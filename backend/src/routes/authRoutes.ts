import { Router } from 'express';
import { startSession, verifyEmail } from '../controllers/authController.js';
import {
  validateUsernameInput,
  validateEmailInput,
} from '../middlewares/usernameValidationMiddleware.js';

const router = Router();

router.post('/start', validateUsernameInput, validateEmailInput, startSession);
router.post('/verify', verifyEmail);

export default router;
