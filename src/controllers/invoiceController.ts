import { Request, Response } from "express";
import pool from "../config/database";
import { RowDataPacket, OkPacket } from "mysql2";
import activityLogService from "../services/activityLogService";

export const getAllInvoices = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = (page - 1) * limit;

    // Filtering options
    const status = req.query.status as string | undefined;
    const buildingId = req.query.buildingId as string | undefined;
    const searchTerm = req.query.search as string | undefined;
    const startDate = req.query.startDate as string | undefined;
    const endDate = req.query.endDate as string | undefined;

    // Base query conditions
    let conditions = [];
    const queryParams: any[] = [];

    // Adding filters if provided
    if (status && ["pending", "paid", "overdue"].includes(status)) {
      conditions.push("i.paymentStatus = ?");
      queryParams.push(status);
    }

    if (buildingId && !isNaN(Number(buildingId))) {
      conditions.push("r.buildingId = ?");
      queryParams.push(Number(buildingId));
    }

    if (searchTerm) {
      conditions.push(
        "(i.invoiceNumber LIKE ? OR r.roomNumber LIKE ? OR s.fullName LIKE ? OR s.studentCode LIKE ?)"
      );
      const searchPattern = `%${searchTerm}%`;
      queryParams.push(
        searchPattern,
        searchPattern,
        searchPattern,
        searchPattern
      );
    }

    if (startDate && endDate) {
      conditions.push("(i.dueDate BETWEEN ? AND ?)");
      queryParams.push(startDate, endDate);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // Count total invoices
    const [countRows] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) as total 
       FROM invoices i
       JOIN rooms r ON i.roomId = r.id
       LEFT JOIN students s ON s.id = i.studentId
       ${whereClause}`,
      queryParams
    );

    const total = countRows[0].total;

    // Get invoices with pagination
    const [invoiceRows] = await pool.query<RowDataPacket[]>(
      `SELECT 
         i.id, i.invoiceNumber, i.invoiceMonth, i.dueDate,
         i.roomFee, i.electricFee, i.waterFee, i.serviceFee,
         i.totalAmount, i.paymentStatus, i.paymentDate, i.paymentMethod,
         r.id as roomId, r.roomNumber, r.floorNumber,
         b.id as buildingId, b.name as buildingName,
         s.fullName, s.studentCode
       FROM invoices i
       JOIN rooms r ON i.roomId = r.id
       JOIN buildings b ON r.buildingId = b.id
       LEFT JOIN students s ON s.id = i.studentId
       ${whereClause}
       ORDER BY i.invoiceMonth DESC
       LIMIT ? OFFSET ?`,
      [...queryParams, limit, offset]
    );

    // Format invoices for response
    const invoices = invoiceRows.map((invoice) => ({
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      roomId: invoice.roomId,
      roomNumber: invoice.roomNumber,
      floorNumber: invoice.floorNumber,
      buildingId: invoice.buildingId,
      buildingName: invoice.buildingName,
      fullName: invoice.fullName,
      studentCode: invoice.studentCode,
      invoiceMonth: invoice.invoiceMonth,
      electricity: Math.round(invoice.electricFee / 2000), // kWh
      water: Math.round(invoice.waterFee / 10000), // m3
      electricFee: invoice.electricFee,
      waterFee: invoice.waterFee,
      serviceFee: invoice.serviceFee,
      roomFee: invoice.roomFee,
      totalAmount: invoice.totalAmount,
      dueDate: invoice.dueDate,
      paymentStatus: invoice.paymentStatus,
      paymentDate: invoice.paymentDate,
      paymentMethod: invoice.paymentMethod,
    }));

    return res.status(200).json({
      success: true,
      data: {
        invoices,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    console.error("Error fetching all invoices:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi khi truy vấn danh sách hóa đơn",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const getInvoiceById = async (req: Request, res: Response) => {
  try {
    const { invoiceId } = req.params;

    // Validate invoiceId
    if (!invoiceId || isNaN(Number(invoiceId))) {
      return res.status(400).json({
        success: false,
        message: "ID hóa đơn không hợp lệ",
      });
    }

    // Get invoice details
    const [invoiceRows] = await pool.query<RowDataPacket[]>(
      `SELECT 
         i.id, i.invoiceNumber, i.invoiceMonth, i.dueDate,
         i.roomFee, i.electricFee, i.waterFee, i.serviceFee,
         i.totalAmount, i.paymentStatus, i.paymentDate, i.paymentMethod,
         r.id as roomId, r.roomNumber, r.floorNumber,
         b.id as buildingId, b.name as buildingName,
         s.fullName, s.studentCode, s.phone as phoneNumber, s.email
       FROM invoices i
       JOIN rooms r ON i.roomId = r.id
       JOIN buildings b ON r.buildingId = b.id
       LEFT JOIN students s ON s.id = i.studentId
       WHERE i.id = ?`,
      [invoiceId]
    );

    if (invoiceRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy hóa đơn",
      });
    }

    const invoice = invoiceRows[0];

    return res.status(200).json({
      success: true,
      data: {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        roomId: invoice.roomId,
        roomNumber: invoice.roomNumber,
        floorNumber: invoice.floorNumber,
        buildingId: invoice.buildingId,
        buildingName: invoice.buildingName,
        fullName: invoice.fullName,
        studentCode: invoice.studentCode,
        phoneNumber: invoice.phoneNumber,
        email: invoice.email,
        invoiceMonth: invoice.invoiceMonth,
        electricity: Math.round(invoice.electricFee / 2000), // kWh
        water: Math.round(invoice.waterFee / 10000), // m3
        electricFee: invoice.electricFee,
        waterFee: invoice.waterFee,
        serviceFee: invoice.serviceFee,
        roomFee: invoice.roomFee,
        totalAmount: invoice.totalAmount,
        dueDate: invoice.dueDate,
        paymentStatus: invoice.paymentStatus,
        paymentDate: invoice.paymentDate,
        paymentMethod: invoice.paymentMethod,
      },
    });
  } catch (error) {
    console.error("Error fetching invoice details:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi khi truy vấn chi tiết hóa đơn",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const getInvoicesByRoom = async (req: Request, res: Response) => {
  try {
    const { roomId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = (page - 1) * limit;

    // Validate roomId
    if (!roomId || isNaN(Number(roomId))) {
      return res.status(400).json({
        success: false,
        message: "ID phòng không hợp lệ",
      });
    }

    // Get room information
    const [roomRows] = await pool.query<RowDataPacket[]>(
      `SELECT r.id, r.roomNumber, r.buildingId, b.name as buildingName
       FROM rooms r
       JOIN buildings b ON r.buildingId = b.id
       WHERE r.id = ?`,
      [roomId]
    );

    if (roomRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy phòng",
      });
    }

    const room = roomRows[0];

    // Count total invoices
    const [countRows] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) as total FROM invoices WHERE roomId = ?`,
      [roomId]
    );
    const total = countRows[0].total;

    // Get invoices
    const [invoiceRows] = await pool.query<RowDataPacket[]>(
      `SELECT 
         i.id, i.invoiceNumber, i.invoiceMonth, i.dueDate,
         i.roomFee, i.electricFee, i.waterFee, i.serviceFee,
         i.totalAmount, i.paymentStatus, i.paymentDate
       FROM invoices i
       WHERE i.roomId = ?
       ORDER BY i.invoiceMonth DESC
       LIMIT ? OFFSET ?`,
      [roomId, limit, offset]
    );

    // Format invoices
    const invoices = invoiceRows.map((invoice) => ({
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      month: new Date(invoice.invoiceMonth).toLocaleDateString("vi-VN", {
        month: "2-digit",
        year: "numeric",
      }),
      electricity: Math.round(invoice.electricFee / 2000), // kWh
      water: Math.round(invoice.waterFee / 10000), // m3
      electricityCost: invoice.electricFee,
      waterCost: invoice.waterFee,
      otherFees: invoice.serviceFee,
      roomFee: invoice.roomFee,
      totalCost: invoice.totalAmount,
      dueDate: invoice.dueDate,
      status: invoice.paymentStatus,
      paidDate: invoice.paymentDate,
    }));

    return res.status(200).json({
      success: true,
      data: {
        room: {
          id: room.id,
          roomNumber: room.roomNumber,
          buildingId: room.buildingId,
          buildingName: room.buildingName,
        },
        invoices,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    console.error("Error fetching invoices:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi khi truy vấn hóa đơn",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const createInvoice = async (req: Request, res: Response) => {
  try {
    const { roomId } = req.params;
    const { invoiceMonth, electricity, water, serviceFee, dueDate } = req.body;

    // Validate required fields
    if (!roomId || !invoiceMonth || !electricity || !water || !dueDate) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng cung cấp đầy đủ thông tin",
      });
    }

    // Get room information
    const [roomRows] = await pool.query<RowDataPacket[]>(
      `SELECT r.id, r.roomNumber, r.buildingId, r.pricePerMonth, b.name as buildingName
       FROM rooms r
       JOIN buildings b ON r.buildingId = b.id
       WHERE r.id = ?`,
      [roomId]
    );

    if (roomRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy phòng",
      });
    }

    const room = roomRows[0];

    // Calculate fees
    const electricFee = Number(electricity) * 2000; // 2000 VND per kWh
    const waterFee = Number(water) * 10000; // 10000 VND per m3

    // Kiểm tra giới hạn của cột DECIMAL(10,2)
    if (waterFee > 99999999.99) {
      return res.status(400).json({
        success: false,
        message:
          "Giá trị tiền nước vượt quá giới hạn. Vui lòng kiểm tra lại số nước.",
      });
    }

    const serviceFeeFinal = Number(serviceFee) || 100000; // Default to 100,000 VND if not provided
    const roomFee = Number(room.pricePerMonth);
    const totalAmount =
      Number(electricFee) +
      Number(waterFee) +
      Number(serviceFeeFinal) +
      Number(roomFee);

    // Kiểm tra giới hạn của cột DECIMAL(10,2)
    if (totalAmount > 99999999.99) {
      return res.status(400).json({
        success: false,
        message:
          "Tổng số tiền vượt quá giới hạn. Vui lòng kiểm tra lại các giá trị.",
      });
    }

    // Format invoice month
    const invoiceDate = new Date(invoiceMonth);

    // Generate invoice number
    const invoiceNumber = `INV-${room.buildingId}${
      room.roomNumber
    }-${invoiceDate.getFullYear()}${(invoiceDate.getMonth() + 1)
      .toString()
      .padStart(2, "0")}`;

    // Check if invoice already exists for this month
    const [existingInvoice] = await pool.query<RowDataPacket[]>(
      `SELECT id FROM invoices 
       WHERE roomId = ? AND MONTH(invoiceMonth) = ? AND YEAR(invoiceMonth) = ?`,
      [roomId, invoiceDate.getMonth() + 1, invoiceDate.getFullYear()]
    );

    if (existingInvoice.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Hóa đơn cho tháng này đã tồn tại",
      });
    }

    // Insert invoice
    const [result] = await pool.query<OkPacket>(
      `INSERT INTO invoices 
       (invoiceNumber, roomId, invoiceMonth, dueDate, roomFee, electricFee, waterFee, serviceFee, 
        totalAmount, paymentStatus)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        invoiceNumber,
        roomId,
        invoiceDate,
        new Date(dueDate),
        roomFee,
        electricFee,
        waterFee,
        serviceFeeFinal,
        totalAmount,
        "pending",
      ]
    );

    // Log activity
    if (req.user?.id) {
      const activityDescription = `Tạo hóa đơn: ${invoiceNumber} cho phòng ${room.roomNumber} tòa nhà ${room.buildingName}`;

      // Log to invoice entity
      await activityLogService.logActivity(
        req.user.id,
        "create",
        "invoice",
        result.insertId,
        activityDescription,
        req,
        Number(roomId),
        result.insertId
      );

      // Log to room entity for room timeline
      await activityLogService.logActivity(
        req.user.id,
        "create",
        "room",
        Number(roomId),
        activityDescription,
        req,
        Number(roomId),
        result.insertId
      );
    }

    // Get the created invoice
    const [newInvoice] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM invoices WHERE id = ?`,
      [result.insertId]
    );

    return res.status(201).json({
      success: true,
      message: "Tạo hóa đơn thành công",
      data: {
        id: result.insertId,
        invoiceNumber: invoiceNumber,
        month: new Date(invoiceDate).toLocaleDateString("vi-VN", {
          month: "2-digit",
          year: "numeric",
        }),
        electricity: Number(electricity),
        water: Number(water),
        electricityCost: electricFee,
        waterCost: waterFee,
        otherFees: serviceFeeFinal,
        roomFee: roomFee,
        totalCost: totalAmount,
        dueDate: new Date(dueDate),
        status: "pending",
      },
    });
  } catch (error) {
    console.error("Error creating invoice:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi khi tạo hóa đơn",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const updateInvoiceStatus = async (req: Request, res: Response) => {
  try {
    const { invoiceId } = req.params;
    const { status } = req.body;

    // Validate status (Now includes waiting_for_approval)
    if (
      !status ||
      !["pending", "paid", "overdue", "waiting_for_approval"].includes(status)
    ) {
      return res.status(400).json({
        success: false,
        message: "Trạng thái không hợp lệ",
      });
    }

    // Get current invoice status for logging
    const [currentInvoice] = await pool.query<RowDataPacket[]>(
      `SELECT i.invoiceNumber, i.paymentStatus, r.roomNumber, b.name as buildingName
       FROM invoices i
       JOIN rooms r ON i.roomId = r.id
       JOIN buildings b ON r.buildingId = b.id
       WHERE i.id = ?`,
      [invoiceId]
    );

    if (currentInvoice.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy hóa đơn",
      });
    }

    const oldStatus = currentInvoice[0].paymentStatus;

    // Update invoice status
    const paymentDate = status === "paid" ? new Date() : null;
    const [result] = await pool.query<OkPacket>(
      `UPDATE invoices 
       SET paymentStatus = ?, paymentDate = ?
       WHERE id = ?`,
      [status, paymentDate, invoiceId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy hóa đơn",
      });
    }

    // Log activity
    if (req.user?.id) {
      const activityDescription = `Cập nhật trạng thái hóa đơn: ${oldStatus} -> ${status} cho hóa đơn ${currentInvoice[0].invoiceNumber} (Phòng: ${currentInvoice[0].roomNumber} tòa nhà ${currentInvoice[0].buildingName})`;

      // Get room ID for room timeline
      const [roomInfo] = await pool.query<RowDataPacket[]>(
        `SELECT roomId FROM invoices WHERE id = ?`,
        [invoiceId]
      );

      const roomId = roomInfo.length > 0 ? roomInfo[0].roomId : null;

      // Log to invoice entity
      await activityLogService.logActivity(
        req.user.id,
        "status_change",
        "invoice",
        Number(invoiceId),
        activityDescription,
        req,
        Number(roomId),
        Number(invoiceId)
      );

      // Log to room entity for room timeline if roomId is available
      if (roomId) {
        await activityLogService.logActivity(
          req.user.id,
          "status_change",
          "room",
          roomId,
          activityDescription,
          req,
          Number(roomId),
          Number(invoiceId)
        );
      }
    }

    return res.status(200).json({
      success: true,
      message: "Cập nhật trạng thái hóa đơn thành công",
      data: {
        id: invoiceId,
        status,
        paymentDate,
      },
    });
  } catch (error) {
    console.error("Error updating invoice status:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi khi cập nhật trạng thái hóa đơn",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const updateInvoice = async (req: Request, res: Response) => {
  try {
    const { invoiceId } = req.params;
    const {
      invoiceMonth,
      dueDate,
      roomFee,
      electricFee,
      waterFee,
      serviceFee,
      electricity,
      water,
    } = req.body;

    // Validate input
    if (
      !invoiceMonth ||
      !dueDate ||
      roomFee === undefined ||
      electricFee === undefined ||
      waterFee === undefined ||
      serviceFee === undefined
    ) {
      return res.status(400).json({
        success: false,
        message: "Thiếu thông tin cần thiết cho hóa đơn",
      });
    }

    // Get current invoice details for comparison and logging
    const [currentInvoice] = await pool.query<RowDataPacket[]>(
      `SELECT i.*, r.roomNumber, r.id as roomId, b.name as buildingName
       FROM invoices i
       JOIN rooms r ON i.roomId = r.id
       JOIN buildings b ON r.buildingId = b.id
       WHERE i.id = ?`,
      [invoiceId]
    );

    if (currentInvoice.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy hóa đơn",
      });
    }

    const invoice = currentInvoice[0];

    // Calculate total amount
    const totalAmount =
      Number(roomFee) +
      Number(electricFee) +
      Number(waterFee) +
      Number(serviceFee);

    // Check if values exceed database column limits
    if (waterFee > 99999999.99) {
      return res.status(400).json({
        success: false,
        message: "Tiền nước vượt quá giới hạn cho phép",
      });
    }

    if (totalAmount > 99999999.99) {
      return res.status(400).json({
        success: false,
        message: "Tổng tiền hóa đơn vượt quá giới hạn cho phép",
      });
    }

    // Update invoice
    const [result] = await pool.query<OkPacket>(
      `UPDATE invoices 
       SET invoiceMonth = ?, dueDate = ?, roomFee = ?, 
           electricFee = ?, waterFee = ?, serviceFee = ?, 
           totalAmount = ?
       WHERE id = ?`,
      [
        invoiceMonth,
        dueDate,
        roomFee,
        electricFee,
        waterFee,
        serviceFee,
        totalAmount,
        invoiceId,
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy hóa đơn",
      });
    }

    // Log activity
    if (req.user?.id) {
      // Format month for display
      const invoiceMonthFormatted = new Date(invoiceMonth).toLocaleDateString(
        "vi-VN",
        { month: "2-digit", year: "numeric" }
      );
      const oldInvoiceMonthFormatted = invoice.invoiceMonth
        ? new Date(invoice.invoiceMonth).toLocaleDateString("vi-VN", {
            month: "2-digit",
            year: "numeric",
          })
        : "-";

      // Create a detailed description of changes
      let description = `Cập nhật hóa đơn cho phòng ${invoice.roomNumber} tòa nhà ${invoice.buildingName}: `;
      const changes = [];

      if (invoiceMonthFormatted !== oldInvoiceMonthFormatted) {
        changes.push(
          `Tháng: ${oldInvoiceMonthFormatted} → ${invoiceMonthFormatted}`
        );
      }

      if (Number(electricFee) !== Number(invoice.electricFee)) {
        changes.push(
          `Phí điện: ${Number(invoice.electricFee).toLocaleString(
            "vi-VN"
          )} → ${Number(electricFee).toLocaleString("vi-VN")} VNĐ`
        );
      }

      if (Number(waterFee) !== Number(invoice.waterFee)) {
        changes.push(
          `Phí nước: ${Number(invoice.waterFee).toLocaleString(
            "vi-VN"
          )} → ${Number(waterFee).toLocaleString("vi-VN")} VNĐ`
        );
      }

      if (Number(serviceFee) !== Number(invoice.serviceFee)) {
        changes.push(
          `Phí dịch vụ: ${Number(invoice.serviceFee).toLocaleString(
            "vi-VN"
          )} → ${Number(serviceFee).toLocaleString("vi-VN")} VNĐ`
        );
      }

      if (Number(totalAmount) !== Number(invoice.totalAmount)) {
        changes.push(
          `Tổng cộng: ${Number(invoice.totalAmount).toLocaleString(
            "vi-VN"
          )} → ${Number(totalAmount).toLocaleString("vi-VN")} VNĐ`
        );
      }

      description += changes.join(", ");

      // Log to invoice entity
      await activityLogService.logActivity(
        req.user.id,
        "update",
        "invoice",
        Number(invoiceId),
        description,
        req,
        Number(invoice.roomId),
        Number(invoiceId)
      );

      // Log to room entity for room timeline
      await activityLogService.logActivity(
        req.user.id,
        "update",
        "room",
        invoice.roomId,
        description,
        req,
        Number(invoice.roomId),
        Number(invoiceId)
      );
    }

    // Get updated invoice data
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM invoices WHERE id = ?`,
      [invoiceId]
    );

    return res.status(200).json({
      success: true,
      message: "Cập nhật hóa đơn thành công",
      data: rows[0],
    });
  } catch (error) {
    console.error("Error updating invoice:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi khi cập nhật hóa đơn",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const deleteInvoice = async (req: Request, res: Response) => {
  try {
    const { invoiceId } = req.params;

    // Get invoice details before deletion for logging
    const [invoiceDetails] = await pool.query<RowDataPacket[]>(
      `SELECT i.invoiceNumber, r.roomNumber, b.name as buildingName, r.id as roomId
       FROM invoices i
       JOIN rooms r ON i.roomId = r.id
       JOIN buildings b ON r.buildingId = b.id
       WHERE i.id = ?`,
      [invoiceId]
    );

    if (invoiceDetails.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy hóa đơn",
      });
    }

    const invoice = invoiceDetails[0];

    // Delete invoice
    const [result] = await pool.query<OkPacket>(
      `DELETE FROM invoices WHERE id = ?`,
      [invoiceId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy hóa đơn",
      });
    }

    // Log activity
    if (req.user?.id) {
      const activityDescription = `Xóa hóa đơn: ${invoice.invoiceNumber} của phòng ${invoice.roomNumber} tòa nhà ${invoice.buildingName}`;

      // Log to invoice entity
      await activityLogService.logActivity(
        req.user.id,
        "delete",
        "invoice",
        Number(invoiceId),
        activityDescription,
        req,
        Number(invoice.roomId),
        Number(invoiceId)
      );

      // Log to room entity for room timeline
      await activityLogService.logActivity(
        req.user.id,
        "delete",
        "room",
        invoice.roomId,
        activityDescription,
        req,
        Number(invoice.roomId),
        Number(invoiceId)
      );
    }

    return res.status(200).json({
      success: true,
      message: "Xóa hóa đơn thành công",
    });
  } catch (error) {
    console.error("Error deleting invoice:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi khi xóa hóa đơn",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// Public lookup API for students to find their invoices
export const searchInvoices = async (req: Request, res: Response) => {
  try {
    const { studentCode, roomNumber, month } = req.query;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = (page - 1) * limit;

    // Check if at least one parameter is provided
    if (!studentCode && !roomNumber && !month) {
      return res.status(400).json({
        success: false,
        message:
          "Vui lòng cung cấp ít nhất một điều kiện tìm kiếm (mã sinh viên, số phòng hoặc tháng)",
      });
    }

    // Build simple query - always use LEFT JOIN to avoid dependency on student records
    // and to handle cases where invoices don't have associated students
    let conditions = [];
    const queryParams: any[] = [];

    if (roomNumber) {
      conditions.push("r.roomNumber LIKE ?");
      queryParams.push(`%${roomNumber}%`);
    }

    if (month) {
      // Parse month format MM/YYYY or YYYY-MM
      let parsedMonth;
      if (typeof month === "string") {
        if (month.includes("/")) {
          const [m, y] = month.split("/");
          parsedMonth = `${y}-${m}`;
        } else {
          parsedMonth = month;
        }
        conditions.push('DATE_FORMAT(i.invoiceMonth, "%Y-%m") = ?');
        queryParams.push(parsedMonth);
      }
    }

    if (studentCode) {
      conditions.push("(s.studentCode LIKE ? OR s.studentCode IS NULL)");
      queryParams.push(`%${studentCode}%`);
    }

    // Build the WHERE clause
    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // Count total invoices
    const [countRows] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) as total 
       FROM invoices i
       JOIN rooms r ON i.roomId = r.id
       JOIN buildings b ON r.buildingId = b.id
       LEFT JOIN students s ON s.id = i.studentId
       ${whereClause}`,
      queryParams
    );

    const total = countRows[0].total;

    if (total === 0) {
      return res.status(200).json({
        success: true,
        message: "Không tìm thấy hóa đơn phù hợp với điều kiện tìm kiếm",
        data: {
          invoices: [],
          pagination: {
            total: 0,
            page,
            limit,
            totalPages: 0,
          },
        },
      });
    }

    // Get invoices with pagination
    const [invoiceRows] = await pool.query<RowDataPacket[]>(
      `SELECT 
         i.id, i.invoiceNumber, i.invoiceMonth, i.dueDate,
         i.roomFee, i.electricFee, i.waterFee, i.serviceFee,
         i.totalAmount, i.paymentStatus, i.paymentDate, i.paymentMethod,
         r.id as roomId, r.roomNumber, r.floorNumber,
         b.id as buildingId, b.name as buildingName,
         s.fullName, s.studentCode
       FROM invoices i
       JOIN rooms r ON i.roomId = r.id
       JOIN buildings b ON r.buildingId = b.id
       LEFT JOIN students s ON s.id = i.studentId
       ${whereClause}
       ORDER BY i.invoiceMonth DESC
       LIMIT ? OFFSET ?`,
      [...queryParams, limit, offset]
    );

    // Process each invoice to get room students if needed
    const processedInvoices = await Promise.all(
      invoiceRows.map(async (invoice) => {
        // If we already have a student associated with the invoice, just return the regular data
        if (invoice.fullName && invoice.studentCode) {
          return {
            id: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            roomId: invoice.roomId,
            roomNumber: invoice.roomNumber,
            floorNumber: invoice.floorNumber,
            buildingId: invoice.buildingId,
            buildingName: invoice.buildingName,
            fullName: invoice.fullName,
            studentCode: invoice.studentCode,
            invoiceMonth: invoice.invoiceMonth,
            electricity: Math.round(invoice.electricFee / 2000), // kWh
            water: Math.round(invoice.waterFee / 10000), // m3
            electricFee: invoice.electricFee,
            waterFee: invoice.waterFee,
            serviceFee: invoice.serviceFee,
            roomFee: invoice.roomFee,
            totalAmount: invoice.totalAmount,
            dueDate: invoice.dueDate,
            paymentStatus: invoice.paymentStatus,
            paymentDate: invoice.paymentDate,
            paymentMethod: invoice.paymentMethod,
          };
        }

        // Get students in this room via active contracts
        const [roomStudents] = await pool.query<RowDataPacket[]>(
          `SELECT 
           s.fullName, s.studentCode, s.id as studentId
         FROM contracts c
         JOIN students s ON c.studentId = s.id
         WHERE c.roomId = ? 
         AND c.status = 'active'
         AND (? BETWEEN c.startDate AND c.endDate OR c.startDate <= LAST_DAY(?))`,
          [invoice.roomId, invoice.invoiceMonth, invoice.invoiceMonth]
        );

        // If we found students in the room
        if (roomStudents.length > 0) {
          const studentInfo = roomStudents
            .map((s) => `${s.fullName} (${s.studentCode})`)
            .join(", ");

          return {
            id: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            roomId: invoice.roomId,
            roomNumber: invoice.roomNumber,
            floorNumber: invoice.floorNumber,
            buildingId: invoice.buildingId,
            buildingName: invoice.buildingName,
            fullName: studentInfo,
            studentCode: null, // We're using fullName to store all student details
            roomStudents: roomStudents,
            invoiceMonth: invoice.invoiceMonth,
            electricity: Math.round(invoice.electricFee / 2000), // kWh
            water: Math.round(invoice.waterFee / 10000), // m3
            electricFee: invoice.electricFee,
            waterFee: invoice.waterFee,
            serviceFee: invoice.serviceFee,
            roomFee: invoice.roomFee,
            totalAmount: invoice.totalAmount,
            dueDate: invoice.dueDate,
            paymentStatus: invoice.paymentStatus,
            paymentDate: invoice.paymentDate,
            paymentMethod: invoice.paymentMethod,
          };
        }

        // If no students found, return original data
        return {
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          roomId: invoice.roomId,
          roomNumber: invoice.roomNumber,
          floorNumber: invoice.floorNumber,
          buildingId: invoice.buildingId,
          buildingName: invoice.buildingName,
          fullName: null,
          studentCode: null,
          invoiceMonth: invoice.invoiceMonth,
          electricity: Math.round(invoice.electricFee / 2000), // kWh
          water: Math.round(invoice.waterFee / 10000), // m3
          electricFee: invoice.electricFee,
          waterFee: invoice.waterFee,
          serviceFee: invoice.serviceFee,
          roomFee: invoice.roomFee,
          totalAmount: invoice.totalAmount,
          dueDate: invoice.dueDate,
          paymentStatus: invoice.paymentStatus,
          paymentDate: invoice.paymentDate,
          paymentMethod: invoice.paymentMethod,
        };
      })
    );

    return res.status(200).json({
      success: true,
      data: {
        invoices: processedInvoices,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    console.error("Error searching invoices:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi khi tìm kiếm hóa đơn",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// Get all student codes for select component
export const getStudentCodes = async (req: Request, res: Response) => {
  try {
    const searchTerm = (req.query.search as string) || "";
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id, studentCode, fullName 
       FROM students 
       WHERE studentCode LIKE ? OR fullName LIKE ?
       ORDER BY studentCode 
       LIMIT 50`,
      [`%${searchTerm}%`, `%${searchTerm}%`]
    );

    return res.json({
      success: true,
      data: rows.map((row) => ({
        value: row.studentCode,
        label: `${row.studentCode} - ${row.fullName}`,
        id: row.id,
      })),
    });
  } catch (error) {
    console.error("Error fetching student codes:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi khi truy vấn danh sách mã sinh viên",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// Get all room numbers for select component
export const getRoomNumbers = async (req: Request, res: Response) => {
  try {
    const searchTerm = (req.query.search as string) || "";
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT r.id, r.roomNumber, b.name as buildingName 
       FROM rooms r
       JOIN buildings b ON r.buildingId = b.id
       WHERE r.roomNumber LIKE ? OR b.name LIKE ?
       ORDER BY b.name, r.roomNumber 
       LIMIT 50`,
      [`%${searchTerm}%`, `%${searchTerm}%`]
    );

    return res.json({
      success: true,
      data: rows.map((row) => ({
        value: row.roomNumber,
        label: `${row.roomNumber} - Tòa ${row.buildingName}`,
        id: row.id,
      })),
    });
  } catch (error) {
    console.error("Error fetching room numbers:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi khi truy vấn danh sách phòng",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// Student payment API
export const submitInvoicePayment = async (req: Request, res: Response) => {
  try {
    const { invoiceId } = req.params;
    const { paymentMethod } = req.body;
    console.log("studentss", req.user?.id);
    // Validate
    if (!paymentMethod) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng chọn phương thức thanh toán",
      });
    }

    // Get current invoice details
    const [currentInvoice] = await pool.query<RowDataPacket[]>(
      `SELECT i.*, r.roomNumber, b.name as buildingName, s.fullName, s.studentCode
       FROM invoices i
       JOIN rooms r ON i.roomId = r.id
       JOIN buildings b ON r.buildingId = b.id
       LEFT JOIN students s ON i.studentId = s.id
       WHERE i.id = ?`,
      [invoiceId]
    );

    if (currentInvoice.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy hóa đơn",
      });
    }
    const [student] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM students WHERE userId = ?`,
      [req.user?.id]
    );
    console.log("studenssst", student);
    const invoice = currentInvoice[0];

    // Only allow payment for pending or overdue invoices
    if (
      invoice.paymentStatus !== "pending" &&
      invoice.paymentStatus !== "overdue"
    ) {
      return res.status(400).json({
        success: false,
        message: `Không thể thanh toán hóa đơn với trạng thái ${invoice.paymentStatus}`,
      });
    }

    // Update invoice status to waiting_for_approval
    const [result] = await pool.query<OkPacket>(
      `UPDATE invoices 
       SET paymentStatus = 'waiting_for_approval', paymentMethod = ?
       WHERE id = ?`,
      [paymentMethod, invoiceId]
    );

    if (result.affectedRows === 0) {
      return res.status(500).json({
        success: false,
        message: "Không thể cập nhật trạng thái hóa đơn",
      });
    }

    // Log activity
    if (req.user?.id) {
      const activityDescription = `Sinh viên ${student[0]?.fullName || ""} (${
        student[0]?.studentCode || ""
      }) đã gửi yêu cầu thanh toán hóa đơn ${invoice.invoiceNumber} (Phòng: ${
        invoice.roomNumber
      }, Tòa nhà: ${invoice.buildingName})`;

      await activityLogService.logActivity(
        req.user.id,
        "payment_submitted",
        "invoice",
        Number(invoiceId),
        activityDescription,
        req,
        Number(invoice.roomId),
        Number(invoiceId)
      );
    }

    return res.status(200).json({
      success: true,
      message: "Gửi yêu cầu thanh toán thành công",
      data: {
        id: invoiceId,
        status: "waiting_for_approval",
        paymentMethod,
      },
    });
  } catch (error) {
    console.error("Error submitting invoice payment:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi khi gửi yêu cầu thanh toán",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
