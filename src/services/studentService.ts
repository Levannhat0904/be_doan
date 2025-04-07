import bcrypt from 'bcrypt';
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
  birthDate: string;
  status: string;
}

interface CreateStudentRequest {
  email: string;
  studentCode: string;
  fullName: string;
  birthDate: Date;
  gender: 'male' | 'female' | 'other';
  phone: string;
  province: string;
  district: string;
  ward: string;
  address: string;
  faculty: string;
  major: string;
  className: string;
  avatarPath?: string;
}

const requiredFields = [
  'email', 'studentCode', 'fullName', 'birthDate', 'gender',
  'phone', 'province', 'district', 'ward',
  'address', 'faculty', 'major', 'className'
];

export class StudentService {
  static async createStudent(data: CreateStudentRequest): Promise<{ id: number }> {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      console.log('Creating user with data:', {
        email: data.email,
        userType: USER_TYPES.STUDENT,
        status: STATUS.INACTIVE
      });

      // Tạo user với password rỗng
      const [userResult] = await connection.query(
        'INSERT INTO users (email, userType, status) VALUES (?, ?, ?)',
        [data.email, USER_TYPES.STUDENT, STATUS.PENDING]
      );

      const userId = (userResult as any).insertId;
      console.log('Created user with ID:', userId);

      console.log('Creating student with data:', {
        userId,
        studentCode: data.studentCode,
        fullName: data.fullName,
        status: STATUS.PENDING
        // ... other fields
      });

      // Tạo student profile với status pending
      await connection.query(
        `INSERT INTO students (
          userId, studentCode, fullName, birthDate, status,
          gender, phone, email,
          province, district, ward, address,
          faculty, major, className,
          avatarPath
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userId, data.studentCode, data.fullName, data.birthDate, STATUS.PENDING,
          data.gender, data.phone, data.email,
          data.province, data.district, data.ward, data.address,
          data.faculty, data.major, data.className,
          data.avatarPath || null
        ]
      );

      await connection.commit();
      return { id: userId };
    } catch (error) {
      await connection.rollback();
      console.error('Error in createStudent:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  static async activateStudent(studentId: number): Promise<void> {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Lấy thông tin sinh viên
      const [students] = await connection.query<Student[]>(
        'SELECT * FROM students WHERE id = ?',
        [studentId]
      );

      if (!students.length) {
        throw new Error('Không tìm thấy sinh viên');
      }

      const student = students[0];

      // Format ngày sinh thành password: DD/MM/YYYY
      const birthDate = new Date(student.birthDate);
      const password = birthDate.toLocaleDateString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });

      const hashedPassword = await bcrypt.hash(password, 10);

      // Cập nhật password và status của user
      await connection.query(
        'UPDATE users SET password = ?, status = ? WHERE id = ?',
        [hashedPassword, STATUS.ACTIVE, student.userId]
      );

      // Cập nhật status của student
      await connection.query(
        'UPDATE students SET status = ? WHERE id = ?',
        ['active', studentId]
      );

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  static async getAllStudents(): Promise<any[]> {
    const connection = await pool.getConnection();
    try {
      // Join bảng users và students để lấy đầy đủ thông tin
      const [rows] = await connection.query(`
        SELECT 
          s.*,
          u.email as email,
          u.status as status,
          u.lastLogin,
          u.createdAt as createdAt
        FROM students s
        LEFT JOIN users u ON s.userId = u.id
        ORDER BY s.createdAt DESC
      `);

      return rows as any[];
    } catch (error) {
      throw error;
    } finally {
      connection.release();
    }
  }
} 