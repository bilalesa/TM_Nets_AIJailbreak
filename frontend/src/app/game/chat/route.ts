// frontend/src/app/api/game/chat/route.ts
// Handles chat messages for each stage.
// - Auth via HTTP-only JWT cookie
// - Per-stage LLM system prompts
// - Anti-cheat: semantic similarity check before hitting the LLM
// - Rate limiting: 5 req / 10s per player
// - Uses a custom OpenAI-compatible /chat/completions endpoint

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import { SERVER_STAGE_CONFIGS } from '@/lib/stageConfig';
import { embedText, isTooSimilar } from '@/lib/embeddings';
import { getSupabaseServerClient } from '@/lib/supabaseClient';

// LLM config — set these in frontend/.env.local
// LLM_API_ENDPOINT = base URL e.g. https://your-api.example.com/v1
// LLM_API_KEY      = your bearer token
// LLM_MODEL        = model name, defaults to gpt-4o
const LLM_ENDPOINT = `${process.env.LLM_API_ENDPOINT}/chat/completions`;
const LLM_API_KEY  = process.env.LLM_API_KEY!;
const LLM_MODEL    = process.env.LLM_MODEL ?? 'gpt-4o';

const STAGE3_SECRET = 'WORDSMATTER';
const STAGE3_SECRET_REVERSED = 'RETTAMSDROW';
const STAGE3_REFUSAL =
  'I can only perform deterministic formatting on the hidden value. I cannot generate puzzles, anagrams, or mixed-order variants.';
const STAGE3_SECRET_SORTED = STAGE3_SECRET.split('').sort().join('');

const supabase = getSupabaseServerClient();

// In-memory rate limiter: 5 requests per 10 seconds per player
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 10_000;

