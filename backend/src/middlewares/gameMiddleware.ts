import { Request, Response, NextFunction } from 'express';

const MIN_STAGE_NUMBER = 1;
const MAX_STAGE_NUMBER = 5;
const MAX_PROMPT_LENGTH = 2000;
const MAX_MESSAGES_PAYLOAD = 20;

export function validateGameSubmission(req: Request, res: Response, next: NextFunction) {
  const { stageNumber, promptText } = req.body as {
    stageNumber?: unknown;
    promptText?: unknown;
  };

  if (!Number.isInteger(stageNumber)) {
    return res.status(400).json({ error: 'Stage number must be an integer.' });
  }

  const parsedStageNumber = stageNumber as number;

  if (parsedStageNumber < MIN_STAGE_NUMBER || parsedStageNumber > MAX_STAGE_NUMBER) {
    return res.status(400).json({
      error: `Stage number must be between ${MIN_STAGE_NUMBER} and ${MAX_STAGE_NUMBER}.`,
    });
  }

  if (typeof promptText !== 'string') {
    return res.status(400).json({ error: 'Prompt text is required.' });
  }

  const trimmedPromptText = promptText.trim();
  if (!trimmedPromptText) {
    return res.status(400).json({ error: 'Prompt text is required.' });
  }

  if (trimmedPromptText.length > MAX_PROMPT_LENGTH) {
    return res.status(400).json({
      error: `Prompt text must be ${MAX_PROMPT_LENGTH} characters or less.`,
    });
  }

  if (/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(trimmedPromptText)) {
    return res.status(400).json({ error: 'Prompt text contains invalid control characters.' });
  }

  req.body.stageNumber = parsedStageNumber;
  req.body.promptText = trimmedPromptText;
  next();
}

export function validateGameChatRequest(req: Request, res: Response, next: NextFunction) {
  const { stageNumber, userMessage, messages } = req.body as {
    stageNumber?: unknown;
    userMessage?: unknown;
    messages?: unknown;
  };

  if (!Number.isInteger(stageNumber)) {
    return res.status(400).json({ error: 'Stage number must be an integer.' });
  }

  const parsedStageNumber = stageNumber as number;
  if (parsedStageNumber < MIN_STAGE_NUMBER || parsedStageNumber > MAX_STAGE_NUMBER) {
    return res.status(400).json({ error: `Stage number must be between ${MIN_STAGE_NUMBER} and ${MAX_STAGE_NUMBER}.` });
  }

  if (typeof userMessage !== 'string') {
    return res.status(400).json({ error: 'Message required' });
  }

  const trimmedUserMessage = userMessage.trim();
  if (!trimmedUserMessage) {
    return res.status(400).json({ error: 'Message required' });
  }

  if (trimmedUserMessage.length > MAX_PROMPT_LENGTH) {
    return res.status(400).json({ error: `Message too long (max ${MAX_PROMPT_LENGTH} characters)` });
  }

  if (!Array.isArray(messages)) {
    return res.status(400).json({ error: 'Invalid chat history' });
  }

  const parsedMessages = messages
    .slice(-MAX_MESSAGES_PAYLOAD)
    .filter(
      (msg): msg is { role: 'user' | 'assistant'; content: string } =>
        typeof msg === 'object'
        && msg !== null
        && ((msg as { role?: unknown }).role === 'user' || (msg as { role?: unknown }).role === 'assistant')
        && typeof (msg as { content?: unknown }).content === 'string',
    )
    .map((msg) => ({
      role: msg.role,
      content: msg.content.trim().slice(0, MAX_PROMPT_LENGTH),
    }));

  req.body.stageNumber = parsedStageNumber;
  req.body.userMessage = trimmedUserMessage;
  req.body.messages = parsedMessages;
  next();
}
