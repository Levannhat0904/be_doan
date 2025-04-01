import bcrypt from 'bcrypt';
import pool from '../config/database';
import { USER_TYPES, STATUS } from '../config/constants';
import { RowDataPacket } from 'mysql2';

interface User extends RowDataPacket {
  id: number;
  email: string;
  password: string;
  user_type: string;
  status: string;
}

interface Student extends RowDataPacket {
  id: number;
  user_id: number;
  student_code: string;
  full_name: string;
}

export class StudentService {
  static async createStudent(data: {
    email: string;
    password: string;
    studentCode: string;
    fullName: string;
  }): Promise<{ id: number }> {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Kiểm tra email đã tồn tại chưa
      const [existingUsers] = await connection.query<User[]>(
        'SELECT id FROM users WHERE email = ?',
        [data.email]
      );

      if (existingUsers.length > 0) {
        throw new Error('Email đã tồn tại');
      }

      // Kiểm tra mã sinh viên đã tồn tại chưa
      const [existingStudents] = await connection.query<Student[]>(
        'SELECT id FROM students WHERE student_code = ?',
        [data.studentCode]
      );

      if (existingStudents.length > 0) {
        throw new Error('Mã sinh viên đã tồn tại');
      }

      // Hash mật khẩu
      const hashedPassword = await bcrypt.hash(data.password, 10);

      // Tạo user mới
      const [userResult] = await connection.query(
        'INSERT INTO users (email, password, user_type, status) VALUES (?, ?, ?, ?)',
        [data.email, hashedPassword, USER_TYPES.STUDENT, STATUS.ACTIVE]
      );

      const userId = (userResult as any).insertId;

      // Tạo profile sinh viên
      await connection.query(
        'INSERT INTO students (user_id, student_code, full_name) VALUES (?, ?, ?)',
        [userId, data.studentCode, data.fullName]
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
} 