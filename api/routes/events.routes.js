'use strict';

/**
 * routes/events.routes.js
 * ---------------------------------------------------------------------
 * Full C.R.U.D. for the `events` resource.
 *
 *   GET    /api/events                 list + filter + sort + paginate
 *   GET    /api/events/:id             one event + ALL its registrations
 *   POST   /api/events                 create            (admin)
 *   PUT    /api/events/:id             update            (admin)
 *   DELETE /api/events/:id             delete            (admin)
 *   GET    /api/events/:id/registrations   registration list only
 *
 * RESTful notes
 *  - The URL identifies the RESOURCE (`/events/7`), the HTTP verb
 *    identifies the OPERATION. No verbs appear in our URLs.
 *  - Optional query string parameters only *filter* the collection.
 *  - Status codes used: 200 OK, 201 Created, 400 Bad Request,
 *    404 Not Found, 409 Conflict.
 *
 * Data integrity
 *  - DELETE is guarded twice: an explicit SELECT ... COUNT first (so the
 *    client receives a friendly 409 + message), and the database's own
 *    `ON DELETE RESTRICT` foreign key as the final safety net.
 */

const express = require('express');
const { query } = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { validateEvent, toInt, EVENT_STATUSES } = require('../utils/validators');

const router = express.Router();

/* ------------------------------------------------------------------ *
 * Shared SQL fragments
 * ------------------------------------------------------------------ */

const EVENT_COLUMNS = `
        e.event_id, e.event_name, e.category_id, c.category_name,
        e.event_description, e.event_venue, e.event_city,
        e.latitude, e.longitude, e.event_date, e.event_time,
        e.event_status, e.event_capacity, e.ticket_price, e.event_image,
        e.created_at`;

const EVENT_AGGREGATES = `
        COALESCE(SUM(r.tickets_purchased), 0)                      AS tickets_sold,
        e.event_capacity - COALESCE(SUM(r.tickets_purchased), 0)   AS seats_remaining,
        COUNT(r.registration_id)                                   AS registration_count`;

// Whitelist: the client may only sort by these logical names. Anything
// else is rejected, so no user supplied string ever reaches the SQL text.
const SORTABLE = {
  date: 'e.event_date',
  name: 'e.event_name',
  price: 'e.ticket_price',
  capacity: 'e.event_capacity',
  status: 'e.event_status',
  popularity: 'tickets_sold',
  city: 'e.event_city'
};

/** Loads an event row (with aggregates) or throws a 404. */
async function findEventOrFail(eventId) {
  const [row] = await query(
    `SELECT ${EVENT_COLUMNS}, ${EVENT_AGGREGATES}
       FROM events e
       JOIN categories c ON c.category_id = e.category_id
       LEFT JOIN registrations r ON r.event_id = e.event_id
      WHERE e.event_id = ?
      GROUP BY e.event_id, c.category_name`,
    [eventId]
  );
  if (!row) throw ApiError.notFound(`Event ${eventId} was not found.`, 'EVENT_NOT_FOUND');
  return row;
}

/** Registrations for one event, newest booking first (A3 requirement). */
async function findRegistrationsForEvent(eventId) {
  return query(
    `SELECT registration_id, event_id, full_name, email, phone,
            tickets_purchased, total_amount, registration_date, notes
       FROM registrations
      WHERE event_id = ?
      ORDER BY registration_date DESC, registration_id DESC`,
    [eventId]
  );
}

