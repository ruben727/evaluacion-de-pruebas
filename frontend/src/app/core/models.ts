export interface User {
  id: number;
  name: string;
  email: string;
  createdAt: string;
  updatedAt: string;
}

export interface LoginResponse {
  token: string;
  user: User;
}

export interface UserPayload {
  name: string;
  email: string;
  password?: string;
}

export interface ApiErrorBody {
  error?: {
    status: number;
    message: string;
    details?: Record<string, string>;
  };
}
