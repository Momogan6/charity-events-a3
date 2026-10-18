/**
 * core/services/event-admin.service.ts
 * ---------------------------------------------------------------------
 * The WRITE side of the events resource - the part of Assessment 3 that
 * only the admin website is allowed to touch (Part 2 "New APIs for event
 * data manipulation" and Part 4 "Admin-side website development").
 *
 *   POST   /api/events         createEvent()
 *   PUT    /api/events/:id     updateEvent()
 *   DELETE /api/events/:id     deleteEvent()
 *
 * The read operations are inherited from the shared EventService so that
 * the two websites cannot drift apart. Errors are translated by
 * `mapApiError`, which preserves per-field messages (HTTP 400) and rule
 * conflicts (HTTP 409 - e.g. "cannot delete, registrations exist").
 */

import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { mapApiError } from '../api/api-error';
import { CharityEvent, EventWriteModel } from '../models/charity-event.model';

interface EventResponse {
  success: true;
  message: string;
  data: CharityEvent;
}

interface DeleteResponse {
  success: true;
  message: string;
  data: { event_id: number };
}

@Injectable({ providedIn: 'root' })
export class EventAdminService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/events`;

  /** Creates a new charity event. Expects HTTP 201 from the API. */
  createEvent(payload: EventWriteModel): Observable<CharityEvent> {
    return this.http
      .post<EventResponse>(this.baseUrl, payload)
      .pipe(map((res) => res.data), catchError(mapApiError));
  }

  /**
   * Updates an existing event.
   * The API validates only the fields that were supplied, so a partial
   * payload is safe, but the admin form always sends the full model.
   */
  updateEvent(eventId: number, payload: EventWriteModel): Observable<CharityEvent> {
    return this.http
      .put<EventResponse>(`${this.baseUrl}/${eventId}`, payload)
      .pipe(map((res) => res.data), catchError(mapApiError));
  }

  /**
   * Deletes an event.
   * The API answers HTTP 409 (with a readable message) whenever the event
   * still has registrations, and `mapApiError` turns that into an
   * ApiClientError the UI can display.
   */
  deleteEvent(eventId: number): Observable<{ event_id: number }> {
    return this.http
      .delete<DeleteResponse>(`${this.baseUrl}/${eventId}`)
      .pipe(map((res) => res.data), catchError(mapApiError));
  }
}
