import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { recoverSession, startSession } from '../controllers/authController.js';
import { validateUsernameInput } from '../middlewares/usernameValidationMiddleware.js';

const router = Router();

const recoverLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/start', validateUsernameInput, startSession);
router.post('/recover', recoverLimiter, validateUsernameInput, recoverSession);

export default router;
