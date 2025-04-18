import pool from '../config/database';
import logger from '../utils/logger';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import { USER_TYPES } from '../config/constants';

// Load environment variables
dotenv.config();

// Dữ liệu mẫu sinh viên
const sampleStudents = [
  {
    email: 'sv1@example.com',
    studentCode: 'SV001',
    fullName: 'Nguyễn Văn An',
    birthDate: '2000-01-15',
    gender: 'male',
    phone: '0987654321',
    province: 'Hà Nội',
    district: 'Cầu Giấy',
    ward: 'Dịch Vọng Hậu',
    address: '144 Xuân Thủy',
    faculty: 'Công nghệ thông tin',
    major: 'Khoa học máy tính',
    className: 'CNTT01'
  },
  {
    email: 'sv2@example.com',
    studentCode: 'SV002',
    fullName: 'Trần Thị Bình',
    birthDate: '2001-05-20',
    gender: 'female',
    phone: '0987654322',
    province: 'Hà Nội',
    district: 'Hai Bà Trưng',
    ward: 'Bách Khoa',
    address: '1 Đại Cồ Việt',
    faculty: 'Kinh tế',
    major: 'Kế toán',
    className: 'KT02'
  },
  {
    email: 'sv3@example.com',
    studentCode: 'SV003',
    fullName: 'Phạm Văn Cường',
    birthDate: '2000-08-10',
    gender: 'male',
    phone: '0987654323',
    province: 'Hà Nội',
    district: 'Nam Từ Liêm',
    ward: 'Mỹ Đình',
    address: '18 Phạm Hùng',
    faculty: 'Điện - Điện tử',
    major: 'Kỹ thuật điện',
    className: 'DDT03'
  },
  {
    email: 'sv4@example.com',
    studentCode: 'SV004',
    fullName: 'Lê Thị Dung',
    birthDate: '2002-03-25',
    gender: 'female',
    phone: '0987654324',
    province: 'Hà Nội',
    district: 'Hoàn Kiếm',
    ward: 'Hàng Bạc',
    address: '5 Hàng Đào',
    faculty: 'Ngoại ngữ',
    major: 'Tiếng Anh',
    className: 'NN04'
  },
  {
    email: 'sv5@example.com',
    studentCode: 'SV005',
    fullName: 'Hoàng Văn Em',
    birthDate: '2001-11-05',
    gender: 'male',
    phone: '0987654325',
    province: 'Hà Nội',
    district: 'Đống Đa',
    ward: 'Láng Hạ',
    address: '25 Láng Hạ',
    faculty: 'Cơ khí',
    major: 'Cơ khí chế tạo',
    className: 'CK05'
  }
];

/**
 * Tạo sinh viên mẫu
 */
async function seedStudents() {
  try {
    logger.info('Tạo sinh viên mẫu...');
    let studentCount = 0;

    for (const student of sampleStudents) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();

        // Tạo user với password mặc định "123456"
        const hashedPassword = await bcrypt.hash('123456', 10);
        const [userResult] = await connection.query<ResultSetHeader>(
          'INSERT INTO users (email, password, userType, status) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE email=email',
          [student.email, hashedPassword, USER_TYPES.STUDENT, 'active']
        );

        const userId = userResult.insertId ||
          ((await connection.query<RowDataPacket[]>('SELECT id FROM users WHERE email = ?', [student.email]))[0] as RowDataPacket[])[0].id;

        // Tạo sinh viên với status active
        const [studentResult] = await connection.query<ResultSetHeader>(
          `INSERT INTO students (
            userId, studentCode, fullName, birthDate, gender, phone, email,
            province, district, ward, address,
            faculty, major, className, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE studentCode=studentCode`,
          [
            userId,
            student.studentCode,
            student.fullName,
            student.birthDate,
            student.gender,
            student.phone,
            student.email,
            student.province,
            student.district,
            student.ward,
            student.address,
            student.faculty,
            student.major,
            student.className,
            'active'
          ]
        );

        if (studentResult.insertId || studentResult.affectedRows > 0) {
          studentCount++;
        }

        await connection.commit();
      } catch (error) {
        await connection.rollback();
        logger.error(`Lỗi khi tạo sinh viên ${student.fullName}:`, error);
      } finally {
        connection.release();
      }
    }

    logger.info(`Đã tạo ${studentCount} sinh viên mẫu thành công`);
  } catch (error) {
    logger.error('Lỗi khi tạo sinh viên mẫu:', error);
    throw error;
  }
}

/**
 * Hàm seed chính
 */
async function seedData() {
  try {
    logger.info('Bắt đầu tạo dữ liệu sinh viên mẫu...');
    await seedStudents();
    logger.info('Tạo dữ liệu sinh viên mẫu thành công');
    process.exit(0);
  } catch (error) {
    logger.error('Tạo dữ liệu sinh viên mẫu thất bại:', error);
    process.exit(1);
  }
}

// Thực thi nếu script được chạy trực tiếp
if (require.main === module) {
  seedData();
}

export default seedData; 