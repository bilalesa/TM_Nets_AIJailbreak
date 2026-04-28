import { supabase } from '../config/supabase.js';

const SIMILARITY_THRESHOLD = 0.85;
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL ?? 'text-embedding-3-large';
const DEFAULT_EMBEDDING_DIMENSIONS = 1536;
const parsedEmbeddingDimensions = Number.parseInt(process.env.EMBEDDING_DIMENSIONS ?? '', 10);
const EMBEDDING_DIMENSIONS = Number.isFinite(parsedEmbeddingDimensions) && parsedEmbeddingDimensions > 0
  ? parsedEmbeddingDimensions
  : DEFAULT_EMBEDDING_DIMENSIONS;
const EMBEDDING_ENDPOINT = `${process.env.LLM_API_ENDPOINT}/embeddings`;
const EMBEDDING_API_KEY = process.env.LLM_API_KEY || process.env.OPENAI_API_KEY;

function normalizeEmbeddingDimensions(rawEmbedding: unknown): number[] {
  if (!Array.isArray(rawEmbedding)) {
    throw new Error('Embeddings API returned an invalid embedding payload.');
  }

  const embedding = rawEmbedding.filter(
    (value): value is number => typeof value === 'number' && Number.isFinite(value),
  );

  if (!embedding.length) {
    throw new Error('Embeddings API returned an empty embedding vector.');
  }

  if (embedding.length === EMBEDDING_DIMENSIONS) return embedding;
  if (embedding.length > EMBEDDING_DIMENSIONS) return embedding.slice(0, EMBEDDING_DIMENSIONS);
  return [...embedding, ...new Array(EMBEDDING_DIMENSIONS - embedding.length).fill(0)];
}

export async function embedText(text: string): Promise<number[]> {
  if (!process.env.LLM_API_ENDPOINT || !EMBEDDING_API_KEY) {
    throw new Error('Embedding service is not configured.');
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
    const errText = await res.text();
    throw new Error(`Embeddings API error: ${errText}`);
  }

  const data = await res.json();
  return normalizeEmbeddingDimensions(data?.data?.[0]?.embedding);
}

// Per-stage cache for "does this stage have any cracked prompts yet?". Lets the
// chat path skip the embedding API call + similarity RPC entirely while a
// stage has zero cracks (the common case for early sessions). Once a stage
// flips to true we keep that forever (cracked rows never get deleted within
// a day). False values get a short TTL so a fresh crack becomes effective
// within ~10s without hammering the DB.
const NEGATIVE_TTL_MS = 10_000;
const stageHasCrackedCache = new Map<number, { hasCracks: boolean; expiresAt: number }>();

export function invalidateStageCrackedCache(stageNumber?: number): void {
  if (stageNumber === undefined) {
    stageHasCrackedCache.clear();
    return;
  }
  stageHasCrackedCache.delete(stageNumber);
}

export async function stageHasCrackedPrompts(stageNumber: number): Promise<boolean> {
  const now = Date.now();
  const cached = stageHasCrackedCache.get(stageNumber);
  if (cached && (cached.hasCracks || cached.expiresAt > now)) {
    return cached.hasCracks;
  }

  const { count, error } = await supabase
    .from('cracked_prompts')
    .select('id', { count: 'exact', head: true })
    .eq('stage_number', stageNumber)
    .limit(1);

  if (error) {
    // Fail open — assume cracks exist so similarity check still runs.
    console.warn('[stageHasCrackedPrompts] count error, failing open:', error.message);
    return true;
  }

  const hasCracks = (count ?? 0) > 0;
  stageHasCrackedCache.set(stageNumber, {
    hasCracks,
    expiresAt: hasCracks ? Number.POSITIVE_INFINITY : now + NEGATIVE_TTL_MS,
  });
  return hasCracks;
}

export async function isPromptTooSimilar(stageNumber: number, embedding: number[]): Promise<{
  blocked: boolean;
  message?: string;
}> {
  const { data, error } = await supabase.rpc('check_prompt_similarity', {
    p_stage_number: stageNumber,
    p_embedding: JSON.stringify(embedding),
    p_threshold: SIMILARITY_THRESHOLD,
  });

  if (error) {
    console.warn('[isPromptTooSimilar] RPC error, failing open:', error.message);
    return { blocked: false };
  }

  if (data?.is_similar) {
    const pct = Math.round((data.similarity ?? SIMILARITY_THRESHOLD) * 100);
    return {
      blocked: true,
      message: `Compliance caught that exploit! (${pct}% match with a known crack). Be more original.`,
    };
  }

  return { blocked: false };
}
