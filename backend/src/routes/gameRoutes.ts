import { Router } from 'express';
import { chatPrompt, getChatQueueHealth, getChatResult, getPublicLeaderboard, getStageConfigPublic } from '../controllers/gameController.js';
import { validateCode } from '../controllers/validateCodeController.js';
import { authenticateUser } from '../middlewares/authMiddleware.js';
import { validateGameChatRequest } from '../middlewares/gameMiddleware.js';

const router = Router();

router.post('/chat', authenticateUser, validateGameChatRequest, chatPrompt);
router.get('/chat/result/:jobId', authenticateUser, getChatResult);
router.get('/chat/queue/health', authenticateUser, getChatQueueHealth);
router.post('/validate-code', authenticateUser, validateCode);
router.get('/leaderboard', getPublicLeaderboard);
router.get('/stage-config/:number', getStageConfigPublic);

export default router;
