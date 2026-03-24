import { Request, Response } from 'express';

export const getMyProfile = (req: Request, res: Response) => {
  // We cast to 'any' because we attached 'user' in the middleware
  const user = (req as any).user;

  if (!user) {
    return res.status(401).json({ error: "User context not found" });
  }

  return res.json({
    message: `Hello ${user.username}, your session is isolated.`,
    yourId: user.id
  });
};