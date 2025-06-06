import express from 'express';
import { StudentController } from '../controllers/studentController';
import { authMiddleware } from '../middlewares/authMiddleware';
import { isAdmin } from '../middlewares/roleMiddleware';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const router = express.Router();
const studentController = new StudentController();

// Tạo thư mục uploads nếu chưa tồn tại
const uploadDir = 'uploads/students';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Cấu hình multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Tạo tên file theo format: studentCode-timestamp.extension
    const studentCode = req.body.studentCode;
    const fileExt = path.extname(file.originalname);
    const fileName = `${studentCode}-${Date.now()}${fileExt}`;
    cb(null, fileName);
  }
});

// Kiểm tra file type
const fileFilter = (req: any, file: any, cb: any) => {
  // Chỉ chấp nhận image files
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Chỉ chấp nhận file ảnh (jpg, jpeg, png, gif)'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // Giới hạn 5MB
  }
});

// Error handling middleware cho multer
const uploadMiddleware = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  upload.single('avatarPath')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      // Lỗi từ multer
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          message: 'File ảnh không được vượt quá 5MB'
        });
      }
      return res.status(400).json({
        success: false,
        message: 'Lỗi upload file: ' + err.message
      });
    } else if (err) {
      // Lỗi khác
      return res.status(400).json({
        success: false,
        message: err.message
      });
    }
    next();
  });
};

// API routes
router.post('/', uploadMiddleware, studentController.createStudent);

// Debug route to test authentication
router.get('/test-auth', authMiddleware, (req, res) => {
  res.json({
    success: true,
    message: 'Authentication successful',
    user: req.user
  });
});

// Special routes that MUST come before dynamic routes with ID parameters
router.get('/current/detail', authMiddleware, studentController.getCurrentStudentDetail);
router.get('/current/invoices', authMiddleware, studentController.getCurrentStudentInvoices);
router.get('/', authMiddleware, isAdmin, studentController.getAllStudents);

// Dynamic routes with parameters
router.patch('/:id/activate', authMiddleware, isAdmin, studentController.activateStudent);
router.patch('/:id/reject', authMiddleware, isAdmin, studentController.rejectStudent);
router.get('/:id', authMiddleware, studentController.getStudentById);
router.get('/:id/detail', authMiddleware, studentController.getStudentDetailById);
router.put('/:id/status', authMiddleware, isAdmin, studentController.updateStudentStatus);
router.put('/:id/dormitory', authMiddleware, isAdmin, studentController.updateStudentDormitory);
router.put('/:id/profile', authMiddleware, uploadMiddleware, studentController.updateStudentProfile);

export default router; 