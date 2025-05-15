import { RequestHandler } from 'express';
import { StudentService } from '../services/studentService';
import fs from 'fs';
import pool from '../config/database';
import { RowDataPacket, OkPacket } from 'mysql2';
import activityLogService from '../services/activityLogService';

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

export class StudentController {
  createStudent: RequestHandler = async (req, res) => {
    try {
      // Lấy data từ form-data
      const data: CreateStudentRequest = {
        email: req.body.email,
        studentCode: req.body.studentCode,
        fullName: req.body.fullName,
        birthDate: req.body.birthDate,
        gender: req.body.gender,
        phone: req.body.phone,
        province: req.body.province,
        district: req.body.district,
        ward: req.body.ward,
        address: req.body.address,
        faculty: req.body.faculty,
        major: req.body.major,
        className: req.body.className,
        ...(req.file && { avatarPath: `/uploads/students/${req.file.filename}` })
      };

      // Validate required fields
      const requiredFields = [
        'email', 'studentCode', 'fullName', 'birthDate', 'gender',
        'phone', 'province', 'district', 'ward',
        'address', 'faculty', 'major', 'className'
      ];

      const missingFields = requiredFields.filter(field => !data[field as keyof CreateStudentRequest]);

      if (missingFields.length > 0) {
        res.status(400).json({
          success: false,
          message: `Vui lòng điền đầy đủ thông tin: ${missingFields.join(', ')}`
        });
        return;
      }

      // Validate phone number
      const phoneRegex = /^[0-9]{10}$/;
      if (!phoneRegex.test(data.phone)) {
        res.status(400).json({
          success: false,
          message: 'Số điện thoại không hợp lệ (phải có 10 chữ số)'
        });
        return;
      }

      // Validate gender
      if (!['male', 'female', 'other'].includes(data.gender)) {
        res.status(400).json({
          success: false,
          message: 'Giới tính không hợp lệ'
        });
        return;
      }

      // Validate và tạo sinh viên
      try {
        const result = await StudentService.createStudent(data);

        // Log activity
        if (req.user?.id) {
          await activityLogService.logActivity(
            req.user.id,
            'create',
            'student',
            result.id,
            `Created student: ${data.fullName} (${data.studentCode})`,
            req
          );
        }

        res.status(201).json({
          success: true,
          message: 'Đăng ký thành công, vui lòng chờ admin phê duyệt',
          data: result
        });
      } catch (error) {
        // Nếu tạo sinh viên thất bại, xóa file ảnh đã upload (nếu có)
        if (req.file) {
          const filePath = `uploads/students/${req.file.filename}`;
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        }
        throw error;
      }

    } catch (error) {
      res.status(400).json({
        success: false,
        message: error instanceof Error ? error.message : 'Lỗi tạo sinh viên'
      });
    }
  };

  activateStudent: RequestHandler = async (req, res) => {
    try {
      const { id } = req.params;
      const studentId = Number(id);

      // Get student info for logging
      const student = await StudentService.getStudentById(studentId);

      await StudentService.activateStudent(studentId);

      // Log activity
      if (req.user?.id) {
        await activityLogService.logActivity(
          req.user.id,
          'update',
          'student',
          studentId,
          `Activated student account: ${student.fullName} (${student.studentCode})`,
          req
        );
      }

      res.json({
        success: true,
        message: 'Kích hoạt tài khoản thành công'
      });

    } catch (error) {
      res.status(400).json({
        success: false,
        message: error instanceof Error ? error.message : 'Lỗi kích hoạt tài khoản'
      });
    }
  };

  rejectStudent: RequestHandler = async (req, res) => {
    try {
      const { id } = req.params;
      const studentId = Number(id);

      // Get student info for logging
      const student = await StudentService.getStudentById(studentId);

      await StudentService.rejectStudent(studentId);

      // Log activity
      if (req.user?.id) {
        await activityLogService.logActivity(
          req.user.id,
          'update',
          'student',
          studentId,
          `Rejected student account: ${student.fullName} (${student.studentCode})`,
          req
        );
      }

      res.json({
        success: true,
        message: 'Từ chối tài khoản thành công'
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error instanceof Error ? error.message : 'Lỗi từ chối tài khoản'
      });
    }
  };

