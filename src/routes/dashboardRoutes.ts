import express from 'express';
import {
  getDashboardSummary,
  getMonthlyStats,
  getYearlyStats,
  getOccupancyStats
} from '../controllers/dashboardController';
import { authMiddleware } from '../middlewares/authMiddleware';
import { isAdmin } from '../middlewares/roleMiddleware';
const router = express.Router();

// Dashboard summary
router.get('/summary', authMiddleware, isAdmin, getDashboardSummary);

// Chart data routes
router.get('/monthly-stats', authMiddleware, isAdmin, getMonthlyStats);
router.get('/yearly-stats', authMiddleware, isAdmin, getYearlyStats);
router.get('/occupancy-stats', authMiddleware, isAdmin, getOccupancyStats);

export default router;  