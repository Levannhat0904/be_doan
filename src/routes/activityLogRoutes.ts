import express from 'express';
import activityLogController from '../controllers/activityLogController';
import { authMiddleware } from '../middlewares/authMiddleware';

const router = express.Router();

// Get activity logs - Admin only
router.get('/', authMiddleware, activityLogController.getActivityLogs);

export default router; 