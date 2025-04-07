import { RequestHandler } from 'express';
import { ADMIN_ROLES } from '../config/constants';

export const isAdmin: RequestHandler = (req, res, next) => {
  if (!req.user || (req.user.userType !== 'admin' && req.user.userType !== 'super_admin')) {
    res.status(403).json({
      success: false,
      message: 'Không có quyền truy cập - Bạn không phải là admin!'
    });
    return;
  }
  next();
}; 