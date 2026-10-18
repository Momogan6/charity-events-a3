'use strict';

/**
 * utils/asyncHandler.js
 * ---------------------------------------------------------------------
 * Express 4 does not catch errors thrown inside an `async` route
 * handler - an unhandled rejection would simply hang the request.
 * Wrapping every async handler with this helper forwards the rejection
 * to the central error middleware instead, so we never have to write
 * try/catch in each route.
 *
 * @param {Function} fn async (req, res, next) => any
 * @returns {import('express').RequestHandler}
 */
module.exports = function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
