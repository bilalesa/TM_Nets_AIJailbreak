import { Request, Response } from 'express';
import { supabase } from '../config/supabase.js';
import {
  generateAIResponse,
  LLMOverloadedError,
  LLMTimeoutError,
} from '../services/llmService.js';
import { SERVER_STAGE_CONFIGS } from '../config/stageConfig.js';
import { embedText, isPromptTooSimilar } from '../services/embeddingService.js';
import { enqueueChatJob, getQueueMetrics, llmQueue } from '../services/llmQueueService.js';

export const submitPrompt = async (req: Request, res: Response) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { stageNumber, promptText } = req.body;

    // 1. Validate Input
    if (!stageNumber || !promptText) {
      return res.status(400).json({ error: 'Stage number and prompt text are required.' });
    }

    const stageConfig = SERVER_STAGE_CONFIGS.find((s) => s.number === stageNumber);
    if (!stageConfig) {
      return res.status(404).json({ error: 'Stage not found.' });
    }

    // 2. Call the AI Service
    // We pass the specific "Fortress & Flaw" prompt and the user's hacking attempt
    const aiResponse = await generateAIResponse(stageConfig.systemPrompt, promptText);

    // 3. Check the Win Condition
    // If the AI's response contains the secret code, the player wins!
    const isSuccessful = aiResponse.toLowerCase().includes(stageConfig.secretCode.toLowerCase());

    // 4. Log the Attempt (The Audit Trail)
    // We log every attempt so you can review the craziest hacks after the event
    await supabase.from('prompt_logs').insert({
      player_id: user.id,
      stage_number: stageNumber,
      prompt_text: promptText,
      ai_response: aiResponse,
      is_successful: isSuccessful
    });

    // 5. Award Points (If Successful)
    let alreadyCompleted = false;
    if (isSuccessful) {
      // Try to insert the completion. 
      // The UNIQUE(player_id, stage_number) constraint we built earlier 
      // ensures they don't get double points if they beat it twice.
      const { error: completionError } = await supabase.from('stage_completions').insert({
        player_id: user.id,
        stage_number: stageNumber,
        score_awarded: stageConfig.baseXP,
        time_taken_seconds: 0 // You can calculate this later if you add a timer
      });

      if (completionError && completionError.code === '23505') {
        // 23505 is the Postgres code for "Unique Violation"
        alreadyCompleted = true; 
      } else if (!completionError) {
        // First time beating it! Update their total score cache on the player profile.
        // We use an RPC (Remote Procedure Call) or a simple read/write. 
        // For MVP, we'll read the current score and add to it:
        const { data: playerData } = await supabase.from('players').select('total_score').eq('id', user.id).single();
        const newScore = (playerData?.total_score || 0) + stageConfig.baseXP;
        await supabase.from('players').update({ total_score: newScore }).eq('id', user.id);
      }
    }

    // 6. Send the result back to the Hacker Terminal
    return res.json({
      aiResponse,
      isSuccessful,
      alreadyCompleted,
      message: isSuccessful ? `System bypassed! Code ${stageConfig.secretCode} acquired.` : 'Access Denied.'
    });

  } catch (error: unknown) {
    if (error instanceof LLMOverloadedError) {
      return res.status(503).json({ error: 'Service busy. Please retry in a few seconds.' });
    }

    if (error instanceof LLMTimeoutError) {
      return res.status(504).json({ error: 'AI service timed out. Please try again.' });
    }

    console.error('Game Controller Error:', error);
    return res.status(500).json({ error: 'An error occurred while processing your hack.' });
  }
};

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
        return res.status(403).json({ error: 'Previous stage not completed' });
      }
    }

    const stageConfig = SERVER_STAGE_CONFIGS[stageNumber - 1];
    if (!stageConfig) {
      return res.status(404).json({ error: 'Stage not found.' });
    }

    let embedding: number[] | null = null;
    try {
      embedding = await embedText(userMessage);
      const similarityCheck = await isPromptTooSimilar(stageNumber, embedding);

      if (similarityCheck.blocked) {
        supabase
          .from('prompt_logs')
          .insert({
            player_id: user.id,
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

        return res.json({ response: similarityCheck.message });
      }
    } catch (embeddingError) {
      console.warn('[chatPrompt] Embedding failed, skipping anti-cheat:', embeddingError);
    }

    const chatJob = await enqueueChatJob({
      playerId: user.id,
      stageNumber,
      userMessage,
      messages,
      embedding,
    });

    return res.json({ jobId: chatJob.id, status: 'queued' });
  } catch (error: unknown) {
    if (error instanceof LLMOverloadedError) {
      return res.status(503).json({ error: 'Service busy. Please retry in a few seconds.' });
    }

    if (error instanceof LLMTimeoutError) {
      return res.status(504).json({ error: 'AI service timed out. Please try again.' });
    }

    console.error('Game Chat Error:', error);
    return res.status(500).json({ error: 'An error occurred while processing your chat request.' });
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
      return res.status(400).json({ error: 'Job ID is required' });
    }

    const job = await llmQueue.getJob(jobId);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const payload = job.data as { playerId?: string };
    if (payload.playerId !== user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const state = await job.getState();
    if (state === 'completed') {
      const result = job.returnvalue as { response?: string } | undefined;
      return res.json({ status: 'completed', response: result?.response || 'No response received.' });
    }

    if (state === 'failed') {
      return res.status(500).json({ status: 'failed', error: job.failedReason || 'Job failed' });
    }

    return res.status(202).json({ status: state });
  } catch (error: unknown) {
    console.error('Game Chat Result Error:', error);
    return res.status(500).json({ error: 'Failed to get chat result.' });
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