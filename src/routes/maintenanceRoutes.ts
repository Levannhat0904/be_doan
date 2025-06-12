import express from 'express';
import { uploadRoomImages } from '../middleware/uploadMiddleware';
import {
  getAllMaintenanceRequests,
  addMaintenanceRequest,
  updateMaintenanceRequest,
  deleteMaintenanceRequest,
  getMaintenanceRequestDetail
} from '../controllers/maintenanceRequestController';
import { authMiddleware } from '../middlewares/authMiddleware';

const router = express.Router();

// Lấy tất cả yêu cầu bảo trì với phân trang và lọc
router.get('/', authMiddleware, (req, res, next) => {
  getAllMaintenanceRequests(req, res).catch(next);
});

// Lấy chi tiết yêu cầu bảo trì
router.get('/:id', authMiddleware, (req, res, next) => {
  getMaintenanceRequestDetail(req, res).catch(next);
});

// Thêm yêu cầu bảo trì mới
router.post('/', authMiddleware, uploadRoomImages, (req, res, next) => {
  addMaintenanceRequest(req, res).catch(next);
});

// Cập nhật trạng thái yêu cầu bảo trì
router.put('/:id', authMiddleware, (req, res, next) => {
  updateMaintenanceRequest(req, res).catch(next);
});

// Xóa yêu cầu bảo trì
router.delete('/:id', authMiddleware, (req, res, next) => {
  deleteMaintenanceRequest(req, res).catch(next);
});

export default router; 