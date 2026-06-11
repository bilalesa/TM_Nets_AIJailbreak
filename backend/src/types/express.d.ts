import type { AdminClaims } from '../middlewares/adminAuthMiddleware.js';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        username: string;
      };
      admin?: AdminClaims;
    }
  }
}

export {};
