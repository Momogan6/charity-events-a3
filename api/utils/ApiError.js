'use strict';

/**
 * utils/ApiError.js
 * ---------------------------------------------------------------------
 * A tiny error type that carries an HTTP status code and an optional
 * machine-readable error code. Route handlers simply `throw` one of
 * these and the central error middleware turns it into a JSON response
 * with the correct status code. This keeps the REST contract consistent
 * across every endpoint.
 */
class ApiError extends Error {
  /**
   * @param {number} status  HTTP status code (400, 404, 409, ...)
   * @param {string} message Human readable message returned to the client
   * @param {object} [details] Extra information, e.g. field level errors
   * @param {string} [code]    Short machine readable code, e.g. EVENT_HAS_REGISTRATIONS
   */
  constructor(status, message, details = null, code = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
    this.code = code;
    Error.captureStackTrace?.(this, ApiError);
  }

  static badRequest(message, details = null, code = 'VALIDATION_ERROR') {
    return new ApiError(400, message, details, code);
  }

  static notFound(message, code = 'NOT_FOUND') {
    return new ApiError(404, message, null, code);
  }

  static conflict(message, details = null, code = 'CONFLICT') {
    return new ApiError(409, message, details, code);
  }
}

module.exports = ApiError;
