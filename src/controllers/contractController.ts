import { Request, Response } from 'express';
import pool from '../config/database';
import { RowDataPacket, OkPacket } from 'mysql2';

export const createContract = async (req: Request, res: Response) => {
  try {
    const {
      studentId,
      roomId,
      bedId,
      startDate,
      endDate,
      depositAmount,
      monthlyFee,
    } = req.body;

    // Validate required fields
    if (!studentId || !roomId || !bedId || !startDate || !endDate || !depositAmount || !monthlyFee) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng cung cấp đầy đủ thông tin hợp đồng'
      });
    }

    // Generate contract number
    const contractNumber = `CTR-${studentId}-${roomId}-${Date.now()}`;

    // Get admin ID from request (assuming it's set by authMiddleware)
    const createdBy = req.user?.id || 1; // Fallback to admin ID 1 if user is undefined

    // Insert contract
    const [result] = await pool.query<OkPacket>(
      `INSERT INTO contracts 
       (contractNumber, studentId, roomId, bedId, startDate, endDate, 
        depositAmount, monthlyFee, status, createdBy)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        contractNumber,
        studentId,
        roomId,
        bedId,
        new Date(startDate),
        new Date(endDate),
        depositAmount,
        monthlyFee,
        'active',
        createdBy
      ]
    );

    // Update bed status to 'occupied'
    await pool.query(
      `UPDATE beds SET status = 'occupied' WHERE id = ?`,
      [bedId]
    );

    return res.status(201).json({
      success: true,
      message: 'Tạo hợp đồng thành công',
      data: {
        id: result.insertId,
        contractNumber
      }
    });
  } catch (error) {
    console.error('Error creating contract:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi khi tạo hợp đồng',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

export const getContractsByStudent = async (req: Request, res: Response) => {
  try {
    const { studentId } = req.params;

    // Validate student ID
    if (!studentId || isNaN(Number(studentId))) {
      return res.status(400).json({
        success: false,
        message: 'ID sinh viên không hợp lệ'
      });
    }

    // Get contracts for the student
    const [contracts] = await pool.query<RowDataPacket[]>(
      `SELECT c.*, r.roomNumber, r.floorNumber, b.bedNumber, b.name as buildingName
       FROM contracts c
       JOIN rooms r ON c.roomId = r.id
       JOIN buildings b ON r.buildingId = b.id
       JOIN beds bd ON c.bedId = bd.id
       WHERE c.studentId = ?
       ORDER BY c.startDate DESC`,
      [studentId]
    );

    return res.status(200).json({
      success: true,
      data: contracts
    });
  } catch (error) {
    console.error('Error fetching contracts:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi khi truy vấn hợp đồng',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};
