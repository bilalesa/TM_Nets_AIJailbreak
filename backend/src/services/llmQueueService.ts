import { Queue, QueueEvents, type JobsOptions } from 'bullmq';
import { Redis } from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const connection = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
});

const queueName = process.env.LLM_QUEUE_NAME || 'llm-queue';
const defaultJobTimeoutMs = Number(process.env.LLM_JOB_TIMEOUT_MS || 45000);
const removeOnCompleteCount = Number(process.env.LLM_JOB_REMOVE_ON_COMPLETE || 5000);
const removeOnFailCount = Number(process.env.LLM_JOB_REMOVE_ON_FAIL || 5000);
const metricsSampleSize = Number(process.env.LLM_QUEUE_METRICS_SAMPLE_SIZE || 200);

export interface LLMChatJobData {
  playerId: string;
  stageNumber: number;
  userMessage: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export interface LLMChatJobResult {
  response: string;
}

export const llmQueue = new Queue<LLMChatJobData, LLMChatJobResult, 'chat'>(queueName, {
  connection,
  defaultJobOptions: {
    attempts: 2,
    backoff: {
      type: 'fixed',
      delay: 500,
    },
    // BullMQ v5 removed per-job timeout from DefaultJobOptions.
    // Keep this env for future use and enforce timeout in llmService.
    removeOnComplete: removeOnCompleteCount,
    removeOnFail: removeOnFailCount,
  },
});

export const llmQueueEvents = new QueueEvents(queueName, { connection });

export function enqueueChatJob(data: LLMChatJobData, opts?: JobsOptions) {
  return llmQueue.add('chat', data, opts);
}

function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) return 0;
  const index = Math.ceil((p / 100) * sortedValues.length) - 1;
  return sortedValues[Math.max(0, Math.min(sortedValues.length - 1, index))];
}

export async function getQueueMetrics() {
  const counts = await llmQueue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed');
  const sampledJobs = await llmQueue.getJobs(['waiting', 'active'], 0, Math.max(metricsSampleSize - 1, 0), true);

  const now = Date.now();
  const waitTimesMs = sampledJobs
    .map((job) => Math.max(0, now - job.timestamp))
    .sort((a, b) => a - b);

  return {
    queue: queueName,
    counts,
    sampledJobs: sampledJobs.length,
    waitMs: {
      min: waitTimesMs[0] || 0,
      p50: percentile(waitTimesMs, 50),
      p95: percentile(waitTimesMs, 95),
      max: waitTimesMs[waitTimesMs.length - 1] || 0,
    },
    timestamp: new Date().toISOString(),
  };
}

export { connection as llmQueueConnection, queueName as llmQueueName };
