import { RequestHandler } from 'express';
import { StudentService } from '../services/studentService';

interface CreateStudentRequest {
  email: string;
  password: string;
  studentCode: string;
  fullName: string;
}

export class StudentController {
  createStudent: RequestHandler = async (req, res) => {
    try {
      const data: CreateStudentRequest = req.body;

      // Validate dữ liệu đầu vào
      if (!data.email || !data.password || !data.studentCode || !data.fullName) {
        res.status(400).json({
          success: false,
          message: 'Vui lòng điền đầy đủ thông tin'
        });
        return;
      }

      // Validate email
      if (!data.email.endsWith('@utt.edu.vn')) {
        res.status(400).json({
          success: false,
          message: 'Email phải có định dạng @utt.edu.vn'
        });
        return;
      }

      // Validate mật khẩu
      if (data.password.length < 8) {
        res.status(400).json({
          success: false,
          message: 'Mật khẩu phải có ít nhất 8 ký tự'
        });
        return;
      }

      const result = await StudentService.createStudent(data);
      res.status(201).json({
        success: true,
        message: 'Tạo sinh viên thành công',
        data: result
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error instanceof Error ? error.message : 'Lỗi tạo sinh viên'
      });
    }
  };
} 