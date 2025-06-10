// import { Request, Response, NextFunction } from 'express';
// import { pool } from '../models/db';
// import logger from '../utils/logger';

// export const adminMiddleware = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
//   try {
//     const { user } = req.body;
    
//     if (!user || !user.id) {
//       res.status(401).json({ message: 'Không có thông tin người dùng' });
//       return;
//     }

//     // Kiểm tra xem người dùng có phải là admin hay không
//     const [users] = await pool.query(
//       'SELECT userType FROM users WHERE id = ?',
//       [user.id]
//     );
    
//     const userArray = users as any[];
//     if (userArray.length === 0 || userArray[0].userType !== 'admin') {
//       res.status(403).json({ message: 'Bạn không có quyền truy cập chức năng này' });
//       return;
//     }

//     next();
//   } catch (error) {
//     logger.error('Lỗi xác thực quyền admin:', error);
//     res.status(500).json({ message: 'Lỗi xác thực quyền admin' });
//   }
// }; 