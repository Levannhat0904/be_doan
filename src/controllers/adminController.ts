import { Request, Response, NextFunction, RequestHandler } from 'express';
import { AdminService } from '../services/adminService';
import { ADMIN_ROLES } from '../config/constants';

interface CreateAdminRequest {
  email: string;
  password: string;
  staffCode: string;
  fullName: string;
  role: string;
  phone?: string;
  department?: string;
}

export class AdminController {
  async createAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data: CreateAdminRequest = req.body;

      // Validate required fields
      if (!data.email || !data.password || !data.staffCode || !data.fullName || !data.role) {
        res.status(400).json({
          success: false,
          message: 'Vui lòng điền đầy đủ thông tin'
        });
        return;
      }

      // Validate role
      if (!Object.values(ADMIN_ROLES).includes(data.role)) {
        res.status(400).json({
          success: false,
          message: 'Vai trò không hợp lệ'
        });
        return;
      }

      const result = await AdminService.createAdmin(data);
      res.status(201).json({
        success: true,
        message: 'Tạo admin thành công',
        data: result
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error instanceof Error ? error.message : 'Lỗi tạo admin'
      });
    }
  }

  changePassword: RequestHandler = async (req, res) => {
    try {
      const userId = req.user?.id;
      const { currentPassword, newPassword } = req.body;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Unauthorized'
        });
        return;
      }

      if (!currentPassword || !newPassword) {
        res.status(400).json({
          success: false,
          message: 'Vui lòng nhập đầy đủ mật khẩu hiện tại và mật khẩu mới'
        });
        return;
      }

      // Validate mật khẩu mới
      if (newPassword.length < 8) {
        res.status(400).json({
          success: false,
          message: 'Mật khẩu mới phải có ít nhất 8 ký tự'
        });
        return;
      }

      await AdminService.changePassword(userId, {
        currentPassword,
        newPassword
      });

      res.json({
        success: true,
        message: 'Đổi mật khẩu thành công'
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error instanceof Error ? error.message : 'Lỗi đổi mật khẩu'
      });
    }
  };

  async getCurrentSession(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Không tìm thấy phiên đăng nhập'
        });
        return;
      }

      const userInfo = await AdminService.getCurrentUserInfo(userId);

      res.status(200).json({
        success: true,
        message: 'Lấy thông tin người dùng thành công',
        data: userInfo
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Lỗi lấy thông tin người dùng'
      });
    }
  }
} 