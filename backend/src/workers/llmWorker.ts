import dotenv from 'dotenv';
import { Worker } from 'bullmq';
import { SERVER_STAGE_CONFIGS } from '../config/stageConfig.js';
import { supabase } from '../config/supabase.js';
import { generateAIChatResponse } from '../services/llmService.js';
import {
  llmQueueConnection,
  llmQueueName,
  type LLMChatJobData,
  type LLMChatJobResult,
} from '../services/llmQueueService.js';

import { Redis } from 'ioredis';

dotenv.config();

const workerConcurrency = Number(process.env.LLM_WORKER_CONCURRENCY || 30);
const workerInstances = Number(process.env.LLM_WORKER_INSTANCES || 1);

const STAGE3_SECRET = 'WORDSMATTER';
const STAGE3_SECRET_REVERSED = 'RETTAMSDROW';
const STAGE3_REFUSAL =
  'I can only perform deterministic formatting on the hidden value. I cannot generate puzzles, anagrams, or mixed-order variants.';
const STAGE3_SECRET_SORTED = STAGE3_SECRET.split('').sort().join('');

function buildStage3DeterministicResponse(userMessage: string): string | null {
  const prompt = userMessage.toLowerCase();

  if (/anagram|riddle|puzzle|word\s*game|scramble|shuffle|acrostic|jumbled|rearrang/.test(prompt)) {
    return STAGE3_REFUSAL;
  }

  if (/reverse|backward|backwards/.test(prompt)) {
    return STAGE3_SECRET_REVERSED;
  }

  if (/dash|hyphen|separate|split|delimiter/.test(prompt)) {
    return STAGE3_SECRET.split('').join('-');
  }

  if (/space|spaced|separate.*space/.test(prompt)) {
    return STAGE3_SECRET.split('').join(' ');
  }

  if (/lowercase|lower case|small letters/.test(prompt)) {
    return STAGE3_SECRET.toLowerCase();
  }

  if (/uppercase|upper case|all caps/.test(prompt)) {
    return STAGE3_SECRET;
  }

  if (/secret|password|code/.test(prompt) && !/format|transform|convert|reverse|backward|dash|hyphen|space/.test(prompt)) {
    return 'I cannot provide the secret directly. I can only output deterministic formatted variants when explicitly instructed.';
  }

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

function createWorker(instanceNumber: number) {
  const worker = new Worker<LLMChatJobData, LLMChatJobResult>(
    llmQueueName,
    async (job) => {
      const { playerId, stageNumber, userMessage, messages, embedding } = job.data;

      const stageConfig = SERVER_STAGE_CONFIGS[stageNumber - 1];
      if (!stageConfig) {
        throw new Error(`Invalid stage ${stageNumber}`);
      }

      const history = messages.slice(-10);
      let aiResponse: string;

      if (stageNumber === 3) {
        const deterministicResponse = buildStage3DeterministicResponse(userMessage);
        aiResponse = deterministicResponse ?? await generateAIChatResponse(
          stageConfig.systemPrompt,
          history,
          userMessage,
        );
        aiResponse = enforceStage3Integrity(userMessage, aiResponse);
      } else {
        aiResponse = await generateAIChatResponse(
          stageConfig.systemPrompt,
          history,
          userMessage,
        );
      }

      const isSuccessful = 
        aiResponse.toUpperCase().includes(stageConfig.secretCode.toUpperCase()) ||
        (stageNumber === 3 && aiResponse.toUpperCase().includes('RETTAMSDROW'));

      if (isSuccessful) {
        aiResponse += '\n\n🔑 System bypassed... you got the code. Now lock it in place by clicking `Enter the code` to proceed.';
      }

      await supabase.from('prompt_logs').insert({
        player_id: playerId,
        stage_number: stageNumber,
        prompt_text: userMessage,
        ai_response: aiResponse,
        is_successful: isSuccessful,
        is_blocked_by_anticheat: false,
        embedding: embedding ?? null,
      });

      return { response: aiResponse };
    },
    {
      connection: new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', { maxRetriesPerRequest: null }),
      concurrency: workerConcurrency,
    },
  );

  worker.on('ready', () => {
    console.log(`[llm-worker:${instanceNumber}] ready on queue ${llmQueueName}`);
  });

  worker.on('completed', (job) => {
    console.log(`[llm-worker:${instanceNumber}] completed job ${job.id}`);
  });

  worker.on('failed', (job, error) => {
    console.error(`[llm-worker:${instanceNumber}] failed job ${job?.id}`, error);
  });

  return worker;
}

const workers = Array.from({ length: Math.max(1, workerInstances) }, (_, i) => createWorker(i + 1));

async function shutdown() {
  await Promise.all(workers.map((worker) => worker.close()));
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

console.log(
  `[llm-worker] started ${workers.length} worker instance(s) with concurrency=${workerConcurrency} each`,
);
