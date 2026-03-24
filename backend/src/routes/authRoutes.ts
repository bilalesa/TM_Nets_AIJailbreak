import { Router } from 'express';
import { startSession } from '../controllers/authController.js';

const router = Router();

router.post('/start', startSession);

export default router;