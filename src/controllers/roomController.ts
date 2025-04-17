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