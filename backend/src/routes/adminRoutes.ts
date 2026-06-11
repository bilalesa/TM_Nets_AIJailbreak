// backend/src/routes/adminRoutes.ts

import { Router } from 'express';
import { adminAuthMiddleware } from '../middlewares/adminAuthMiddleware.js';
import {
  login,
  getPlayers,
  getPlayer,
  deletePlayer,
  banPlayer,
  unbanPlayer,
  getLeaderboard,
  getStats,
  getAudit,
  wipeSystem,
  getStages,
  getStage,
  updateStage,
} from '../controllers/adminController.js';

const router = Router();

// Public — no auth required
router.post('/login', login);

// All routes below require admin auth
router.get('/players', adminAuthMiddleware, getPlayers);
router.get('/players/:id', adminAuthMiddleware, getPlayer);
router.delete('/players/:id', adminAuthMiddleware, deletePlayer);
router.post('/players/:id/ban', adminAuthMiddleware, banPlayer);
router.post('/players/:id/unban', adminAuthMiddleware, unbanPlayer);

router.get('/leaderboard', adminAuthMiddleware, getLeaderboard);
router.get('/stats', adminAuthMiddleware, getStats);
router.get('/audit', adminAuthMiddleware, getAudit);

router.post('/system/wipe', adminAuthMiddleware, wipeSystem);

router.get('/stages', adminAuthMiddleware, getStages);
router.get('/stages/:number', adminAuthMiddleware, getStage);
router.patch('/stages/:number', adminAuthMiddleware, updateStage);

export default router;
