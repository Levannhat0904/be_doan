import { Request, Response, RequestHandler } from "express";
import { AuthService } from "../services/authService";
import { LoginRequest, LogoutRequest, LogoutResponse } from "../types/express";
import activityLogService from "../services/activityLogService";
import crypto from "crypto";
import { sendEmail } from "../services/sendMail";
import { NextFunction } from "express";
import bcrypt from "bcrypt";
import { RowDataPacket } from "mysql2";
import pool from "../config/database";

export class AuthController {
  login: RequestHandler = async (req, res) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        res.status(400).json({
          success: false,
          message: "Email và mật khẩu là bắt buộc",
        });
        return;
      }

      const result = await AuthService.login(email, password);

      // Log login activity
      if (result.user && result.user.id) {
        await activityLogService.logActivity(
          result.user.id,
          "login",
          "user",
          result.user.id,
          `User logged in: ${email}`,
          req,
          undefined,
          undefined,
          undefined,
          result.user.id
        );
      }

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      res.status(401).json({
        success: false,
        message: error instanceof Error ? error.message : "Lỗi đăng nhập",
      });
    }
  };

  logout: RequestHandler = async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({
          success: false,
          message: "Unauthorized",
        });
        return;
      }

      await AuthService.logout(userId);

      // Log logout activity
      await activityLogService.logActivity(
        userId,
        "logout",
        "user",
        userId,
        `User logged out`,
        req,
        undefined,
        undefined,
        undefined,
        userId
      );

      res.json({
        success: true,
        message: "Đăng xuất thành công",
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Lỗi đăng xuất",
      });
    }
  };

  refreshToken: RequestHandler = async (req, res) => {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        res.status(400).json({
          success: false,
          message: "Refresh token là bắt buộc",
        });
        return;
      }

      const result = await AuthService.refreshToken(refreshToken);
      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      res.status(401).json({
        success: false,
        message: "Invalid refresh token",
      });
    }
  };

  // Yêu cầu reset mật khẩu
  forgotPassword = async (req: Request, res: Response): Promise<void> => {
    try {
      const { email } = req.body;

      if (!email) {
        res.status(400).json({
          success: false,
          message: "Vui lòng cung cấp địa chỉ email",
        });
        return;
      }

      // Kiểm tra email có tồn tại trong hệ thống
      const [userRows] = await pool.query(
        "SELECT * FROM users WHERE email = ?",
        [email]
      );
      const users = userRows as RowDataPacket[];

      if (users.length === 0) {
        res.status(404).json({
          success: false,
          message: "Không tìm thấy tài khoản với email này",
        });
        return;
      }

      const user = users[0];

      // Tạo reset token
      const resetToken = crypto.randomBytes(32).toString("hex");
      const resetTokenHash = crypto
        .createHash("sha256")
        .update(resetToken)
        .digest("hex");

      // Thời gian hết hạn: 30 phút
      const resetTokenExpires = new Date(Date.now() + 30 * 60 * 1000);

      // Lưu token vào DB
      await pool.query(
        "UPDATE users SET resetPasswordToken = ?, resetPasswordExpires = ? WHERE id = ?",
        [resetTokenHash, resetTokenExpires, user.id]
      );

      // Tạo URL reset
      const resetURL = `${
        process.env.FRONTEND_URL || "http://localhost:3001"
      }/dat-lai-mat-khau?token=${resetToken}`;

      // Tạo nội dung email
      let userName = email;
      if (user.userType === "student") {
        const [studentRows] = await pool.query(
          "SELECT fullName FROM students WHERE userId = ?",
          [user.id]
        );
        const students = studentRows as RowDataPacket[];
        if (students.length > 0) {
          userName = students[0].fullName;
        }
      } else if (user.userType === "admin") {
        const [adminRows] = await pool.query(
          "SELECT fullName FROM admins WHERE userId = ?",
          [user.id]
        );
        const admins = adminRows as RowDataPacket[];
        if (admins.length > 0) {
          userName = admins[0].fullName;
        }
      }
      console.log("resetURL", resetURL);
      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
          <h2 style="color: #003366; text-align: center;">Đặt lại mật khẩu</h2>
          <p>Xin chào <strong>${userName}</strong>,</p>
          <p>Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn. Vui lòng click vào nút bên dưới để thiết lập mật khẩu mới:</p>
          <div style="text-align: center; margin: 25px 0;">
            <a href="${resetURL}" style="background-color: #003366; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold;">Đặt lại mật khẩu</a>
          </div>
          <p>Liên kết này sẽ hết hạn sau 30 phút.</p>
          <p><strong>Lưu ý:</strong> Nếu bạn không yêu cầu đặt lại mật khẩu, vui lòng bỏ qua email này hoặc liên hệ với quản trị viên.</p>
          <div style="margin-top: 30px; padding-top: 15px; border-top: 1px solid #e0e0e0; color: #666; font-size: 12px;">
            <p>Đây là email tự động, vui lòng không trả lời email này.</p>
          </div>
        </div>
      `;

      const text = `Xin chào ${userName},\n\nChúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn. Vui lòng truy cập link sau để thiết lập mật khẩu mới: ${resetURL}\n\nLiên kết này sẽ hết hạn sau 30 phút.\n\nLưu ý: Nếu bạn không yêu cầu đặt lại mật khẩu, vui lòng bỏ qua email này hoặc liên hệ với quản trị viên.`;

      await sendEmail(
        {
          Email: email,
          Name: userName,
        },
        "Đặt lại mật khẩu - Ký túc xá sinh viên",
        text,
        html
      );

      res.status(200).json({
        success: true,
        message:
          "Email đặt lại mật khẩu đã được gửi đi. Vui lòng kiểm tra hộp thư của bạn.",
      });
    } catch (error) {
      console.error("Error in forgotPassword:", error);
      res.status(500).json({
        success: false,
        message: "Đã xảy ra lỗi khi xử lý yêu cầu",
      });
    }
  };

  // Xác thực token và đặt lại mật khẩu
  resetPassword = async (req: Request, res: Response): Promise<void> => {
    try {
      const { token, password } = req.body;

      if (!token || !password) {
        res.status(400).json({
          success: false,
          message: "Vui lòng cung cấp đầy đủ thông tin",
        });
        return;
      }

      // Hash token từ request
      const resetTokenHash = crypto
        .createHash("sha256")
        .update(token)
        .digest("hex");

      // Tìm user với token này và token chưa hết hạn
      const [userRows] = await pool.query(
        "SELECT * FROM users WHERE resetPasswordToken = ? AND resetPasswordExpires > NOW()",
        [resetTokenHash]
      );
      const users = userRows as RowDataPacket[];

      if (users.length === 0) {
        res.status(400).json({
          success: false,
          message: "Token không hợp lệ hoặc đã hết hạn",
        });
        return;
      }

      const user = users[0];

      // Hash mật khẩu mới
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);

      // Cập nhật mật khẩu và xóa token
      await pool.query(
        "UPDATE users SET password = ?, resetPasswordToken = NULL, resetPasswordExpires = NULL WHERE id = ?",
        [hashedPassword, user.id]
      );

      res.status(200).json({
        success: true,
        message: "Mật khẩu đã được cập nhật thành công",
      });
    } catch (error) {
      console.error("Error in resetPassword:", error);
      res.status(500).json({
        success: false,
        message: "Đã xảy ra lỗi khi xử lý yêu cầu",
      });
    }
  };

  changePassword: RequestHandler = async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body;
      // lấy bằng user id cách lấy từ token
      const userId = req.user?.id;
      console.log("userId", req);
      if (!userId) {
        res.status(401).json({
          success: false,
          message: "Unauthorized",
        });
        return;
      }
      const user = await AuthService.getUserById(userId as number);
      if (!user) {
        res.status(404).json({
          success: false,
          message: "User not found",
        });
        return;
      }
      const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
      if (!isPasswordValid) {
        res.status(400).json({
          success: false,
          message: "Mật khẩu hiện tại không chính xác",
        });
      }
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(newPassword, salt);
      await pool.query("UPDATE users SET password = ? WHERE id = ?", [hashedPassword, userId]);
      await activityLogService.logActivity(
        userId,
        "changePassword",
        "user",
        userId,
        `User changed password`,
        req,
        undefined,
        undefined,
        undefined,
        userId
      );
      res.status(200).json({
        success: true,
        message: "Mật khẩu đã được cập nhật thành công",
      });
    } catch (error) {
      console.error("Error in changePassword:", error);
      res.status(500).json({
        success: false,
        message: "Đã xảy ra lỗi khi xử lý yêu cầu",
      });
    }
  };
}
