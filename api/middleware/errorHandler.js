'use strict';

/**
 * middleware/errorHandler.js
 * ---------------------------------------------------------------------
 * The single place where every error becomes an HTTP response.
 *
 * Two categories are handled:
 *  1. ApiError  - thrown deliberately by our own route handlers.
 *  2. Driver errors - mysql2 surfaces constraint violations that we
 *     translate into meaningful REST status codes instead of leaking a
 *     raw "ER_DUP_ENTRY" to the client.
 *
 * Response shape (always the same, which makes the front-end simpler):
 *   { "success": false, "error": { "code": "...", "message": "...", "details": {...} } }
 */

const ApiError = require('../utils/ApiError');

/** Maps a low-level MySQL error onto an ApiError. */
function translateMySqlError(err) {
  switch (err.code) {
    // UNIQUE (event_id, email) already exists -> this user has already booked this event
    case 'ER_DUP_ENTRY':
      return new ApiError(
        409,
        'This email address has already registered for the selected event.',
        null,
        'DUPLICATE_REGISTRATION'
      );

    // FOREIGN KEY ... ON DELETE RESTRICT -> the event still has registrations
    case 'ER_ROW_IS_REFERENCED_2':
      return new ApiError(
        409,
        'This event cannot be deleted because it already has registrations.',
        null,
        'EVENT_HAS_REGISTRATIONS'
      );

    // FK parent row missing
    case 'ER_NO_REFERENCED_ROW_2':
      return new ApiError(400, 'The referenced record does not exist.', null, 'INVALID_REFERENCE');

    case 'ER_CHECK_CONSTRAINT_VIOLATED':
      return new ApiError(400, 'The submitted values violate a database constraint.', null, 'CHECK_CONSTRAINT');

    // Our BEFORE INSERT trigger raises SQLSTATE 45000 with a friendly message
    case 'ER_SIGNAL_EXCEPTION':
      return new ApiError(409, err.sqlMessage || 'The operation was rejected by a database business rule.', null, 'BUSINESS_RULE');

    case 'ER_DATA_TOO_LONG':
      return new ApiError(400, 'One of the submitted values is too long.', null, 'VALUE_TOO_LONG');

    default:
      return null;
  }
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let apiError = err;

  if (!(err instanceof ApiError)) {
    const translated = translateMySqlError(err);
    if (translated) {
      apiError = translated;
    } else if (err.type === 'entity.parse.failed') {
      apiError = ApiError.badRequest('The request body is not valid JSON.', null, 'INVALID_JSON');
    } else {
      // Genuinely unexpected: log the full stack for the developer, but
      // never expose internals to the client.
      console.error('[UNHANDLED ERROR]', err);
      apiError = new ApiError(500, 'An unexpected server error occurred.', null, 'INTERNAL_ERROR');
    }
  } else if (apiError.status >= 500) {
    console.error('[API ERROR]', err);
  }

  res.status(apiError.status || 500).json({
    success: false,
    error: {
      code: apiError.code || 'ERROR',
      message: apiError.message,
      ...(apiError.details ? { details: apiError.details } : {})
    }
  });
}

/** Catches any request that did not match a mounted route. */
function notFoundHandler(req, res, next) {
  next(ApiError.notFound(`No API endpoint matches ${req.method} ${req.originalUrl}.`, 'ENDPOINT_NOT_FOUND'));
}

module.exports = { errorHandler, notFoundHandler, translateMySqlError };
