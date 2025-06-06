import express from "express";
import { AuthController } from "../controllers/authController";
import { authMiddleware } from "../middlewares/authMiddleware";

const router = express.Router();
const authController = new AuthController();

router.post("/login", authController.login.bind(authController));
router.post(
  "/logout",
  authMiddleware,
  authController.logout.bind(authController)
);
router.post("/refresh-token", authController.refreshToken.bind(authController));
router.post(
  "/forgot-password",
  authController.forgotPassword.bind(authController)
);
router.post(
  "/reset-password",
  authController.resetPassword.bind(authController)
);

export default router;
