'use strict';

/**
 * routes/registrations.routes.js
 * ---------------------------------------------------------------------
 *   POST   /api/registrations          create a booking (client website)
 *   GET    /api/registrations          list bookings (admin, filterable)
 *   GET    /api/registrations/:id      one booking
 *   DELETE /api/registrations/:id      cancel a booking (admin, optional)
 *
 * The registration resource is the new capability required by A3: it
 * links a web user to a charity event, and it is what makes the delete
 * rule in events.routes.js meaningful.
 *
 * Business rules (all enforced, defence in depth):
 *   1. The event must exist and be `Active`.
 *   2. Enough seats must remain for the requested number of tickets.
 *   3. The same email may book a given event only once
 *      (`UNIQUE (event_id, email)` + friendly 409).
 */

const express = require('express');
const { query } = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { validateRegistration, toInt } = require('../utils/validators');

const router = express.Router();

const REGISTRATION_COLUMNS = `
        r.registration_id, r.event_id, r.full_name, r.email, r.phone,
        r.tickets_purchased, r.total_amount, r.registration_date, r.notes`;

/* ------------------------------------------------------------------ *
 * POST /api/registrations
 * ------------------------------------------------------------------ */
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { errors, values } = validateRegistration(req.body);
    if (Object.keys(errors).length) {
      throw ApiError.badRequest('Please correct the highlighted fields and try again.', errors, 'VALIDATION_ERROR');
    }

    // --- rule 1: event must exist and be open for registration ---
    const [event] = await query(
      `SELECT event_id, event_name, event_status, event_capacity, ticket_price
         FROM events WHERE event_id = ?`,
      [values.event_id]
    );
    if (!event) {
      throw ApiError.notFound('The selected event does not exist.', 'EVENT_NOT_FOUND');
    }
    if (event.event_status !== 'Active') {
      throw ApiError.conflict(
        `"${event.event_name}" is currently ${event.event_status} and is not open for registration.`,
        null,
        'EVENT_NOT_ACTIVE'
      );
    }

    // --- rule 3: one booking per email, per event ---
    const [duplicate] = await query(
      'SELECT registration_id FROM registrations WHERE event_id = ? AND email = ?',
      [values.event_id, values.email]
    );
    if (duplicate) {
      throw ApiError.conflict(
        'This email address has already registered for this event. Each person may register once per event.',
        { email: 'Already registered for this event.' },
        'DUPLICATE_REGISTRATION'
      );
    }

    // --- rule 2: seats remaining ---
    const [{ sold }] = await query(
      'SELECT COALESCE(SUM(tickets_purchased), 0) AS sold FROM registrations WHERE event_id = ?',
      [values.event_id]
    );
    const remaining = event.event_capacity - sold;
    if (values.tickets_purchased > remaining) {
      throw ApiError.conflict(
        remaining > 0
          ? `Only ${remaining} seat(s) remain for this event.`
          : 'This event is fully booked.',
        { tickets_purchased: `Maximum ${remaining} ticket(s) available.` },
        'NOT_ENOUGH_SEATS'
      );
    }

    // --- insert (the BEFORE INSERT trigger re-checks rules 1 & 2) ---
    const result = await query(
      `INSERT INTO registrations
         (event_id, full_name, email, phone, tickets_purchased, registration_date, notes)
       VALUES (?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), ?)`,
      [
        values.event_id,
        values.full_name,
        values.email,
        values.phone,
        values.tickets_purchased,
        values.registration_date ?? null,
        values.notes ?? null
      ]
    );

    const [created] = await query(
      `SELECT ${REGISTRATION_COLUMNS}, e.event_name
         FROM registrations r
         JOIN events e ON e.event_id = r.event_id
        WHERE r.registration_id = ?`,
      [result.insertId]
    );

    res.status(201).location(`/api/registrations/${result.insertId}`).json({
      success: true,
      message: `Registration confirmed for "${event.event_name}".`,
      data: created
    });
  })
);

/* ------------------------------------------------------------------ *
 * GET /api/registrations  -  admin listing, filterable
 * ------------------------------------------------------------------ */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const where = [];
    const params = [];

    if (req.query.eventId !== undefined && String(req.query.eventId).trim() !== '') {
      const eventId = toInt(req.query.eventId);
      if (eventId === undefined) throw ApiError.badRequest('eventId must be a whole number.');
      where.push('r.event_id = ?');
      params.push(eventId);
    }
    if (req.query.email !== undefined && String(req.query.email).trim() !== '') {
      where.push('r.email = ?');
      params.push(String(req.query.email).trim().toLowerCase());
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const rows = await query(
      `SELECT ${REGISTRATION_COLUMNS}, e.event_name, e.event_date
         FROM registrations r
         JOIN events e ON e.event_id = r.event_id
         ${whereSql}
        ORDER BY r.registration_date DESC, r.registration_id DESC`,
      params
    );

    res.json({ success: true, count: rows.length, data: rows });
  })
);

/* ------------------------------------------------------------------ *
 * GET /api/registrations/:id
 * ------------------------------------------------------------------ */
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = toInt(req.params.id);
    if (id === undefined) throw ApiError.badRequest('Registration id must be a whole number.');

    const [row] = await query(
      `SELECT ${REGISTRATION_COLUMNS}, e.event_name
         FROM registrations r
         JOIN events e ON e.event_id = r.event_id
        WHERE r.registration_id = ?`,
      [id]
    );
    if (!row) throw ApiError.notFound(`Registration ${id} was not found.`, 'REGISTRATION_NOT_FOUND');

    res.json({ success: true, data: row });
  })
);

/* ------------------------------------------------------------------ *
 * DELETE /api/registrations/:id  -  cancel a booking (optional feature)
 * ------------------------------------------------------------------ */
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = toInt(req.params.id);
    if (id === undefined) throw ApiError.badRequest('Registration id must be a whole number.');

    const [row] = await query('SELECT registration_id FROM registrations WHERE registration_id = ?', [id]);
    if (!row) throw ApiError.notFound(`Registration ${id} was not found.`, 'REGISTRATION_NOT_FOUND');

    await query('DELETE FROM registrations WHERE registration_id = ?', [id]);
    res.json({ success: true, message: 'Registration cancelled.', data: { registration_id: id } });
  })
);

module.exports = router;
