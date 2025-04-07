import bcrypt from 'bcrypt';
import pool from '../config/database';
import { USER_TYPES, STATUS, ADMIN_ROLES } from '../config/constants';
import { RowDataPacket } from 'mysql2';

interface User extends RowDataPacket {
  id: number;
  email: string;
  password: string;
  userType: string;
  status: string;
}

interface Admin extends RowDataPacket {
  id: number;
  userId: number;
  staffCode: string;
  fullName: string;
  role: string;
}

interface UserWithProfile extends RowDataPacket {
  id: number;
  email: string;
  userType: string;
  status: string;
  lastLogin: Date;
  profile: string | null;
}

export class AdminService {
  static async createAdmin(data: {
    email: string;
    password: string;
    staffCode: string;
    fullName: string;
    role: string;
    phone?: string;
    department?: string;
  }): Promise<{ id: number }> {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Check if email already exists
      const [existingUsers] = await connection.query<User[]>(
        'SELECT id FROM users WHERE email = ?',
        [data.email]
      );

      if (existingUsers.length > 0) {
        throw new Error('Email đã tồn tại');
      }

      // Check if staff code already exists
      const [existingAdmins] = await connection.query<Admin[]>(
        'SELECT id FROM admins WHERE staffCode = ?',
        [data.staffCode]
      );

      if (existingAdmins.length > 0) {
        throw new Error('Mã nhân viên đã tồn tại');
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(data.password, 10);

      // Create user
      const [userResult] = await connection.query(
        'INSERT INTO users (email, password, userType, status) VALUES (?, ?, ?, ?)',
        [data.email, hashedPassword, USER_TYPES.ADMIN, STATUS.ACTIVE]
      );

      const userId = (userResult as any).insertId;

      // Create admin profile
      await connection.query(
        'INSERT INTO admins (userId, staffCode, fullName, role, phone, department) VALUES (?, ?, ?, ?, ?, ?)',
        [userId, data.staffCode, data.fullName, data.role, data.phone || null, data.department || null]
      );

      await connection.commit();
      return { id: userId };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  static async changePassword(userId: number, data: {
    currentPassword: string;
    newPassword: string;
  }): Promise<void> {
    const connection = await pool.getConnection();
    try {
      // Kiểm tra user có tồn tại không
      const [users] = await connection.query<User[]>(
        'SELECT * FROM users WHERE id = ? AND userType = ?',
        [userId, USER_TYPES.ADMIN]
      );

      const user = users[0];
      if (!user) {
        throw new Error('Không tìm thấy tài khoản admin');
      }

      // Kiểm tra mật khẩu hiện tại
      const isValidPassword = await bcrypt.compare(data.currentPassword, user.password);
      if (!isValidPassword) {
        throw new Error('Mật khẩu hiện tại không đúng');
      }

      // Hash mật khẩu mới
      const hashedPassword = await bcrypt.hash(data.newPassword, 10);

      // Cập nhật mật khẩu
      await connection.query(
        'UPDATE users SET password = ? WHERE id = ?',
        [hashedPassword, userId]
      );
    } finally {
      connection.release();
    }
  }

  static async getCurrentUserInfo(userId: number) {
    const connection = await pool.getConnection();

    try {
      const [rows] = await connection.execute<UserWithProfile[]>(`
        SELECT 
          u.id,
          u.email,
          u.userType,
          u.status,
          u.lastLogin,
          CASE 
            WHEN u.userType = 'admin' THEN (
              SELECT JSON_OBJECT(
                'id', a.id,
                'staffCode', a.staffCode,
                'fullName', a.fullName,
                'phone', a.phone,
                'role', a.role,
                'department', a.department,
                'avatarPath', a.avatarPath,
                'createdAt', a.createdAt
              )
              FROM admins a 
              WHERE a.userId = u.id
            )
            WHEN u.userType = 'student' THEN (
              SELECT JSON_OBJECT(
                'id', s.id,
                'studentCode', s.studentCode,
                'fullName', s.fullName,
                'gender', s.gender,
                'birthDate', s.birthDate,
                'phone', s.phone,
                'role', s.role,
                'address', s.address,
                'province', s.province,
                'district', s.district,
                'ward', s.ward,
                'faculty', s.faculty,
                'major', s.major,
                'className', s.className,
                'avatarPath', s.avatarPath,
                'status', s.status,
                'createdAt', s.createdAt
              )
              FROM students s 
              WHERE s.userId = u.id
            )
          END as profile
        FROM users u
        WHERE u.id = ?
      `, [userId]);

      if (!rows || !rows[0]) {
        throw new Error('Không tìm thấy thông tin người dùng');
      }

      const user = rows[0];
      if (user.profile) {
        user.profile = JSON.parse(user.profile);
      }

      return user;
    } catch (error) {
      throw error;
    }
  }
} 