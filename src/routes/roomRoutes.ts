import express from 'express';
import { uploadRoomImages } from '../middleware/uploadMiddleware';
import {
  getRooms,
  addRoom,
  updateRoom,
  deleteRoom,
  getRoomDetail,
  updateRoomStatus
} from '../controllers/roomController';
import { authMiddleware } from '../middlewares/authMiddleware';

const router = express.Router();

// Get all rooms with pagination and filters
router.get('/', authMiddleware, (req, res, next) => {
  getRooms(req, res).catch(next);
});

// Add new room with images
router.post('/', authMiddleware, uploadRoomImages, (req, res, next) => {
  addRoom(req, res).catch(next);
});

// Update room with optional images
router.put('/:roomId', authMiddleware, uploadRoomImages, (req, res, next) => {
  updateRoom(req, res).catch(next);
});

// Delete room
router.delete('/:roomId', authMiddleware, (req, res, next) => {
  deleteRoom(req, res).catch(next);
});

// Get room detail
router.get('/:id/detail', authMiddleware, (req, res, next) => {
  getRoomDetail(req, res).catch(next);
});

// Update room status
router.patch('/:roomId/status', authMiddleware, (req, res, next) => {
  updateRoomStatus(req, res).catch(next);
});

export default router; 