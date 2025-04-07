import bcrypt from 'bcrypt';
import pool from '../config/database';
import { createTablesSQL } from '../models/tables';
import logger from '../utils/logger';
import { ADMIN_ROLES, USER_TYPES, STATUS } from '../config/constants';
import { ResultSetHeader } from 'mysql2';

async function createDefaultAdmin() {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Create default admin user
    const hashedPassword = await bcrypt.hash(process.env.DEFAULT_ADMIN_PASSWORD || 'Admin@123', 10);
    const [userResult] = await connection.query<ResultSetHeader>(`
            INSERT INTO users (email, password, userType, status)
            VALUES (?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)
        `, [
      process.env.DEFAULT_ADMIN_EMAIL,
      hashedPassword,
      USER_TYPES.ADMIN,
      STATUS.ACTIVE
    ]);

    if (userResult.insertId) {
      await connection.query(`
                INSERT INTO admins (userId, staffCode, fullName, role)
                VALUES (?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE userId=userId
            `, [
        userResult.insertId,
        'ADMIN001',
        'System Administrator',
        ADMIN_ROLES.SUPER_ADMIN
      ]);
    }

    await connection.commit();
    logger.info('Admin mặc định đã được tạo thành công');
  } catch (error) {
    await connection.rollback();
    logger.error('Lỗi tạo admin mặc định:', error);
    throw error;
  } finally {
    connection.release();
  }
}

async function initializeDatabase() {
  const connection = await pool.getConnection();
  try {
    logger.info('Bắt đầu khởi tạo cơ sở dữ liệu...');

    // Split SQL statements and execute them one by one
    const statements = createTablesSQL.split(';').filter(statement => statement.trim());

    for (const statement of statements) {
      if (statement.trim()) {
        await connection.query(statement);
      }
    }

    logger.info('Khởi tạo cơ sở dữ liệu thành công');

    // Create default admin
    await createDefaultAdmin();

    logger.info('Khởi tạo cơ sở dữ liệu thành công');
  } catch (error) {
    logger.error('Lỗi khởi tạo cơ sở dữ liệu:', error);
    throw error;
  } finally {
    connection.release();
  }
}

export default initializeDatabase;

// If running this script directly
if (require.main === module) {
  initializeDatabase()
    .then(() => {
      logger.info('Khởi tạo cơ sở dữ liệu thành công');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Lỗi khởi tạo cơ sở dữ liệu:', error);
      process.exit(1);
    });
}