import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import pool from '../config/database';
import { USER_TYPES, STATUS } from '../config/constants';
import { RowDataPacket } from 'mysql2';

interface User extends RowDataPacket {
  id: number;
  email: string;
  password: string;
  userType: string;
  status: string;
}

interface Student extends RowDataPacket {
  id: number;
  userId: number;
  studentCode: string;
  fullName: string;
}

interface Admin extends RowDataPacket {
  id: number;
  userId: number;
  staffCode: string;
  fullName: string;
  role: string;
}

interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: number;
    email: string;
    userType: string;
    profile: {
      id: number;
      staffCode?: string;
      studentCode?: string;
      fullName: string;
      role?: string;
    }
  }
}

export class AuthService {
  private static readonly JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
  private static readonly JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'your-refresh-secret';
  private static readonly JWT_EXPIRES_IN = '6d';
  private static readonly JWT_REFRESH_EXPIRES_IN = '7d';

  static async login(email: string, password: string): Promise<LoginResponse> {
    const connection = await pool.getConnection();
    try {
      // Tìm user theo email
      const [users] = await connection.query<User[]>(
        'SELECT * FROM users WHERE email = ? AND status = ?',
        [email, STATUS.ACTIVE]
      );

      const user = users[0];
      if (!user) {
        throw new Error('Email hoặc mật khẩu không đúng');
      }

      // Kiểm tra mật khẩu
      const isValidPassword = await bcrypt.compare(password, user.password);
      if (!isValidPassword) {
        throw new Error('Email hoặc mật khẩu không đúng');
      }

      // Lấy thông tin profile dựa vào user type
      let profile;
      if (user.userType === USER_TYPES.STUDENT) {
        const [students] = await connection.query<Student[]>(
          'SELECT * FROM students WHERE userId = ?',
          [user.id]
        );
        profile = students[0];
      } else {
        const [admins] = await connection.query<Admin[]>(
          'SELECT * FROM admins WHERE userId = ?',
          [user.id]
        );
        profile = admins[0];
      }

      // Tạo tokens
      const accessToken = jwt.sign(
        { userId: user.id, userType: user.userType },
        this.JWT_SECRET,
        { expiresIn: this.JWT_EXPIRES_IN }
      );

      const refreshToken = jwt.sign(
        { userId: user.id },
        this.JWT_REFRESH_SECRET,
        { expiresIn: this.JWT_REFRESH_EXPIRES_IN }
      );

      // Cập nhật refresh token trong database
      await connection.query(
        'UPDATE users SET refreshToken = ?, lastLogin = NOW() WHERE id = ?',
        [refreshToken, user.id]
      );

      return {
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          email: user.email,
          userType: user.userType,
          profile: {
            id: profile.id,
            staffCode: profile.staffCode,
            studentCode: profile.studentCode,
            fullName: profile.fullName,
            role: (profile as Admin).role
          }
        }
      };
    } finally {
      connection.release();
    }
  }

  static async logout(userId: number): Promise<void> {
    const connection = await pool.getConnection();
    try {
      // Xóa refresh token khi logout
      await connection.query(
        'UPDATE users SET refreshToken = NULL WHERE id = ?',
        [userId]
      );
    } finally {
      connection.release();
    }
  }

  static async refreshToken(refreshToken: string): Promise<{ accessToken: string, refreshToken: string }> {
    const connection = await pool.getConnection();
    try {
      // Verify refresh token
      const decoded = jwt.verify(refreshToken, this.JWT_REFRESH_SECRET) as { userId: number };

      // Kiểm tra refresh token trong database
      const [users] = await connection.query<User[]>(
        'SELECT * FROM users WHERE id = ? AND refreshToken = ?',
        [decoded.userId, refreshToken]
      );

      const user = users[0];
      if (!user) {
        throw new Error('Invalid refresh token');
      }

      // Tạo access token mới
      const accessToken = jwt.sign(
        { userId: user.id, userType: user.userType },
        this.JWT_SECRET,
        { expiresIn: this.JWT_EXPIRES_IN }
      );

      return { accessToken, refreshToken: refreshToken };
    } finally {
      connection.release();
    }
  }

  static async getUserById(userId: number): Promise<User> {
    const connection = await pool.getConnection();
    try {
      const [users] = await connection.query<User[]>(
        'SELECT * FROM users WHERE id = ?',
        [userId]
      );
      return users[0];
    } finally {
      connection.release();
    }
  }
} 