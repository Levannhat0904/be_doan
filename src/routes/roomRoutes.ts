import express from 'express';
import { uploadRoomImages } from '../middleware/uploadMiddleware';
import {
  getRooms,
  addRoom,
  updateRoom,
  deleteRoom,
  getRoomDetail,
  updateRoomStatus,
  addMaintenance,
  addUtility,
  removeResident,
  processMaintenanceRequest
} from '../controllers/roomController';
import { updateInvoiceStatus } from '../controllers/invoiceController';
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
router.put('/maintenance-requests/:requestId', authMiddleware, (req, res, next) => {
  processMaintenanceRequest(req, res).catch(next);
});

// Update room status
router.put('/:roomId/status', authMiddleware, (req, res, next) => {
  updateRoomStatus(req, res).catch(next);
});

// Add Maintenance
router.post('/:roomId/maintenance', authMiddleware, (req, res, next) => {
  addMaintenance(req, res).catch(next);
});
// Thêm vào file be/src/routes/index.ts
router.use('/maintenance-requests', (req, res, next) => {
  // Redirect to the route in roomRoutes
  req.url = req.url.replace('/maintenance-requests', '/rooms/maintenance-requests');
  next();
});

// Add Utility
router.post('/:roomId/utilities', authMiddleware, (req, res, next) => {
  addUtility(req, res).catch(next);
});

// Remove Resident
router.delete('/:roomId/residents/:residentId', authMiddleware, (req, res, next) => {
  removeResident(req, res).catch(next);
});

// Update Invoice Status
router.put('/invoices/:invoiceId/status', authMiddleware, (req, res, next) => {
  updateInvoiceStatus(req, res).catch(next);
});

export default router; 