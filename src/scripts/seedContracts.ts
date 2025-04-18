import pool from '../config/database';
import logger from '../utils/logger';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function seedContracts() {
  try {
    // Lấy danh sách sinh viên đã active
    const [students] = await pool.query<RowDataPacket[]>(
      `SELECT id FROM students WHERE status = 'active' LIMIT 10`
    );

    if ((students as RowDataPacket[]).length === 0) {
      logger.info('No active students found. Please activate some students first.');
      return;
    }

    // Lấy danh sách phòng và giường trống
    const [rooms] = await pool.query<RowDataPacket[]>(
      `SELECT r.id as roomId, b.id as bedId 
       FROM rooms r
       JOIN beds b ON r.id = b.roomId
       WHERE b.status = 'available'
       LIMIT 10`
    );

    if ((rooms as RowDataPacket[]).length === 0) {
      logger.info('No available beds found. Please add some rooms and beds first.');
      return;
    }

    // Tạo hợp đồng mẫu
    for (let i = 0; i < Math.min((students as RowDataPacket[]).length, (rooms as RowDataPacket[]).length); i++) {
      const student = (students as RowDataPacket[])[i];
      const room = (rooms as RowDataPacket[])[i];

      // Tạo ngày bắt đầu và kết thúc
      const startDate = new Date();
      const endDate = new Date();
      endDate.setFullYear(endDate.getFullYear() + 1); // Hợp đồng 1 năm

      // Tạo hợp đồng
      await pool.query(
        `INSERT INTO contracts 
         (contractNumber, studentId, roomId, bedId, startDate, endDate, 
          depositAmount, monthlyFee, status, createdBy)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          `CTR-${student.id}-${room.roomId}-${Date.now()}`,
          student.id,
          room.roomId,
          room.bedId,
          startDate,
          endDate,
          1000000, // Tiền đặt cọc
          800000,  // Tiền phòng hàng tháng
          'active',
          1 // Admin ID
        ]
      );

      // Cập nhật trạng thái giường
      await pool.query(
        `UPDATE beds SET status = 'occupied' WHERE id = ?`,
        [room.bedId]
      );

      logger.info(`Created contract for student ${student.id} in room ${room.roomId}, bed ${room.bedId}`);
    }

    logger.info('Contracts seeding completed successfully');
  } catch (error) {
    logger.error('Error seeding contracts:', error);
    throw error;
  }
}

// Execute if this script is run directly
if (require.main === module) {
  seedContracts()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

export default seedContracts;
