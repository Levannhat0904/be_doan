import express from 'express';
import { AdminController } from '../controllers/adminController';
import { authMiddleware } from '../middlewares/authMiddleware';

const router = express.Router();
const adminController = new AdminController();

// Tạo admin mới (chỉ super admin mới có quyền)
router.post('/create', authMiddleware, adminController.createAdmin.bind(adminController));

router.post('/change-password', authMiddleware, adminController.changePassword);

export default router; 