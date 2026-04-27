import { Request, Response, NextFunction } from 'express';
import { containsProfanity } from '../utils/profanity.js';
import { isDisposableEmailDomain } from '../utils/disposableEmails.js';

const USERNAME_PATTERN = /^[a-zA-Z0-9_\-. ]+$/;
const MIN_LENGTH = 2;
const MAX_LENGTH = 30;

// RFC 5322-lite. Good enough for signup; the verification code is what
// actually proves ownership.
const EMAIL_PATTERN = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;

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

export function validateEmailInput(req: Request, res: Response, next: NextFunction) {
  const { email } = req.body as { email?: unknown };

  if (typeof email !== 'string') {
    return res.status(400).json({ error: 'Email is required' });
  }

  const normalized = email.trim().toLowerCase();

  if (!normalized) {
    return res.status(400).json({ error: 'Email is required' });
  }

  if (normalized.length > 254) {
    return res.status(400).json({ error: 'Email is too long' });
  }

  if (!EMAIL_PATTERN.test(normalized)) {
    return res.status(400).json({ error: 'Email format is invalid' });
  }

  if (isDisposableEmailDomain(normalized)) {
    return res.status(400).json({
      error: 'Disposable email addresses are not allowed',
    });
  }

  req.body.email = normalized;
  next();
}
