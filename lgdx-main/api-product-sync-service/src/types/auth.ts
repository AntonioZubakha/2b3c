// Centralized JWT payload interface - USE THIS EVERYWHERE
export interface JwtPayload {
  userId: string;
  companyId: string;
  isAdmin: boolean;
  isLgdealSupervisor: boolean;
  email: string;
  firstName: string;
  lastName: string;
  companyName: string;
  role: string;
  iat?: number;
  exp?: number;
} 