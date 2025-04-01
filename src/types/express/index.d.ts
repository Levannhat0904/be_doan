import { Request } from 'express';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: number;
        userType: string;
      };
    }
  }
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LogoutRequest extends Request {
  user?: {
    id: number;
  };
}

export interface LogoutResponse extends Response {
  json: (body: any) => LogoutResponse;
  status: (code: number) => LogoutResponse;
} 