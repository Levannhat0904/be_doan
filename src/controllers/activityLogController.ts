import { Request, Response } from "express";
import activityLogService from "../services/activityLogService";

class ActivityLogController {
  /**
   * Get paginated activity logs
   */
  // @ts-ignore
  async getActivityLogs(req: Request, res: Response): Promise<void> {
    try {
      const {
        page = 1,
        limit = 20,
        entityId,
        entityType,
        action,
        roomId,
        invoiceId,
        contractId,
      } = req.query;

      const logs = await activityLogService.getActivityLogs(
        Number(page),
        Number(limit),
        entityId ? Number(entityId) : undefined,
        entityType as string,
        action as string,
        roomId ? Number(roomId) : undefined,
        invoiceId ? Number(invoiceId) : undefined,
        contractId ? Number(contractId) : undefined
      );

      res.json({
        success: true,
        data: logs,
      });
    } catch (error) {
      console.error("Error retrieving activity logs:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: (error as Error).message,
      });
    }
  }
}

export default new ActivityLogController();
