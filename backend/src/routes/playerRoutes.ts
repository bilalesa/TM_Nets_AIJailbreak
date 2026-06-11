import { Router } from 'express';
import { getMyProfile } from '../controllers/playerController.js';
import { getPlayerProfile, getStageHistory } from '../controllers/profileController.js';
import { authenticateUser } from '../middlewares/authMiddleware.js';

const router = Router();

router.get('/me', authenticateUser, getMyProfile);
router.get('/profile', authenticateUser, getPlayerProfile);
router.get('/stage-history', authenticateUser, getStageHistory);

export default router;
