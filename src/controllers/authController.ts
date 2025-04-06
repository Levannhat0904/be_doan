import { Request, Response, RequestHandler } from 'express';
import { AuthService } from '../services/authService';
import { LoginRequest, LogoutRequest, LogoutResponse } from '../types/express';

export class AuthController {
  login: RequestHandler = async (req, res) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        res.status(400).json({
          success: false,
          message: 'Email và mật khẩu là bắt buộc'
        });
        return;
      }

      const result = await AuthService.login(email, password);
      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      res.status(401).json({
        success: false,
        message: error instanceof Error ? error.message : 'Lỗi đăng nhập'
      });
    }
  }

  logout: RequestHandler = async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Unauthorized'
        });
        return;
      }

      await AuthService.logout(userId);
      res.json({
        success: true,
        message: 'Đăng xuất thành công'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Lỗi đăng xuất'
      });
    }
  }

  refreshToken: RequestHandler = async (req, res) => {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        res.status(400).json({
          success: false,
          message: 'Refresh token là bắt buộc'
        });
        return;
      }

      const result = await AuthService.refreshToken(refreshToken);
      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      res.status(401).json({
        success: false,
        message: 'Invalid refresh token'
      });
    }
  }
} 