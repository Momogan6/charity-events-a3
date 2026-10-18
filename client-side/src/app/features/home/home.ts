import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { ApiClientError } from '../../core/api/api-error';
import { Category } from '../../core/models/category.model';
import { CharityEvent } from '../../core/models/charity-event.model';
import { WeatherForecast } from '../../core/models/weather.model';
import { CategoryService } from '../../core/services/category.service';
import { EventService } from '../../core/services/event.service';
import { WeatherService } from '../../core/services/weather.service';
import { EventCard } from '../../shared/event-card/event-card';
import { formatDate } from '../../core/utils/format.util';

/**
 * features/home/home.ts
 * ---------------------------------------------------------------------
 * Landing page. It combines three API sources into one screen:
 *
 *   1. GET /api/events            -> the next few upcoming events
 *   2. GET /api/categories        -> the category drop-down + impact stats
 *   3. GET /api/weather            -> external Open-Meteo forecast for the
 *                                    region (optional Part 6 feature)
 *
 * The class uses Angular 22 SIGNALS for all view state. Because the app
 * is bootstrapped ZONELESS, a signal write is what tells the framework to
 * re-render - there is no zone.js patching underneath any more.
 */
@Component({
  selector: 'app-home',
  imports: [ReactiveFormsModule, RouterLink, EventCard],
  templateUrl: './home.html',
  styleUrl: './home.css'
})
export class Home implements OnInit {
  private readonly eventService = inject(EventService);
  private readonly categoryService = inject(CategoryService);
  private readonly weatherService = inject(WeatherService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  /* ---------------- view state ---------------- */
  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly upcoming = signal<CharityEvent[]>([]);
  protected readonly categories = signal<Category[]>([]);
  protected readonly totalEvents = signal(0);
  protected readonly totalTickets = signal(0);
  protected readonly weather = signal<WeatherForecast | null>(null);
  protected readonly weatherError = signal<string | null>(null);

  /** Default forecast location for the home page (Lismore, NSW). */
  private readonly defaultLocation = { latitude: -28.8133, longitude: 153.2778 };

  /* ---------------- quick search form ---------------- */
  protected readonly quickSearchForm = this.fb.nonNullable.group({
    search: ['', [Validators.minLength(2)]],
    categoryId: ['']
  });

  protected readonly quickSearchError = computed(() => {
    const control = this.quickSearchForm.controls.search;
    if (control.value && control.value.trim().length === 1) {
      return 'Please type at least 2 characters to search.';
    }
    return null;
  });

  protected readonly nextEventDate = computed(() => {
    const [first] = this.upcoming();
    return first ? formatDate(first.event_date) : null;
  });

  /* ---------------- lifecycle ---------------- */
  async ngOnInit(): Promise<void> {
    await Promise.all([this.loadEvents(), this.loadCategories(), this.loadWeather()]);
    this.loading.set(false);
  }

  /* ---------------- data loading ---------------- */

  /**
   * Loads events that are still open for registration, soonest first.
   * Note the use of `status=Active` rather than filtering in the browser:
   * the filtering is done by MySQL, so the page never downloads rows it
   * will not display.
   */
  private async loadEvents(): Promise<void> {
    try {
      const result = await firstValueFrom(
        this.eventService.search({ status: 'Active', sort: 'date', order: 'asc' })
      );

      this.upcoming.set(result.events.slice(0, 6));
      this.totalEvents.set(result.total);
      this.totalTickets.set(result.events.reduce((sum, e) => sum + Number(e.tickets_sold ?? 0), 0));
    } catch (error) {
      this.errorMessage.set(
        error instanceof ApiClientError ? error.message : 'Unable to load events right now.'
      );
    }
  }

  private async loadCategories(): Promise<void> {
    try {
      this.categories.set(await firstValueFrom(this.categoryService.getAll()));
    } catch {
      /* The category list is a nice-to-have on this page - fail silently. */
    }
  }

  private async loadWeather(): Promise<void> {
    try {
      this.weather.set(
        await firstValueFrom(
          this.weatherService.forCoordinates(this.defaultLocation.latitude, this.defaultLocation.longitude)
        )
      );
    } catch (error) {
      this.weatherError.set(
        error instanceof ApiClientError ? error.message : 'Weather forecast is unavailable.'
      );
    }
  }

  /* ---------------- actions ---------------- */

  /**
   * Sends the hero search form to /events, passing the criteria as URL
   * QUERY STRINGS. This makes the result page bookmarkable and lets the
   * search page rebuild exactly the same query from the URL.
   */
  protected onQuickSearch(): void {
    const { search, categoryId } = this.quickSearchForm.getRawValue();
    if (search && search.trim().length === 1) {
      this.quickSearchForm.controls.search.markAsTouched();
      return;
    }

    this.router.navigate(['/events'], {
      queryParams: {
        search: search?.trim() || null,
        categoryId: categoryId || null
      }
    });
  }

  protected retry(): void {
    this.loading.set(true);
    this.errorMessage.set(null);
    this.ngOnInit();
  }
}