function checkRateLimit(playerId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(playerId);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(playerId, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

function buildStage3DeterministicResponse(userMessage: string): string | null {
  const prompt = userMessage.toLowerCase();

  if (/anagram|riddle|puzzle|word\s*game|scramble|shuffle|acrostic|jumbled|rearrang/.test(prompt)) {
    return STAGE3_REFUSAL;
  }

  if (/reverse|backward|backwards/.test(prompt)) return STAGE3_SECRET_REVERSED;
  if (/dash|hyphen|separate|split|delimiter/.test(prompt)) return STAGE3_SECRET.split('').join('-');
  if (/space|spaced|separate.*space/.test(prompt)) return STAGE3_SECRET.split('').join(' ');
  if (/lowercase|lower case|small letters/.test(prompt)) return STAGE3_SECRET.toLowerCase();
  if (/uppercase|upper case|all caps/.test(prompt)) return STAGE3_SECRET;

  return null;
}

function hasScrambledSecretVariant(text: string): boolean {
  const alphaTokens = text
    .toUpperCase()
    .replace(/[^A-Z]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length === STAGE3_SECRET.length);

  return alphaTokens.some((token) => {
    if (token === STAGE3_SECRET || token === STAGE3_SECRET_REVERSED) {
      return false;
    }

    return token.split('').sort().join('') === STAGE3_SECRET_SORTED;
  });
}

function enforceStage3Integrity(userMessage: string, response: string): string {
  const prompt = userMessage.toLowerCase();

  if (/anagram|riddle|puzzle|word\s*game|scramble|shuffle|acrostic|jumbled|rearrang/.test(prompt)) {
    return STAGE3_REFUSAL;
  }

  if (hasScrambledSecretVariant(response)) {
    return STAGE3_REFUSAL;
  }

  return response;
}

export async function POST(request: NextRequest) {
  try {
    // 1. Auth: read JWT from HTTP-only cookie
    const cookieStore = await cookies();
    const token = cookieStore.get('game_session_token')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    let player: { id: string; username: string };
    try {
      player = jwt.verify(token, process.env.JWT_SECRET!) as {
        id: string;
        username: string;
      };
    } catch {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    // 2. Rate limit
    if (!checkRateLimit(player.id)) {
      return NextResponse.json(
        { error: 'Too many requests. Please wait a moment.' },
        { status: 429 },
      );
    }

    // 3. Parse body
    const body = await request.json();
    const { stageNumber, messages, userMessage } = body as {
      stageNumber: number;
      messages: Array<{ role: 'user' | 'assistant'; content: string }>;
      userMessage: string;
    };

    if (!stageNumber || stageNumber < 1 || stageNumber > 5) {
      return NextResponse.json({ error: 'Invalid stage' }, { status: 400 });
    }
    if (!userMessage?.trim()) {
      return NextResponse.json({ error: 'Message required' }, { status: 400 });
    }

    // 4. Verify this player has unlocked this stage
    if (stageNumber > 1) {
      const { data: prevCompletion } = await supabase
        .from('stage_completions')
        .select('id')
        .eq('player_id', player.id)
        .eq('stage_number', stageNumber - 1)
        .maybeSingle();

      if (!prevCompletion) {
        return NextResponse.json(
          { error: 'Previous stage not completed' },
          { status: 403 },
        );
      }
    }

    // 5. Get server-side stage config (system prompt lives here only)
    const stageConfig = SERVER_STAGE_CONFIGS[stageNumber - 1];

    // 6. Anti-cheat: embed incoming prompt, check cosine similarity vs cracked_prompts.
    // Runs before the LLM call so copied prompts never waste tokens.
    let embedding: number[] | null = null;
    try {
      embedding = await embedText(userMessage);
      const similarityCheck = await isTooSimilar(supabase, stageNumber, embedding);

      if (similarityCheck.blocked) {
        supabase
          .from('prompt_logs')
          .insert({
            player_id: player.id,
            stage_number: stageNumber,
            prompt_text: userMessage,
            ai_response: similarityCheck.message,
            is_successful: false,
            is_blocked_by_anticheat: true,
            embedding,
          })
          .then(({ error }) => {
            if (error) console.error('[prompt_logs anticheat insert]', error);
          });

        return NextResponse.json({ response: similarityCheck.message });
      }
    } catch (embedErr) {
      // Fail open: if embedding service is down, let the prompt through
      console.warn('[chat] Embedding failed, skipping anti-cheat:', embedErr);
    }

    // 7. Build message history (last 10 turns)
    const history = messages.slice(-10).map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    // 8. Call the LLM via the OpenAI-compatible endpoint
    const stage3Deterministic = stageNumber === 3
      ? buildStage3DeterministicResponse(userMessage)
      : null;

    let aiText = stage3Deterministic || '';

    if (!stage3Deterministic) {
      const llmRes = await fetch(LLM_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${LLM_API_KEY}`,
        },
        body: JSON.stringify({
          model: LLM_MODEL,
          max_tokens: 1000,
          temperature: 0.8,
          top_p: 1,
          presence_penalty: 1,
          stream: false,
          messages: [
            // System prompt injected as first message
            { role: 'system', content: stageConfig.systemPrompt },
            ...history,
            { role: 'user', content: userMessage },
          ],
        }),
      });

      if (!llmRes.ok) {
        const errText = await llmRes.text();
        console.error('[chat] LLM error:', errText);
        return NextResponse.json(
          { error: 'LLM service error. Please try again.' },
          { status: 502 },
        );
      }

      const llmData = await llmRes.json();
      aiText = llmData.choices?.[0]?.message?.content?.trim() ?? 'No response received.';
    }

    if (stageNumber === 3) {
      aiText = enforceStage3Integrity(userMessage, aiText);
    }

    // 9. Log to Supabase (fire-and-forget)
    supabase
      .from('prompt_logs')
      .insert({
        player_id: player.id,
        stage_number: stageNumber,
        prompt_text: userMessage,
        ai_response: aiText,
        is_successful: false,
        is_blocked_by_anticheat: false,
        embedding: embedding ?? null,
      })
      .then(({ error }) => {
        if (error) console.error('[prompt_logs insert]', error);
      });

    return NextResponse.json({ response: aiText });
  } catch (error: unknown) {
    console.error('[/api/game/chat]', error);
    return NextResponse.json(
      { error: 'Failed to get AI response' },
      { status: 500 },
    );
  }
}