import { Request, Response } from 'express';

export const getMyProfile = (req: Request, res: Response) => {
  const user = req.user;

  if (!user) {
    return res.status(401).json({ error: "User context not found" });
  }

  return res.json({
    message: `Hello ${user.username}, your session is isolated.`,
    yourId: user.id
  });
};