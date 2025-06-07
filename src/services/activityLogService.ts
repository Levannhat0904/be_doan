import { Request } from "express";
import db from "../config/database";

/**
 * Activity logger service to track user actions
 */
class ActivityLogService {
  /**
   * Log an activity
   * @param userId - The ID of the user performing the action
   * @param action - The action performed (add, update, delete, etc.)
   * @param entityType - The type of entity affected (student, contract, room, etc.)
   * @param entityId - The ID of the affected entity
   * @param description - Description of the activity
   * @param req - Express request object (optional)
   */
  async logActivity(
    userId: number,
    action: string,
    entityType: string,
    entityId: number | null,
    description: string,
    req?: Request,
    roomId?: number,
    invoiceId?: number,
    contractId?: number,
    studentId?: number
  ): Promise<void> {
    try {
      const ipAddress = req?.ip || null;
      const userAgent = req?.headers["user-agent"] || null;

      await db.query(
        `INSERT INTO activity_logs 
        (userId, action, entityType, entityId, description, ipAddress, userAgent, roomId, invoiceId, contractId) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userId,
          action,
          entityType,
          entityId,
          description,
          ipAddress,
          userAgent,
          roomId,
          invoiceId,
          contractId,
          studentId,
        ]
      );
    } catch (error) {
      console.error("Error logging activity:", error);
      // We don't throw here to prevent affecting the main operation
    }
  }

  /**
   * Get activity logs with pagination
   */
  async getActivityLogs(
    page = 1,
    limit = 20,
    entityId?: number,
    entityType?: string,
    action?: string,
    roomId?: number,
    invoiceId?: number,
    contractId?: number,
    studentId?: number
  ) {
    try {
      let query = `
        SELECT al.*, u.email, 
          CASE 
            WHEN u.userType = 'admin' THEN a.fullName
            WHEN u.userType = 'student' THEN s.fullName
            ELSE NULL
          END as userName
        FROM activity_logs al
        LEFT JOIN users u ON al.userId = u.id
        LEFT JOIN admins a ON u.id = a.userId
        LEFT JOIN students s ON u.id = s.userId
        WHERE 1=1
      `;

      const params: any[] = [];

      if (entityId) {
        query += ` AND al.entityId = ?`;
        params.push(entityId);
      }

      if (entityType) {
        query += ` AND al.entityType = ?`;
        params.push(entityType);
      }

      if (action) {
        query += ` AND al.action = ?`;
        params.push(action);
      }

      if (roomId) {
        query += ` AND al.roomId = ?`;
        params.push(roomId);
      }

      if (invoiceId) {
        query += ` AND al.invoiceId = ?`;
        params.push(invoiceId);
      }

      if (contractId) {
        query += ` AND al.contractId = ?`;
        params.push(contractId);
      }

      if (studentId) {
        query += ` AND al.studentId = ?`;
        params.push(studentId);
      }

      // Add ordering and pagination
      query += ` ORDER BY al.createdAt DESC LIMIT ? OFFSET ?`;
      params.push(limit, (page - 1) * limit);

      const [logs] = await db.query(query, params);

      // Get total count for pagination
      let countQuery = `SELECT COUNT(*) as total FROM activity_logs WHERE 1=1`;
      const countParams: any[] = [];

      if (entityId) {
        countQuery += ` AND entityId = ?`;
        countParams.push(entityId);
      }

      if (entityType) {
        countQuery += ` AND entityType = ?`;
        countParams.push(entityType);
      }

      if (action) {
        countQuery += ` AND action = ?`;
        countParams.push(action);
      }

      if (studentId) {
        countQuery += ` AND studentId = ?`;
        countParams.push(studentId);
      }

      if (roomId) {
        countQuery += ` AND roomId = ?`;
        countParams.push(roomId);
      }

      if (invoiceId) {
        countQuery += ` AND invoiceId = ?`;
        countParams.push(invoiceId);
      }

      if (contractId) {
        countQuery += ` AND contractId = ?`;
        countParams.push(contractId);
      }

      const [countResult] = await db.query(countQuery, countParams);
      const total = (countResult as any)[0].total;

      return {
        logs,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      console.error("Error getting activity logs:", error);
      throw error;
    }
  }
}

export default new ActivityLogService();
