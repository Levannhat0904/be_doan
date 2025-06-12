import { Request, Response } from 'express';
import { RowDataPacket, OkPacket } from 'mysql2';
import pool from '../config/database';
import activityLogService from '../services/activityLogService';
import fs from 'fs';
import path from 'path';
import FilesService from '../services/FilesService';

// Lấy tất cả yêu cầu bảo trì
export const getAllMaintenanceRequests = async (
  req: Request,
  res: Response
) => {
  try {
    // Xử lý các tham số tìm kiếm và lọc
    const searchText = req.query.searchText as string | undefined;
    const status = req.query.status as string | undefined;
    const priority = req.query.priority as string | undefined;
    const buildingId = req.query.buildingId ? parseInt(req.query.buildingId as string) : undefined;
    
    // Xử lý phân trang
    const page = req.query.page ? parseInt(req.query.page as string) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
    const offset = (page - 1) * limit;

    // Xây dựng câu truy vấn
    let query = `SELECT 
      mr.id, mr.requestNumber, mr.roomId, mr.studentId,
      mr.requestType as type, mr.description, mr.priority, mr.status,
      mr.createdAt as date, mr.resolvedAt, mr.resolutionNote,
      mr.imagePaths,
      r.roomNumber, b.name as buildingName, b.id as buildingId,
      s.fullName as requestedBy, s.studentCode
    FROM maintenance_requests mr
    JOIN rooms r ON mr.roomId = r.id
    JOIN buildings b ON r.buildingId = b.id
    LEFT JOIN students s ON mr.studentId = s.id`;

    // Xây dựng điều kiện WHERE
    const conditions = [];
    const params = [];

    if (searchText) {
      conditions.push(`(mr.requestNumber LIKE ? OR r.roomNumber LIKE ? OR mr.description LIKE ? OR s.fullName LIKE ?)`);
      const searchPattern = `%${searchText}%`;
      params.push(searchPattern, searchPattern, searchPattern, searchPattern);
    }

    if (status) {
      conditions.push(`mr.status = ?`);
      params.push(status);
    }

    if (priority) {
      conditions.push(`mr.priority = ?`);
      params.push(priority);
    }

    if (buildingId && !isNaN(buildingId)) {
      conditions.push(`b.id = ?`);
      params.push(buildingId);
    }

    // Thêm điều kiện WHERE nếu có
    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(" AND ")}`;
    }

    // Thêm sắp xếp và phân trang
    query += ` ORDER BY mr.createdAt DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    // Thực hiện truy vấn
    const [requests] = await pool.query<RowDataPacket[]>(query, params);

    // Đếm tổng số bản ghi để phân trang
    let countQuery = `SELECT COUNT(*) as total FROM maintenance_requests mr
      JOIN rooms r ON mr.roomId = r.id
      JOIN buildings b ON r.buildingId = b.id
      LEFT JOIN students s ON mr.studentId = s.id`;

    if (conditions.length > 0) {
      countQuery += ` WHERE ${conditions.join(" AND ")}`;
    }

    const [countResult] = await pool.query<RowDataPacket[]>(countQuery, params.slice(0, -2));
    const totalItems = countResult[0].total;

    // Xử lý dữ liệu trả về
    const requestsWithImages = requests.map((request: RowDataPacket) => {
      try {
        let parsedImagePaths = [];

        if (request.imagePaths) {
          if (Array.isArray(request.imagePaths)) {
            parsedImagePaths = request.imagePaths;
          } else {
            try {
              parsedImagePaths = JSON.parse(request.imagePaths);
            } catch (parseError) {
              parsedImagePaths = request.imagePaths ? [request.imagePaths] : [];
            }
          }
        }

        return {
          ...request,
          images: parsedImagePaths,
        };
      } catch (error) {
        console.error("Error processing request:", error);
        return {
          ...request,
          images: [],
        };
      }
    });

    return res.status(200).json({
      success: true,
      data: requestsWithImages,
      pagination: {
        currentPage: page,
        itemsPerPage: limit,
        totalItems: totalItems,
        totalPages: Math.ceil(totalItems / limit)
      }
    });
  } catch (error) {
    console.error("Error fetching all maintenance requests:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi khi lấy danh sách yêu cầu bảo trì",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// Thêm yêu cầu bảo trì mới
export const addMaintenanceRequest = async (
  req: Request,
  res: Response
) => {
  try {
    const { buildingId, roomId, type, description, priority, requestedBy } = req.body;

    // Validate required fields
    if (!roomId || !type || !description) {
      return res.status(400).json({
        success: false,
        message: "Thiếu thông tin bắt buộc: roomId, type, description",
      });
    }

    // Kiểm tra phòng có tồn tại không
    const [roomCheck] = await pool.query<RowDataPacket[]>(
      "SELECT r.id, r.roomNumber, b.name as buildingName FROM rooms r JOIN buildings b ON r.buildingId = b.id WHERE r.id = ?",
      [roomId]
    );

    if (roomCheck.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy phòng",
      });
    }

    const roomNumber = roomCheck[0].roomNumber;
    const buildingName = roomCheck[0].buildingName;

    // Tạo mã yêu cầu
    const requestNumber = `MR-${Date.now().toString().slice(-6)}`;

    // Xử lý tải lên hình ảnh
    const uploadedImages: string[] = [];
    if (req.files && Array.isArray(req.files)) {
      for (const file of req.files) {
        try {
          // Kiểm tra kích thước file (giới hạn 5MB)
          const MAX_FILE_SIZE = 5 * 1024 * 1024;
          if (file.size > MAX_FILE_SIZE) {
            throw new Error("Kích thước file không được vượt quá 5MB");
          }

          // Kiểm tra mime type
          if (!file.mimetype.startsWith("image/")) {
            throw new Error("File phải là hình ảnh");
          }

          const buffer = file.buffer || fs.readFileSync(file.path);
          const timestamp = Date.now();
          const ext = path.extname(file.originalname);
          const filename = `maintenance-${roomId}-${timestamp}${ext}`;

          // Upload ảnh
          const imagePath = await FilesService.singleUpload(
            buffer,
            filename,
            "maintenance",
            true
          );
          const imageUrl = await FilesService.getSignedUrl(imagePath, true);

          uploadedImages.push(imageUrl);

          // Xóa file tạm nếu có
          if (file.path && fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        } catch (uploadError) {
          console.error("Error uploading image:", uploadError);
        }
      }
    }

    // Insert new maintenance request
    const [result] = await pool.query<OkPacket>(
      `INSERT INTO maintenance_requests (
        roomId, requestNumber, requestType, description, priority, status, 
        createdAt, imagePaths
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        roomId,
        requestNumber,
        type,
        description,
        priority || "normal",
        "pending",
        new Date(),
        JSON.stringify(uploadedImages),
      ]
    );

    const maintenanceId = result.insertId;

    // Log activity
    if (req.user?.id) {
      await activityLogService.logActivity(
        req.user.id,
        "create",
        "maintenance",
        maintenanceId,
        `Tạo yêu cầu bảo trì cho Phòng ${roomNumber} tại tòa nhà ${buildingName}: ${type}`,
        req,
        Number(roomId)
      );
    }

    res.status(201).json({
      success: true,
      message: "Thêm yêu cầu bảo trì thành công",
      data: {
        id: maintenanceId,
        requestNumber,
        roomId,
        type,
        description,
        priority: priority || "normal",
        status: "pending",
        createdAt: new Date(),
        images: uploadedImages,
      },
    });
  } catch (error: any) {
    console.error("Error adding maintenance request:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi khi thêm yêu cầu bảo trì",
      error: error.message,
    });
  }
};

// Cập nhật trạng thái yêu cầu bảo trì
export const updateMaintenanceRequest = async (
  req: Request,
  res: Response
) => {
  try {
    const requestId = parseInt(req.params.id);
    const { status, notes, cost, staff } = req.body;

    if (isNaN(requestId)) {
      return res.status(400).json({
        success: false,
        message: "ID yêu cầu không hợp lệ",
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
        message: "Không tìm thấy yêu cầu bảo trì",
      });
    }

    const maintenanceRequest = requestResult[0];
    const previousStatus = maintenanceRequest.status;

    // Cập nhật thông tin
    let updateQuery = "UPDATE maintenance_requests SET ";
    const updateValues = [];
    const updateFields = [];

    if (status) {
      updateFields.push("status = ?");
      updateValues.push(status);
    }

    if (notes !== undefined) {
      updateFields.push("resolutionNote = ?");
      updateValues.push(notes);
    }

    if (cost !== undefined) {
      updateFields.push("cost = ?");
      updateValues.push(cost);
    }

    if (staff !== undefined) {
      updateFields.push("staff = ?");
      updateValues.push(staff);
    }

    // Nếu status là completed, cập nhật resolvedAt
    if (status === "completed") {
      updateFields.push("resolvedAt = ?");
      updateValues.push(new Date());
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Không có thông tin nào để cập nhật",
      });
    }

    updateQuery += updateFields.join(", ") + " WHERE id = ?";
    updateValues.push(requestId);

    await pool.query(updateQuery, updateValues);

    // Log activity
    if (req.user?.id) {
      await activityLogService.logActivity(
        req.user.id,
        "update",
        "maintenance",
        requestId,
        `Cập nhật yêu cầu bảo trì cho Phòng ${maintenanceRequest.roomNumber} tại tòa nhà ${maintenanceRequest.buildingName}`,
        req,
        Number(maintenanceRequest.roomId)
      );
    }

    return res.json({
      success: true,
      message: "Cập nhật yêu cầu bảo trì thành công",
    });
  } catch (error: any) {
    console.error("Error updating maintenance request:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi khi cập nhật yêu cầu bảo trì",
      error: error.message,
    });
  }
};

// Xóa yêu cầu bảo trì
export const deleteMaintenanceRequest = async (
  req: Request,
  res: Response
) => {
  try {
    const requestId = parseInt(req.params.id);

    if (isNaN(requestId)) {
      return res.status(400).json({
        success: false,
        message: "ID yêu cầu không hợp lệ",
      });
    }

    // Kiểm tra yêu cầu có tồn tại không
    const [requestInfo] = await pool.query<RowDataPacket[]>(
      `SELECT mr.*, r.roomNumber, b.name as buildingName 
       FROM maintenance_requests mr
       JOIN rooms r ON mr.roomId = r.id
       JOIN buildings b ON r.buildingId = b.id
       WHERE mr.id = ?`,
      [requestId]
    );

    if (requestInfo.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy yêu cầu bảo trì",
      });
    }

    // Xóa yêu cầu
    await pool.query("DELETE FROM maintenance_requests WHERE id = ?", [requestId]);

    // Log activity
    if (req.user?.id) {
      await activityLogService.logActivity(
        req.user.id,
        "delete",
        "maintenance",
        requestId,
        `Xóa yêu cầu bảo trì cho Phòng ${requestInfo[0].roomNumber} tại tòa nhà ${requestInfo[0].buildingName}`,
        req,
        Number(requestInfo[0].roomId)
      );
    }

    return res.status(200).json({
      success: true,
      message: "Xóa yêu cầu bảo trì thành công",
    });
  } catch (error: any) {
    console.error("Error deleting maintenance request:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi khi xóa yêu cầu bảo trì",
      error: error.message,
    });
  }
};

// Lấy chi tiết yêu cầu bảo trì
export const getMaintenanceRequestDetail = async (
  req: Request,
  res: Response
) => {
  try {
    const requestId = parseInt(req.params.id);

    if (isNaN(requestId)) {
      return res.status(400).json({
        success: false,
        message: "ID yêu cầu không hợp lệ",
      });
    }

    // Lấy thông tin chi tiết
    const [requestResult] = await pool.query<RowDataPacket[]>(
      `SELECT 
        mr.id, mr.requestNumber, mr.roomId, mr.studentId,
        mr.requestType as type, mr.description, mr.priority, mr.status,
        mr.createdAt as date, mr.resolvedAt, mr.resolutionNote, mr.cost, mr.staff,
        mr.imagePaths,
        r.roomNumber, b.name as buildingName, b.id as buildingId,
        s.fullName as requestedBy, s.studentCode
      FROM maintenance_requests mr
      JOIN rooms r ON mr.roomId = r.id
      JOIN buildings b ON r.buildingId = b.id
      LEFT JOIN students s ON mr.studentId = s.id
      WHERE mr.id = ?`,
      [requestId]
    );

    if (requestResult.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy yêu cầu bảo trì",
      });
    }

    const request = requestResult[0];

    // Xử lý hình ảnh
    let images = [];
    try {
      if (request.imagePaths) {
        if (Array.isArray(request.imagePaths)) {
          images = request.imagePaths;
        } else {
          try {
            images = JSON.parse(request.imagePaths);
          } catch (parseError) {
            images = request.imagePaths ? [request.imagePaths] : [];
          }
        }
      }
    } catch (error) {
      console.error("Error processing images:", error);
      images = [];
    }

    return res.status(200).json({
      success: true,
      data: {
        ...request,
        images,
      },
    });
  } catch (error: any) {
    console.error("Error fetching maintenance request detail:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi khi lấy chi tiết yêu cầu bảo trì",
      error: error.message,
    });
  }
}; 