import { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';

interface JwtPayload {
  userId: number;
  userType: string;
}

export const authMiddleware: RequestHandler = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        message: 'Không tìm thấy token xác thực'
      });
      return;
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key') as JwtPayload;

    req.user = {
      id: decoded.userId,
      userType: decoded.userType
    };

    next();
  } catch (error) {
    res.status(401).json({
      success: false,
      message: 'Token không hợp lệ'
    });
  }
}; 