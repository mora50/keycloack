export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_expires_in?: number;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface RefreshRequest {
  refresh_token: string;
}

export interface ErrorResponse {
  error: string;
  error_description?: string;
  message?: string;
}

export interface ProductsResponse {
  user_id: string;
  email?: string;
  preferred_username?: string;
  products: Array<{ id: string; name: string }>;
}

export interface PaymentResponse {
  user_id: string;
  payment_id: string;
  status: string;
}

export interface DecodedJwt {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  signaturePreview: string;
  expiresAt?: Date;
  issuedAt?: Date;
  subject?: string;
  preferredUsername?: string;
  email?: string;
}

export interface RequestRecord {
  id: string;
  method: string;
  url: string;
  status?: number;
  statusText?: string;
  durationMs: number;
  requestHeaders: Record<string, string>;
  responseHeaders: Record<string, string>;
  requestBody?: unknown;
  responseBody?: unknown;
  error?: string;
  startedAt: number;
  expectedFailure?: boolean;
}
