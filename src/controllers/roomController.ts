import { Request, Response } from 'express';
import pool from '../config/database';
import { RowDataPacket, OkPacket } from 'mysql2';
import fs from 'fs';
import { Room, RoomFilters, RoomResponse } from '../types/room/room';
import activityLogService from '../services/activityLogService';
// Add this type at the top
type QueryResult = RowDataPacket[];

export const getRooms = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = (page - 1) * limit;

    const filters = req.query as RoomFilters;

    // Base query
    let baseQuery = `
      SELECT 
        r.*,
        b.name as buildingName,
        COUNT(DISTINCT c.id) as occupiedBeds
      FROM rooms r
      LEFT JOIN buildings b ON r.buildingId = b.id
      LEFT JOIN contracts c ON r.id = c.roomId AND c.status = 'active'
    `;

    const whereConditions = [];
    const values = [];

    // Add filter conditions
    if (filters.buildingName) {
      whereConditions.push(`b.name LIKE ?`);
      values.push(`%${filters.buildingName}%`);
    }

    if (filters.type) {
      whereConditions.push(`r.roomType = ?`);
      values.push(filters.type);
    }

    if (filters.status) {
      whereConditions.push(`r.status = ?`);
      values.push(filters.status === 'active' ? 'available' : 'maintenance');
    }

    if (filters.searchText) {
      whereConditions.push(`(r.roomNumber LIKE ? OR b.name LIKE ?)`);
      values.push(`%${filters.searchText}%`, `%${filters.searchText}%`);
    }

    if (whereConditions.length > 0) {
      baseQuery += ` WHERE ${whereConditions.join(' AND ')}`;
    }

    baseQuery += ` GROUP BY r.id, b.name`;

    // Add HAVING clause for availability filter
    let query = baseQuery;
    if (filters.availability === 'available') {
      query += ` HAVING occupiedBeds < r.capacity`;
    } else if (filters.availability === 'full') {
      query += ` HAVING occupiedBeds >= r.capacity`;
    }

    // Get total count
    const countQuery = `SELECT COUNT(*) as count FROM (${query}) as subquery`;
    const [totalResult] = await pool.query<RowDataPacket[]>(countQuery, values);
    const totalItems = parseInt(totalResult[0].count);

    // Add pagination to main query
    query += ` LIMIT ? OFFSET ?`;
    values.push(limit, offset);

    // Get rooms
    const [result] = await pool.query<RowDataPacket[]>(query, values);
    const rooms = result as Room[];

    // Get summary statistics using base query
    const summaryQuery = `
      SELECT 
        COUNT(*) as totalRooms,
        COUNT(CASE WHEN status = 'available' AND occupiedBeds < capacity THEN 1 END) as availableRooms,
        COUNT(CASE WHEN status = 'maintenance' THEN 1 END) as maintenanceRooms,
        ROUND(AVG(CAST(occupiedBeds AS FLOAT) / capacity * 100)) as occupancyRate
      FROM (${baseQuery}) as stats
    `;
    const [summaryResult] = await pool.query<RowDataPacket[]>(summaryQuery, values);
    const summary = summaryResult[0];

    const response: RoomResponse = {
      data: rooms.map(room => ({
        ...room,
        amenities: room.amenities || []
      })),
      pagination: {
        currentPage: page,
        itemsPerPage: limit,
        totalItems,
        totalPages: Math.ceil(totalItems / limit)
      },
      summary: {
        totalRooms: parseInt(summary.totalRooms),
        availableRooms: parseInt(summary.availableRooms),
        maintenanceRooms: parseInt(summary.maintenanceRooms),
        occupancyRate: parseInt(summary.occupancyRate)
      }
    };

    res.json(response);
  } catch (error) {
    console.error('Error getting rooms:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const getRoomDetail = async (req: Request, res: Response) => {
  try {
    const roomId = req.params.id;

    if (!roomId) {
      return res.status(400).json({ message: 'Room ID is required' });
    }

    // Get room details
    const roomQuery = `
      SELECT r.*, b.name as buildingName 
      FROM rooms r
      JOIN buildings b ON r.buildingId = b.id
      WHERE r.id = ?
    `;

    const [roomData] = await pool.query<RowDataPacket[]>(roomQuery, [roomId]);

    if (!roomData || roomData.length === 0) {
      return res.status(404).json({ message: 'Room not found' });
    }

    const room = {
      id: roomData[0].id,
      buildingId: roomData[0].buildingId,
      buildingName: roomData[0].buildingName,
      roomNumber: roomData[0].roomNumber,
      floorNumber: roomData[0].floorNumber,
      roomType: roomData[0].roomType,
      capacity: roomData[0].capacity,
      occupiedBeds: 0, // Sẽ được tính toán sau
      pricePerMonth: roomData[0].pricePerMonth,
      status: roomData[0].status,
      description: roomData[0].description,
      amenities: roomData[0].amenities ?
        (typeof roomData[0].amenities === 'string' ?
          JSON.parse(roomData[0].amenities) : roomData[0].amenities) : [],
      lastCleaned: roomData[0].lastCleaned,
      createdAt: roomData[0].createdAt,
      updatedAt: roomData[0].updatedAt,
      roomArea: 0, // Optional
      notes: '' // Optional
    };

    // Đếm số chỗ đã được sử dụng (dựa trên số hợp đồng active)
    const occupiedBedsQuery = `
      SELECT COUNT(*) as occupiedBeds
      FROM contracts c
      WHERE c.roomId = ? AND c.status = 'active'
    `;

    const [occupiedBedsData] = await pool.query<RowDataPacket[]>(occupiedBedsQuery, [roomId]);
    room.occupiedBeds = occupiedBedsData[0].occupiedBeds;

    // Get residents in the room
    const residentsQuery = `
      SELECT s.id, s.studentCode, s.fullName, s.gender, s.phone, s.email, 
             c.startDate as joinDate, c.endDate, c.status,
             s.faculty, s.major, s.avatarPath,
             IFNULL(
               (SELECT MAX(i.paymentStatus) 
                FROM invoices i 
                WHERE i.studentId = s.id AND i.paymentStatus = 'pending'), 'paid'
             ) as paymentStatus
      FROM contracts c
      JOIN students s ON c.studentId = s.id
      WHERE c.roomId = ? AND c.status = 'active'
    `;

    const [residentsRows] = await pool.query<RowDataPacket[]>(residentsQuery, [roomId]);

    const residents = residentsRows.map((resident) => ({
      id: resident.id,
      studentCode: resident.studentCode,
      fullName: resident.fullName,
      gender: resident.gender,
      phone: resident.phone,
      email: resident.email,
      joinDate: resident.joinDate,
      endDate: resident.endDate,
      status: resident.status,
      faculty: resident.faculty,
      major: resident.major,
      avatarPath: resident.avatarPath,
      paymentStatus: resident.paymentStatus
    }));

    // Get maintenance history
    const maintenanceQuery = `
      SELECT m.id, m.createdAt as date, m.requestType as type, m.description, 
              0 as cost, IFNULL(a.fullName, 'Not assigned') as staff, m.status
      FROM maintenance_requests m
      LEFT JOIN admins a ON m.assignedTo = a.id
      WHERE m.roomId = ? AND m.status = 'completed'
      ORDER BY m.createdAt DESC
      LIMIT 10
    `;

    const [maintenanceRows] = await pool.query<RowDataPacket[]>(maintenanceQuery, [roomId]);

    const maintenanceHistory = maintenanceRows.map((maintenance) => ({
      id: maintenance.id,
      date: maintenance.date,
      type: maintenance.type,
      description: maintenance.description,
      cost: maintenance.cost,
      staff: maintenance.staff,
      status: maintenance.status
    }));

    // Get pending requests
    const pendingRequestsQuery = `
      SELECT m.id, m.createdAt as date, m.requestType as type, m.description, 
             IFNULL(s.fullName, 'System') as requestedBy, 
             m.status, m.priority
      FROM maintenance_requests m
      LEFT JOIN students s ON m.studentId = s.id
      WHERE m.roomId = ? AND m.status IN ('pending', 'processing')
      ORDER BY 
        CASE 
          WHEN m.priority = 'urgent' THEN 1
          WHEN m.priority = 'high' THEN 2
          WHEN m.priority = 'normal' THEN 3
          WHEN m.priority = 'low' THEN 4
          ELSE 5
        END,
        m.createdAt DESC
    `;

    const [pendingRows] = await pool.query<RowDataPacket[]>(pendingRequestsQuery, [roomId]);

    const pendingRequests = pendingRows.map((request) => ({
      id: request.id,
      date: request.date,
      type: request.type,
      description: request.description,
      requestedBy: request.requestedBy,
      status: request.status,
      priority: request.priority
    }));

    // Get utilities bills
    const utilitiesQuery = `
      SELECT i.id, 
             DATE_FORMAT(i.invoiceMonth, '%m/%Y') as month, 
             i.electricFee / 2000 as electricity, 
             i.waterFee / 10000 as water, 
             i.electricFee as electricityCost, 
             i.waterFee as waterCost,
             i.serviceFee as otherFees,
             i.totalAmount as totalCost,
             i.dueDate, i.paymentStatus as status, i.paymentDate as paidDate
      FROM invoices i
      WHERE i.roomId = ?
      ORDER BY i.invoiceMonth DESC
      LIMIT 6
    `;

    const [utilitiesRows] = await pool.query<RowDataPacket[]>(utilitiesQuery, [roomId]);

    const utilities = utilitiesRows.map((utility) => ({
      id: utility.id,
      month: utility.month,
      electricity: utility.electricity,
      water: utility.water,
      electricityCost: utility.electricityCost,
      waterCost: utility.waterCost,
      otherFees: utility.otherFees,
      totalCost: utility.totalCost,
      dueDate: utility.dueDate,
      status: utility.status,
      paidDate: utility.paidDate
    }));

    // Combine all data
    const roomDetail = {
      room,
      residents,
      maintenanceHistory,
      pendingRequests,
      utilities
    };

    res.status(200).json(roomDetail);
  } catch (error: any) {
    console.error('Error fetching room detail:', error);
    res.status(500).json({ message: 'Error fetching room detail', error: error.message });
  }
};

// Add Room
export const addRoom = async (req: Request, res: Response) => {
  try {
    const {
      buildingId,
      roomNumber,
      floorNumber,
      roomType,
      capacity,
      pricePerMonth,
      description,
      roomArea,
      notes,
      amenities
    } = req.body;

    // Validate required fields
    if (!buildingId || !roomNumber || !floorNumber || !roomType || !capacity || !pricePerMonth) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields'
      });
    }

    // Check if building exists
    const [buildingResult] = await pool.query<RowDataPacket[]>(
      'SELECT id, name FROM buildings WHERE id = ?',
      [buildingId]
    );

    if (buildingResult.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Building not found'
      });
    }

    // Check if room already exists in this building
    const [roomExistsResult] = await pool.query<RowDataPacket[]>(
      'SELECT id FROM rooms WHERE buildingId = ? AND roomNumber = ?',
      [buildingId, roomNumber]
    );

    if (roomExistsResult.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Room number already exists in this building'
      });
    }

    // Insert room
    const [result] = await pool.query<OkPacket>(
      `INSERT INTO rooms 
      (buildingId, roomNumber, floorNumber, roomType, capacity, pricePerMonth, description, roomArea, notes, amenities, status) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        buildingId,
        roomNumber,
        floorNumber,
        roomType,
        capacity,
        pricePerMonth,
        description || null,
        roomArea || null,
        notes || null,
        amenities ? JSON.stringify(amenities) : null,
        'available'
      ]
    );

    // Log activity
    if (req.user?.id) {
      await activityLogService.logActivity(
        req.user.id,
        'create',
        'room',
        result.insertId,
        `Tạo phòng mới: ${roomNumber} tại tòa nhà ${buildingResult[0].name}`,
        req
      );
    }

    return res.status(201).json({
      success: true,
      message: 'Room created successfully',
      data: { id: result.insertId }
    });
  } catch (error) {
    console.error('Error adding room:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Update Room
export const updateRoom = async (req: Request, res: Response) => {
  try {
    const roomId = req.params.roomId;
    console.log("Received roomId:", roomId, "type:", typeof roomId);

    // Kiểm tra id có phải là số hợp lệ không
    if (!roomId) {
      return res.status(400).json({
        success: false,
        message: 'Room ID is required'
      });
    }

    // Chuyển đổi id thành số và kiểm tra
    const roomIdNumber = parseInt(roomId, 10);
    if (isNaN(roomIdNumber)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid room ID format'
      });
    }

    const {
      buildingId,
      roomNumber,
      floorNumber,
      roomType,
      capacity,
      pricePerMonth,
      description,
      roomArea,
      notes,
      amenities,
      status
    } = req.body;

    console.log("Received body:", req.body);

    // Validate required fields
    if (!buildingId || !roomNumber || !floorNumber || !roomType || !capacity || !pricePerMonth) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields'
      });
    }

    // Check if building exists
    const [buildingResult] = await pool.query<RowDataPacket[]>(
      'SELECT id, name FROM buildings WHERE id = ?',
      [buildingId]
    );

    if (buildingResult.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Building not found'
      });
    }

    // Check if room exists
    const [roomResult] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM rooms WHERE id = ?',
      [roomIdNumber]
    );

    if (roomResult.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Room not found'
      });
    }

    const existingRoom = roomResult[0];

    // Check if the new room number already exists (but not for this room)
    if (roomNumber !== existingRoom.roomNumber) {
      const [roomExistsResult] = await pool.query<RowDataPacket[]>(
        'SELECT id FROM rooms WHERE buildingId = ? AND roomNumber = ? AND id != ?',
        [buildingId, roomNumber, roomIdNumber]
      );

      if (roomExistsResult.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Room number already exists in this building'
        });
      }
    }

    // Check current occupancy from contracts instead of relying on input
    const [occupancyResult] = await pool.query<RowDataPacket[]>(
      'SELECT COUNT(*) as currentOccupancy FROM contracts WHERE roomId = ? AND status = "active"',
      [roomIdNumber]
    );

    const currentOccupancy = occupancyResult[0].currentOccupancy;

    // If changing capacity, check if it's valid
    if (capacity < currentOccupancy) {
      return res.status(400).json({
        success: false,
        message: `New capacity (${capacity}) cannot be less than current occupancy (${currentOccupancy})`
      });
    }

    // Update room
    const result = await pool.query(
      `UPDATE rooms SET 
        buildingId = ?, 
        roomNumber = ?, 
        floorNumber = ?, 
        roomType = ?, 
        capacity = ?, 
        pricePerMonth = ?, 
        description = ?, 
        roomArea = ?,
        notes = ?,
        amenities = ?,
        status = ?
      WHERE id = ?`,
      [
        buildingId,
        roomNumber,
        floorNumber,
        roomType,
        capacity,
        pricePerMonth,
        description || null,
        roomArea || null,
        notes || null,
        amenities ? JSON.stringify(amenities) : null,
        status || existingRoom.status,
        roomIdNumber
      ]
    );

    // Log activity - safely handle the case where req.user might not exist
    try {
      if (req.user && req.user.id) {
        await activityLogService.logActivity(
          req.user.id,
          'update',
          'room',
          Number(roomIdNumber),
          `Cập nhật thông tin phòng: ${existingRoom.roomNumber} -> ${roomNumber} tại tòa nhà ${buildingResult[0].name}`,
          req
        );
      }
    } catch (logError) {
      console.error('Error logging activity:', logError);
      // Continue with the response even if logging fails
    }

    return res.json({
      success: true,
      message: 'Room updated successfully'
    });
  } catch (error) {
    console.error('Error updating room:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error instanceof Error ? error.message : String(error)
    });
  }
};

// Delete Room
export const deleteRoom = async (req: Request, res: Response) => {
  try {
    const roomId = req.params.id;

    // Check if room exists
    const [roomResult] = await pool.query<RowDataPacket[]>(
      `SELECT r.*, b.name as buildingName 
       FROM rooms r 
       JOIN buildings b ON r.buildingId = b.id 
       WHERE r.id = ?`,
      [roomId]
    );

    if (roomResult.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Room not found'
      });
    }

    const room = roomResult[0];

    // Check if room has active contracts
    const [contractsResult] = await pool.query<RowDataPacket[]>(
      'SELECT COUNT(*) as count FROM contracts WHERE roomId = ? AND status = "active"',
      [roomId]
    );

    if (contractsResult[0].count > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete room with active contracts'
      });
    }

    // Delete room
    await pool.query('DELETE FROM rooms WHERE id = ?', [roomId]);

    // Log activity
    if (req.user?.id) {
      await activityLogService.logActivity(
        req.user.id,
        'delete',
        'room',
        Number(roomId),
        `Xóa phòng: ${room.roomNumber} tại tòa nhà ${room.buildingName}`,
        req
      );
    }

    return res.json({
      success: true,
      message: 'Room deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting room:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Update Room Status
export const updateRoomStatus = async (req: Request, res: Response) => {
  try {
    const roomIdParam = req.params.id;
    const { status, notes } = req.body;

    console.log('Update Room Status Request:', {
      roomIdParam,
      status,
      notes,
      body: req.body,
      params: req.params
    });

    if (!roomIdParam) {
      return res.status(400).json({
        success: false,
        message: 'Room ID is required'
      });
    }

    // Convert to number and validate
    const roomId = parseInt(roomIdParam, 10);
    if (isNaN(roomId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid room ID format'
      });
    }

    if (!status || !['available', 'maintenance', 'full'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status value'
      });
    }

    // Get current room info
    const [roomResult] = await pool.query<RowDataPacket[]>(
      `SELECT r.*, b.name as buildingName 
       FROM rooms r 
       JOIN buildings b ON r.buildingId = b.id 
       WHERE r.id = ?`,
      [roomId]
    );

    console.log('Room query result:', roomResult);

    if (roomResult.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Room not found'
      });
    }

    const currentRoom = roomResult[0];
    console.log('Current room:', currentRoom);

    // Check if the room has active contracts when trying to set to maintenance
    if (status === 'maintenance' && currentRoom.status !== 'maintenance') {
      const [contractsResult] = await pool.query<RowDataPacket[]>(
        'SELECT COUNT(*) as activeContracts FROM contracts WHERE roomId = ? AND status = "active"',
        [roomId]
      );

      const activeContracts = contractsResult[0].activeContracts;
      console.log('Active contracts:', activeContracts);

      if (activeContracts > 0) {
        return res.status(400).json({
          success: false,
          message: 'Cannot set room to maintenance when it has active contracts'
        });
      }
    }

    // Update room status
    const [updateResult] = await pool.query<OkPacket>(
      'UPDATE rooms SET status = ?, notes = ? WHERE id = ?',
      [status, notes || currentRoom.notes, roomId]
    );

    console.log('Update result:', updateResult);

    // Log activity
    if (req.user?.id) {
      await activityLogService.logActivity(
        req.user.id,
        'status_change',
        'room',
        roomId,
        `Cập nhật trạng thái phòng: ${currentRoom.status} -> ${status} cho phòng ${currentRoom.roomNumber} tại tòa nhà ${currentRoom.buildingName}`,
        req
      );
    }

    return res.json({
      success: true,
      message: 'Room status updated successfully'
    });
  } catch (error) {
    console.error('Error updating room status:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error instanceof Error ? error.message : String(error)
    });
  }
};

// Add Maintenance
export const addMaintenance = async (req: Request, res: Response) => {
  try {
    const roomId = parseInt(req.params.roomId);

    if (isNaN(roomId)) {
      return res.status(400).json({
        success: false,
        message: 'ID phòng không hợp lệ'
      });
    }

    // Kiểm tra phòng có tồn tại không
    const [roomExists] = await pool.query<RowDataPacket[]>(
      'SELECT id, roomNumber, buildingId FROM rooms WHERE id = ?',
      [roomId]
    );

    if (!roomExists.length) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy phòng'
      });
    }

    const { requestType, description, studentId } = req.body;

    // Validate required fields
    if (!requestType || !description) {
      return res.status(400).json({
        success: false,
        message: 'Thiếu thông tin bắt buộc: loại yêu cầu, mô tả'
      });
    }

    // Get building name for logging
    const [buildingResult] = await pool.query<RowDataPacket[]>(
      'SELECT name FROM buildings WHERE id = ?',
      [roomExists[0].buildingId]
    );

    const buildingName = buildingResult.length > 0 ? buildingResult[0].name : 'Unknown';
    const roomNumber = roomExists[0].roomNumber;

    // Tạo requestNumber
    const requestNumber = `MR-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    // Insert new maintenance request - luôn đặt status = 'pending' vì là yêu cầu mới
    const [result] = await pool.query<OkPacket>(
      `INSERT INTO maintenance_requests (
        roomId, requestNumber, studentId, requestType, description, priority, status, 
        createdAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        roomId,
        requestNumber,
        studentId || null, // ID của sinh viên yêu cầu, có thể null nếu admin tạo
        requestType,
        description,
        'normal', // Mức ưu tiên mặc định
        'pending', // Luôn đặt trạng thái là pending cho yêu cầu mới
        new Date()
      ]
    );

    // Log activity
    if (req.user?.id) {
      await activityLogService.logActivity(
        req.user.id,
        'create',
        'maintenance',
        result.insertId,
        `Tạo yêu cầu bảo trì cho Phòng ${roomNumber} tại tòa nhà ${buildingName}: ${requestType}`,
        req
      );

      // Add log for room entity to ensure it appears in room timeline
      await activityLogService.logActivity(
        req.user.id,
        'create',
        'room',
        roomId,
        `Tạo yêu cầu bảo trì cho Phòng ${roomNumber} tại tòa nhà ${buildingName}: ${requestType}`,
        req
      );
    }

    res.status(201).json({
      success: true,
      message: 'Thêm yêu cầu bảo trì thành công',
      data: {
        id: result.insertId,
        requestNumber,
        roomId,
        studentId: studentId || null,
        requestType,
        description,
        status: 'pending',
        createdAt: new Date()
      }
    });

  } catch (error: any) {
    console.error('Error adding maintenance:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi khi thêm yêu cầu bảo trì',
      error: error.message
    });
  }
};

export const processMaintenanceRequest = async (req: Request, res: Response) => {
  try {
    const requestId = parseInt(req.params.requestId);
    const { status } = req.body;

    if (isNaN(requestId)) {
      return res.status(400).json({
        success: false,
        message: 'ID yêu cầu không hợp lệ'
      });
    }

    // Kiểm tra yêu cầu có tồn tại không
    const [requestResult] = await pool.query<RowDataPacket[]>(
      `SELECT mr.*, r.roomNumber, b.name as buildingName
       FROM maintenance_requests mr
       JOIN rooms r ON mr.roomId = r.id
       JOIN buildings b ON r.buildingId = b.id
       WHERE mr.id = ?`,
      [requestId]
    );

    if (requestResult.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy yêu cầu bảo trì'
      });
    }

    const maintenanceRequest = requestResult[0];
    const previousStatus = maintenanceRequest.status;

    // Chỉ cập nhật trạng thái, bỏ hết các trường khác
    await pool.query(
      'UPDATE maintenance_requests SET status = ? WHERE id = ?',
      [status, requestId]
    );

    // Log activity
    if (req.user?.id) {
      await activityLogService.logActivity(
        req.user.id,
        'status_change',
        'maintenance',
        requestId,
        `Cập nhật trạng thái yêu cầu bảo trì: ${previousStatus} -> ${status} cho Phòng ${maintenanceRequest.roomNumber} tại tòa nhà ${maintenanceRequest.buildingName}`,
        req
      );

      // Add log for room entity to ensure it appears in room timeline
      await activityLogService.logActivity(
        req.user.id,
        'status_change',
        'room',
        maintenanceRequest.roomId,
        `Cập nhật trạng thái yêu cầu bảo trì: ${previousStatus} -> ${status} cho Phòng ${maintenanceRequest.roomNumber} tại tòa nhà ${maintenanceRequest.buildingName}`,
        req
      );
    }

    return res.json({
      success: true,
      message: 'Cập nhật trạng thái yêu cầu thành công'
    });
  } catch (error: any) {
    console.error('Error processing maintenance request:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi khi xử lý yêu cầu bảo trì',
      error: error.message
    });
  }
};

// Add Utility
export const addUtility = async (req: Request, res: Response) => {
  try {
    const roomId = parseInt(req.params.roomId);

    if (isNaN(roomId)) {
      return res.status(400).json({
        success: false,
        message: 'ID phòng không hợp lệ'
      });
    }

    // Kiểm tra phòng có tồn tại không và lấy thông tin phí phòng
    const [roomData] = await pool.query<RowDataPacket[]>(
      'SELECT id, pricePerMonth, roomNumber, buildingId FROM rooms WHERE id = ?',
      [roomId]
    );

    if (!roomData.length) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy phòng'
      });
    }

    const roomFee = roomData[0].pricePerMonth;
    const roomNumber = roomData[0].roomNumber;

    // Get building name for logging
    const [buildingResult] = await pool.query<RowDataPacket[]>(
      'SELECT name FROM buildings WHERE id = ?',
      [roomData[0].buildingId]
    );

    const buildingName = buildingResult.length > 0 ? buildingResult[0].name : 'Unknown';

    const {
      month,
      electricity,
      water,
      electricityCost,
      waterCost,
      otherFees,
      dueDate,
      status,
      paidDate
    } = req.body;

    // Validate required fields
    if (!month || electricityCost === undefined || waterCost === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Thiếu thông tin bắt buộc: tháng, chi phí điện, chi phí nước'
      });
    }

    // Tính tổng chi phí
    const totalAmount =
      parseFloat(roomFee) +
      parseFloat(electricityCost) +
      parseFloat(waterCost) +
      (otherFees ? parseFloat(otherFees) : 0);

    // Parse tháng thành đối tượng ngày
    // Định dạng dự kiến: MM/YYYY
    const [monthPart, yearPart] = month.split('/');
    const invoiceMonth = new Date();
    invoiceMonth.setMonth(parseInt(monthPart) - 1);
    invoiceMonth.setFullYear(parseInt(yearPart));
    invoiceMonth.setDate(1); // Ngày 1 của tháng

    // Tạo invoiceNumber
    const invoiceNumber = `INV-${roomId}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    // Sử dụng 'pending' thay vì 'unpaid' vì ENUM chỉ chấp nhận 'pending', 'paid', 'overdue'
    const paymentStatus = status || 'pending';

    // Nếu không có ngày đến hạn, đặt là 15 ngày sau ngày đầu tháng
    const defaultDueDate = new Date(invoiceMonth);
    defaultDueDate.setDate(15);

    // Xử lý ngày thanh toán
    let paymentDateValue = null;
    if (paymentStatus === 'paid') {
      paymentDateValue = paidDate ? new Date(paidDate) : new Date();
    }

    // Insert new utility bill với roomFee
    const [result] = await pool.query<OkPacket>(
      `INSERT INTO invoices (
        invoiceNumber, roomId, invoiceMonth, roomFee, electricFee, waterFee, 
        serviceFee, totalAmount, dueDate, paymentStatus, paymentDate
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        invoiceNumber,
        roomId,
        invoiceMonth,
        roomFee,
        electricityCost,
        waterCost,
        otherFees || 0,
        totalAmount,
        dueDate ? new Date(dueDate) : defaultDueDate,
        paymentStatus,
        paymentDateValue
      ]
    );

    // Log activity
    if (req.user?.id) {
      await activityLogService.logActivity(
        req.user.id,
        'create',
        'invoice',
        result.insertId,
        `Tạo hóa đơn tiện ích cho Phòng ${roomNumber} tại tòa nhà ${buildingName} tháng ${month}: ${totalAmount.toLocaleString('vi-VN')} VNĐ`,
        req
      );
    }

    res.status(201).json({
      success: true,
      message: 'Thêm hóa đơn tiện ích thành công',
      data: {
        id: result.insertId,
        invoiceNumber,
        roomId,
        month,
        roomFee,
        electricityCost,
        waterCost,
        otherFees: otherFees || 0,
        totalAmount,
        paymentStatus,
        paidDate: paymentDateValue
      }
    });

  } catch (error: any) {
    console.error('Error adding utility:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi khi thêm hóa đơn tiện ích',
      error: error.message
    });
  }
};

// Remove Resident
export const removeResident = async (req: Request, res: Response) => {
  try {
    const roomId = parseInt(req.params.roomId);
    const residentId = parseInt(req.params.residentId);

    if (isNaN(roomId) || isNaN(residentId)) {
      return res.status(400).json({
        success: false,
        message: 'ID phòng hoặc ID sinh viên không hợp lệ'
      });
    }

    // Kiểm tra sinh viên có ở phòng này không
    const [contractExists] = await pool.query<RowDataPacket[]>(
      `SELECT c.id 
       FROM contracts c 
       WHERE c.roomId = ? AND c.studentId = ? AND c.status = 'active'`,
      [roomId, residentId]
    );

    if (!contractExists.length) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy sinh viên trong phòng này hoặc hợp đồng không còn hiệu lực'
      });
    }

    const contractId = contractExists[0].id;

    // Get student and room information for logging
    const [studentRoomInfo] = await pool.query<RowDataPacket[]>(
      `SELECT s.fullName as studentName, r.roomNumber, b.name as buildingName
       FROM students s
       JOIN rooms r ON r.id = ?
       JOIN buildings b ON r.buildingId = b.id
       WHERE s.id = ?`,
      [roomId, residentId]
    );

    if (!studentRoomInfo.length) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy thông tin sinh viên hoặc phòng'
      });
    }

    const { studentName, roomNumber, buildingName } = studentRoomInfo[0];

    // Bắt đầu transaction
    await pool.query('START TRANSACTION');

    try {
      // Cập nhật trạng thái hợp đồng
      await pool.query(
        'UPDATE contracts SET status = ?, endDate = ? WHERE id = ?',
        ['terminated', new Date(), contractId]
      );

      // Cập nhật số người ở phòng
      await pool.query(
        'UPDATE rooms SET currentOccupancy = currentOccupancy - 1 WHERE id = ?',
        [roomId]
      );

      // Cập nhật trạng thái phòng nếu đang full
      await pool.query(
        'UPDATE rooms SET status = "available" WHERE id = ? AND status = "full"',
        [roomId]
      );

      // Log activity
      if (req.user?.id) {
        // Log for student entity
        await activityLogService.logActivity(
          req.user.id,
          'remove',
          'student',
          residentId,
          `Xóa sinh viên ${studentName} khỏi Phòng ${roomNumber} tại tòa nhà ${buildingName}`,
          req
        );

        // Log for room entity - ensures it shows up in room timeline
        await activityLogService.logActivity(
          req.user.id,
          'remove',
          'room',
          roomId,
          `Xóa sinh viên ${studentName} khỏi Phòng ${roomNumber} tại tòa nhà ${buildingName}`,
          req
        );
      }

      // Commit transaction
      await pool.query('COMMIT');

      res.json({
        success: true,
        message: 'Đã xóa sinh viên khỏi phòng thành công',
        data: {
          roomId,
          residentId
        }
      });
    } catch (err) {
      // Rollback transaction nếu có lỗi
      await pool.query('ROLLBACK');
      throw err;
    }
  } catch (error: any) {
    console.error('Error removing resident:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi khi xóa sinh viên khỏi phòng',
      error: error.message
    });
  }
};

/**
 * Get room timeline history
 * This function retrieves all activity logs related to a specific room
 * including student-related activities, invoice activities, and room status changes
 */
export const getRoomTimeline = async (req: Request, res: Response) => {
  try {
    const roomId = req.params.id;

    if (!roomId) {
      return res.status(400).json({
        success: false,
        message: 'Room ID is required'
      });
    }

    // Main query to get all activity logs related to the room
    const timelineQuery = `
      SELECT 
        al.id,
        al.action,
        al.entityType,
        al.entityId,
        al.description,
        al.createdAt,
        CASE 
          WHEN u.userType = 'admin' THEN a.fullName
          WHEN u.userType = 'student' THEN s.fullName
          ELSE 'System'
        END as userName,
        u.userType,
        a.avatarPath as adminAvatar,
        s.avatarPath as studentAvatar
      FROM activity_logs al
      LEFT JOIN users u ON al.userId = u.id
      LEFT JOIN admins a ON u.id = a.userId AND u.userType = 'admin'
      LEFT JOIN students s ON u.id = s.userId AND u.userType = 'student'
      WHERE 
        (al.entityType = 'room' AND al.entityId = ?) OR
        (al.entityType = 'student' AND al.description LIKE ?) OR
        (al.entityType = 'contract' AND al.description LIKE ?) OR
        (al.entityType = 'invoice' AND al.description LIKE ?) OR
        (al.entityType = 'maintenance' AND al.description LIKE ?)
      ORDER BY al.createdAt DESC
    `;

    const roomNumberQuery = `SELECT roomNumber FROM rooms WHERE id = ?`;
    const [roomResult] = await pool.query<RowDataPacket[]>(roomNumberQuery, [roomId]);

    if (!roomResult || roomResult.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Room not found'
      });
    }

    const roomNumber = roomResult[0].roomNumber;
    const searchParam = `%Room ${roomNumber}%`;

    // Execute the query with parameters
    const [timelineRows] = await pool.query<RowDataPacket[]>(
      timelineQuery,
      [roomId, searchParam, searchParam, searchParam, searchParam]
    );

    // Format the timeline data
    const timeline = timelineRows.map(row => ({
      id: row.id,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      description: row.description,
      timestamp: row.createdAt,
      userName: row.userName,
      userType: row.userType,
      userAvatar: row.userType === 'admin' ? row.adminAvatar : row.studentAvatar
    }));

    return res.status(200).json({
      success: true,
      data: timeline
    });
  } catch (error: any) {
    console.error('Error fetching room timeline:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching room timeline',
      error: error.message
    });
  }
};

// Get maintenance requests for a student
export const getStudentMaintenanceRequests = async (req: Request, res: Response) => {
  try {
    const studentId = parseInt(req.params.studentId);

    if (isNaN(studentId)) {
      return res.status(400).json({
        success: false,
        message: 'ID sinh viên không hợp lệ'
      });
    }

    // Check if user has permission (admin or the student themself)
    const isAdmin = req.user?.userType === 'admin';
    const isOwnRequest = req.user?.id === studentId;

    if (!isAdmin && !isOwnRequest) {
      return res.status(403).json({
        success: false,
        message: 'Bạn không có quyền xem thông tin này'
      });
    }

    // Get maintenance requests for this student
    const [requests] = await pool.query<RowDataPacket[]>(
      `SELECT 
        mr.id, mr.requestNumber, mr.roomId, mr.studentId,
        mr.requestType, mr.description, mr.priority, mr.status,
        mr.createdAt, mr.resolvedAt, mr.resolutionNote,
        r.roomNumber, b.name as buildingName
      FROM maintenance_requests mr
      JOIN rooms r ON mr.roomId = r.id
      JOIN buildings b ON r.buildingId = b.id
      WHERE mr.studentId = ?
      ORDER BY mr.createdAt DESC`,
      [studentId]
    );

    // Get image paths for each request (if any)
    const requestsWithImages = await Promise.all(
      requests.map(async (request) => {
        const [images] = await pool.query<RowDataPacket[]>(
          'SELECT imagePath FROM maintenance_request_images WHERE requestId = ?',
          [request.id]
        );

        return {
          ...request,
          imagePaths: images.map(img => img.imagePath),
        };
      })
    );

    return res.status(200).json({
      success: true,
      data: requestsWithImages
    });
  } catch (error) {
    console.error('Error fetching student maintenance requests:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi khi lấy danh sách yêu cầu bảo trì'
    });
  }
};

// Get maintenance requests for a room
export const getRoomMaintenanceRequests = async (req: Request, res: Response) => {
  try {
    const roomId = parseInt(req.params.roomId);

    if (isNaN(roomId)) {
      return res.status(400).json({
        success: false,
        message: 'ID phòng không hợp lệ'
      });
    }

    // Get maintenance requests for this room
    const [requests] = await pool.query<RowDataPacket[]>(
      `SELECT 
        mr.id, mr.requestNumber, mr.roomId, mr.studentId,
        mr.requestType, mr.description, mr.priority, mr.status,
        mr.createdAt, mr.resolvedAt, mr.resolutionNote,
        r.roomNumber, b.name as buildingName,
        s.fullName as studentName, s.studentCode
      FROM maintenance_requests mr
      JOIN rooms r ON mr.roomId = r.id
      JOIN buildings b ON r.buildingId = b.id
      LEFT JOIN students s ON mr.studentId = s.id
      WHERE mr.roomId = ?
      ORDER BY mr.createdAt DESC`,
      [roomId]
    );

    // If there are no requests, return an empty array instead of failing
    if (!requests || requests.length === 0) {
      return res.status(200).json({
        success: true,
        data: []
      });
    }

    // Skip the image fetching since the table might not exist
    const requestsWithImages = requests.map(request => ({
      ...request,
      imagePaths: [],
    }));

    return res.status(200).json({
      success: true,
      data: requestsWithImages
    });
  } catch (error) {
    console.error('Error fetching room maintenance requests:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi khi lấy danh sách yêu cầu bảo trì'
    });
  }
};

// Cancel a maintenance request
export const cancelMaintenanceRequest = async (req: Request, res: Response) => {
  try {
    const requestId = parseInt(req.params.id);

    if (isNaN(requestId)) {
      return res.status(400).json({
        success: false,
        message: 'ID yêu cầu không hợp lệ'
      });
    }

    // Get request info to check permissions
    const [requestInfo] = await pool.query<RowDataPacket[]>(
      'SELECT studentId, status FROM maintenance_requests WHERE id = ?',
      [requestId]
    );

    if (requestInfo.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy yêu cầu bảo trì'
      });
    }

    // Check if user has permission (admin or the student who created the request)
    const isAdmin = req.user?.userType === 'admin';
    const isOwnRequest = req.user?.id === requestInfo[0].studentId;

    if (!isAdmin && !isOwnRequest) {
      return res.status(403).json({
        success: false,
        message: 'Bạn không có quyền hủy yêu cầu này'
      });
    }

    // Check if request can be canceled (only pending requests can be canceled)
    if (requestInfo[0].status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Chỉ những yêu cầu đang chờ xử lý mới có thể bị hủy'
      });
    }

    // Update request status to 'canceled'
    await pool.query(
      'UPDATE maintenance_requests SET status = "canceled" WHERE id = ?',
      [requestId]
    );

    // Log the activity
    if (req.user?.id) {
      await pool.query(
        `INSERT INTO activity_logs 
         (userId, action, entityType, entityId, description)
         VALUES (?, 'cancel', 'maintenance_request', ?, 'Hủy yêu cầu bảo trì')`,
        [req.user.id, requestId]
      );
    }

    return res.status(200).json({
      success: true,
      message: 'Hủy yêu cầu bảo trì thành công'
    });
  } catch (error) {
    console.error('Error canceling maintenance request:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi khi hủy yêu cầu bảo trì'
    });
  }
};