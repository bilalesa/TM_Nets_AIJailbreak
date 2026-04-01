import { Router } from 'express';
import { chatPrompt, getChatQueueHealth, getChatResult, submitPrompt } from '../controllers/gameController.js';
import { authenticateUser } from '../middlewares/authMiddleware.js';
import { validateGameChatRequest, validateGameSubmission } from '../middlewares/gameMiddleware.js';

const router = Router();

// Protect this route so only logged-in players with a valid JWT can hack
router.post('/submit', authenticateUser, validateGameSubmission, submitPrompt);
router.post('/chat', authenticateUser, validateGameChatRequest, chatPrompt);
router.get('/chat/result/:jobId', authenticateUser, getChatResult);
router.get('/chat/queue/health', authenticateUser, getChatQueueHealth);

export default router;