/**
 * core/services/registration-admin.service.ts
 * ---------------------------------------------------------------------
 * Admin-only operations on the registrations resource.
 *
 *   GET    /api/registrations            list every booking
 *   GET    /api/registrations?eventId=x  list one event's bookings
 *   DELETE /api/registrations/:id        cancel a booking
 *
 * Cancelling a registration is what makes the "delete an event" path
 * reachable for an event that previously had bookings, so it is a
 * genuinely useful part of the console even though the brief only lists
 * it as optional.
 */

import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { mapApiError } from '../api/api-error';
import { Registration } from '../models/registration.model';

interface RegistrationsResponse {
  success: true;
  count: number;
  data: Registration[];
}

@Injectable({ providedIn: 'root' })
export class RegistrationAdminService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/registrations`;

  getAll(eventId?: number): Observable<Registration[]> {
    return this.http
      .get<RegistrationsResponse>(this.baseUrl, {
        params: eventId ? { eventId: String(eventId) } : {}
      })
      .pipe(map((res) => res.data), catchError(mapApiError));
  }

  cancel(registrationId: number): Observable<{ registration_id: number }> {
    return this.http
      .delete<{ success: true; message: string; data: { registration_id: number } }>(
        `${this.baseUrl}/${registrationId}`
      )
      .pipe(map((res) => res.data), catchError(mapApiError));
  }
}
