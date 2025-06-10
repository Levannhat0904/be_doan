import express from 'express';
import { runAllStatusUpdates } from '../controllers/cronController';
import { authMiddleware } from '../middlewares/authMiddleware';
import { isAdmin } from '../middlewares/roleMiddleware';

const router = express.Router();

// Route để chạy cập nhật trạng thái thủ công (chỉ admin)
router.post('/run-status-updates', authMiddleware, isAdmin, runAllStatusUpdates);

export default router; 