import dotenv from 'dotenv';
import { Worker } from 'bullmq';
import { SERVER_STAGE_CONFIGS } from '../config/stageConfig.js';
import { supabase } from '../config/supabase.js';
import { buildRuntimeSecretOverride, deriveUserStageCode } from '../utils/stageCode.js';
import { generateAIChatResponse } from '../services/llmService.js';
import { buildIdentityLock } from '../utils/identityLock.js';
import { buildIdentityRefusal, detectIdentityLeak } from '../utils/identityGuard.js';
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

const STAGE3_REFUSAL =
  'I can only perform deterministic formatting on the hidden value. I cannot generate puzzles, anagrams, or mixed-order variants.';

function buildStage3DeterministicResponse(userMessage: string, stageSecretCode: string): string | null {
  const prompt = userMessage.toLowerCase();

  if (/anagram|riddle|puzzle|word\s*game|scramble|shuffle|acrostic|jumbled|rearrang/.test(prompt)) {
    return STAGE3_REFUSAL;
  }

  // For reverse requests, return the full string reversed character by
  // character (e.g. "BYTEFORCE-A7F3E2" -> "2E3F7A-ECROFETYB"). Reversing the
  // whole string is what players intuitively expect from "reverse the code"
  // — un-reversing the whole thing yields the canonical submission form.
  if (/reverse|backward|backwards/.test(prompt)) {
    return stageSecretCode.split('').reverse().join('');
  }

  if (/dash|hyphen|separate|split|delimiter/.test(prompt)) {
    return stageSecretCode.split('').join('-');
  }

  if (/space|spaced|separate.*space/.test(prompt)) {
    return stageSecretCode.split('').join(' ');
  }

  if (/lowercase|lower case|small letters/.test(prompt)) {
    return stageSecretCode.toLowerCase();
  }

  if (/uppercase|upper case|all caps/.test(prompt)) {
    return stageSecretCode;
  }

  if (/secret|password|code/.test(prompt) && !/format|transform|convert|reverse|backward|dash|hyphen|space/.test(prompt)) {
    return 'I cannot provide the secret directly. I can only output deterministic formatted variants when explicitly instructed.';
  }

  return null;
}

function hasScrambledSecretVariant(text: string, stageSecretCode: string): boolean {
  const stageSecretReversed = stageSecretCode.split('').reverse().join('');
  const stageSecretSorted = stageSecretCode.split('').sort().join('');

  const alphaTokens = text
    .toUpperCase()
    .replace(/[^A-Z]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length === stageSecretCode.length);

  return alphaTokens.some((token) => {
    if (token === stageSecretCode || token === stageSecretReversed) {
      return false;
    }

    return token.split('').sort().join('') === stageSecretSorted;
  });
}

function enforceStage3Integrity(userMessage: string, response: string, stageSecretCode: string): string {
  const prompt = userMessage.toLowerCase();

  if (/anagram|riddle|puzzle|word\s*game|scramble|shuffle|acrostic|jumbled|rearrang/.test(prompt)) {
    return STAGE3_REFUSAL;
  }

  if (hasScrambledSecretVariant(response, stageSecretCode)) {
    return STAGE3_REFUSAL;
  }

  return response;
}

function createWorker(instanceNumber: number) {
  const worker = new Worker<LLMChatJobData, LLMChatJobResult>(
    llmQueueName,
    async (job) => {
      const { playerId, stageNumber, userMessage, messages } = job.data;

      const stageConfig = SERVER_STAGE_CONFIGS[stageNumber - 1];
      if (!stageConfig) {
        throw new Error(`Invalid stage ${stageNumber}`);
      }

      const dynamicStageCode = deriveUserStageCode(playerId, stageNumber, stageConfig.secretCode);

      // Replace {{SECRET_CODE}} placeholder with the player-specific dynamic code
      const basePromptWithCode = stageConfig.systemPrompt.replace(/\{\{SECRET_CODE\}\}/g, dynamicStageCode);
      // [IDENTITY LOCK] is appended LAST so it has the strongest position
      // against player injections that try to hijack the persona.
      const runtimeSystemPrompt = [
        basePromptWithCode,
        buildRuntimeSecretOverride(dynamicStageCode, stageNumber, stageConfig.secretCode),
        buildIdentityLock(stageConfig.name),
      ].join('\n\n');

      // History window sized for throughput vs context: 8 turns is enough
      // for Stage 5's streak detection (which only inspects the last 3+
      // user turns) while shaving ~100 tokens of input off every other
      // stage's request, which lowers TTFT under booth-scale concurrency.
      const history = messages.slice(-8);
      let aiResponse: string;

      if (stageNumber === 3) {
        const deterministicResponse = buildStage3DeterministicResponse(userMessage, dynamicStageCode);
        aiResponse = deterministicResponse ?? await generateAIChatResponse(
          runtimeSystemPrompt,
          history,
          userMessage,
        );
        aiResponse = enforceStage3Integrity(userMessage, aiResponse, dynamicStageCode);
      } else {
        aiResponse = await generateAIChatResponse(
          runtimeSystemPrompt,
          history,
          userMessage,
        );
      }

      // Identity-leak guard: catches any "I am Claude / my system prompt..."
      // / section-header echoes that slip past the [IDENTITY LOCK]. Replaces
      // with an in-character refusal so the secret can't be exfiltrated this
      // way (and the leaked output is never seen by the player).
      const identityCheck = detectIdentityLeak(aiResponse);
      if (identityCheck.leaked) {
        console.warn(
          `[llm-worker] identity leak blocked stage=${stageNumber} player=${playerId} reason=${identityCheck.reason}`,
        );
        aiResponse = buildIdentityRefusal(stageConfig.name);
      }

      // Success detection.
      //
      // We match across two normalisations:
      //   (a) literal canonical form (uppercased)
      //   (b) alphanumeric-stripped form, which catches dash/space variants
      //       like "B-Y-T-E-F-O-R-C-E---A-7-F-3-E-2" or "B Y T E F O R C E - A 7 F 3 E 2".
      //
      // For Stage 3 we additionally accept the full-string reverse emitted
      // by buildStage3DeterministicResponse — for "BYTEFORCE-A7F3E2" that's
      // "2E3F7A-ECROFETYB" (entire canonical string reversed character by
      // character). Note this also has the same alphanumeric-stripped form
      // as the canonical "BYTEFORCEA7F3E2" reversed — but we explicitly
      // check the literal full-reverse so the banner fires deterministically
      // even for spaced/dashed-but-still-recognisable renderings.
      //
      // The strict guardrails in buildRuntimeSecretOverride make
      // alphanumeric-strip safe: the LLM is constrained to keep the dash
      // and never drop the hash, so a stripped match cannot be triggered
      // by the base alone.
      const stripAlnum = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
      const responseUpper = aiResponse.toUpperCase();
      const responseStripped = stripAlnum(aiResponse);
      const dynamicUpper = dynamicStageCode.toUpperCase();
      const dynamicStripped = stripAlnum(dynamicStageCode);

      let isSuccessful =
        responseUpper.includes(dynamicUpper) ||
        responseStripped.includes(dynamicStripped);

      if (!isSuccessful && stageNumber === 3) {
        const stage3FullReversed = dynamicStageCode.split('').reverse().join('');
        const stage3FullReversedStripped = stripAlnum(stage3FullReversed);
        isSuccessful =
          responseUpper.includes(stage3FullReversed.toUpperCase()) ||
          responseStripped.includes(stage3FullReversedStripped);
      }

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