/* ------------------------------------------------------------------ *
 * GET /api/events  -  search / browse the collection
 * ------------------------------------------------------------------ */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { search, categoryId, status, city, from, to } = req.query;

    const where = [];
    const params = [];

    if (search !== undefined && String(search).trim() !== '') {
      const term = `%${String(search).trim()}%`;
      where.push(
        `(e.event_name LIKE ? OR e.event_description LIKE ? OR e.event_city LIKE ? OR e.event_venue LIKE ?)`
      );
      params.push(term, term, term, term);
    }

    if (categoryId !== undefined && String(categoryId).trim() !== '') {
      const id = toInt(categoryId);
      if (id === undefined) throw ApiError.badRequest('categoryId must be a whole number.');
      where.push('e.category_id = ?');
      params.push(id);
    }

    if (status !== undefined && String(status).trim() !== '') {
      const wanted = String(status)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const invalid = wanted.filter((s) => !EVENT_STATUSES.includes(s));
      if (invalid.length) {
        throw ApiError.badRequest(`Invalid status value(s): ${invalid.join(', ')}. Allowed: ${EVENT_STATUSES.join(', ')}.`);
      }
      where.push(`e.event_status IN (${wanted.map(() => '?').join(', ')})`);
      params.push(...wanted);
    }

    if (city !== undefined && String(city).trim() !== '') {
      where.push('e.event_city LIKE ?');
      params.push(`%${String(city).trim()}%`);
    }

    const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
    if (from !== undefined && String(from).trim() !== '') {
      if (!DATE_RE.test(String(from))) throw ApiError.badRequest('`from` must use the format YYYY-MM-DD.');
      where.push('e.event_date >= ?');
      params.push(String(from));
    }
    if (to !== undefined && String(to).trim() !== '') {
      if (!DATE_RE.test(String(to))) throw ApiError.badRequest('`to` must use the format YYYY-MM-DD.');
      where.push('e.event_date <= ?');
      params.push(String(to));
    }

    // --- sorting (whitelisted) ---
    const sortKey = SORTABLE[String(req.query.sort || 'date').toLowerCase()];
    if (!sortKey) {
      throw ApiError.badRequest(`Unknown sort key. Allowed: ${Object.keys(SORTABLE).join(', ')}.`);
    }
    const order = String(req.query.order || 'asc').toLowerCase() === 'desc' ? 'DESC' : 'ASC';

    // --- pagination (validated then inlined: mysql2 cannot bind LIMIT) ---
    let limit = toInt(req.query.limit);
    let offset = toInt(req.query.offset) || 0;
    if (limit === undefined) limit = 100;
    if (limit < 1 || limit > 200) throw ApiError.badRequest('`limit` must be between 1 and 200.');
    if (offset < 0) throw ApiError.badRequest('`offset` must be zero or greater.');

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const rows = await query(
      `SELECT ${EVENT_COLUMNS}, ${EVENT_AGGREGATES}
         FROM events e
         JOIN categories c ON c.category_id = e.category_id
         LEFT JOIN registrations r ON r.event_id = e.event_id
         ${whereSql}
        GROUP BY e.event_id, c.category_name
        ORDER BY ${sortKey} ${order}, e.event_id ASC
        LIMIT ${limit} OFFSET ${offset}`,
      params
    );

    const [{ total }] = await query(
      `SELECT COUNT(*) AS total FROM events e ${whereSql}`,
      params
    );

    res.json({
      success: true,
      count: rows.length,
      total,
      filters: { search: search ?? null, categoryId: categoryId ?? null, status: status ?? null, city: city ?? null, from: from ?? null, to: to ?? null },
      data: rows
    });
  })
);

/* ------------------------------------------------------------------ *
 * GET /api/events/:id  -  detail + complete registration list
 * ------------------------------------------------------------------ */
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = toInt(req.params.id);
    if (id === undefined) throw ApiError.badRequest('Event id must be a whole number.');

    const event = await findEventOrFail(id);
    const registrations = await findRegistrationsForEvent(id);

    res.json({
      success: true,
      data: {
        ...event,
        registrations,
        registration_count: registrations.length
      }
    });
  })
);

/* ------------------------------------------------------------------ *
 * GET /api/events/:id/registrations  -  registrations only
 * ------------------------------------------------------------------ */
router.get(
  '/:id/registrations',
  asyncHandler(async (req, res) => {
    const id = toInt(req.params.id);
    if (id === undefined) throw ApiError.badRequest('Event id must be a whole number.');

    await findEventOrFail(id); // 404 when the event does not exist
    const registrations = await findRegistrationsForEvent(id);

    res.json({ success: true, count: registrations.length, data: registrations });
  })
);

