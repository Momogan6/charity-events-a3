# Charity Events Platform

A full-stack charity event management platform built for **PROG2002 Web Development II — Assessment 3**.

The system lets members of the public browse charity events, search and filter them by category, city, status and date, check the local weather forecast for an event, and register to attend. An accompanying admin console lets staff create, edit and remove events and manage the registrations attached to them.

---

## Team

| Name | Student ID |
|---|---|
| Haoqiang Chen | 202300408048 |
| Boyuan Liu | 202300408034 |

**Team ID:** 36

---

## Technology stack

| Layer | Technology |
|---|---|
| Database | MySQL 8.0 (InnoDB, foreign keys, CHECK constraints, views, trigger) |
| API | Node.js + Express 4, `mysql2/promise` connection pool |
| Client site | Angular 22 (standalone components, signals, zoneless change detection) |
| Admin console | Angular 22 (standalone components, signals, zoneless change detection) |
| External service | Open-Meteo forecast API (proxied server-side) |
| Deployment | cPanel (shared hosting) |

Angular 22 requires **Node.js `^22.22.3`, `^24.15.0` or `>=26`**. Older Node releases are rejected by the Angular CLI at startup.

---

## Repository layout

```
charity-events/
├── api/              REST API - Express server, routes, validation, error handling
├── client-side/      Public-facing Angular website (port 4200)
├── admin-side/       Staff-facing Angular console  (port 4300)
├── database/         MySQL schema, constraints, views, trigger and seed data
└── report/           Assessment report and demo video outline
```

---

## Getting started

### 1. Prerequisites

- Node.js `^22.22.3` / `^24.15.0` / `>=26`
- MySQL 8.0 running locally on port 3306
- Three terminals (one per service)

### 2. Database

The schema file is self-contained: it creates the database, the three tables, the constraints, two views, one trigger and the seed data.

```bash
mysql -u root -p < database/charityevents_db.sql
```

Verify:

```sql
USE charityevents_db;
SELECT * FROM vw_event_summary;
```

You should see **14 events** across **6 categories**, with **18 registrations**.

### 3. API

```bash
cd api
npm install
cp .env.example .env      # then edit DB_USER / DB_PASSWORD
npm start
```

The server listens on <http://localhost:3000>. A health check is available at <http://localhost:3000/api/health>.

The API refuses to start if it cannot reach the database — start MySQL first.

### 4. Client site

```bash
cd client-side
npm install
npm start                 # http://localhost:4200
```

### 5. Admin console

```bash
cd admin-side
npm install
npm start -- --port 4300  # http://localhost:4300
```

The admin console runs on **4300** so that the client site and the console can be demonstrated side by side.

---

## API reference

Base URL: `http://localhost:3000/api`

### Categories

| Method | Endpoint | Description |
|---|---|---|
| GET | `/categories` | List all event categories |
| GET | `/categories/:id` | Single category |

### Events

| Method | Endpoint | Description |
|---|---|---|
| GET | `/events` | Search / filter / sort / paginate events |
| GET | `/events/:id` | Single event with its category |
| GET | `/events/:id/registrations` | Registrations for one event, newest first |
| POST | `/events` | Create an event |
| PUT | `/events/:id` | Update an event |
| DELETE | `/events/:id` | Delete an event (only when it has no registrations) |

`GET /events` accepts the following query parameters:

| Parameter | Type | Notes |
|---|---|---|
| `search` | string | Matches event name or description |
| `categoryId` | integer | Filter by category |
| `status` | enum | `Active` \| `Past` \| `Suspended` |
| `city` | string | Partial match, case-insensitive |
| `from` | date | `YYYY-MM-DD`, inclusive lower bound |
| `to` | date | `YYYY-MM-DD`, inclusive upper bound |
| `sort` | enum | `date` \| `name` \| `price` \| `capacity` \| `status` \| `popularity` \| `city` |
| `order` | enum | `asc` \| `desc` |
| `limit` | integer | Page size |
| `offset` | integer | Rows to skip |

Sort keys are validated against a whitelist, so the parameter cannot be used to inject SQL.

### Registrations

| Method | Endpoint | Description |
|---|---|---|
| GET | `/registrations` | List registrations, optionally `?eventId=` |
| GET | `/registrations/:id` | Single registration |
| POST | `/registrations` | Register for an event |
| DELETE | `/registrations/:id` | Cancel a registration |

### Weather

| Method | Endpoint | Description |
|---|---|---|
| GET | `/weather?eventId=4` | Five-day forecast for the event venue |
| GET | `/weather?latitude=-28.0&longitude=153.4` | Forecast for explicit coordinates |

Weather responses are cached in memory for **10 minutes** per location, and the upstream call carries an 8-second timeout.

### Error format

Every failure returns the same envelope:

```json
{
  "success": false,
  "error": {
    "code": "DUPLICATE_REGISTRATION",
    "message": "This email address is already registered for this event."
  }
}
```

| HTTP | Code | Raised when |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Field-level validation failed |
| 404 | `NOT_FOUND` | Record does not exist |
| 409 | `DUPLICATE_REGISTRATION` | Same email registered twice for one event |
| 409 | `EVENT_HAS_REGISTRATIONS` | Delete blocked by existing registrations |
| 409 | `EVENT_NOT_ACTIVE` | Registration attempted on a Past or Suspended event |
| 409 | `CAPACITY_BELOW_SOLD` | Capacity reduced below tickets already sold |
| 502 | `WEATHER_UNAVAILABLE` | Open-Meteo did not respond |

---

## Data model

Three tables:

- `categories` — one row per cause area.
- `events` — event details including venue coordinates, capacity, ticket price and status.
- `registrations` — one booking per attendee email per event.

Business rules are enforced at database level, not only in the application:

- `UNIQUE (event_id, email)` — a person may book many different events, but each event only once.
- `FOREIGN KEY registrations.event_id → events.event_id ON DELETE RESTRICT` — an event with bookings cannot be deleted.
- `CHECK` constraints on ticket count, capacity, price and coordinates.
- `BEFORE INSERT` trigger `trg_registrations_before_insert` — verifies that the event exists and is `Active`, verifies seats remain, and derives `total_amount` from `tickets_purchased × ticket_price`.

Two views support reporting:

- `vw_event_summary` — events with category name, tickets sold and revenue.
- `vw_event_registrations` — registrations joined to their event.

---

## Notes

- The client site and the admin console mirror the API's business rules in their forms, but they never duplicate the authority. Where the two disagree, the API wins, and the server's rejection message is shown to the user verbatim.
- `api/.env` is intentionally excluded from version control. Copy `api/.env.example` and fill in your own credentials.
