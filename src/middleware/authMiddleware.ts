// import { Request, Response, NextFunction } from 'express';
// import jwt from 'jsonwebtoken';
// import logger from '../utils/logger';

// // Mở rộng interface Request của Express để thêm thuộc tính user
// declare global {
//   namespace Express {
//     interface Request {
//       user?: any;
//     }
//   }
// }

// export const authMiddleware = (req: Request, res: Response, next: NextFunction): void => {
//   try {
//     const token = req.headers.authorization?.split(' ')[1];
    
//     if (!token) {
//       res.status(401).json({ message: 'Không tìm thấy token xác thực' });
//       return;
//     }

//     const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default_secret');
//     req.user = decoded;
//     next();
//   } catch (error) {
//     logger.error('Lỗi xác thực token:', error);
//     res.status(401).json({ message: 'Token không hợp lệ hoặc đã hết hạn' });
//   }
// };