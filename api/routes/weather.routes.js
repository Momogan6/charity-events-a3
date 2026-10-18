'use strict';

/**
 * routes/weather.routes.js
 * ---------------------------------------------------------------------
 * Optional external API integration (Part 6 of the brief) using the free
 * Open-Meteo forecast API: https://api.open-meteo.com
 *
 *   GET /api/weather?eventId=7
 *   GET /api/weather?latitude=-28.81&longitude=153.28
 *
 * DESIGN DECISION - why call Open-Meteo from the server instead of the
 * browser?
 *   1. No CORS surprises: the Angular app only ever talks to our own API.
 *   2. The coarse browser `timezone` string is replaced by an explicit
 *      `Australia/Sydney` timezone, so the forecast matches the event's
 *      actual local day.
 *   3. We can cache responses and shield the front-end from upstream
 *      outages or rate limiting.
 *   4. The WMO weather codes are translated into readable text once,
 *      server-side, instead of in every client.
 */

const express = require('express');
const { query } = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { toInt } = require('../utils/validators');

const router = express.Router();

const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast';
const TIMEZONE = 'Australia/Sydney';
const FORECAST_DAYS = 5;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/** Simple in-memory cache: key -> { expires, payload } */
const cache = new Map();

/**
 * WMO weather interpretation codes returned by Open-Meteo.
 * (Table reproduced from the Assessment Brief / Open-Meteo docs.)
 */
const WMO_CODES = {
  0: { description: 'Clear sky', icon: 'clear' },
  1: { description: 'Mainly clear', icon: 'mostly-clear' },
  2: { description: 'Partly cloudy', icon: 'partly-cloudy' },
  3: { description: 'Overcast', icon: 'overcast' },
  45: { description: 'Fog', icon: 'fog' },
  48: { description: 'Depositing rime fog', icon: 'fog' },
  51: { description: 'Light drizzle', icon: 'drizzle' },
  53: { description: 'Moderate drizzle', icon: 'drizzle' },
  55: { description: 'Dense drizzle', icon: 'drizzle' },
  56: { description: 'Light freezing drizzle', icon: 'sleet' },
  57: { description: 'Dense freezing drizzle', icon: 'sleet' },
  61: { description: 'Slight rain', icon: 'rain' },
  63: { description: 'Moderate rain', icon: 'rain' },
  65: { description: 'Heavy rain', icon: 'rain' },
  66: { description: 'Light freezing rain', icon: 'sleet' },
  67: { description: 'Heavy freezing rain', icon: 'sleet' },
  71: { description: 'Slight snowfall', icon: 'snow' },
  73: { description: 'Moderate snowfall', icon: 'snow' },
  75: { description: 'Heavy snowfall', icon: 'snow' },
  77: { description: 'Snow grains', icon: 'snow' },
  80: { description: 'Slight rain showers', icon: 'showers' },
  81: { description: 'Moderate rain showers', icon: 'showers' },
  82: { description: 'Violent rain showers', icon: 'showers' },
  85: { description: 'Slight snow showers', icon: 'snow' },
  86: { description: 'Heavy snow showers', icon: 'snow' },
  95: { description: 'Thunderstorm', icon: 'storm' },
  96: { description: 'Thunderstorm with slight hail', icon: 'storm' },
  99: { description: 'Thunderstorm with heavy hail', icon: 'storm' }
};

function describeWeatherCode(code) {
  return WMO_CODES[code] || { description: 'Unknown conditions', icon: 'unknown' };
}

/** Clamps a coordinate and returns it as a fixed-precision string. */
function normaliseCoord(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n.toFixed(4);
}

/* ------------------------------------------------------------------ *
 * GET /api/weather
 * ------------------------------------------------------------------ */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    let latitude;
    let longitude;
    let locationLabel = null;
    let eventId = null;

    if (req.query.eventId !== undefined && String(req.query.eventId).trim() !== '') {
      eventId = toInt(req.query.eventId);
      if (eventId === undefined) throw ApiError.badRequest('eventId must be a whole number.');

      const [event] = await query(
        `SELECT event_id, event_name, event_city, event_venue, event_date, latitude, longitude
           FROM events WHERE event_id = ?`,
        [eventId]
      );
      if (!event) throw ApiError.notFound(`Event ${eventId} was not found.`, 'EVENT_NOT_FOUND');
      if (event.latitude === null || event.longitude === null) {
        throw ApiError.badRequest(
          `Event "${event.event_name}" has no latitude/longitude recorded, so a forecast cannot be produced.`,
          { eventId },
          'MISSING_COORDINATES'
        );
      }

      latitude = normaliseCoord(event.latitude, -90, 90);
      longitude = normaliseCoord(event.longitude, -180, 180);
      locationLabel = [event.event_venue, event.event_city].filter(Boolean).join(', ') || event.event_name;
    } else {
      latitude = normaliseCoord(req.query.latitude, -90, 90);
      longitude = normaliseCoord(req.query.longitude, -180, 180);
      if (latitude === null || longitude === null) {
        throw ApiError.badRequest(
          'Supply either ?eventId=<id> or both ?latitude=<num>&longitude=<num>.'
        );
      }
    }

    const cacheKey = `${latitude},${longitude}`;
    const hit = cache.get(cacheKey);
    if (hit && hit.expires > Date.now()) {
      return res.json({ success: true, cached: true, ...hit.payload });
    }

    const url = new URL(OPEN_METEO_URL);
    url.searchParams.set('latitude', latitude);
    url.searchParams.set('longitude', longitude);
    url.searchParams.set(
      'daily',
      'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max'
    );
    url.searchParams.set('timezone', TIMEZONE);
    url.searchParams.set('forecast_days', String(FORECAST_DAYS));

    let upstream;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      upstream = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
    } catch (err) {
      throw new ApiError(
        502,
        'The weather service could not be reached. Please try again in a moment.',
        null,
        'WEATHER_UPSTREAM_UNREACHABLE'
      );
    }

    if (!upstream.ok) {
      throw new ApiError(
        502,
        `The weather service returned an error (HTTP ${upstream.status}).`,
        null,
        'WEATHER_UPSTREAM_ERROR'
      );
    }

    const raw = await upstream.json();
    const daily = raw.daily || {};
    const dates = daily.time || [];

    const forecast = dates.map((date, i) => {
      const info = describeWeatherCode(daily.weather_code?.[i]);
      return {
        date,
        day: new Date(`${date}T00:00:00`).toLocaleDateString('en-AU', { weekday: 'short' }),
        weatherCode: daily.weather_code?.[i] ?? null,
        description: info.description,
        icon: info.icon,
        tempMax: daily.temperature_2m_max?.[i] ?? null,
        tempMin: daily.temperature_2m_min?.[i] ?? null,
        rainChance: daily.precipitation_probability_max?.[i] ?? null,
        windMax: daily.wind_speed_10m_max?.[i] ?? null
      };
    });

    const payload = {
      location: { label: locationLabel, latitude, longitude, timezone: TIMEZONE },
      eventId,
      units: { temperature: '°C', wind: 'km/h', precipitation: '%' },
      source: 'Open-Meteo (https://open-meteo.com)',
      forecast
    };

    cache.set(cacheKey, { expires: Date.now() + CACHE_TTL_MS, payload });

    res.json({ success: true, cached: false, ...payload });
  })
);

module.exports = router;
