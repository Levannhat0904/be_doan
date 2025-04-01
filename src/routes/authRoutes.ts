import express from 'express';
import { AuthController } from '../controllers/authController';
import { authMiddleware } from '../middlewares/authMiddleware';

const router = express.Router();
const authController = new AuthController();

router.post('/login', authController.login.bind(authController));
router.post('/logout', authController.logout.bind(authController));
router.post('/refresh-token', authController.refreshToken.bind(authController));

export default router; 