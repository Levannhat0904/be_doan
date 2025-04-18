import pool from '../config/database';
import logger from '../utils/logger';
import { ResultSetHeader } from 'mysql2';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Generate random invoices for rooms
 */
async function seedInvoices() {
  try {
    logger.info('Seeding invoices...');

    // Get all rooms with active status
    const [rooms] = await pool.query<any[]>(`
      SELECT r.id, r.roomNumber, r.pricePerMonth, r.buildingId
      FROM rooms r
      WHERE r.status != 'maintenance'
    `);

    let invoiceCount = 0;
    const currentDate = new Date();

    // For each room, create invoices for the last 6 months
    for (const room of rooms) {
      // Generate random invoices for the last 6 months
      for (let i = 0; i < 6; i++) {
        const invoiceMonth = new Date(currentDate);
        invoiceMonth.setMonth(currentDate.getMonth() - i);

        // Set the invoice month to the first day of the month
        invoiceMonth.setDate(1);

        // Generate due date (15th of the month)
        const dueDate = new Date(invoiceMonth);
        dueDate.setDate(15);

        // Generate random utility costs
        const electricity = Math.floor(Math.random() * 200) + 50; // 50-250 kWh
        const water = Math.floor(Math.random() * 10) + 2; // 2-12 m3

        const electricFee = electricity * 2000; // 2000 VND per kWh
        const waterFee = water * 10000; // 10000 VND per m3
        const serviceFee = 100000; // Fixed service fee

        // Calculate total amount
        const totalAmount = electricFee + waterFee + serviceFee;

        // Payment status - older invoices are more likely to be paid
        let paymentStatus = 'pending';
        const paymentChance = i > 2 ? 0.9 : i > 0 ? 0.7 : 0.3;
        if (Math.random() < paymentChance) {
          paymentStatus = 'paid';
        } else if (invoiceMonth.getTime() < currentDate.getTime() - 30 * 24 * 60 * 60 * 1000) {
          // If invoice is more than 30 days old and not paid, mark as overdue
          paymentStatus = 'overdue';
        }

        // Payment date - only if the invoice is paid
        let paymentDate = null;
        if (paymentStatus === 'paid') {
          paymentDate = new Date(dueDate);
          // Random payment date between invoice date and due date + 10 days
          const randomDays = Math.floor(Math.random() * 25); // 0-25 days from invoice date
          paymentDate.setDate(paymentDate.getDate() - 15 + randomDays);
        }

        // Generate invoice number
        const invoiceNumber = `INV-${room.buildingId}${room.roomNumber}-${invoiceMonth.getFullYear()}${(invoiceMonth.getMonth() + 1).toString().padStart(2, '0')}`;

        // Insert invoice
        const [result] = await pool.query<ResultSetHeader>(
          `INSERT INTO invoices 
           (invoiceNumber, roomId, invoiceMonth, dueDate, roomFee, electricFee, waterFee, serviceFee, 
            totalAmount, paymentStatus, paymentDate)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE invoiceNumber=invoiceNumber`,
          [
            invoiceNumber,
            room.id,
            invoiceMonth,
            dueDate,
            room.pricePerMonth,
            electricFee,
            waterFee,
            serviceFee,
            totalAmount,
            paymentStatus,
            paymentDate
          ]
        );

        if (result.insertId) {
          invoiceCount++;
        }
      }
    }

    logger.info(`${invoiceCount} invoices seeded successfully`);
  } catch (error) {
    logger.error('Error seeding invoices:', error);
    throw error;
  }
}

/**
 * Main seed function
 */
async function seedData() {
  try {
    logger.info('Starting invoice seed...');

    // Seed invoices
    await seedInvoices();

    logger.info('Invoice seed completed successfully');
    process.exit(0);
  } catch (error) {
    logger.error('Invoice seed failed:', error);
    process.exit(1);
  }
}

// Execute if this script is run directly
if (require.main === module) {
  seedData();
}

export default seedData;
