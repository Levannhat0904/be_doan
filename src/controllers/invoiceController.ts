import { Request, Response } from 'express';
import pool from '../config/database';
import { RowDataPacket, OkPacket } from 'mysql2';

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
        message: 'ID phòng không hợp lệ'
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
        message: 'Không tìm thấy phòng'
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
    const invoices = invoiceRows.map(invoice => ({
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      month: new Date(invoice.invoiceMonth).toLocaleDateString('vi-VN', { month: '2-digit', year: 'numeric' }),
      electricity: Math.round(invoice.electricFee / 2000), // kWh
      water: Math.round(invoice.waterFee / 10000), // m3
      electricityCost: invoice.electricFee,
      waterCost: invoice.waterFee,
      otherFees: invoice.serviceFee,
      roomFee: invoice.roomFee,
      totalCost: invoice.totalAmount,
      dueDate: invoice.dueDate,
      status: invoice.paymentStatus,
      paidDate: invoice.paymentDate
    }));

    return res.status(200).json({
      success: true,
      data: {
        room: {
          id: room.id,
          roomNumber: room.roomNumber,
          buildingId: room.buildingId,
          buildingName: room.buildingName
        },
        invoices,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Error fetching invoices:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi khi truy vấn hóa đơn',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

export const createInvoice = async (req: Request, res: Response) => {
  try {
    const { roomId } = req.params;
    const {
      invoiceMonth,
      electricity,
      water,
      serviceFee,
      dueDate
    } = req.body;

    // Validate required fields
    if (!roomId || !invoiceMonth || !electricity || !water || !dueDate) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng cung cấp đầy đủ thông tin'
      });
    }

    // Get room information
    const [roomRows] = await pool.query<RowDataPacket[]>(
      `SELECT id, roomNumber, buildingId, pricePerMonth
       FROM rooms
       WHERE id = ?`,
      [roomId]
    );

    if (roomRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy phòng'
      });
    }

    const room = roomRows[0];

    // Calculate fees
    const electricFee = Number(electricity) * 2000; // 2000 VND per kWh
    const waterFee = Number(water) * 10000; // 10000 VND per m3
    const serviceFeeFinal = Number(serviceFee) || 100000; // Default to 100,000 VND if not provided
    const roomFee = room.pricePerMonth;
    const totalAmount = electricFee + waterFee + serviceFeeFinal + roomFee;

    // Format invoice month
    const invoiceDate = new Date(invoiceMonth);

    // Generate invoice number
    const invoiceNumber = `INV-${room.buildingId}${room.roomNumber}-${invoiceDate.getFullYear()}${(invoiceDate.getMonth() + 1).toString().padStart(2, '0')}`;

    // Check if invoice already exists for this month
    const [existingInvoice] = await pool.query<RowDataPacket[]>(
      `SELECT id FROM invoices 
       WHERE roomId = ? AND MONTH(invoiceMonth) = ? AND YEAR(invoiceMonth) = ?`,
      [roomId, invoiceDate.getMonth() + 1, invoiceDate.getFullYear()]
    );

    if (existingInvoice.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Hóa đơn cho tháng này đã tồn tại'
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
        'pending'
      ]
    );

    // Get the created invoice
    const [newInvoice] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM invoices WHERE id = ?`,
      [result.insertId]
    );

    return res.status(201).json({
      success: true,
      message: 'Tạo hóa đơn thành công',
      data: {
        id: result.insertId,
        invoiceNumber: invoiceNumber,
        month: new Date(invoiceDate).toLocaleDateString('vi-VN', { month: '2-digit', year: 'numeric' }),
        electricity: Number(electricity),
        water: Number(water),
        electricityCost: electricFee,
        waterCost: waterFee,
        otherFees: serviceFeeFinal,
        roomFee: roomFee,
        totalCost: totalAmount,
        dueDate: new Date(dueDate),
        status: 'pending'
      }
    });
  } catch (error) {
    console.error('Error creating invoice:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi khi tạo hóa đơn',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

export const updateInvoiceStatus = async (req: Request, res: Response) => {
  try {
    const { invoiceId } = req.params;
    const { status } = req.body;

    // Validate status
    if (!status || !['pending', 'paid', 'overdue'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Trạng thái không hợp lệ'
      });
    }

    // Update invoice status
    const paymentDate = status === 'paid' ? new Date() : null;
    const [result] = await pool.query<OkPacket>(
      `UPDATE invoices 
       SET paymentStatus = ?, paymentDate = ?
       WHERE id = ?`,
      [status, paymentDate, invoiceId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy hóa đơn'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Cập nhật trạng thái hóa đơn thành công',
      data: {
        id: invoiceId,
        status,
        paymentDate
      }
    });
  } catch (error) {
    console.error('Error updating invoice status:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi khi cập nhật trạng thái hóa đơn',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

export const deleteInvoice = async (req: Request, res: Response) => {
  try {
    const { invoiceId } = req.params;

    // Delete invoice
    const [result] = await pool.query<OkPacket>(
      `DELETE FROM invoices WHERE id = ?`,
      [invoiceId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy hóa đơn'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Xóa hóa đơn thành công'
    });
  } catch (error) {
    console.error('Error deleting invoice:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi khi xóa hóa đơn',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};
