'use strict';

/**
 * config/db.js
 * ---------------------------------------------------------------------
 * Creates a single shared MySQL connection POOL using mysql2/promise.
 *
 * Why a pool instead of a single connection?
 *  - A pool re-uses open connections, so we do not pay the TCP +
 *    authentication cost on every request.
 *  - connectionLimit caps how many concurrent connections we open, so
 *    the API cannot exhaust the MySQL `max_connections` limit - this
 *    matters on shared hosting such as the SCU cPanel.
 *
 * Every query in this project is executed with PLACEHOLDERS (`?`), which
 * means mysql2 sends the statement and the values separately. That is
 * what makes all of our endpoints immune to SQL injection.
 */

const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'charityevents_db',
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
  queueLimit: 0,
  dateStrings: true,       // return DATE/DATETIME as plain strings (no UTC shifting)
  charset: 'utf8mb4_unicode_ci',
  timezone: 'Z'
});

/**
 * Small helper so route handlers stay readable.
 * Usage:  const rows = await query('SELECT * FROM events WHERE event_id = ?', [id]);
 *
 * @param {string} sql
 * @param {Array}  params
 * @returns {Promise<Array>} rows
 */
async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

/**
 * Runs a callback inside a database transaction so that a multi-step
 * write is all-or-nothing. Used when a new event is created together
 * with related rows.
 *
 * @param {(conn: import('mysql2/promise').PoolConnection) => Promise<any>} work
 */
async function withTransaction(work) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await work(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/** Verifies at start-up that the database is actually reachable. */
async function testConnection() {
  const conn = await pool.getConnection();
  try {
    await conn.query('SELECT 1');
  } finally {
    conn.release();
  }
}

module.exports = { pool, query, withTransaction, testConnection };
