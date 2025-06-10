import { pool } from '../models/db';
import logger from '../utils/logger';

/**
 * Service xử lý cập nhật trạng thái hợp đồng định kỳ
 * Kiểm tra và cập nhật các hợp đồng hết hạn (từ 'active' sang 'expired')
 */
export const updateContractStatus = async (): Promise<any[]> => {
  try {
    // Trước tiên, lấy danh sách các hợp đồng sẽ bị cập nhật để có thông tin gửi email
    const getContractsToUpdateQuery = `
      SELECT c.id as contractId, c.contractNumber, s.id as studentId, s.fullName, s.email,
             r.id as roomId, r.roomNumber, b.name as buildingName
      FROM contracts c
      JOIN students s ON c.studentId = s.id
      JOIN rooms r ON c.roomId = r.id
      JOIN buildings b ON r.buildingId = b.id
      WHERE c.status = 'active' AND c.endDate < CURDATE()
    `;
    
    const [contractsToUpdate]: any = await pool.query(getContractsToUpdateQuery);
    
    // Thực hiện cập nhật
    const query = `
      UPDATE contracts 
      SET status = 'expired' 
      WHERE status = 'active' AND endDate < CURDATE()
    `;
    
    const [result]: any = await pool.query(query);
    logger.info(`Đã cập nhật ${result.affectedRows} hợp đồng sang trạng thái hết hạn`);
    
    // Cập nhật số lượng sinh viên hiện tại trong các phòng
    if (contractsToUpdate.length > 0) {
      const roomIds = contractsToUpdate.map((contract: any) => contract.roomId);
      await updateRoomOccupancy(roomIds);
    }
    
    // Trả về danh sách các hợp đồng vừa được cập nhật để gửi mail
    return contractsToUpdate;
  } catch (error) {
    logger.error('Lỗi khi cập nhật trạng thái hợp đồng:', error);
    throw error;
  }
};

/**
 * Service xử lý cập nhật trạng thái hóa đơn định kỳ
 * Kiểm tra và cập nhật các hóa đơn quá hạn (từ 'pending' sang 'overdue')
 */
export const updateInvoiceStatus = async (): Promise<any[]> => {
  try {
    // Trước tiên, lấy danh sách các hóa đơn sẽ bị cập nhật để có thông tin gửi email
    const getInvoicesToUpdateQuery = `
      SELECT i.id as invoiceId, i.invoiceNumber, i.dueDate, i.totalAmount,
             r.id as roomId, r.roomNumber, b.name as buildingName
      FROM invoices i
      JOIN rooms r ON i.roomId = r.id
      JOIN buildings b ON r.buildingId = b.id
      WHERE i.paymentStatus = 'pending' AND i.dueDate < CURDATE()
    `;
    
    const [invoicesToUpdate]: any = await pool.query(getInvoicesToUpdateQuery);
    
    // Thực hiện cập nhật
    const query = `
      UPDATE invoices 
      SET paymentStatus = 'overdue' 
      WHERE paymentStatus = 'pending' AND dueDate < CURDATE()
    `;
    
    const [result]: any = await pool.query(query);
    logger.info(`Đã cập nhật ${result.affectedRows} hóa đơn sang trạng thái quá hạn`);
    
    // Trả về danh sách các hóa đơn vừa được cập nhật để gửi mail
    return invoicesToUpdate;
  } catch (error) {
    logger.error('Lỗi khi cập nhật trạng thái hóa đơn:', error);
    throw error;
  }
};

/**
 * Service tạo nhật ký hoạt động cho các cập nhật tự động
 */
export const logAutomatedActivity = async (
  action: string,
  entityType: string,
  description: string,
  roomId?: number,
  invoiceId?: number,
  contractId?: number,
  studentId?: number
): Promise<void> => {
  try {
    const query = `
      INSERT INTO activity_logs (action, entityType, description, roomId, invoiceId, contractId, entityId) 
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    
    // Sử dụng entityId để lưu studentId nếu có
    const entityId = studentId || null;
    
    await pool.query(query, [action, entityType, description, roomId || null, invoiceId || null, contractId || null, entityId]);
  } catch (error) {
    logger.error('Lỗi khi ghi nhật ký hoạt động:', error);
  }
};

/**
 * Service cập nhật số lượng sinh viên hiện tại trong phòng
 * Tính toán dựa trên số lượng hợp đồng active của phòng đó
 */
export const updateRoomOccupancy = async (roomIds: number[]): Promise<void> => {
  try {
    if (!roomIds.length) return;
    
    // Cập nhật từng phòng một
    for (const roomId of roomIds) {
      // Đếm số hợp đồng active của phòng
      const countQuery = `
        SELECT COUNT(*) as activeContracts
        FROM contracts
        WHERE roomId = ? AND status = 'active'
      `;
      
      const [countResult]: any = await pool.query(countQuery, [roomId]);
      const currentOccupancy = countResult[0].activeContracts;
      
      // Cập nhật số lượng sinh viên hiện tại trong phòng
      const updateQuery = `
        UPDATE rooms
        SET currentOccupancy = ?
        WHERE id = ?
      `;
      
      await pool.query(updateQuery, [currentOccupancy, roomId]);
      
      // Cập nhật trạng thái phòng nếu cần
      await updateRoomStatus(roomId);
      
      logger.info(`Đã cập nhật số lượng sinh viên hiện tại trong phòng ID ${roomId}: ${currentOccupancy}`);
    }
  } catch (error) {
    logger.error('Lỗi khi cập nhật số lượng sinh viên trong phòng:', error);
    throw error;
  }
};

/**
 * Service cập nhật trạng thái phòng dựa trên số lượng sinh viên hiện tại
 */
export const updateRoomStatus = async (roomId: number): Promise<void> => {
  try {
    // Lấy thông tin phòng
    const getRoomQuery = `
      SELECT currentOccupancy, capacity, status
      FROM rooms
      WHERE id = ?
    `;
    
    const [roomResult]: any = await pool.query(getRoomQuery, [roomId]);
    
    if (!roomResult.length) return;
    
    const room = roomResult[0];
    let newStatus = room.status;
    
    // Xác định trạng thái mới
    if (room.status !== 'maintenance') {
      if (room.currentOccupancy >= room.capacity) {
        newStatus = 'full';
      } else if (room.currentOccupancy < room.capacity) {
        newStatus = 'available';
      }
    }
    
    // Cập nhật trạng thái nếu có thay đổi
    if (newStatus !== room.status) {
      const updateStatusQuery = `
        UPDATE rooms
        SET status = ?
        WHERE id = ?
      `;
      
      await pool.query(updateStatusQuery, [newStatus, roomId]);
      logger.info(`Đã cập nhật trạng thái phòng ID ${roomId} từ '${room.status}' sang '${newStatus}'`);
    }
  } catch (error) {
    logger.error('Lỗi khi cập nhật trạng thái phòng:', error);
    throw error;
  }
};