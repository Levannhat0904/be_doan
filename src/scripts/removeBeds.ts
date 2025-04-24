import pool from '../config/database';
import logger from '../utils/logger';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Script to remove the beds table and update room occupancy based on active contracts
 */
async function removeBeds() {
  try {
    logger.info('Starting beds table removal process...');

    // Start transaction for safety
    await pool.query('START TRANSACTION');

    try {
      // 1. Update room occupancy counts based on active contracts
      logger.info('Updating room occupancy based on active contracts...');
      await pool.query(`
        UPDATE rooms r
        SET currentOccupancy = (
          SELECT COUNT(*) 
          FROM contracts c 
          WHERE c.roomId = r.id AND c.status = 'active'
        )
      `);

      // 2. Update room status based on occupancy
      logger.info('Updating room status based on occupancy...');
      await pool.query(`
        UPDATE rooms
        SET status = CASE 
          WHEN status = 'maintenance' THEN 'maintenance'
          WHEN currentOccupancy >= capacity THEN 'full'
          ELSE 'available'
        END
      `);

      // 3. Drop the beds table
      logger.info('Dropping beds table...');
      await pool.query('DROP TABLE IF EXISTS beds');

      // 4. Commit all changes
      await pool.query('COMMIT');
      logger.info('Successfully removed beds table and updated room occupancy');
    } catch (error) {
      // Rollback on error
      await pool.query('ROLLBACK');
      throw error;
    }

    process.exit(0);
  } catch (error) {
    logger.error('Error removing beds table:', error);
    process.exit(1);
  }
}

// Execute if this script is run directly
if (require.main === module) {
  removeBeds();
}

export default removeBeds; 