import express from 'express';
import { StudentController } from '../controllers/studentController';
import { authMiddleware } from '../middlewares/authMiddleware';
import { isAdmin } from '../middlewares/roleMiddleware';

const router = express.Router();
const studentController = new StudentController();

// Tạo sinh viên mới (chỉ admin mới có quyền)
router.post('/create', authMiddleware, isAdmin, studentController.createStudent);

export default router; 