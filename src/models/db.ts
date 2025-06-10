import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import logger from '../utils/logger';

dotenv.config();

// Tạo connection pool để kết nối với MySQL
export const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'dormitory',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Kiểm tra kết nối database
export const testConnection = async (): Promise<void> => {
  try {
    const connection = await pool.getConnection();
    logger.info('Kết nối CSDL thành công');
    connection.release();
  } catch (error) {
    logger.error('Lỗi kết nối CSDL:', error);
    throw error;
  }
};

export default pool; 