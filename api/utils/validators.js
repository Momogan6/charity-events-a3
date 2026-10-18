'use strict';

/**
 * utils/validators.js
 * ---------------------------------------------------------------------
 * Hand-rolled, dependency-free validation for the two writable
 * resources (`events` and `registrations`).
 *
 * Each validator returns:
 *    { errors: { field: message, ... }, values: { sanitised fields } }
 *
 * `values` only ever contains keys that were present in the request and
 * that map to a known database column. Route handlers therefore build
 * their SQL from a fixed whitelist of columns - the client can never
 * inject a column name.
 */

const EVENT_STATUSES = ['Active', 'Past', 'Suspended'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^[0-9+()\-\s]{8,20}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}(:\d{2})?$/;

const trim = (v) => (typeof v === 'string' ? v.trim() : v);

/** Coerces to a number, or returns undefined when not numeric. */
function toNumber(value) {
  if (value === '' || value === null || value === undefined) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/** Coerces to a bounded integer, or returns undefined when invalid. */
function toInt(value) {
  const n = toNumber(value);
  return n === undefined ? undefined : Math.trunc(n);
}

function isBlank(value) {
  return value === undefined || value === null || String(value).trim() === '';
}

/**
 * Validates an event payload.
 * @param {object} body
 * @param {{partial?: boolean}} [options] partial = true for PUT (only
 *        supplied fields are validated + updated).
 */
function validateEvent(body = {}, { partial = false } = {}) {
  const errors = {};
  const values = {};
  const has = (key) => !isBlank(body[key]) || (key in body && body[key] === null);

  // ---- event_name (required, 3..150 chars) ----
  if (!partial || 'event_name' in body) {
    const name = trim(body.event_name);
    if (partial && isBlank(name)) {
      // explicitly sending an empty name on update is an error too
      if ('event_name' in body) errors.event_name = 'Event name cannot be empty.';
    } else if (isBlank(name)) {
      errors.event_name = 'Event name is required.';
    } else if (String(name).length < 3 || String(name).length > 150) {
      errors.event_name = 'Event name must be between 3 and 150 characters.';
    } else {
      values.event_name = String(name);
    }
  }

  // ---- category_id (required, positive integer) ----
  if (!partial || 'category_id' in body) {
    const categoryId = toInt(body.category_id);
    if (categoryId === undefined) errors.category_id = 'A valid category is required.';
    else if (categoryId <= 0) errors.category_id = 'Category id must be a positive integer.';
    else values.category_id = categoryId;
  }

  // ---- event_date (required, YYYY-MM-DD) ----
  if (!partial || 'event_date' in body) {
    const date = trim(body.event_date);
    if (isBlank(date)) errors.event_date = 'Event date is required.';
    else if (!DATE_RE.test(String(date))) errors.event_date = 'Event date must use the format YYYY-MM-DD.';
    else if (Number.isNaN(new Date(date).getTime())) errors.event_date = 'Event date is not a real calendar date.';
    else values.event_date = String(date);
  }

  // ---- event_status (optional, enum) ----
  if (has('event_status')) {
    const status = trim(body.event_status);
    if (!EVENT_STATUSES.includes(status)) {
      errors.event_status = `Status must be one of: ${EVENT_STATUSES.join(', ')}.`;
    } else {
      values.event_status = status;
    }
  } else if (!partial) {
    values.event_status = 'Active';
  }

  // ---- numeric / decimal fields ----
  if (has('event_capacity')) {
    const capacity = toInt(body.event_capacity);
    if (capacity === undefined || capacity < 0) errors.event_capacity = 'Capacity must be a non-negative whole number.';
    else values.event_capacity = capacity;
  } else if (!partial) {
    values.event_capacity = 0;
  }

  if (has('ticket_price')) {
    const price = toNumber(body.ticket_price);
    if (price === undefined || price < 0) errors.ticket_price = 'Ticket price must be a non-negative number.';
    else values.ticket_price = Math.round(price * 100) / 100;
  } else if (!partial) {
    values.ticket_price = 0;
  }

  // ---- latitude / longitude (used by the Weather API) ----
  if (has('latitude')) {
    const lat = toNumber(body.latitude);
    if (lat === undefined || lat < -90 || lat > 90) errors.latitude = 'Latitude must be a number between -90 and 90.';
    else values.latitude = lat;
  }
  if (has('longitude')) {
    const lng = toNumber(body.longitude);
    if (lng === undefined || lng < -180 || lng > 180) errors.longitude = 'Longitude must be a number between -180 and 180.';
    else values.longitude = lng;
  }

  // ---- optional free-text fields ----
  const optionalText = {
    event_description: 5000,
    event_venue: 200,
    event_city: 80,
    event_image: 255
  };
  for (const [field, max] of Object.entries(optionalText)) {
    if (!has(field)) continue;
    const value = trim(body[field]);
    if (value === null || value === '') {
      values[field] = null;
    } else if (String(value).length > max) {
      errors[field] = `${field.replace(/_/g, ' ')} must be ${max} characters or fewer.`;
    } else {
      values[field] = String(value);
    }
  }

  // ---- event_time (optional, HH:MM or HH:MM:SS) ----
  if (has('event_time')) {
    const time = trim(body.event_time);
    if (!TIME_RE.test(String(time))) errors.event_time = 'Event time must use the format HH:MM or HH:MM:SS.';
    else values.event_time = String(time).length === 5 ? `${time}:00` : String(time);
  }

  // ---- cross-field rule: both coordinates, or neither ----
  const willHaveLat = 'latitude' in values;
  const willHaveLng = 'longitude' in values;
  if (willHaveLat !== willHaveLng) {
    errors.latitude = errors.longitude =
      'Provide both latitude and longitude, or leave both empty (needed for the weather forecast).';
  }

  return { errors, values };
}

/**
 * Validates a registration (booking) payload.
 */
function validateRegistration(body = {}) {
  const errors = {};
  const values = {};

  // ---- event_id (required) ----
  const eventId = toInt(body.event_id);
  if (eventId === undefined || eventId <= 0) errors.event_id = 'A valid event must be selected.';
  else values.event_id = eventId;

  // ---- full_name (required, 2..120) ----
  const fullName = trim(body.full_name);
  if (isBlank(fullName)) errors.full_name = 'Full name is required.';
  else if (String(fullName).length < 2 || String(fullName).length > 120) {
    errors.full_name = 'Full name must be between 2 and 120 characters.';
  } else values.full_name = String(fullName);

  // ---- email (required, format) ----
  const email = trim(body.email);
  if (isBlank(email)) errors.email = 'Email address is required.';
  else if (!EMAIL_RE.test(String(email))) errors.email = 'Please enter a valid email address.';
  else if (String(email).length > 160) errors.email = 'Email address is too long.';
  else values.email = String(email).toLowerCase();

  // ---- phone (required, loose AU-friendly format) ----
  const phone = trim(body.phone);
  if (isBlank(phone)) errors.phone = 'Contact phone number is required.';
  else if (!PHONE_RE.test(String(phone))) errors.phone = 'Please enter a valid contact phone number.';
  else values.phone = String(phone);

  // ---- tickets_purchased (required, 1..10) ----
  const tickets = toInt(body.tickets_purchased);
  if (tickets === undefined) errors.tickets_purchased = 'Number of tickets is required.';
  else if (tickets < 1 || tickets > 10) errors.tickets_purchased = 'You may purchase between 1 and 10 tickets.';
  else values.tickets_purchased = tickets;

  // ---- registration_date (optional; defaults to now in the DB) ----
  if (!isBlank(body.registration_date)) {
    const raw = String(body.registration_date).trim();
    if (Number.isNaN(new Date(raw).getTime())) {
      errors.registration_date = 'Registration date is not a valid date/time.';
    } else {
      // Normalise "2026-10-15T09:30:00.000Z" and "2026-10-15 09:30" to MySQL DATETIME
      const d = new Date(raw);
      const pad = (n) => String(n).padStart(2, '0');
      values.registration_date =
        `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
        `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    }
  }

  // ---- notes (optional) ----
  if (!isBlank(body.notes)) {
    const notes = String(trim(body.notes));
    if (notes.length > 255) errors.notes = 'Notes must be 255 characters or fewer.';
    else values.notes = notes;
  }

  return { errors, values };
}

module.exports = {
  EVENT_STATUSES,
  validateEvent,
  validateRegistration,
  toInt
};
