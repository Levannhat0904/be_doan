import { Request, Response } from 'express';
import activityLogService from '../services/activityLogService';

class ActivityLogController {
  /**
   * Get paginated activity logs
   */
  async getActivityLogs(req: Request, res: Response): Promise<void> {
    try {
      const { page = 1, limit = 20, userId, entityType, action } = req.query;

      const logs = await activityLogService.getActivityLogs(
        Number(page),
        Number(limit),
        userId ? Number(userId) : undefined,
        entityType as string,
        action as string
      );

      res.json({
        success: true,
        data: logs
      });
    } catch (error) {
      console.error('Error retrieving activity logs:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: (error as Error).message
      });
    }
  }
}

export default new ActivityLogController(); 