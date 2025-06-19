import { RequestHandler } from "express";
import { StudentService } from "../services/studentService";
import fs from "fs";
import pool from "../config/database";
import { RowDataPacket, OkPacket } from "mysql2";
import activityLogService from "../services/activityLogService";
import FilesService from "../services/FilesService";
import path from "path";

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

export class StudentController {
  createStudent: RequestHandler = async (req, res) => {
    try {
      // Prepare data without avatar first
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
      };

      // Validate required fields
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

      const missingFields = requiredFields.filter(
        (field) => !data[field as keyof CreateStudentRequest]
      );

      if (missingFields.length > 0) {
        res.status(400).json({
          success: false,
          message: `Vui lòng điền đầy đủ thông tin: ${missingFields.join(
            ", "
          )}`,
        });
        return;
      }

      // Validate phone number
      const phoneRegex = /^[0-9]{10}$/;
      if (!phoneRegex.test(data.phone)) {
        res.status(400).json({
          success: false,
          message: "Số điện thoại không hợp lệ (phải có 10 chữ số)",
        });
        return;
      }

      // Validate gender
      if (!["male", "female", "other"].includes(data.gender)) {
        res.status(400).json({
          success: false,
          message: "Giới tính không hợp lệ",
        });
        return;
      }

      // Create student first without avatar
      let userResult;
      let studentId;
      let avatarPath;
      let avatarUrl;

      try {
        // First create student without avatar
        userResult = await StudentService.createStudent(data);

        // Get the student ID from the user ID
        const [studentResult] = await pool.query<RowDataPacket[]>(
          "SELECT id FROM students WHERE userId = ?",
          [userResult.id]
        );

        if (studentResult.length === 0) {
          throw new Error("Failed to retrieve student ID after creation");
        }

        studentId = studentResult[0].id;

        // If student creation is successful and there's a file, upload it
        if (req.file) {
          try {
            const buffer = req.file.buffer || fs.readFileSync(req.file.path);
            const filename = req.file.originalname;

            // Upload the file to cloud storage
            avatarPath = await FilesService.singleUpload(
              buffer,
              filename,
              "students",
              true
            );

            // Get the signed URL for the uploaded file
            avatarUrl = await FilesService.getSignedUrl(avatarPath, true);

            // Clean up local file if it exists
            if (req.file.path && fs.existsSync(req.file.path)) {
              fs.unlinkSync(req.file.path);
            }

            // Update the student with the avatar path and URL
            await pool.query(
              "UPDATE students SET avatarPath = ? WHERE id = ?",
              [avatarUrl, studentId]
            );
          } catch (error) {
            console.error("Error uploading avatar:", error);
            // Continue with the process even if avatar upload fails
          }
        }

        // Log activity
        if (req.user?.id) {
          await activityLogService.logActivity(
            req.user.id,
            "create",
            "student",
            studentId,
            `Created student: ${data.fullName} (${data.studentCode})`,
            req
          );
        }

        res.status(201).json({
          success: true,
          message: "Đăng ký thành công, vui lòng chờ admin phê duyệt",
          data: {
            ...userResult,
            studentId,
            ...(avatarPath && { avatarPath }),
            ...(avatarUrl && { avatarUrl }),
          },
        });
      } catch (error) {
        throw error;
      }
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error instanceof Error ? error.message : "Lỗi tạo sinh viên",
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
          "update",
          "student",
          studentId,
          `Activated student account: ${student.fullName} (${student.studentCode})`,
          req
        );
      }

      res.json({
        success: true,
        message: "Kích hoạt tài khoản thành công",
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message:
          error instanceof Error ? error.message : "Lỗi kích hoạt tài khoản",
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
          "update",
          "student",
          studentId,
          `Rejected student account: ${student.fullName} (${student.studentCode})`,
          req
        );
      }

      res.json({
        success: true,
        message: "Từ chối tài khoản thành công",
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message:
          error instanceof Error ? error.message : "Lỗi từ chối tài khoản",
      });
    }
  };

  getAllStudents: RequestHandler = async (req, res) => {
    try {
      const page = Number(req.query.page) || 1;
      const limit = Number(req.query.limit) || 10;
      const search = (req.query.search as string) || "";
      const status = (req.query.status as string) || "";

      console.log("Controller received:", { page, limit, search, status }); // Debug log

      const { students, total } = await StudentService.getAllStudents(
        page,
        limit,
        search,
        status
      );

      const totalPages = Math.ceil(total / limit);

      res.json({
        success: true,
        data: students,
        pagination: {
          currentPage: page,
          totalPages,
          totalItems: total,
          itemsPerPage: limit,
        },
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Lỗi lấy danh sách sinh viên",
      });
    }
  };

  getStudentById: RequestHandler = async (req, res) => {
    try {
      const { id } = req.params;
      const student = await StudentService.getStudentById(Number(id));
      res.json({
        success: true,
        data: student,
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Lỗi lấy thông tin sinh viên",
      });
    }
  };

  getStudentDetailById: RequestHandler = async (req, res) => {
    try {
      const { id } = req.params;
      const studentId = Number(id);

      // Kiểm tra quyền truy cập: admin có thể xem tất cả, sinh viên chỉ có thể xem thông tin của mình
      const isAdmin = req.user?.userType === "admin";

      // For student users, first get their student profile ID to compare
      let isOwnProfile = false;

      if (req.user?.userType === "student") {
        // If student user, check if they are looking at their own profile
        const [studentRecord] = await pool.query<RowDataPacket[]>(
          "SELECT id FROM students WHERE userId = ?",
          [req.user?.id || 0]
        );

        if (studentRecord.length > 0) {
          isOwnProfile = studentRecord[0].id === studentId;
        }
      }

      if (!isAdmin && !isOwnProfile) {
        res.status(403).json({
          success: false,
          message: "Bạn không có quyền xem thông tin này",
        });
        return;
      }

      // Get student information
      const student = await StudentService.getStudentById(studentId);

      // Get dormitory information from contracts or rooms
      const [dormitory] = await pool.query<RowDataPacket[]>(
        `
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
      `,
        [studentId]
      );

      // Get history records
      const [history] = await pool.query<RowDataPacket[]>(
        `
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
      `,
        [studentId]
      );

      // If there's no history yet, add basic registration entry
      const historyItems =
        history.length > 0
          ? history
          : [
              {
                id: 1,
                action: "register",
                description: "Đăng ký ký túc xá",
                date: student.createdAt,
                user: student.email,
              },
            ];

      // Get roommates if student has a dormitory
      let roommates: RowDataPacket[] = [];
      if (dormitory && dormitory.length > 0 && dormitory[0].roomId) {
        const [roommatResults] = await pool.query<RowDataPacket[]>(
          `
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
        `,
          [dormitory[0].roomId, studentId]
        );

        roommates = roommatResults;
      }

      res.json({
        success: true,
        data: {
          student,
          dormitory: dormitory && dormitory.length > 0 ? dormitory[0] : {},
          history: historyItems,
          roommates: roommates || [],
        },
      });
    } catch (error) {
      console.error("Error fetching student details:", error);
      res.status(400).json({
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Lỗi lấy thông tin chi tiết sinh viên",
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
        message: "Cập nhật trạng thái thành công",
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message:
          error instanceof Error ? error.message : "Lỗi cập nhật trạng thái",
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
        depositAmount,
      } = req.body;

      // Validate required fields
      if (!roomId) {
        res.status(400).json({
          success: false,
          message: "Vui lòng chọn phòng",
        });
        return;
      }

      // Start transaction
      await pool.query("START TRANSACTION");

      try {
        // Kiểm tra trạng thái sinh viên
        const [studentStatus] = await pool.query<RowDataPacket[]>(
          `SELECT s.status, s.userId FROM students s WHERE s.id = ?`,
          [id]
        );

        if (!studentStatus.length) {
          throw new Error("Không tìm thấy sinh viên");
        }

        // Nếu sinh viên chưa được phê duyệt, cập nhật trạng thái
        if (studentStatus[0].status !== "active") {
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
        const [existingContract] = await pool.query<RowDataPacket[]>(
          `
          SELECT id FROM contracts WHERE studentId = ? AND status = 'active'
        `,
          [id]
        );

        let contractId;

        if (existingContract.length > 0) {
          // Update existing contract
          contractId = existingContract[0].id;
          await pool.query(
            `
            UPDATE contracts
            SET roomId = ?, monthlyFee = ?, depositAmount = ?
            WHERE id = ?
          `,
            [roomId, monthlyFee, depositAmount, contractId]
          );
        } else {
          // Create new contract
          const startDate = new Date();
          const endDate = new Date();
          endDate.setFullYear(endDate.getFullYear() + 1); // Default 1 year contract

          const [contractResult] = await pool.query<OkPacket>(
            `
            INSERT INTO contracts 
            (contractNumber, studentId, roomId, startDate, endDate, depositAmount, monthlyFee, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'active')
          `,
            [
              `CTR-${id}-${Date.now()}`,
              id,
              roomId,
              startDate,
              endDate,
              depositAmount || 0,
              monthlyFee || 0,
            ]
          );

          contractId = contractResult.insertId;

          // Update room occupancy
          await pool.query(
            `
            UPDATE rooms SET currentOccupancy = currentOccupancy + 1 
            WHERE id = ?
          `,
            [roomId]
          );

          // Log activity
          await pool.query(
            `
            INSERT INTO activity_logs 
            (userId, action, entityType, entityId, description)
            VALUES (?, 'assign_room', 'student', ?, 'Cập nhật thông tin phòng ở')
          `,
            [req.user?.id || 1, id]
          );
        }

        // Store metadata in a separate key-value table or session if needed

        // Commit transaction
        await pool.query("COMMIT");

        res.json({
          success: true,
          message: "Cập nhật thông tin phòng ở thành công",
          data: {
            contractId,
            bedNumber,
            semester,
            schoolYear,
          },
        });
      } catch (error) {
        // Rollback on error
        await pool.query("ROLLBACK");
        throw error;
      }
    } catch (error) {
      console.error("Error updating student dormitory:", error);
      res.status(400).json({
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Lỗi cập nhật thông tin phòng ở",
      });
    }
  };

  updateStudentProfile: RequestHandler = async (req, res) => {
    // Bắt đầu transaction
    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      const { id } = req.params;
      const userId = Number(id);

      // Lấy thông tin sinh viên hiện tại bằng userId
      const [currentStudent] = await connection.query<RowDataPacket[]>(
        "SELECT * FROM students WHERE userId = ?",
        [userId]
      );

      if (!currentStudent.length) {
        throw new Error("Không tìm thấy thông tin sinh viên");
      }

      const studentId = currentStudent[0].id;

      // Kiểm tra email và số điện thoại trùng lặp (loại trừ sinh viên hiện tại)
      if (req.body.email) {
        const [existingEmail] = await connection.query<RowDataPacket[]>(
          "SELECT id FROM students WHERE email = ? AND id != ?",
          [req.body.email, studentId]
        );
        if (existingEmail.length > 0) {
          await connection.rollback();
          res.status(400).json({
            success: false,
            message: "Email đã được sử dụng",
            field: "email",
          });
          return;
        }
      }

      if (req.body.phone) {
        const [existingPhone] = await connection.query<RowDataPacket[]>(
          "SELECT id FROM students WHERE phone = ? AND id != ?",
          [req.body.phone, studentId]
        );
        if (existingPhone.length > 0) {
          await connection.rollback();
          res.status(400).json({
            success: false,
            message: "Số điện thoại đã được sử dụng",
            field: "phone",
          });
          return;
        }
      }

      // Cập nhật thông tin cơ bản
      const updateData: any = {};
      const allowedFields = [
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
        "email",
      ];

      allowedFields.forEach((field) => {
        if (req.body[field] !== undefined) {
          updateData[field] = req.body[field];
        }
      });

      // Nếu có file avatar mới
      if (req.file) {
        try {
          // Kiểm tra kích thước file (giới hạn 5MB)
          const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
          if (req.file.size > MAX_FILE_SIZE) {
            throw new Error("Kích thước file không được vượt quá 5MB");
          }

          console.log("File info:", {
            originalname: req.file.originalname,
            mimetype: req.file.mimetype,
            size: req.file.size,
            hasBuffer: !!req.file.buffer,
            path: req.file.path,
          });

          // Kiểm tra mime type
          if (!req.file.mimetype.startsWith("image/")) {
            throw new Error("File phải là hình ảnh");
          }

          const buffer = req.file.buffer || fs.readFileSync(req.file.path);

          // Tạo tên file với format chuẩn
          const timestamp = Date.now();
          const ext = path.extname(req.file.originalname);
          const filename = `student-${studentId}-${timestamp}${ext}`;

          console.log("Preparing to upload:", {
            filename,
            bufferSize: buffer.length,
          });

          // Upload với timeout 30 giây
          const avatarPath = await FilesService.singleUpload(
            buffer,
            filename,
            "students",
            true
          );

          const newAvatarPath = await FilesService.getSignedUrl(
            avatarPath,
            true
          );
          console.log("Upload result - newAvatarPath:", newAvatarPath);

          // Kiểm tra và xóa avatar cũ
          if (newAvatarPath && currentStudent[0].avatarPath) {
            console.log("Current avatar path:", currentStudent[0].avatarPath);
            const deleteResult = await FilesService.deleteFile(
              currentStudent[0].avatarPath
            );
            console.log("Delete old avatar result:", deleteResult);
          }

          // Cập nhật đường dẫn avatar mới
          updateData.avatarPath = newAvatarPath;

          // Xóa file local nếu tồn tại
          if (req.file.path && fs.existsSync(req.file.path)) {
            console.log("Cleaning up local file:", req.file.path);
            fs.unlinkSync(req.file.path);
          }
        } catch (uploadError: any) {
          console.error("Error details during avatar handling:", uploadError);

          // Xóa file local nếu có lỗi
          if (req.file.path && fs.existsSync(req.file.path)) {
            console.log("Cleaning up local file after error:", req.file.path);
            fs.unlinkSync(req.file.path);
          }

          throw new Error(`Lỗi khi xử lý avatar: ${uploadError.message}`);
        }
      }

      // Thực hiện cập nhật nếu có dữ liệu
      if (Object.keys(updateData).length > 0) {
        await connection.query("UPDATE students SET ? WHERE id = ?", [
          updateData,
          studentId,
        ]);
      }

      // Lấy thông tin sinh viên sau khi cập nhật
      const [updatedStudent] = await connection.query<RowDataPacket[]>(
        "SELECT * FROM students WHERE id = ?",
        [studentId]
      );

      // Ghi log hoạt động
      if (req.user?.id) {
        await activityLogService.logActivity(
          req.user.id,
          "update",
          "student",
          studentId,
          `Updated student profile: ${
            updateData.fullName || currentStudent[0].fullName
          }`,
          req
        );
      }

      // Commit transaction
      await connection.commit();

      // Tạo signed URL cho avatar nếu có
      let response = { ...updatedStudent[0] };
      if (response.avatarPath) {
        try {
          response.avatarUrl = await FilesService.getSignedUrl(
            response.avatarPath,
            true
          );
        } catch (urlError) {
          console.error("Lỗi khi tạo signed URL:", urlError);
        }
      }

      res.json({
        success: true,
        message: "Cập nhật thông tin sinh viên thành công",
        data: response,
      });
    } catch (error) {
      // Rollback nếu có lỗi
      await connection.rollback();

      console.error("Error updating student profile:", error);
      res.status(400).json({
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Lỗi cập nhật thông tin sinh viên",
      });
    } finally {
      // Luôn release connection
      connection.release();
    }
  };

  getCurrentStudentDetail: RequestHandler = async (req, res) => {
    try {
      // Ensure user is logged in
      if (!req.user) {
        console.log("No user found in request");
        res.status(403).json({
          success: false,
          message: "Unauthorized access - No user in request",
        });
        return;
      }

      console.log("Current user in getCurrentStudentDetail:", req.user);

      // Get student ID from the user ID
      const [studentRecord] = await pool.query<RowDataPacket[]>(
        "SELECT id FROM students WHERE userId = ?",
        [req.user?.id || 0]
      );

      console.log("Found student records:", studentRecord);

      if (studentRecord.length === 0) {
        console.log("No student record found for userId:", req.user.id);
        res.status(404).json({
          success: false,
          message: "Student profile not found for user ID: " + req.user.id,
        });
        return;
      }

      const studentId = studentRecord[0].id;

      console.log("Found student ID:", studentId);

      // Get student information
      const student = await StudentService.getStudentById(studentId);

      // Get dormitory information from contracts or rooms
      const [dormitory] = await pool.query<RowDataPacket[]>(
        `
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
      `,
        [studentId]
      );

      // Get history records
      const [history] = await pool.query<RowDataPacket[]>(
        `
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
      `,
        [studentId]
      );

      // If there's no history yet, add basic registration entry
      const historyItems =
        history.length > 0
          ? history
          : [
              {
                id: 1,
                action: "register",
                description: "Đăng ký ký túc xá",
                date: student.createdAt,
                user: student.email,
              },
            ];

      // Get roommates if student has a dormitory
      let roommates: RowDataPacket[] = [];
      if (dormitory && dormitory.length > 0 && dormitory[0].roomId) {
        const [roommatResults] = await pool.query<RowDataPacket[]>(
          `
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
        `,
          [dormitory[0].roomId, studentId]
        );

        roommates = roommatResults;
      }

      res.json({
        success: true,
        data: {
          student,
          dormitory: dormitory && dormitory.length > 0 ? dormitory[0] : {},
          history: historyItems,
          roommates: roommates || [],
        },
      });
    } catch (error) {
      console.error("Error fetching current student details:", error);
      res.status(400).json({
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Lỗi lấy thông tin chi tiết sinh viên",
      });
    }
  };

  // Get current student's invoices
  getCurrentStudentInvoices: RequestHandler = async (req, res) => {
    try {
      if (!req.user) {
        res.status(403).json({
          success: false,
          message: "Unauthorized access",
        });
        return;
      }

      // Get student ID from user ID
      const [studentResults] = await pool.query<RowDataPacket[]>(
        "SELECT id FROM students WHERE userId = ?",
        [req.user?.id || 0]
      );

      if (studentResults.length === 0) {
        res.status(404).json({
          success: false,
          message: "Student profile not found",
        });
        return;
      }

      const studentId = studentResults[0].id;

      // Lấy tất cả hợp đồng của sinh viên
      const [contractResult] = await pool.query<RowDataPacket[]>(
        `SELECT r.id as roomId, c.id as contractId, c.contractNumber, c.status as contractStatus, 
                c.startDate, c.endDate, c.updatedAt
         FROM contracts c 
         JOIN rooms r ON r.id = c.roomId 
         WHERE c.studentId = ?`,
        [studentId]
      );

      if (contractResult.length === 0) {
        res.status(404).json({
          success: false,
          message: "Không tìm thấy hợp đồng của sinh viên",
        });
        return;
      }

      // Mảng chứa hoá đơn từ tất cả các hợp đồng
      let allInvoices: any[] = [];
      
      // Lấy hoá đơn cho từng hợp đồng
      for (const contract of contractResult) {
        const roomId = contract.roomId;
        const contractId = contract.contractId;
        const startDate = contract.startDate;
        let endDate;

        // Xác định ngày kết thúc dựa trên trạng thái hợp đồng
        if (contract.contractStatus === 'terminated') {
          endDate = contract.updatedAt;
        } else {
          endDate = contract.endDate;
        }

        // Lấy hoá đơn cho hợp đồng này, sử dụng leftJoin contracts để lấy contractNumber
        const [invoiceRows] = await pool.query<RowDataPacket[]>(
          `SELECT 
             i.id, i.invoiceNumber, i.invoiceMonth, i.dueDate,
             i.roomFee, i.electricFee, i.waterFee, i.serviceFee,
             i.totalAmount, i.paymentStatus, i.paymentDate, i.paymentMethod,
             r.id as roomId, r.roomNumber, r.floorNumber,
             b.id as buildingId, b.name as buildingName,
             ? as contractId, ? as contractNumber
           FROM invoices i
           JOIN rooms r ON i.roomId = r.id
           JOIN buildings b ON r.buildingId = b.id
           WHERE i.roomId = ? AND i.invoiceMonth BETWEEN ? AND ?
           ORDER BY i.invoiceMonth DESC`,
          [contractId, contract.contractNumber, roomId, startDate, endDate]
        );

        // Thêm các hoá đơn vào mảng kết quả
        if (invoiceRows.length > 0) {
          allInvoices = [...allInvoices, ...invoiceRows];
        }
      }

      // Sắp xếp tất cả hoá đơn theo thời gian giảm dần
      allInvoices.sort((a, b) => {
        return new Date(b.invoiceMonth).getTime() - new Date(a.invoiceMonth).getTime();
      });

      res.status(200).json({
        success: true,
        data: {
          invoices: allInvoices.map((invoice) => ({
            id: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            roomId: invoice.roomId,
            roomNumber: invoice.roomNumber,
            floorNumber: invoice.floorNumber,
            buildingId: invoice.buildingId,
            buildingName: invoice.buildingName,
            contractId: invoice.contractId,
            contractNumber: invoice.contractNumber,
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
            paymentMethod: invoice.paymentMethod,
          })),
          pagination: {
            total: allInvoices.length,
            page: 1,
            limit: allInvoices.length,
            totalPages: 1,
          },
        },
      });
    } catch (error) {
      console.error("Error fetching student invoices:", error);
      res.status(500).json({
        success: false,
        message: "Lỗi khi truy vấn hóa đơn",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };
}
