import { Router } from 'express';
import { startSession } from '../controllers/authController.js';
import {
  validateUsernameInput,
  validateEmailInput,
} from '../middlewares/usernameValidationMiddleware.js';

const router = Router();

router.post('/start', validateUsernameInput, validateEmailInput, startSession);

export default router;
