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

dotenv.config();

const workerConcurrency = Number(process.env.LLM_WORKER_CONCURRENCY || 30);
const workerInstances = Number(process.env.LLM_WORKER_INSTANCES || 1);

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
      const aiResponse = await generateAIChatResponse(
        stageConfig.systemPrompt,
        history,
        userMessage,
      );

      await supabase.from('prompt_logs').insert({
        player_id: playerId,
        stage_number: stageNumber,
        prompt_text: userMessage,
        ai_response: aiResponse,
        is_successful: false,
        is_blocked_by_anticheat: false,
        embedding: embedding ?? null,
      });

      return { response: aiResponse };
    },
    {
      connection: llmQueueConnection,
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
