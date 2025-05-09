import { Request, Response } from 'express';
import pool from '../config/database';
import { RowDataPacket, OkPacket } from 'mysql2';

export const createContract = async (req: Request, res: Response) => {
  try {
    const {
      studentId,
      roomId,
      startDate,
      endDate,
      depositAmount,
      monthlyFee,
    } = req.body;

    // Validate required fields
    if (!studentId || !roomId || !startDate || !endDate || !depositAmount || !monthlyFee) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng cung cấp đầy đủ thông tin hợp đồng'
      });
    }

    // Kiểm tra trạng thái sinh viên trước khi tạo hợp đồng
    const [studentStatus] = await pool.query<RowDataPacket[]>(
      `SELECT status FROM students WHERE id = ?`,
      [studentId]
    );

    if (!studentStatus.length) {
      return res.status(400).json({
        success: false,
        message: 'Sinh viên không tồn tại'
      });
    }

    // Kiểm tra nếu sinh viên chưa được phê duyệt thì không thể tạo hợp đồng active
    if (studentStatus[0].status !== 'active') {
      // Cập nhật trạng thái sinh viên sang active
      await pool.query('START TRANSACTION');

      try {
        // Cập nhật trạng thái sinh viên
        await pool.query(
          `UPDATE students SET status = 'active' WHERE id = ?`,
          [studentId]
        );

        // Cập nhật trạng thái user liên quan
        const [studentUser] = await pool.query<RowDataPacket[]>(
          `SELECT userId FROM students WHERE id = ?`,
          [studentId]
        );

        if (studentUser.length && studentUser[0].userId) {
          await pool.query(
            `UPDATE users SET status = 'active' WHERE id = ?`,
            [studentUser[0].userId]
          );
        }

        // Ghi log
        await pool.query(
          `INSERT INTO activity_logs (userId, action, entityType, entityId, description)
           VALUES (?, ?, ?, ?, ?)`,
          [
            req.user?.id || 1,
            'update_status',
            'student',
            studentId,
            'Cập nhật trạng thái sinh viên thành "active" khi tạo hợp đồng'
          ]
        );

        await pool.query('COMMIT');
      } catch (error) {
        await pool.query('ROLLBACK');
        throw error;
      }
    }

    // Check if the room is available (not full)
    const [roomStatus] = await pool.query<RowDataPacket[]>(
      `SELECT r.id, r.currentOccupancy, r.capacity, r.status, r.roomType, 
              s.gender 
       FROM rooms r
       LEFT JOIN students s ON s.id = ?
       WHERE r.id = ?`,
      [studentId, roomId]
    );

    if (!roomStatus.length) {
      return res.status(400).json({
        success: false,
        message: 'Phòng không tồn tại'
      });
    }

    if (roomStatus[0].status === 'maintenance') {
      return res.status(400).json({
        success: false,
        message: 'Phòng đang bảo trì, không thể tạo hợp đồng'
      });
    }

    if (roomStatus[0].currentOccupancy >= roomStatus[0].capacity) {
      return res.status(400).json({
        success: false,
        message: 'Phòng đã đầy, không thể tạo hợp đồng'
      });
    }

    // Check if room type matches student gender
    if (roomStatus[0].roomType === 'male' && roomStatus[0].gender === 'female') {
      return res.status(400).json({
        success: false,
        message: 'Phòng nam không thể xếp cho sinh viên nữ'
      });
    }

    if (roomStatus[0].roomType === 'female' && roomStatus[0].gender === 'male') {
      return res.status(400).json({
        success: false,
        message: 'Phòng nữ không thể xếp cho sinh viên nam'
      });
    }

    // Check if student already has an active contract
    const [existingContract] = await pool.query<RowDataPacket[]>(
      `SELECT id FROM contracts 
       WHERE studentId = ? AND status = 'active'`,
      [studentId]
    );

    if (existingContract.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Sinh viên đã có hợp đồng đang hoạt động'
      });
    }

    // Generate contract number
    const contractNumber = `CTR-${studentId}-${roomId}-${Date.now()}`;

    // Get admin ID from request (assuming it's set by authMiddleware)
    const createdBy = req.user?.id || 1; // Fallback to admin ID 1 if user is undefined

    // Insert contract
    const [result] = await pool.query<OkPacket>(
      `INSERT INTO contracts 
       (contractNumber, studentId, roomId, startDate, endDate, 
        depositAmount, monthlyFee, status, createdBy)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        contractNumber,
        studentId,
        roomId,
        new Date(startDate),
        new Date(endDate),
        depositAmount,
        monthlyFee,
        'active',
        createdBy
      ]
    );

    // Begin transaction for updating room
    await pool.query('START TRANSACTION');

    try {
      // Update room occupancy
      await pool.query(
        `UPDATE rooms SET currentOccupancy = currentOccupancy + 1 WHERE id = ?`,
        [roomId]
      );

      // Check if room is full after adding this contract
      const [updatedRoomInfo] = await pool.query<RowDataPacket[]>(
        `SELECT currentOccupancy, capacity FROM rooms WHERE id = ?`,
        [roomId]
      );

      if (updatedRoomInfo.length && updatedRoomInfo[0].currentOccupancy >= updatedRoomInfo[0].capacity) {
        await pool.query(
          `UPDATE rooms SET status = 'full' WHERE id = ?`,
          [roomId]
        );
      }

      // Commit the transaction
      await pool.query('COMMIT');
    } catch (error) {
      // Rollback in case of error
      await pool.query('ROLLBACK');
      throw error;
    }

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

    // Kiểm tra ID sinh viên
    if (!studentId || isNaN(Number(studentId))) {
      return res.status(400).json({ success: false, message: 'ID sinh viên không hợp lệ' });
    }

    // Lấy danh sách hợp đồng
    const [contracts] = await pool.query<RowDataPacket[]>(
      `SELECT c.*, 
          r.roomNumber, r.floorNumber, r.pricePerMonth,
          b.name as buildingName,
          s.fullName, s.studentCode
       FROM contracts c
       JOIN rooms r ON c.roomId = r.id
       JOIN buildings b ON r.buildingId = b.id
       JOIN students s ON c.studentId = s.id
       WHERE c.studentId = ?
       ORDER BY c.startDate DESC`,
      [studentId]
    );

    return res.status(200).json({ success: true, data: contracts });
  } catch (error) {
    console.error('Error fetching contracts:', error);
    return res.status(500).json({ success: false, message: 'Lỗi khi truy vấn hợp đồng' });
  }
};

export const getAllContracts = async (req: Request, res: Response) => {
  try {
    const [contracts] = await pool.query<RowDataPacket[]>(
      `SELECT c.*, 
          r.roomNumber, r.floorNumber, r.pricePerMonth,
          b.name as buildingName,
          s.fullName, s.studentCode
       FROM contracts c
       JOIN rooms r ON c.roomId = r.id
       JOIN buildings b ON r.buildingId = b.id
       JOIN students s ON c.studentId = s.id
       ORDER BY c.createdAt DESC`
    );

    return res.status(200).json({ success: true, data: contracts });
  } catch (error) {
    console.error('Error fetching all contracts:', error);
    return res.status(500).json({ success: false, message: 'Lỗi khi truy vấn hợp đồng' });
  }
};

export const getContractById = async (req: Request, res: Response) => {
  try {
    const { contractId } = req.params;

    // Validate ID
    if (!contractId || isNaN(Number(contractId))) {
      return res.status(400).json({ success: false, message: 'ID hợp đồng không hợp lệ' });
    }

    // Fetch contract with related information
    const [contracts] = await pool.query<RowDataPacket[]>(
      `SELECT c.*, 
          r.roomNumber, r.floorNumber, r.pricePerMonth,
          b.name as buildingName,
          s.fullName, s.studentCode, s.phone, s.email, s.faculty, s.className
       FROM contracts c
       JOIN rooms r ON c.roomId = r.id
       JOIN buildings b ON r.buildingId = b.id
       JOIN students s ON c.studentId = s.id
       WHERE c.id = ?`,
      [contractId]
    );

    if (!contracts.length) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy hợp đồng' });
    }

    return res.status(200).json({ success: true, data: contracts[0] });
  } catch (error) {
    console.error('Error fetching contract details:', error);
    return res.status(500).json({ success: false, message: 'Lỗi khi truy vấn hợp đồng' });
  }
};

export const updateContract = async (req: Request, res: Response) => {
  try {
    const { contractId } = req.params;
    const {
      startDate,
      endDate,
      depositAmount,
      monthlyFee,
      status
    } = req.body;

    // Validate ID
    if (!contractId || isNaN(Number(contractId))) {
      return res.status(400).json({ success: false, message: 'ID hợp đồng không hợp lệ' });
    }

    // Check if contract exists
    const [existingContract] = await pool.query<RowDataPacket[]>(
      `SELECT c.*, s.status as studentStatus, s.userId 
       FROM contracts c
       JOIN students s ON c.studentId = s.id
       WHERE c.id = ?`,
      [contractId]
    );

    if (!existingContract.length) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy hợp đồng' });
    }

    // Begin transaction
    await pool.query('START TRANSACTION');

    try {
      // Nếu đang cập nhật hợp đồng thành active và sinh viên chưa active
      if (status === 'active' && existingContract[0].studentStatus !== 'active') {
        // Cập nhật trạng thái sinh viên
        await pool.query(
          `UPDATE students SET status = 'active' WHERE id = ?`,
          [existingContract[0].studentId]
        );

        // Cập nhật trạng thái user liên quan
        if (existingContract[0].userId) {
          await pool.query(
            `UPDATE users SET status = 'active' WHERE id = ?`,
            [existingContract[0].userId]
          );
        }

        // Ghi log
        await pool.query(
          `INSERT INTO activity_logs (userId, action, entityType, entityId, description)
           VALUES (?, ?, ?, ?, ?)`,
          [
            req.user?.id || 1,
            'update_status',
            'student',
            existingContract[0].studentId,
            'Cập nhật trạng thái sinh viên thành "active" khi cập nhật hợp đồng'
          ]
        );
      }

      // Update contract
      await pool.query<OkPacket>(
        `UPDATE contracts 
         SET startDate = ?, endDate = ?, depositAmount = ?, monthlyFee = ?, 
             status = ?, updatedAt = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          startDate ? new Date(startDate) : existingContract[0].startDate,
          endDate ? new Date(endDate) : existingContract[0].endDate,
          depositAmount || existingContract[0].depositAmount,
          monthlyFee || existingContract[0].monthlyFee,
          status || existingContract[0].status,
          contractId
        ]
      );

      // If contract is terminated, update room occupancy
      if (status === 'terminated' && existingContract[0].status !== 'terminated') {
        // Update room occupancy
        await pool.query(
          `UPDATE rooms SET currentOccupancy = currentOccupancy - 1 WHERE id = ?`,
          [existingContract[0].roomId]
        );

        // Update room status if it was full
        await pool.query(
          `UPDATE rooms SET status = 'available' WHERE id = ? AND status = 'full'`,
          [existingContract[0].roomId]
        );
      }

      // Commit changes
      await pool.query('COMMIT');

      return res.status(200).json({
        success: true,
        message: 'Cập nhật hợp đồng thành công',
        data: { id: Number(contractId) }
      });
    } catch (error) {
      // Rollback if there's an error
      await pool.query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    console.error('Error updating contract:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi khi cập nhật hợp đồng',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

export const deleteContract = async (req: Request, res: Response) => {
  try {
    const { contractId } = req.params;

    // Validate ID
    if (!contractId || isNaN(Number(contractId))) {
      return res.status(400).json({ success: false, message: 'ID hợp đồng không hợp lệ' });
    }

    // Get contract details before deletion
    const [contract] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM contracts WHERE id = ?`,
      [contractId]
    );

    if (!contract.length) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy hợp đồng' });
    }

    // Begin transaction
    await pool.query('START TRANSACTION');

    try {
      // Delete contract
      const [result] = await pool.query<OkPacket>(
        `DELETE FROM contracts WHERE id = ?`,
        [contractId]
      );

      if (result.affectedRows === 0) {
        await pool.query('ROLLBACK');
        return res.status(404).json({ success: false, message: 'Không tìm thấy hợp đồng' });
      }

      // Update room occupancy if contract was active
      if (contract[0].status === 'active') {
        // Update room occupancy
        await pool.query(
          `UPDATE rooms SET currentOccupancy = currentOccupancy - 1 WHERE id = ?`,
          [contract[0].roomId]
        );

        // Update room status if it was full
        await pool.query(
          `UPDATE rooms SET status = 'available' WHERE id = ? AND status = 'full'`,
          [contract[0].roomId]
        );
      }

      // Commit changes
      await pool.query('COMMIT');

      return res.status(200).json({
        success: true,
        message: 'Xóa hợp đồng thành công'
      });
    } catch (error) {
      // Rollback if there's an error
      await pool.query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    console.error('Error deleting contract:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi khi xóa hợp đồng',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};
