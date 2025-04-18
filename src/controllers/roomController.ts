import { Request, Response } from 'express';
import pool from '../config/database';
import { RowDataPacket, OkPacket } from 'mysql2';
import fs from 'fs';
import { Room, RoomFilters, RoomResponse } from '../types/room/room';
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
        COUNT(DISTINCT bd.id) as occupiedBeds
      FROM rooms r
      LEFT JOIN buildings b ON r.buildingId = b.id
      LEFT JOIN beds bd ON r.id = bd.roomId AND bd.status = 'occupied'
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

    // Đếm số giường đã được sử dụng
    const occupiedBedsQuery = `
      SELECT COUNT(*) as occupiedBeds
      FROM beds
      WHERE roomId = ? AND status = 'occupied'
    `;

    const [occupiedBedsData] = await pool.query<RowDataPacket[]>(occupiedBedsQuery, [roomId]);
    room.occupiedBeds = occupiedBedsData[0].occupiedBeds;

    // Get residents in the room
    const residentsQuery = `
      SELECT s.id, s.studentCode, s.fullName, s.gender, s.phone, s.email, 
             c.startDate as joinDate, c.endDate, b.bedNumber, c.status,
             s.faculty, s.major, s.avatarPath,
             IFNULL(
               (SELECT MAX(i.paymentStatus) 
                FROM invoices i 
                WHERE i.studentId = s.id AND i.paymentStatus = 'pending'), 'paid'
             ) as paymentStatus
      FROM contracts c
      JOIN students s ON c.studentId = s.id
      JOIN beds b ON c.bedId = b.id
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
      bedNumber: resident.bedNumber,
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
    const data = {
      buildingId: parseInt(req.body.buildingId),
      roomNumber: req.body.roomNumber,
      floorNumber: parseInt(req.body.floorNumber),
      roomType: req.body.roomType,
      capacity: parseInt(req.body.capacity),
      pricePerMonth: parseFloat(req.body.pricePerMonth),
      description: req.body.description,
      amenities: req.body.amenities ? JSON.parse(req.body.amenities) : [],
      status: req.body.status || 'available'
    };

    // Validate required fields
    const requiredFields = [
      'buildingId', 'roomNumber', 'floorNumber',
      'roomType', 'capacity', 'pricePerMonth'
    ] as const;

    const missingFields = requiredFields.filter(field => !data[field as keyof typeof data]);
    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Thiếu các trường bắt buộc: ${missingFields.join(', ')}`
      });
    }

    // Thêm phòng mới vào database
    const [result] = await pool.query<OkPacket>(
      `INSERT INTO rooms (
        buildingId, roomNumber, floorNumber, roomType, 
        capacity, pricePerMonth, description, amenities, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.buildingId, data.roomNumber, data.floorNumber,
        data.roomType, data.capacity, data.pricePerMonth,
        data.description, JSON.stringify(data.amenities), data.status
      ]
    );

    const roomId = result.insertId;
    let imagePaths: string[] = [];

    // Chỉ xử lý ảnh sau khi thêm phòng thành công
    if (req.files && Array.isArray(req.files)) {
      const files = req.files as Express.Multer.File[];
      imagePaths = files.map(file => file.path);

      // Cập nhật đường dẫn ảnh vào phòng
      await pool.query(
        'UPDATE rooms SET roomImagePath = ? WHERE id = ?',
        [JSON.stringify(imagePaths), roomId]
      );
    }

    res.status(201).json({
      success: true,
      message: 'Thêm phòng thành công',
      data: {
        roomId: result.insertId,
        imagePaths
      }
    });

  } catch (error) {
    // Nếu có lỗi, xóa các file ảnh đã upload
    if (req.files && Array.isArray(req.files)) {
      const files = req.files as Express.Multer.File[];
      for (const file of files) {
        try {
          fs.unlinkSync(file.path);
        } catch (err) {
          console.error(`Lỗi xóa file ảnh: ${file.path}`);
        }
      }
    }

    res.status(500).json({
      success: false,
      message: 'Lỗi khi thêm phòng'
    });
  }
};

// Update Room
export const updateRoom = async (req: Request, res: Response) => {
  try {
    const roomId = parseInt(req.params.roomId);
    // Lấy dữ liệu cập nhật từ form
    const data = {
      buildingId: parseInt(req.body.buildingId),
      roomNumber: req.body.roomNumber,
      floorNumber: parseInt(req.body.floorNumber),
      roomType: req.body.roomType,
      capacity: parseInt(req.body.capacity),
      pricePerMonth: parseFloat(req.body.pricePerMonth),
      description: req.body.description,
      amenities: req.body.amenities ? JSON.parse(req.body.amenities) : undefined,
      status: req.body.status
    };

    // Kiểm tra phòng có tồn tại không
    const [existingRoom] = await pool.query<RowDataPacket[]>(
      'SELECT roomImagePath FROM rooms WHERE id = ?',
      [roomId]
    );

    if (!existingRoom.length) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy phòng'
      });
    }

    // Xử lý cập nhật ảnh
    let imagePaths = existingRoom[0].roomImagePath ?
      JSON.parse(existingRoom[0].roomImagePath) : [];

    if (req.files && Array.isArray(req.files)) {
      const files = req.files as Express.Multer.File[];

      // Nếu không giữ lại ảnh cũ (keepExisting = false)
      if (req.body.keepExisting !== 'true') {
        // Xóa các file ảnh cũ
        for (const oldPath of imagePaths) {
          try {
            fs.unlinkSync(oldPath);
          } catch (err) {
            console.error(`Lỗi xóa file ảnh: ${oldPath}`);
          }
        }
        imagePaths = [];
      }

      // Thêm đường dẫn ảnh mới
      const newPaths = files.map(file => file.path);
      imagePaths = [...imagePaths, ...newPaths];
    }

    // Tạo câu query cập nhật động
    const updates = [];
    const values = [];

    // Chỉ cập nhật các trường có dữ liệu mới
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        updates.push(`${key} = ?`);
        values.push(key === 'amenities' ? JSON.stringify(value) : value);
      }
    }

    // Cập nhật đường dẫn ảnh
    updates.push('roomImagePath = ?');
    values.push(JSON.stringify(imagePaths));

    // Thực hiện cập nhật
    await pool.query(
      `UPDATE rooms SET ${updates.join(', ')} WHERE id = ?`,
      [...values, roomId]
    );

    res.json({
      success: true,
      message: 'Cập nhật phòng thành công',
      data: { imagePaths }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi khi cập nhật phòng'
    });
  }
};

// Delete Room
export const deleteRoom = async (req: Request, res: Response) => {
  try {
    const roomId = parseInt(req.params.roomId);

    // Lấy thông tin phòng để xóa ảnh
    const [room] = await pool.query<RowDataPacket[]>(
      'SELECT roomImagePath FROM rooms WHERE id = ?',
      [roomId]
    );

    if (!room.length) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy phòng'
      });
    }

    // Xóa các file ảnh từ hệ thống
    const imagePaths = JSON.parse(room[0].roomImagePath || '[]');
    for (const path of imagePaths) {
      try {
        fs.unlinkSync(path);
      } catch (err) {
        console.error(`Lỗi xóa file ảnh: ${path}`);
      }
    }

    // Xóa phòng khỏi database
    await pool.query('DELETE FROM rooms WHERE id = ?', [roomId]);

    res.json({
      success: true,
      message: 'Xóa phòng thành công'
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi khi xóa phòng'
    });
  }
};

// Update Room Status
export const updateRoomStatus = async (req: Request, res: Response) => {
  try {
    const roomId = parseInt(req.params.roomId);
    const { status } = req.body;

    // Validate status
    const validStatuses = ['available', 'full', 'maintenance'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Trạng thái không hợp lệ. Các trạng thái hợp lệ là: available, full, maintenance'
      });
    }

    // Check if room exists
    const [room] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM rooms WHERE id = ?',
      [roomId]
    );

    if (!room.length) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy phòng'
      });
    }

    // Update room status
    await pool.query(
      'UPDATE rooms SET status = ? WHERE id = ?',
      [status, roomId]
    );

    res.json({
      success: true,
      message: 'Cập nhật trạng thái phòng thành công',
      data: { status }
    });

  } catch (error: any) {
    console.error('Error updating room status:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi khi cập nhật trạng thái phòng',
      error: error.message
    });
  }
};