export interface JwtPayload {
  sub: string;
  tenantId: string;
  email: string;
}

export interface AuthenticatedUser {
  id: string;
  tenantId: string;
  email: string;
  fullName: string | null;
  roles: string[];
}

export interface ApiMeta {
  requestId?: string;
  timestamp?: string;
  page?: number;
  pageSize?: number;
  total?: number;
  totalPages?: number;
}

export interface ApiResponse<T> {
  data: T;
  meta?: ApiMeta;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: Array<{ field?: string; message: string }>;
  };
  meta?: ApiMeta;
}
