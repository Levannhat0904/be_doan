
interface User {
  id: number;
  email: string;
  userType: string;
  profile?: any;
}
interface LoginRequest {
  email: string;
  password: string;
}
interface RefreshTokenRequest {
  refreshToken: string;
}
interface LogoutRequest {
  user: User;
}
interface LogoutResponse {
  status: string;
}
interface RefreshTokenResponse {
  success: boolean;
  accessToken: string;
}
