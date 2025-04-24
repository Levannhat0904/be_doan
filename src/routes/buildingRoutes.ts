// be/src/routes/buildingRoutes.ts
import express from 'express';
import {
  getBuildings,
  getBuildingById,
  createBuilding,
  updateBuilding,
  deleteBuilding,
  getAvailableBuildings,
  getAvailableRooms
} from '../controllers/buildingController';
import { authMiddleware } from '../middlewares/authMiddleware';
import multer from 'multer';

const router = express.Router();
const upload = multer();
router.get('/', authMiddleware, getBuildings);
router.get('/available', authMiddleware, getAvailableBuildings);
router.get('/:id', authMiddleware, getBuildingById);
router.get('/:buildingId/rooms/available', authMiddleware, getAvailableRooms);
router.post('/', authMiddleware, upload.none(), createBuilding);
router.put('/:id', authMiddleware, upload.none(), updateBuilding);
router.delete('/:id', authMiddleware, deleteBuilding);

export default router;