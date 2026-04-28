import { Request, Response, NextFunction } from 'express';
import { containsProfanity } from '../utils/profanity.js';

const USERNAME_PATTERN = /^[a-zA-Z0-9_\-. ]+$/;
const MIN_LENGTH = 2;
const MAX_LENGTH = 30;

export function validateUsernameInput(req: Request, res: Response, next: NextFunction) {
  const { username } = req.body as { username?: unknown };

  if (typeof username !== 'string') {
    return res.status(400).json({ error: 'Username is required' });
  }

  const trimmedUsername = username.trim();

  if (!trimmedUsername) {
    return res.status(400).json({ error: 'Username is required' });
  }

  if (trimmedUsername.length < MIN_LENGTH || trimmedUsername.length > MAX_LENGTH) {
    return res.status(400).json({
      error: `Username must be ${MIN_LENGTH}-${MAX_LENGTH} characters long`,
    });
  }

  if (!USERNAME_PATTERN.test(trimmedUsername)) {
    return res.status(400).json({
      error: 'Username contains invalid characters',
    });
  }

  if (containsProfanity(trimmedUsername)) {
    return res.status(400).json({ error: 'Username contains disallowed language' });
  }

  req.body.username = trimmedUsername;
  next();
}
