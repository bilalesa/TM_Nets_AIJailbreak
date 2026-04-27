import { Router } from 'express';
import { chatPrompt, getChatQueueHealth, getChatResult } from '../controllers/gameController.js';
import { authenticateUser } from '../middlewares/authMiddleware.js';
import { validateGameChatRequest } from '../middlewares/gameMiddleware.js';

const router = Router();

router.post('/chat', authenticateUser, validateGameChatRequest, chatPrompt);
router.get('/chat/result/:jobId', authenticateUser, getChatResult);
router.get('/chat/queue/health', authenticateUser, getChatQueueHealth);

export default router;