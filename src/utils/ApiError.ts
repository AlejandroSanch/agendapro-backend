export class ApiError extends Error {
  public statusCode: number;
  public code?: string;
  public details?: Record<string, unknown>;

  constructor(statusCode: number, message: string, code?: string, details?: Record<string, unknown>) {
    super(message);
    this.statusCode = statusCode;
    this.name = this.constructor.name;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}
