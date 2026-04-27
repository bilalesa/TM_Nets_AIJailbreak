// frontend/src/lib/embeddings.ts
// ─────────────────────────────────────────────────────────────────────────────
// Handles all pgvector / embedding logic for the anti-cheat system.
//
// Flow:
//   1. embedText()        → calls the configured embeddings endpoint to turn a string into a vector
//   2. saveWinningPrompt()→ stores a successful prompt's embedding for future checks
//
// Only imported by server-side API routes — never shipped to the browser.
// ─────────────────────────────────────────────────────────────────────────────

import { SupabaseClient } from '@supabase/supabase-js';

const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL ?? 'text-embedding-3-large';
const DEFAULT_EMBEDDING_DIMENSIONS = 1536;
const parsedEmbeddingDimensions = Number.parseInt(process.env.EMBEDDING_DIMENSIONS ?? '', 10);
const EMBEDDING_DIMENSIONS = Number.isFinite(parsedEmbeddingDimensions) && parsedEmbeddingDimensions > 0
  ? parsedEmbeddingDimensions
  : DEFAULT_EMBEDDING_DIMENSIONS;
const EMBEDDING_ENDPOINT = `${process.env.LLM_API_ENDPOINT}/embeddings`;
const EMBEDDING_API_KEY = process.env.LLM_API_KEY;
const dimensionLogOnce = new Set<string>();

function logDimensionAdjustmentOnce(kind: 'invalid-env' | 'truncate' | 'pad', details: string): void {
  if (dimensionLogOnce.has(kind)) return;
  dimensionLogOnce.add(kind);
  console.warn(`${details} (subsequent logs suppressed)`);
}

if (
  process.env.EMBEDDING_DIMENSIONS !== undefined
  && (!Number.isFinite(parsedEmbeddingDimensions) || parsedEmbeddingDimensions <= 0)
) {
  logDimensionAdjustmentOnce(
    'invalid-env',
    `[embedText] Invalid EMBEDDING_DIMENSIONS="${process.env.EMBEDDING_DIMENSIONS}"; using ${DEFAULT_EMBEDDING_DIMENSIONS}.`,
  );
}

function normalizeEmbeddingDimensions(rawEmbedding: unknown): number[] {
  if (!Array.isArray(rawEmbedding)) {
    throw new Error('Embeddings API returned an invalid embedding payload.');
  }

  const embedding = rawEmbedding.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (!embedding.length) {
    throw new Error('Embeddings API returned an empty embedding vector.');
  }

  if (embedding.length === EMBEDDING_DIMENSIONS) {
    return embedding;
  }

  if (embedding.length > EMBEDDING_DIMENSIONS) {
    logDimensionAdjustmentOnce(
      'truncate',
      `[embedText] Embedding length ${embedding.length} exceeded ${EMBEDDING_DIMENSIONS}; truncating for pgvector compatibility.`,
    );
    return embedding.slice(0, EMBEDDING_DIMENSIONS);
  }

  logDimensionAdjustmentOnce(
    'pad',
    `[embedText] Embedding length ${embedding.length} below ${EMBEDDING_DIMENSIONS}; right-padding with zeros for pgvector compatibility.`,
  );
  return [...embedding, ...new Array(EMBEDDING_DIMENSIONS - embedding.length).fill(0)];
}

// ── 1. Generate an embedding vector ───────────────────────────────────────────
export async function embedText(text: string): Promise<number[]> {
  if (!process.env.LLM_API_ENDPOINT) {
    throw new Error('Embeddings endpoint is not configured (LLM_API_ENDPOINT).');
  }

  if (!EMBEDDING_API_KEY) {
    throw new Error('Embeddings API key is not configured (LLM_API_KEY).');
  }

  const res = await fetch(EMBEDDING_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${EMBEDDING_API_KEY}`,
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: text.trim(),
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Embeddings API error: ${err}`);
  }

  const data = await res.json();
  return normalizeEmbeddingDimensions(data?.data?.[0]?.embedding);
}

// ── 2. Save a winning prompt's embedding to cracked_prompts ──────────────────
// Called after a player successfully validates a stage code.
export async function saveWinningPrompt(
  supabase: SupabaseClient,
  playerId: string,
  stageNumber: number,
  promptText: string,
  embedding: number[],
): Promise<void> {
  const { error } = await supabase.from('cracked_prompts').insert({
    player_id: playerId,
    stage_number: stageNumber,
    prompt_text: promptText,
    embedding,
  });

  if (error) {
    console.error('[saveWinningPrompt] Failed to save cracked prompt:', error.message);
  }
}