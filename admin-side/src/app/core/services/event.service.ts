/**
 * core/services/event.service.ts
 * ---------------------------------------------------------------------
 * Everything the client-side website needs to know about charity events.
 * All methods return cold Observables; components decide whether to
 * `subscribe` or to `await firstValueFrom(...)`.
 *
 * Endpoints consumed:
 *   GET    /api/events            (search + filter + sort)
 *   GET    /api/events/:id        (details INCLUDING the registration list)
 *   GET    /api/events/:id/registrations
 */

import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { mapApiError } from '../api/api-error';
import {
  CharityEvent,
  EventFilters,
  EventRegistration,
  EventSearchResult
} from '../models/charity-event.model';

interface EventsListResponse {
  success: true;
  count: number;
  total: number;
  data: CharityEvent[];
}

interface EventResponse {
  success: true;
  data: CharityEvent;
}

interface RegistrationsResponse {
  success: true;
  count: number;
  data: EventRegistration[];
}

@Injectable({ providedIn: 'root' })
export class EventService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/events`;

  /**
   * Searches / browses the event collection.
   * Every filter is optional; an empty object returns everything the
   * caller is allowed to see, ordered by date.
   */
  search(filters: EventFilters = {}): Observable<EventSearchResult> {
    return this.http
      .get<EventsListResponse>(this.baseUrl, { params: this.toParams(filters) })
      .pipe(
        map((res) => ({ events: res.data, count: res.count, total: res.total })),
        catchError(mapApiError)
      );
  }

  /** Single event, including the complete sorted registration list. */
  getById(eventId: number): Observable<CharityEvent> {
    return this.http
      .get<EventResponse>(`${this.baseUrl}/${eventId}`)
      .pipe(map((res) => res.data), catchError(mapApiError));
  }

  /** Convenience wrapper used by the admin "update" screen. */
  getRegistrations(eventId: number): Observable<EventRegistration[]> {
    return this.http
      .get<RegistrationsResponse>(`${this.baseUrl}/${eventId}/registrations`)
      .pipe(map((res) => res.data), catchError(mapApiError));
  }

  /** Builds the HttpParams object, skipping empty filters. */
  private toParams(filters: EventFilters): HttpParams {
    let params = new HttpParams();

    const setIfPresent = (key: string, value: unknown): void => {
      if (value === undefined || value === null || value === '') return;
      params = params.set(key, String(value));
    };

    setIfPresent('search', filters.search?.trim());
    setIfPresent('categoryId', filters.categoryId);
    setIfPresent('status', filters.status);
    setIfPresent('city', filters.city?.trim());
    setIfPresent('from', filters.from);
    setIfPresent('to', filters.to);
    setIfPresent('sort', filters.sort);
    setIfPresent('order', filters.order);
    setIfPresent('limit', filters.limit);
    setIfPresent('offset', filters.offset);

    return params;
  }
}
