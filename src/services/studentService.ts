import bcrypt from "bcrypt";
import pool from "../config/database";
import { USER_TYPES, STATUS } from "../config/constants";
import { RowDataPacket } from "mysql2";

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
  gender: "male" | "female" | "other";
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
  "email",
  "studentCode",
  "fullName",
  "birthDate",
  "gender",
  "phone",
  "province",
  "district",
  "ward",
  "address",
  "faculty",
  "major",
  "className",
];

export class StudentService {
  static async createStudent(
    data: CreateStudentRequest
  ): Promise<{ id: number }> {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      // Tạo user với password rỗng
      const [userResult] = await connection.query(
        "INSERT INTO users (email, userType, status) VALUES (?, ?, ?)",
        [data.email, USER_TYPES.STUDENT, STATUS.PENDING]
      );

      const userId = (userResult as any).insertId;

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
          userId,
          data.studentCode,
          data.fullName,
          data.birthDate,
          STATUS.PENDING,
          data.gender,
          data.phone,
          data.email,
          data.province,
          data.district,
          data.ward,
          data.address,
          data.faculty,
          data.major,
          data.className,
          data.avatarPath || null,
        ]
      );

      await connection.commit();
      return { id: userId };
    } catch (error) {
      await connection.rollback();
      console.error("Error in createStudent:", error);
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
        "SELECT * FROM students WHERE id = ?",
        [studentId]
      );

      if (!students.length) {
        throw new Error("Không tìm thấy sinh viên");
      }

      const student = students[0];

      // Format ngày sinh thành password: DD/MM/YYYY
      const birthDate = new Date(student.birthDate);
      const password = birthDate.toLocaleDateString("vi-VN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });

      const hashedPassword = await bcrypt.hash(password, 10);

      // Cập nhật password và status của user
      await connection.query(
        "UPDATE users SET password = ?, status = ? WHERE id = ?",
        [hashedPassword, STATUS.ACTIVE, student.userId]
      );

      // Cập nhật status của student
      await connection.query("UPDATE students SET status = ? WHERE id = ?", [
        "active",
        studentId,
      ]);

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  static async rejectStudent(studentId: number): Promise<void> {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Lấy thông tin sinh viên
      const [students] = await connection.query<Student[]>(
        "SELECT * FROM students WHERE id = ?",
        [studentId]
      );

      if (!students.length) {
        throw new Error("Không tìm thấy sinh viên");
      }

      const student = students[0];

      // 1. Cập nhật status của user thành inactive
      await connection.query("UPDATE users SET status = ? WHERE id = ?", [
        STATUS.INACTIVE,
        student.userId,
      ]);

      // 2. Cập nhật status của student thành inactive
      await connection.query("UPDATE students SET status = ? WHERE id = ?", [
        "inactive",
        studentId,
      ]);

      // 3. Cập nhật trạng thái tất cả các hợp đồng liên quan thành terminated
      await connection.query(
        "UPDATE contracts SET status = ? WHERE studentId = ? AND status = ?",
        ["terminated", studentId, "active"]
      );

      // 4. Lấy phòng mà sinh viên đã được gán (để cập nhật currentOccupancy)
      const [roomResults] = await connection.query<RowDataPacket[]>(
        `SELECT r.id, r.currentOccupancy 
         FROM contracts c
         JOIN rooms r ON c.roomId = r.id
         WHERE c.studentId = ? AND c.status = 'terminated'`,
        [studentId]
      );

      // 5. Cập nhật currentOccupancy của từng phòng
      for (const room of roomResults) {
        await connection.query(
          "UPDATE rooms SET currentOccupancy = GREATEST(0, currentOccupancy - 1) WHERE id = ?",
          [room.id]
        );
      }
      // 6. Xoá mật khẩu của user
      await connection.query("UPDATE users SET password = NULL WHERE id = ?", [
        student.userId,
      ]);

      // 7. Ghi log hoạt động
      await connection.query(
        `INSERT INTO activity_logs (userId, action, entityType, entityId, description)
         VALUES (?, ?, ?, ?, ?)`,
        [
          student.userId,
          "reject",
          "student",
          studentId,
          "Từ chối sinh viên và chấm dứt các hợp đồng liên quan",
        ]
      );

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  static async getAllStudents(
    page: number = 1,
    limit: number = 10,
    search: string = ""
  ): Promise<{ students: any[]; total: number }> {
    const connection = await pool.getConnection();
    try {
      const offset = (page - 1) * limit;
      const searchPattern = `%${search}%`;

      // Log để kiểm tra giá trị đầu vào
      console.log("Search params:", {
        page,
        limit,
        search,
        offset,
        searchPattern,
      });

      let whereClause = "1=1"; // Always true if no search
      let queryParams = [];

      if (search && search.trim()) {
        whereClause = `(
          s.studentCode LIKE ? OR
          s.fullName LIKE ? OR
          s.phone LIKE ? OR
          s.email LIKE ? OR
          s.className LIKE ? OR
          s.faculty LIKE ? OR
          s.major LIKE ?
        )`;
        queryParams = Array(7).fill(searchPattern);
      }

      // Log câu query count
      const countQuery = `
        SELECT COUNT(*) as total
        FROM students s
        LEFT JOIN users u ON s.userId = u.id
        WHERE ${whereClause}
      `;
      console.log("Count Query:", countQuery);
      console.log("Count Params:", queryParams);

      const [countResult] = await connection.query(countQuery, queryParams);
      const total = (countResult as any)[0].total;

      // Log câu query select
      const selectQuery = `
        SELECT 
          s.*,
          u.email,
          u.status as userStatus,
          u.lastLogin,
          u.createdAt as userCreatedAt
        FROM students s
        LEFT JOIN users u ON s.userId = u.id
        WHERE ${whereClause}
        ORDER BY s.createdAt DESC
        LIMIT ? OFFSET ?
      `;
      const selectParams = [...queryParams, limit, offset];
      console.log("Select Query:", selectQuery);
      console.log("Select Params:", selectParams);

      const [students] = await connection.query(selectQuery, selectParams);

      // Log kết quả
      console.log("Total records:", total);

      return {
        students: students as any[],
        total,
      };
    } catch (error) {
      console.error("Error in getAllStudents:", error);
      throw error;
    } finally {
      connection.release();
    }
  }

  static async getStudentById(id: number): Promise<Student> {
    const connection = await pool.getConnection();
    try {
      const [students] = await connection.query<Student[]>(
        "SELECT * FROM students WHERE id = ?",
        [id]
      );

      if (!students.length) {
        throw new Error("Không tìm thấy sinh viên");
      }

      return students[0];
    } catch (error) {
      throw error;
    } finally {
      connection.release();
    }
  }

  static async updateStudentStatus(id: number, status: string): Promise<void> {
    const connection = await pool.getConnection();
    try {
      await connection.query("UPDATE students SET status = ? WHERE id = ?", [
        status,
        id,
      ]);
    } catch (error) {
      throw error;
    } finally {
      connection.release();
    }
  }
}
