import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { recoverSession, startSession } from '../controllers/authController.js';
import { validateUsernameInput } from '../middlewares/usernameValidationMiddleware.js';

const router = Router();

// Tighter limit for the recover endpoint specifically. The shared auth
// limiter (mounted in index.ts) is already 40 req / 10min; this one caps
// recovery attempts at 10 per 10min per IP, which combined with scrypt's
// ~50ms cost and the 80-bit code entropy makes online brute-force a
// non-issue.
const recoverLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/start', validateUsernameInput, startSession);
router.post('/recover', recoverLimiter, validateUsernameInput, recoverSession);

export default router;
