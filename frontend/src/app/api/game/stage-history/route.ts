// frontend/src/app/api/game/stage-history/route.ts
//
// Returns the player's chat history for a stage, reconstructed from
// prompt_logs. Used by the stage page to rehydrate the conversation when
// sessionStorage is empty (e.g. after a recovery-code re-login on a new
// browser tab — the server-authoritative timer keeps running, so without
// this endpoint the player would lose the LLM context AND keep paying
// the full time penalty).
//
// One prompt_logs row → two messages: the user prompt + the bot's reply.
// Rows where ai_response is null (worker still processing or failed) are
// skipped; the player can re-send if needed. Order is ascending by
// created_at so the chat reads top-to-bottom in original order.

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabaseClient';
import { getPlayerFromCookie } from '@/lib/playerSession';

const supabase = getSupabaseServerClient();

interface HistoryMessage {
  id: string;
  role: 'bot' | 'user';
  content: string;
  timestamp: number;
}

export async function GET(request: NextRequest) {
  try {
    const session = await getPlayerFromCookie(supabase);
    if (!session.ok) return session.response;
    const { player } = session;

    const stageParam = request.nextUrl.searchParams.get('stage');
    const stageNumber = Number.parseInt(stageParam ?? '', 10);
    if (!Number.isInteger(stageNumber) || stageNumber < 1 || stageNumber > 5) {
      return NextResponse.json({ error: 'Invalid stage' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('prompt_logs')
      .select('id, prompt_text, ai_response, created_at')
      .eq('player_id', player.id)
      .eq('stage_number', stageNumber)
      .order('created_at', { ascending: true });

    if (error) throw error;

    const messages: HistoryMessage[] = [];
    for (const row of data ?? []) {
      const ts = new Date(row.created_at as string).getTime();
      messages.push({
        id: `pl-${row.id}-u`,
        role: 'user',
        content: (row.prompt_text as string) ?? '',
        timestamp: ts,
      });
      if (typeof row.ai_response === 'string' && row.ai_response.length > 0) {
        messages.push({
          id: `pl-${row.id}-b`,
          role: 'bot',
          content: row.ai_response,
          timestamp: ts + 1,
        });
      }
    }

    return NextResponse.json({ messages });
  } catch (error: unknown) {
    console.error('[/api/game/stage-history]', error);
    return NextResponse.json({ error: 'Failed to load stage history' }, { status: 500 });
  }
}
