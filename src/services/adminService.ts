import bcrypt from 'bcrypt';
import pool from '../config/database';
import { USER_TYPES, STATUS, ADMIN_ROLES } from '../config/constants';
import { RowDataPacket } from 'mysql2';

interface User extends RowDataPacket {
  id: number;
  email: string;
  password: string;
  user_type: string;
  status: string;
}

interface Admin extends RowDataPacket {
  id: number;
  user_id: number;
  staff_code: string;
  full_name: string;
  role: string;
}

interface UserWithProfile extends RowDataPacket {
  id: number;
  email: string;
  user_type: string;
  status: string;
  last_login: Date;
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
        'SELECT id FROM admins WHERE staff_code = ?',
        [data.staffCode]
      );

      if (existingAdmins.length > 0) {
        throw new Error('Mã nhân viên đã tồn tại');
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(data.password, 10);

      // Create user
      const [userResult] = await connection.query(
        'INSERT INTO users (email, password, user_type, status) VALUES (?, ?, ?, ?)',
        [data.email, hashedPassword, USER_TYPES.ADMIN, STATUS.ACTIVE]
      );

      const userId = (userResult as any).insertId;

      // Create admin profile
      await connection.query(
        'INSERT INTO admins (user_id, staff_code, full_name, role, phone, department) VALUES (?, ?, ?, ?, ?, ?)',
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
        'SELECT * FROM users WHERE id = ? AND user_type = ?',
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
          u.user_type,
          u.status,
          u.last_login,
          CASE 
            WHEN u.user_type = 'admin' THEN (
              SELECT JSON_OBJECT(
                'id', a.id,
                'staff_code', a.staff_code,
                'full_name', a.full_name,
                'phone', a.phone,
                'role', a.role,
                'department', a.department,
                'avatar_path', a.avatar_path,
                'created_at', a.created_at
              )
              FROM admins a 
              WHERE a.user_id = u.id
            )
            WHEN u.user_type = 'student' THEN (
              SELECT JSON_OBJECT(
                'id', s.id,
                'student_code', s.student_code,
                'full_name', s.full_name,
                'gender', s.gender,
                'birth_date', s.birth_date,
                'phone', s.phone,
                'address', s.address,
                'province', s.province,
                'district', s.district,
                'ward', s.ward,
                'department', s.department,
                'major', s.major,
                'class_name', s.class_name,
                'school_year', s.school_year,
                'avatar_path', s.avatar_path,
                'citizen_id', s.citizen_id,
                'emergency_contact_name', s.emergency_contact_name,
                'emergency_contact_phone', s.emergency_contact_phone,
                'emergency_contact_relationship', s.emergency_contact_relationship,
                'status', s.status,
                'created_at', s.created_at
              )
              FROM students s 
              WHERE s.user_id = u.id
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