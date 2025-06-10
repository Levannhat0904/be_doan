import express from 'express';
import authRoutes from './authRoutes';
import adminRoutes from './adminRoutes';
import studentRoutes from './studentRoutes';
import administrativeRoutes from './administrativeRoutes';
import roomRoutes from './roomRoutes';
import buildingRoutes from './buildingRoutes';
import invoiceRoutes from './invoiceRoutes';
import dashboardRoutes from './dashboardRoutes';
import contractRoutes from './contractRoutes';
import activityLogRoutes from './activityLogRoutes';
import sendmailRoutes from './sendmail';
import cronRoutes from './cronRoutes';

const router = express.Router();

// Combine all routes
router.use('/auth', authRoutes);
router.use('/admin', adminRoutes);
router.use('/student', studentRoutes);
router.use('/administrative', administrativeRoutes);
router.use('/rooms', roomRoutes);
router.use('/buildings', buildingRoutes);
router.use('/contracts', contractRoutes);
router.use('/', invoiceRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/activity-logs', activityLogRoutes);
router.use('/', sendmailRoutes);
router.use('/cron', cronRoutes);

export default router; 