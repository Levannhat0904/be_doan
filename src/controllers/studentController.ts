import { RequestHandler } from 'express';
import { StudentService } from '../services/studentService';
import fs from 'fs';

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

      await StudentService.activateStudent(Number(id));

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

      await StudentService.rejectStudent(Number(id));
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

} 