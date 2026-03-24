import { Router } from 'express';
import { getMyProfile } from '../controllers/playerController.js';
import { authenticateUser } from '../middlewares/authMiddleware.js';

const router = Router();

// Notice we put authenticateUser here to protect the route
router.get('/me', authenticateUser, getMyProfile);

export default router;