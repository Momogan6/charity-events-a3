/**
 * core/services/weather.service.ts
 * ---------------------------------------------------------------------
 * Optional external API integration (Part 6 of the Assessment Brief).
 *
 * The Angular app never calls api.open-meteo.com directly. It calls OUR
 * endpoint, which:
 *   - looks up the event's latitude/longitude in MySQL,
 *   - requests the forecast from Open-Meteo with an explicit
 *     Australia/Sydney timezone,
 *   - translates the numeric WMO weather codes into readable text,
 *   - caches the response for 10 minutes.
 * That keeps the browser free of CORS problems and of provider details.
 */

import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { mapApiError } from '../api/api-error';
import { WeatherForecast } from '../models/weather.model';

type WeatherResponse = { success: true } & WeatherForecast;

@Injectable({ providedIn: 'root' })
export class WeatherService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/weather`;

  /** Forecast for the location of a stored event. */
  forEvent(eventId: number): Observable<WeatherForecast> {
    return this.http
      .get<WeatherResponse>(this.baseUrl, { params: { eventId: String(eventId) } })
      .pipe(map((res) => res as WeatherForecast), catchError(mapApiError));
  }

  /** Forecast for an arbitrary coordinate (used on the home page). */
  forCoordinates(latitude: number, longitude: number): Observable<WeatherForecast> {
    return this.http
      .get<WeatherResponse>(this.baseUrl, {
        params: { latitude: String(latitude), longitude: String(longitude) }
      })
      .pipe(map((res) => res as WeatherForecast), catchError(mapApiError));
  }
}