/* ------------------------------------------------------------------ *
 * POST /api/events  -  create  (admin)
 * ------------------------------------------------------------------ */
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { errors, values } = validateEvent(req.body, { partial: false });
    if (Object.keys(errors).length) {
      throw ApiError.badRequest('Please correct the highlighted fields and try again.', errors, 'VALIDATION_ERROR');
    }

    const [category] = await query('SELECT category_id FROM categories WHERE category_id = ?', [values.category_id]);
    if (!category) {
      throw ApiError.badRequest('The selected category does not exist.', { category_id: 'Unknown category.' });
    }

    const columns = Object.keys(values);
    const placeholders = columns.map(() => '?').join(', ');
    const result = await query(
      `INSERT INTO events (${columns.join(', ')}) VALUES (${placeholders})`,
      columns.map((c) => values[c])
    );

    const created = await findEventOrFail(result.insertId);
    res
      .status(201)
      .location(`/api/events/${result.insertId}`)
      .json({ success: true, message: 'Event created successfully.', data: created });
  })
);

/* ------------------------------------------------------------------ *
 * PUT /api/events/:id  -  update  (admin)
 * ------------------------------------------------------------------ */
router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = toInt(req.params.id);
    if (id === undefined) throw ApiError.badRequest('Event id must be a whole number.');

    await findEventOrFail(id); // 404 before doing anything else

    const { errors, values } = validateEvent(req.body, { partial: true });
    if (Object.keys(errors).length) {
      throw ApiError.badRequest('Please correct the highlighted fields and try again.', errors, 'VALIDATION_ERROR');
    }

    const columns = Object.keys(values);
    if (!columns.length) {
      throw ApiError.badRequest('No updatable fields were supplied.', null, 'NOTHING_TO_UPDATE');
    }

    if (values.category_id !== undefined) {
      const [category] = await query('SELECT category_id FROM categories WHERE category_id = ?', [values.category_id]);
      if (!category) {
        throw ApiError.badRequest('The selected category does not exist.', { category_id: 'Unknown category.' });
      }
    }

    // Capacity must never drop below the tickets already sold.
    if (values.event_capacity !== undefined) {
      const [{ sold }] = await query(
        'SELECT COALESCE(SUM(tickets_purchased), 0) AS sold FROM registrations WHERE event_id = ?',
        [id]
      );
      if (values.event_capacity < sold) {
        throw ApiError.conflict(
          `Capacity cannot be reduced to ${values.event_capacity} because ${sold} ticket(s) have already been sold.`,
          { event_capacity: `Must be at least ${sold}.` },
          'CAPACITY_BELOW_SOLD'
        );
      }
    }

    await query(
      `UPDATE events SET ${columns.map((c) => `${c} = ?`).join(', ')} WHERE event_id = ?`,
      [...columns.map((c) => values[c]), id]
    );

    const updated = await findEventOrFail(id);
    res.json({ success: true, message: 'Event updated successfully.', data: updated });
  })
);

/* ------------------------------------------------------------------ *
 * DELETE /api/events/:id  -  delete  (admin)
 * Blocked while registrations exist (data integrity).
 * ------------------------------------------------------------------ */
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = toInt(req.params.id);
    if (id === undefined) throw ApiError.badRequest('Event id must be a whole number.');

    const event = await findEventOrFail(id);

    const [{ registrationCount, ticketsSold }] = await query(
      `SELECT COUNT(*) AS registrationCount, COALESCE(SUM(tickets_purchased), 0) AS ticketsSold
         FROM registrations WHERE event_id = ?`,
      [id]
    );

    if (registrationCount > 0) {
      throw ApiError.conflict(
        `"${event.event_name}" cannot be deleted because it has ${registrationCount} registration(s) ` +
          `(${ticketsSold} ticket(s) sold). Remove the registrations first or suspend the event instead.`,
        { registrationCount, ticketsSold },
        'EVENT_HAS_REGISTRATIONS'
      );
    }

    await query('DELETE FROM events WHERE event_id = ?', [id]);

    res.json({
      success: true,
      message: `Event "${event.event_name}" was deleted successfully.`,
      data: { event_id: id }
    });
  })
);

module.exports = router;
