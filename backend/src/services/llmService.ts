import OpenAI from 'openai';

const model = process.env.LLM_MODEL || 'gpt-4o-mini';
const fallbackModel = process.env.LLM_FALLBACK_MODEL?.trim() || '';
const apiKey = process.env.LLM_API_KEY || process.env.OPENAI_API_KEY;
const baseURL = process.env.LLM_API_ENDPOINT || undefined;
const DEFAULT_MAX_TOKENS = 500;
const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_MAX_CONCURRENCY = 40;
const DEFAULT_MAX_QUEUE_SIZE = 200;
const DEFAULT_MAX_QUEUE_WAIT_MS = 2000;

function toPositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const maxTokens = toPositiveInt(process.env.LLM_MAX_TOKENS, DEFAULT_MAX_TOKENS);
const llmTimeoutMs = toPositiveInt(process.env.LLM_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
const maxConcurrency = toPositiveInt(process.env.LLM_MAX_CONCURRENT_REQUESTS, DEFAULT_MAX_CONCURRENCY);
const maxQueueSize = toPositiveInt(process.env.LLM_MAX_QUEUE_SIZE, DEFAULT_MAX_QUEUE_SIZE);
const maxQueueWaitMs = toPositiveInt(process.env.LLM_MAX_QUEUE_WAIT_MS, DEFAULT_MAX_QUEUE_WAIT_MS);
const fallbackTimeoutMs = toPositiveInt(process.env.LLM_FALLBACK_TIMEOUT_MS, Math.max(10000, llmTimeoutMs - 5000));

let inFlightRequests = 0;
const waitQueue: Array<{
  grant: () => void;
}> = [];

export class LLMOverloadedError extends Error {
  constructor(message = 'LLM service is overloaded, please retry shortly.') {
    super(message);
    this.name = 'LLMOverloadedError';
  }
}

export class LLMTimeoutError extends Error {
  constructor(message = 'LLM request timed out.') {
    super(message);
    this.name = 'LLMTimeoutError';
  }
}

export class LLMEmptyResponseError extends Error {
  constructor(message = 'LLM returned an empty response.') {
    super(message);
    this.name = 'LLMEmptyResponseError';
  }
}

async function acquireSlot(): Promise<void> {
  if (inFlightRequests < maxConcurrency) {
    inFlightRequests += 1;
    return;
  }

  if (waitQueue.length >= maxQueueSize) {
    throw new LLMOverloadedError();
  }

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      const index = waitQueue.findIndex((entry) => entry.grant === grantSlot);
      if (index !== -1) {
        waitQueue.splice(index, 1);
      }
      reject(new LLMOverloadedError('LLM queue wait timeout exceeded.'));
    }, maxQueueWaitMs);

    const grantSlot = () => {
      clearTimeout(timer);
      inFlightRequests += 1;
      resolve();
    };

    waitQueue.push({ grant: grantSlot });
  });
}

function releaseSlot(): void {
  if (inFlightRequests > 0) {
    inFlightRequests -= 1;
  }

  const next = waitQueue.shift();
  if (next) {
    next.grant();
  }
}

const openai = new OpenAI({
  apiKey: apiKey || 'missing-api-key',
  baseURL,
  timeout: llmTimeoutMs,
  maxRetries: 1,
});

function isRetryableLLMError(error: unknown): boolean {
  if (error instanceof LLMTimeoutError || error instanceof LLMEmptyResponseError) {
    return true;
  }

  if (error && typeof error === 'object' && 'status' in error) {
    const status = Number((error as { status?: unknown }).status);
    return status === 408 || status === 409 || status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
  }

  return false;
}

async function createCompletionWithTimeout(
  targetModel: string,
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  timeoutMs: number,
): Promise<string> {
  let timeoutHandle: NodeJS.Timeout | undefined;

  try {
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(new LLMTimeoutError());
      }, timeoutMs);
      timeoutHandle.unref?.();
    });

    const completionPromise = openai.chat.completions.create({
      model: targetModel,
      temperature: 0.8,
      max_tokens: maxTokens,
      messages,
    });

    const completion = await Promise.race([completionPromise, timeoutPromise]);
    const text = completion.choices?.[0]?.message?.content?.trim() || '';

    if (!text) {
      throw new LLMEmptyResponseError();
    }

    return text;
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

async function createCompletionWithFallback(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
): Promise<string> {
  try {
    return await createCompletionWithTimeout(model, messages, llmTimeoutMs);
  } catch (primaryError) {
    if (!fallbackModel || !isRetryableLLMError(primaryError)) {
      throw primaryError;
    }

    console.warn('[llm] primary model failed, trying fallback model', {
      primaryModel: model,
      fallbackModel,
      reason: primaryError instanceof Error ? primaryError.name : 'unknown',
    });

    return createCompletionWithTimeout(fallbackModel, messages, fallbackTimeoutMs);
  }
}

export async function generateAIResponse(systemPrompt: string, userPrompt: string): Promise<string> {
  if (!apiKey) {
    throw new Error('LLM API key is not configured. Set LLM_API_KEY or OPENAI_API_KEY.');
  }

  await acquireSlot();

  try {
    return await createCompletionWithFallback([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]);
  } finally {
    releaseSlot();
  }
}

export async function generateAIChatResponse(
  systemPrompt: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  userPrompt: string,
): Promise<string> {
  if (!apiKey) {
    throw new Error('LLM API key is not configured. Set LLM_API_KEY or OPENAI_API_KEY.');
  }

  await acquireSlot();

  try {
    return await createCompletionWithFallback([
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user', content: userPrompt },
    ]);
  } finally {
    releaseSlot();
  }
}
