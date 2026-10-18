'use strict';

/**
 * routes/categories.routes.js
 * ---------------------------------------------------------------------
 * Read-only resource. Categories are a lookup table used to populate the
 * drop-down lists on the search page and the admin "new event" form, so
 * exposing them keeps the front-end from hard-coding any category list.
 *
 *   GET /api/categories          -> all categories with event counts
 *   GET /api/categories/:id      -> a single category
 */

const express = require('express');
const { query } = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { toInt } = require('../utils/validators');

const router = express.Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const rows = await query(
      `SELECT c.category_id,
              c.category_name,
              c.category_description,
              COUNT(e.event_id) AS event_count
         FROM categories c
         LEFT JOIN events e ON e.category_id = c.category_id
        GROUP BY c.category_id, c.category_name, c.category_description
        ORDER BY c.category_name`
    );

    res.json({ success: true, count: rows.length, data: rows });
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = toInt(req.params.id);
    if (id === undefined) throw ApiError.badRequest('Category id must be a whole number.');

    const [row] = await query(
      'SELECT category_id, category_name, category_description FROM categories WHERE category_id = ?',
      [id]
    );
    if (!row) throw ApiError.notFound(`Category ${id} was not found.`, 'CATEGORY_NOT_FOUND');

    res.json({ success: true, data: row });
  })
);

module.exports = router;
