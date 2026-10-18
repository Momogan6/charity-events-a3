/**
 * core/services/registration.service.ts
 * ---------------------------------------------------------------------
 * The NEW capability for Assessment 3: a web user booking tickets for a
 * charity event. The API enforces "one registration per email, per
 * event" and returns HTTP 409 with a readable message when that rule is
 * broken - the component shows that message to the user.
 */

import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { mapApiError } from '../api/api-error';
import { Registration, RegistrationWriteModel } from '../models/registration.model';

interface RegistrationResponse {
  success: true;
  message: string;
  data: Registration;
}

@Injectable({ providedIn: 'root' })
export class RegistrationService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/registrations`;

  /**
   * Creates a booking. On success the API answers 201 Created with the
   * stored row (including its generated id and registration_date).
   */
  create(payload: RegistrationWriteModel): Observable<Registration> {
    return this.http
      .post<RegistrationResponse>(this.baseUrl, payload)
      .pipe(map((res) => res.data), catchError(mapApiError));
  }

  /** All bookings for one event, newest first. */
  getByEvent(eventId: number): Observable<Registration[]> {
    return this.http
      .get<{ success: true; count: number; data: Registration[] }>(this.baseUrl, {
        params: { eventId: String(eventId) }
      })
      .pipe(map((res) => res.data), catchError(mapApiError));
  }
}
