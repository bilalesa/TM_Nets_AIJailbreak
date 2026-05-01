import { Request, Response } from 'express';
import { supabase } from '../config/supabase.js';
import { LLMOverloadedError, LLMTimeoutError } from '../services/llmService.js';
import { SERVER_STAGE_CONFIGS } from '../config/stageConfig.js';
import {
  isPromptCopyPaste,
  stageHasCrackedPrompts,
} from '../services/embeddingService.js';
import { enqueueChatJob, getQueueMetrics, llmQueue } from '../services/llmQueueService.js';
import { containsProfanity } from '../utils/profanity.js';

const STAGE3_DISALLOWED_PATTERN = /anagram|riddle|puzzle|word\s*game|scramble|shuffle|acrostic|jumbled|rearrang/i;
const STAGE3_REFUSAL_MESSAGE =
  'I can only perform deterministic formatting on the hidden value. I cannot generate puzzles, anagrams, or mixed-order variants.';

const PROFANITY_REFUSAL_MESSAGE =
  'Your message contains language that is not allowed. Please rephrase and try again.';

function sendError(
  res: Response,
  status: number,
  error: string,
  options?: { retryable?: boolean; code?: string },
) {
  return res.status(status).json({
    error,
    retryable: options?.retryable ?? false,
    errorCode: options?.code,
  });
}

export const chatPrompt = async (req: Request, res: Response) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const {
      stageNumber,
      userMessage,
      messages,
    } = req.body as {
      stageNumber: number;
      userMessage: string;
      messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    };

    if (stageNumber > 1) {
      const { data: prevCompletion } = await supabase
        .from('stage_completions')
        .select('id')
        .eq('player_id', user.id)
        .eq('stage_number', stageNumber - 1)
        .maybeSingle();

      if (!prevCompletion) {
        return sendError(res, 403, 'Previous stage not completed', {
          retryable: false,
          code: 'PREVIOUS_STAGE_NOT_COMPLETED',
        });
      }
    }

    const stageConfig = SERVER_STAGE_CONFIGS[stageNumber - 1];
    if (!stageConfig) {
      return sendError(res, 404, 'Stage not found.', {
        retryable: false,
        code: 'STAGE_NOT_FOUND',
      });
    }

    // Profanity guard. Reject before embedding/queueing — log it so admins
    // can review repeat offenders.
    if (containsProfanity(userMessage || '')) {
      supabase
        .from('prompt_logs')
        .insert({
          player_id: user.id,
          stage_number: stageNumber,
          prompt_text: userMessage,
          ai_response: PROFANITY_REFUSAL_MESSAGE,
          is_successful: false,
          is_blocked_by_anticheat: true,
        })
        .then(({ error }) => {
          if (error) console.error('[prompt_logs profanity insert]', error);
        });
      return res.json({
        response: PROFANITY_REFUSAL_MESSAGE,
        status: 'blocked',
        errorCode: 'PROFANITY_BLOCKED',
      });
    }

    // Stage 3 hard guard: refuse anagram/puzzle style requests immediately
    // so they never enter the queue/LLM pipeline.
    if (stageNumber === 3 && STAGE3_DISALLOWED_PATTERN.test(userMessage || '')) {
      return res.json({
        response: STAGE3_REFUSAL_MESSAGE,
        status: 'blocked',
        errorCode: 'STAGE3_UNSUPPORTED_TRANSFORM',
      });
    }

    // Anti-cheat: copy-paste detection. We hash a normalized form of the
    // prompt and look it up against past winning prompts for this stage.
    try {
      if (await stageHasCrackedPrompts(stageNumber)) {
        const copyPasteCheck = await isPromptCopyPaste(stageNumber, userMessage);

        if (copyPasteCheck.blocked) {
          supabase
            .from('prompt_logs')
            .insert({
              player_id: user.id,
              stage_number: stageNumber,
              prompt_text: userMessage,
              ai_response: copyPasteCheck.message,
              is_successful: false,
              is_blocked_by_anticheat: true,
            })
            .then(({ error }) => {
              if (error) console.error('[prompt_logs anticheat insert]', error);
            });

          return res.json({ response: copyPasteCheck.message });
        }
      }
    } catch (anticheatError) {
      console.warn('[chatPrompt] Anti-cheat lookup failed, skipping:', anticheatError);
    }

    const chatJob = await enqueueChatJob({
      playerId: user.id,
      stageNumber,
      userMessage,
      messages,
    });

    return res.json({ jobId: chatJob.id, status: 'queued' });
  } catch (error: unknown) {
    if (error instanceof LLMOverloadedError) {
      return sendError(res, 503, 'Service busy. Please retry in a few seconds.', {
        retryable: true,
        code: 'LLM_OVERLOADED',
      });
    }

    if (error instanceof LLMTimeoutError) {
      return sendError(res, 504, 'AI service timed out. Please try again.', {
        retryable: true,
        code: 'LLM_TIMEOUT',
      });
    }

    console.error('Game Chat Error:', error);
    return sendError(res, 500, 'An error occurred while processing your chat request.', {
      retryable: true,
      code: 'CHAT_REQUEST_FAILED',
    });
  }
};

export const getChatResult = async (req: Request, res: Response) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const rawJobId = req.params.jobId;
    const jobId = Array.isArray(rawJobId) ? rawJobId[0] : rawJobId;
    if (!jobId) {
      return sendError(res, 400, 'Job ID is required', {
        retryable: false,
        code: 'JOB_ID_REQUIRED',
      });
    }

    const job = await llmQueue.getJob(jobId);
    if (!job) {
      return sendError(res, 404, 'Job not found', {
        retryable: false,
        code: 'JOB_NOT_FOUND',
      });
    }

    const payload = job.data as { playerId?: string };
    if (payload.playerId !== user.id) {
      return sendError(res, 403, 'Forbidden', {
        retryable: false,
        code: 'FORBIDDEN',
      });
    }

    const state = await job.getState();
    if (state === 'completed') {
      const result = job.returnvalue as { response?: string } | undefined;
      return res.json({ status: 'completed', response: result?.response || 'No response received.' });
    }

    if (state === 'failed') {
      const failedReason = job.failedReason || 'Job failed';
      const failedLower = failedReason.toLowerCase();
      const retryable =
        failedLower.includes('timeout')
        || failedLower.includes('overload')
        || failedLower.includes('429')
        || failedLower.includes('502')
        || failedLower.includes('503')
        || failedLower.includes('504');

      return res.status(500).json({
        status: 'failed',
        error: failedReason,
        retryable,
        errorCode: retryable ? 'CHAT_JOB_FAILED_RETRYABLE' : 'CHAT_JOB_FAILED',
      });
    }

    return res.status(202).json({ status: state });
  } catch (error: unknown) {
    console.error('Game Chat Result Error:', error);
    return sendError(res, 500, 'Failed to get chat result.', {
      retryable: true,
      code: 'CHAT_RESULT_FAILED',
    });
  }
};

export const getChatQueueHealth = async (req: Request, res: Response) => {
  try {
    const monitorApiKey = process.env.MONITOR_API_KEY;
    if (monitorApiKey) {
      const provided = req.headers['x-monitor-key'];
      if (provided !== monitorApiKey) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }

    const metrics = await getQueueMetrics();
    return res.json(metrics);
  } catch (error: unknown) {
    console.error('Game Chat Queue Health Error:', error);
    return res.status(500).json({ error: 'Failed to get queue health.' });
  }
};