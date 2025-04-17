import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';

// Custom error interface
export interface ApiError extends Error {
  statusCode?: number;
  details?: any;
}

/**
 * Global error handling middleware
 */
export const errorHandler = (
  err: ApiError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Log the error
  logger.error(`${err.message || 'Unknown error'} ${err.stack || ''}`);

  // Send appropriate response
  const statusCode = err.statusCode || 500;

  res.status(statusCode).json({
    success: false,
    message: statusCode === 500 ? 'Internal Server Error' : err.message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
    ...(err.details && { details: err.details })
  });
}; 