import { Router } from 'express';
import { startSession } from '../controllers/authController.js';
import { validateUsernameInput } from '../middlewares/usernameValidationMiddleware.js';

const router = Router();

router.post('/start', validateUsernameInput, startSession);

export default router;