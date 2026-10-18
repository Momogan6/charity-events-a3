/**
 * core/models/weather.model.ts
 * ---------------------------------------------------------------------
 * Shape of the response from our own `/api/weather` endpoint, which in
 * turn proxies the external Open-Meteo API. The server has already
 * translated the raw WMO weather codes into readable descriptions, so
 * the front-end only has to render them.
 */

export interface WeatherDay {
  date: string;
  day: string;
  weatherCode: number | null;
  description: string;
  icon: string;
  tempMax: number | null;
  tempMin: number | null;
  rainChance: number | null;
  windMax: number | null;
}

export interface WeatherForecast {
  location: {
    label: string | null;
    latitude: string;
    longitude: string;
    timezone: string;
  };
  eventId: number | null;
  units: { temperature: string; wind: string; precipitation: string };
  source: string;
  forecast: WeatherDay[];
  cached: boolean;
}
