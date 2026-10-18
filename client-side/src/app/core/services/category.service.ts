/**
 * core/services/category.service.ts
 * ---------------------------------------------------------------------
 * Loads the event categories used by the search page and the home page.
 */

import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { mapApiError } from '../api/api-error';
import { Category } from '../models/category.model';

interface CategoriesResponse {
  success: true;
  count: number;
  data: Category[];
}

@Injectable({ providedIn: 'root' })
export class CategoryService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/categories`;

  getAll(): Observable<Category[]> {
    return this.http
      .get<CategoriesResponse>(this.baseUrl)
      .pipe(map((res) => res.data), catchError(mapApiError));
  }
}
