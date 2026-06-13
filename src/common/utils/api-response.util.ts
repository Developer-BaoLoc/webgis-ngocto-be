import { ApiMeta, ApiResponse } from '../types/api.types';

export function apiResponse<T>(data: T, meta?: ApiMeta): ApiResponse<T> {
  return {
    data,
    meta: {
      timestamp: new Date().toISOString(),
      ...meta,
    },
  };
}
