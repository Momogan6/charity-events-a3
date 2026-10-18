'use strict';

/**
 * server.js
 * =====================================================================
 *  PROG2002 Web Development II - Assessment 3
 *  Charity Events Platform - RESTful API
 *
 *  Stack : Node.js + Express.js + MySQL (mysql2/promise)
 *  Role  : single source of truth for BOTH the client-side website and
 *          the admin-side website. Both front-ends are plain HTTP
 *          clients of the endpoints mounted below - they never touch the
 *          database directly.
 *
 *  Start : npm start          (or: node server.js)
 * =====================================================================
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const { testConnection } = require('./config/db');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

const categoriesRouter = require('./routes/categories.routes');
const eventsRouter = require('./routes/events.routes');
const registrationsRouter = require('./routes/registrations.routes');
const weatherRouter = require('./routes/weather.routes');

const app = express();
const PORT = Number(process.env.PORT || 3000);

/* ------------------------------------------------------------------ *
 * 1. Global middleware
 * ------------------------------------------------------------------ */

// CORS - the Angular dev server (localhost:4200 / :4300) and the deployed
// cPanel host are different origins, so the browser needs permission.
const allowedOrigins = (process.env.CORS_ORIGIN || '*')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins.includes('*') ? true : allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Accept'],
    maxAge: 86400
  })
);

// Parse JSON request bodies. The `limit` is small because none of our
// resources carry large payloads.
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging (concise in production, verbose while developing).
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

/* ------------------------------------------------------------------ *
 * 2. Routes
 * ------------------------------------------------------------------ */

/** Health check - handy after deploying to cPanel to confirm the app is up. */
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    status: 'ok',
    service: 'charity-events-api',
    version: require('./package.json').version,
    timestamp: new Date().toISOString()
  });
});

app.use('/api/categories', categoriesRouter);
app.use('/api/events', eventsRouter);
app.use('/api/registrations', registrationsRouter);
app.use('/api/weather', weatherRouter);

/** Friendly root so hitting the base URL in a browser is informative. */
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Charity Events API - PROG2002 Assessment 3',
    documentation: 'See api/README.md for the full endpoint reference.',
    endpoints: {
      health: 'GET /api/health',
      categories: ['GET /api/categories', 'GET /api/categories/:id'],
      events: [
        'GET /api/events?search=&categoryId=&status=&city=&from=&to=&sort=&order=&limit=&offset=',
        'GET /api/events/:id',
        'GET /api/events/:id/registrations',
        'POST /api/events',
        'PUT /api/events/:id',
        'DELETE /api/events/:id'
      ],
      registrations: [
        'POST /api/registrations',
        'GET /api/registrations?eventId=&email=',
        'GET /api/registrations/:id',
        'DELETE /api/registrations/:id'
      ],
      weather: ['GET /api/weather?eventId=:id', 'GET /api/weather?latitude=&longitude=']
    }
  });
});

/* ------------------------------------------------------------------ *
 * 3. Error handling (must be registered LAST)
 * ------------------------------------------------------------------ */
app.use(notFoundHandler);
app.use(errorHandler);

/* ------------------------------------------------------------------ *
 * 4. Start-up
 * ------------------------------------------------------------------ */
async function start() {
  try {
    await testConnection();
    console.log(`[db] connected to ${process.env.DB_NAME || 'charityevents_db'} @ ${process.env.DB_HOST || '127.0.0.1'}`);
  } catch (err) {
    console.error('[db] FATAL: could not connect to MySQL.');
    console.error(`      ${err.message}`);
    console.error('      Check the DB_* values in your .env file and that MySQL is running.');
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log('');
    console.log('  Charity Events API is running');
    console.log(`  http://localhost:${PORT}`);
    console.log(`  Health:  http://localhost:${PORT}/api/health`);
    console.log(`  Events:  http://localhost:${PORT}/api/events`);
    console.log('');
  });
}

// Start the server. Phusion Passenger (used by the SCU cPanel) loads this
// file with require(), so `require.main === module` is FALSE there and a
// guard based on it would leave the process listening on nothing. The server
// therefore starts unless a test explicitly opts out.
if (process.env.CHARITY_EVENTS_NO_AUTOSTART !== '1') {
  start();
}

module.exports = { app, start };