  getAllStudents: RequestHandler = async (req, res) => {
    try {
      const page = Number(req.query.page) || 1;
      const limit = Number(req.query.limit) || 10;
      const search = (req.query.search as string) || '';

      console.log('Controller received:', { page, limit, search }); // Debug log

      const { students, total } = await StudentService.getAllStudents(page, limit, search);

      const totalPages = Math.ceil(total / limit);

      res.json({
        success: true,
        data: students,
        pagination: {
          currentPage: page,
          totalPages,
          totalItems: total,
          itemsPerPage: limit
        }
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error instanceof Error ? error.message : 'Lỗi lấy danh sách sinh viên'
      });
    }
  };

  getStudentById: RequestHandler = async (req, res) => {
    try {
      const { id } = req.params;
      const student = await StudentService.getStudentById(Number(id));
      res.json({
        success: true,
        data: student
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error instanceof Error ? error.message : 'Lỗi lấy thông tin sinh viên'
      });
    }
  };

  getStudentDetailById: RequestHandler = async (req, res) => {
    try {
      const { id } = req.params;
      const studentId = Number(id);

      // Kiểm tra quyền truy cập: admin có thể xem tất cả, sinh viên chỉ có thể xem thông tin của mình
      const isAdmin = req.user?.userType === 'admin';

      // For student users, first get their student profile ID to compare
      let isOwnProfile = false;

      if (req.user?.userType === 'student') {
        // If student user, check if they are looking at their own profile
        const [studentRecord] = await pool.query<RowDataPacket[]>(
          'SELECT id FROM students WHERE userId = ?',
          [req.user?.id || 0]
        );

        if (studentRecord.length > 0) {
          isOwnProfile = studentRecord[0].id === studentId;
        }
      }

      if (!isAdmin && !isOwnProfile) {
        res.status(403).json({
          success: false,
          message: 'Bạn không có quyền xem thông tin này'
        });
        return;
      }

      // Get student information
      const student = await StudentService.getStudentById(studentId);

      // Get dormitory information from contracts or rooms
      const [dormitory] = await pool.query<RowDataPacket[]>(`
        SELECT 
          c.id as contractId,
          r.id as roomId,
          r.buildingId,
          b.name as buildingName,
          r.roomNumber,
          r.floorNumber,
          c.startDate as checkInDate,
          c.endDate as checkOutDate,
          c.depositAmount,
          c.monthlyFee,
          CONCAT('Bed-', '1') as bedNumber,
          '1' as semester,
          '2023-2024' as schoolYear,
          c.status
        FROM contracts c
        JOIN rooms r ON c.roomId = r.id
        JOIN buildings b ON r.buildingId = b.id
        WHERE c.studentId = ? AND c.status = 'active'
        LIMIT 1
      `, [studentId]);

      // Get history records
      const [history] = await pool.query<RowDataPacket[]>(`
        SELECT 
          al.id,
          al.action,
          al.description,
          al.createdAt as date,
          CONCAT(u.email) as user
        FROM activity_logs al
        JOIN users u ON al.userId = u.id
        WHERE al.entityType = 'student' AND al.entityId = ?
        ORDER BY al.createdAt DESC
        LIMIT 10
      `, [studentId]);

      // If there's no history yet, add basic registration entry
      const historyItems = history.length > 0 ? history : [{
        id: 1,
        action: 'register',
        description: 'Đăng ký ký túc xá',
        date: student.createdAt,
        user: student.email
      }];

      // Get roommates if student has a dormitory
      let roommates: RowDataPacket[] = [];
      if (dormitory && dormitory.length > 0 && dormitory[0].roomId) {
        const [roommatResults] = await pool.query<RowDataPacket[]>(`
          SELECT 
            s.id,
            s.studentCode,
            s.fullName,
            s.gender,
            s.status,
            s.avatarPath
          FROM contracts c
          JOIN students s ON c.studentId = s.id
          WHERE c.roomId = ? AND c.studentId != ? AND c.status = 'active'
        `, [dormitory[0].roomId, studentId]);

        roommates = roommatResults;
      }

      res.json({
        success: true,
        data: {
          student,
          dormitory: dormitory && dormitory.length > 0 ? dormitory[0] : {},
          history: historyItems,
          roommates: roommates || []
        }
      });
    } catch (error) {
      console.error('Error fetching student details:', error);
      res.status(400).json({
        success: false,
        message: error instanceof Error ? error.message : 'Lỗi lấy thông tin chi tiết sinh viên'
      });
    }
  };

