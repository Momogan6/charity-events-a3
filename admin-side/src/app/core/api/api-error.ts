/**
 * core/api/api-error.ts
 * ---------------------------------------------------------------------
 * The API always answers with the same error envelope:
 *
 *   { "success": false,
 *     "error": { "code": "...", "message": "...", "details": { ... } } }
 *
 * `ApiClientError` normalises that (plus transport failures such as
 * "the server is not running") into one predictable object that every
 * component can render, and exposes `fieldErrors` so form inputs can be
 * highlighted individually.
 */

import { HttpErrorResponse } from '@angular/common/http';

export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: Record<string, string> | null = null
  ) {
    super(message);
    this.name = 'ApiClientError';
  }

  /** Per-field validation messages keyed by form control name. */
  get fieldErrors(): Record<string, string> {
    return this.details ?? {};
  }

  /** True when the operation failed because of a rule conflict (409). */
  get isConflict(): boolean {
    return this.status === 409;
  }
}

/**
 * Converts anything thrown by HttpClient into an ApiClientError.
 * Used as the RxJS `catchError` operator in every service method.
 */
export function mapApiError(error: unknown): never {
  if (error instanceof ApiClientError) {
    throw error;
  }

  if (error instanceof HttpErrorResponse) {
    // status 0 => network/CORS failure or the API is simply not running.
    if (error.status === 0) {
      throw new ApiClientError(
        0,
        'NETWORK_ERROR',
        'Could not reach the Charity Events API. Please check that the backend server is running and try again.'
      );
    }

    const body = error.error as
      | { error?: { code?: string; message?: string; details?: Record<string, string> } }
      | null;

    throw new ApiClientError(
      error.status,
      body?.error?.code ?? 'HTTP_ERROR',
      body?.error?.message ?? error.message ?? 'An unexpected error occurred.',
      body?.error?.details ?? null
    );
  }

  throw new ApiClientError(0, 'UNKNOWN_ERROR', (error as Error)?.message ?? 'An unexpected error occurred.');
}