  updateStudentStatus: RequestHandler = async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      await StudentService.updateStudentStatus(Number(id), status);
      res.json({
        success: true,
        message: 'Cập nhật trạng thái thành công'
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error instanceof Error ? error.message : 'Lỗi cập nhật trạng thái'
      });
    }
  };

  updateStudentDormitory: RequestHandler = async (req, res) => {
    try {
      const { id } = req.params;
      const {
        buildingId,
        roomId,
        bedNumber,
        semester,
        schoolYear,
        monthlyFee,
        depositAmount
      } = req.body;

      // Validate required fields
      if (!roomId) {
        res.status(400).json({
          success: false,
          message: 'Vui lòng chọn phòng'
        });
        return;
      }

      // Start transaction
      await pool.query('START TRANSACTION');

      try {
        // Kiểm tra trạng thái sinh viên
        const [studentStatus] = await pool.query<RowDataPacket[]>(
          `SELECT s.status, s.userId FROM students s WHERE s.id = ?`,
          [id]
        );

        if (!studentStatus.length) {
          throw new Error('Không tìm thấy sinh viên');
        }

        // Nếu sinh viên chưa được phê duyệt, cập nhật trạng thái
        if (studentStatus[0].status !== 'active') {
          // Cập nhật trạng thái sinh viên
          await pool.query(
            `UPDATE students SET status = 'active' WHERE id = ?`,
            [id]
          );

          // Cập nhật trạng thái user
          if (studentStatus[0].userId) {
            await pool.query(
              `UPDATE users SET status = 'active' WHERE id = ?`,
              [studentStatus[0].userId]
            );
          }

          // Ghi log
          await pool.query(
            `INSERT INTO activity_logs 
             (userId, action, entityType, entityId, description)
             VALUES (?, 'update_status', 'student', ?, 'Cập nhật trạng thái sinh viên thành active khi cập nhật phòng ở')
            `,
            [req.user?.id || 1, id]
          );
        }

        // Check if student already has an active contract
        const [existingContract] = await pool.query<RowDataPacket[]>(`
          SELECT id FROM contracts WHERE studentId = ? AND status = 'active'
        `, [id]);

        let contractId;

        if (existingContract.length > 0) {
          // Update existing contract
          contractId = existingContract[0].id;
          await pool.query(`
            UPDATE contracts
            SET roomId = ?, monthlyFee = ?, depositAmount = ?
            WHERE id = ?
          `, [roomId, monthlyFee, depositAmount, contractId]);
        } else {
          // Create new contract
          const startDate = new Date();
          const endDate = new Date();
          endDate.setFullYear(endDate.getFullYear() + 1); // Default 1 year contract

          const [contractResult] = await pool.query<OkPacket>(`
            INSERT INTO contracts 
            (contractNumber, studentId, roomId, startDate, endDate, depositAmount, monthlyFee, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'active')
          `, [
            `CTR-${id}-${Date.now()}`,
            id,
            roomId,
            startDate,
            endDate,
            depositAmount || 0,
            monthlyFee || 0
          ]);

          contractId = contractResult.insertId;

          // Update room occupancy
          await pool.query(`
            UPDATE rooms SET currentOccupancy = currentOccupancy + 1 
            WHERE id = ?
          `, [roomId]);

          // Log activity
          await pool.query(`
            INSERT INTO activity_logs 
            (userId, action, entityType, entityId, description)
            VALUES (?, 'assign_room', 'student', ?, 'Cập nhật thông tin phòng ở')
          `, [req.user?.id || 1, id]);
        }

        // Store metadata in a separate key-value table or session if needed

        // Commit transaction
        await pool.query('COMMIT');

        res.json({
          success: true,
          message: 'Cập nhật thông tin phòng ở thành công',
          data: {
            contractId,
            bedNumber,
            semester,
            schoolYear
          }
        });
      } catch (error) {
        // Rollback on error
        await pool.query('ROLLBACK');
        throw error;
      }
    } catch (error) {
      console.error('Error updating student dormitory:', error);
      res.status(400).json({
        success: false,
        message: error instanceof Error ? error.message : 'Lỗi cập nhật thông tin phòng ở'
      });
    }
  }

  updateStudentProfile: RequestHandler = async (req, res) => {
    try {
      const { id } = req.params;
      const studentId = Number(id);

      // Kiểm tra quyền - chỉ admin hoặc chính sinh viên đó có thể cập nhật
      const isAdmin = req.user?.userType === 'admin';
      const isOwnProfile = req.user?.id === studentId;

      if (!isAdmin && !isOwnProfile) {
        res.status(403).json({
          success: false,
          message: 'Bạn không có quyền cập nhật thông tin này'
        });
        return;
      }

      // Tạo object chứa dữ liệu cần cập nhật
      const updateData: any = {};

      // Các trường có thể cập nhật
      const allowedFields = [
        'fullName', 'birthDate', 'gender', 'phone',
        'province', 'district', 'ward', 'address',
        'faculty', 'major', 'className', 'email'
      ];

      // Thêm các trường từ request body vào updateData
      allowedFields.forEach(field => {
        if (req.body[field] !== undefined) {
          updateData[field] = req.body[field];
        }
      });

      // Xử lý file ảnh đại diện nếu có
      if (req.file) {
        updateData.avatarPath = `/uploads/students/${req.file.filename}`;

        // Lấy thông tin sinh viên để xóa ảnh cũ nếu có
        const student = await StudentService.getStudentById(studentId);
        if (student.avatarPath) {
          const oldPath = `uploads/${student.avatarPath.split('/uploads/')[1]}`;
          if (fs.existsSync(oldPath)) {
            fs.unlinkSync(oldPath);
          }
        }
      }

      // Cập nhật thông tin sinh viên trong database
      await pool.query(`
        UPDATE students
        SET ?
        WHERE id = ?
      `, [updateData, studentId]);

      // Log activity
      if (req.user?.id) {
        await activityLogService.logActivity(
          req.user.id,
          'update',
          'student',
          studentId,
          `Updated student profile: ${updateData.fullName || ''}`,
          req
        );
      }

      res.json({
        success: true,
        message: 'Cập nhật thông tin sinh viên thành công'
      });

    } catch (error) {
      console.error('Error updating student profile:', error);
      res.status(400).json({
        success: false,
        message: error instanceof Error ? error.message : 'Lỗi cập nhật thông tin sinh viên'
      });
    }
  };

  getCurrentStudentDetail: RequestHandler = async (req, res) => {
    try {
      // Ensure user is logged in 
      if (!req.user) {
        console.log('No user found in request');
        res.status(403).json({
          success: false,
          message: 'Unauthorized access - No user in request'
        });
        return;
      }

      console.log('Current user in getCurrentStudentDetail:', req.user);

      // Get student ID from the user ID
      const [studentRecord] = await pool.query<RowDataPacket[]>(
        'SELECT id FROM students WHERE userId = ?',
        [req.user?.id || 0]
      );

      console.log('Found student records:', studentRecord);

      if (studentRecord.length === 0) {
        console.log('No student record found for userId:', req.user.id);
        res.status(404).json({
          success: false,
          message: 'Student profile not found for user ID: ' + req.user.id
        });
        return;
      }

      const studentId = studentRecord[0].id;

      console.log('Found student ID:', studentId);

      // Get student information
      const student = await StudentService.getStudentById(studentId);

      // Get dormitory information from contracts or rooms
      const [dormitory] = await pool.query<RowDataPacket[]>(`
        SELECT 
          c.id as contractId,
          r.id as roomId,
          r.buildingId,
          b.name as buildingName,
          r.roomNumber,
          r.floorNumber,
          c.startDate as checkInDate,
          c.endDate as checkOutDate,
          c.depositAmount,
          c.monthlyFee,
          CONCAT('Bed-', '1') as bedNumber,
          '1' as semester,
          '2023-2024' as schoolYear,
          c.status
        FROM contracts c
        JOIN rooms r ON c.roomId = r.id
        JOIN buildings b ON r.buildingId = b.id
        WHERE c.studentId = ? AND c.status = 'active'
        LIMIT 1
      `, [studentId]);

      // Get history records
      const [history] = await pool.query<RowDataPacket[]>(`
        SELECT 
          al.id,
          al.action,
          al.description,
          al.createdAt as date,
          CONCAT(u.email) as user
        FROM activity_logs al
        JOIN users u ON al.userId = u.id
        WHERE al.entityType = 'student' AND al.entityId = ?
        ORDER BY al.createdAt DESC
        LIMIT 10
      `, [studentId]);

      // If there's no history yet, add basic registration entry
      const historyItems = history.length > 0 ? history : [{
        id: 1,
        action: 'register',
        description: 'Đăng ký ký túc xá',
        date: student.createdAt,
        user: student.email
      }];

      // Get roommates if student has a dormitory
      let roommates: RowDataPacket[] = [];
      if (dormitory && dormitory.length > 0 && dormitory[0].roomId) {
        const [roommatResults] = await pool.query<RowDataPacket[]>(`
          SELECT 
            s.id,
            s.studentCode,
            s.fullName,
            s.gender,
            s.status,
            s.avatarPath
          FROM contracts c
          JOIN students s ON c.studentId = s.id
          WHERE c.roomId = ? AND c.studentId != ? AND c.status = 'active'
        `, [dormitory[0].roomId, studentId]);

        roommates = roommatResults;
      }

      res.json({
        success: true,
        data: {
          student,
          dormitory: dormitory && dormitory.length > 0 ? dormitory[0] : {},
          history: historyItems,
          roommates: roommates || []
        }
      });
    } catch (error) {
      console.error('Error fetching current student details:', error);
      res.status(400).json({
        success: false,
        message: error instanceof Error ? error.message : 'Lỗi lấy thông tin chi tiết sinh viên'
      });
    }
  };

  // Get current student's invoices
  getCurrentStudentInvoices: RequestHandler = async (req, res) => {
    try {
      if (!req.user) {
        res.status(403).json({
          success: false,
          message: 'Unauthorized access'
        });
      }

      // Get student ID from user ID
      const [studentResults] = await pool.query<RowDataPacket[]>(
        'SELECT id FROM students WHERE userId = ?',
        [req.user?.id || 0]
      );

      if (studentResults.length === 0) {
        res.status(404).json({
          success: false,
          message: 'Student profile not found'
        });
      }

      const studentId = studentResults[0].id;

      // Get student's invoices
      const [invoiceRows] = await pool.query<RowDataPacket[]>(
        `SELECT 
           i.id, i.invoiceNumber, i.invoiceMonth, i.dueDate,
           i.roomFee, i.electricFee, i.waterFee, i.serviceFee,
           i.totalAmount, i.paymentStatus, i.paymentDate, i.paymentMethod,
           r.id as roomId, r.roomNumber, r.floorNumber,
           b.id as buildingId, b.name as buildingName
         FROM invoices i
         JOIN contracts c ON i.roomId = c.roomId
         JOIN rooms r ON i.roomId = r.id
         JOIN buildings b ON r.buildingId = b.id
         WHERE c.studentId = ? AND (i.invoiceMonth BETWEEN c.startDate AND c.endDate OR c.endDate IS NULL)
         ORDER BY i.invoiceMonth DESC`,
        [studentId]
      );

      res.status(200).json({
        success: true,
        data: {
          invoices: invoiceRows.map(invoice => ({
            id: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            roomId: invoice.roomId,
            roomNumber: invoice.roomNumber,
            floorNumber: invoice.floorNumber,
            buildingId: invoice.buildingId,
            buildingName: invoice.buildingName,
            invoiceMonth: invoice.invoiceMonth,
            electricity: Math.round(invoice.electricFee / 2000), // kWh
            water: Math.round(invoice.waterFee / 10000), // m3
            electricFee: invoice.electricFee,
            waterFee: invoice.waterFee,
            serviceFee: invoice.serviceFee,
            roomFee: invoice.roomFee,
            totalAmount: invoice.totalAmount,
            dueDate: invoice.dueDate,
            paymentStatus: invoice.paymentStatus,
            paymentDate: invoice.paymentDate,
            paymentMethod: invoice.paymentMethod
          })),
          pagination: {
            total: invoiceRows.length,
            page: 1,
            limit: invoiceRows.length,
            totalPages: 1
          }
        }
      });
    } catch (error) {
      console.error('Error fetching student invoices:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi khi truy vấn hóa đơn',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };
} 