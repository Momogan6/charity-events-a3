import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { ApiClientError } from '../../core/api/api-error';
import { CharityEvent, EventRegistration } from '../../core/models/charity-event.model';
import { WeatherForecast } from '../../core/models/weather.model';
import { EventService } from '../../core/services/event.service';
import { WeatherService } from '../../core/services/weather.service';
import {
  formatDate,
  formatDateTime,
  formatMoney,
  formatPrice,
  formatTime,
  percentSold,
  statusClass
} from '../../core/utils/format.util';

/**
 * features/event-details/event-details.ts
 * ---------------------------------------------------------------------
 * ENHANCED in Assessment 3 (requirement 3 / "Event detail page").
 *
 * What changed compared with the Assessment 2 version:
 *   - It now calls the UPGRADED endpoint GET /api/events/:id, which
 *     returns the event AND its complete registration list.
 *   - The registration list is rendered in a table, newest booking first
 *     (the ordering is performed by MySQL via ORDER BY registration_date
 *     DESC, so the correct rows are always first even with pagination).
 *   - The "Register" button no longer dead-ends: it navigates to the new
 *     Event Registration Page and passes the event id as a URL query
 *     string (?eventId=...), which the registration page reads back.
 *   - BONUS: the Open-Meteo forecast for the event's own venue
 *     coordinates is displayed, demonstrating a second live API.
 */
@Component({
  selector: 'app-event-details',
  imports: [RouterLink],
  templateUrl: './event-details.html',
  styleUrl: './event-details.css'
})
export class EventDetails implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly eventService = inject(EventService);
  private readonly weatherService = inject(WeatherService);

  /* ---------------- state ---------------- */
  protected readonly event = signal<CharityEvent | null>(null);
  protected readonly registrations = signal<EventRegistration[]>([]);
  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly notFound = signal(false);
  protected readonly weather = signal<WeatherForecast | null>(null);
  protected readonly weatherError = signal<string | null>(null);

  /* ---------------- derived values ---------------- */
  protected readonly statusClass = computed(() => statusClass(this.event()?.event_status));
  protected readonly progress = computed(() => {
    const e = this.event();
    return e ? percentSold(e.tickets_sold, e.event_capacity) : 0;
  });
  protected readonly canRegister = computed(() => {
    const e = this.event();
    return !!e && e.event_status === 'Active' && e.seats_remaining > 0;
  });
  protected readonly registerBlockedReason = computed(() => {
    const e = this.event();
    if (!e) return null;
    if (e.event_status !== 'Active') return `Registration is closed because this event is ${e.event_status}.`;
    if (e.seats_remaining <= 0) return 'This event is fully booked.';
    return null;
  });
  protected readonly totalTickets = computed(() =>
    this.registrations().reduce((sum, r) => sum + Number(r.tickets_purchased), 0)
  );
  protected readonly revenue = computed(() =>
    this.registrations().reduce((sum, r) => sum + Number(r.total_amount ?? 0), 0)
  );

  /* ---------------- formatting helpers exposed to the template ---------------- */
  protected readonly fmtDate = formatDate;
  protected readonly fmtTime = formatTime;
  protected readonly fmtDateTime = formatDateTime;
  protected readonly fmtPrice = formatPrice;
  protected readonly fmtMoney = formatMoney;

  /* ---------------- lifecycle ---------------- */
  ngOnInit(): void {
    // A subscription rather than a snapshot, so navigating from one event
    // straight to another reloads the page content correctly.
    this.route.paramMap.subscribe((params) => {
      const id = Number(params.get('id'));
      if (!Number.isInteger(id) || id <= 0) {
        this.notFound.set(true);
        this.loading.set(false);
        return;
      }
      void this.load(id);
    });
  }

  private async load(eventId: number): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set(null);
    this.notFound.set(false);
    this.weather.set(null);
    this.weatherError.set(null);

    try {
      // ONE request returns the event plus its registrations, because the
      // API now joins the two resources for exactly this page.
      const event = await firstValueFrom(this.eventService.getById(eventId));
      this.event.set(event);
      this.registrations.set(event.registrations ?? []);
      this.loading.set(false);

      // Weather is a secondary, optional feature - load it afterwards so a
      // weather outage can never stop the event from rendering.
      void this.loadWeather(eventId);
    } catch (error) {
      this.loading.set(false);
      if (error instanceof ApiClientError && error.status === 404) {
        this.notFound.set(true);
      } else {
        this.errorMessage.set(
          error instanceof ApiClientError ? error.message : 'The event could not be loaded.'
        );
      }
    }
  }

  private async loadWeather(eventId: number): Promise<void> {
    try {
      this.weather.set(await firstValueFrom(this.weatherService.forEvent(eventId)));
    } catch (error) {
      this.weatherError.set(
        error instanceof ApiClientError ? error.message : 'Forecast unavailable for this event.'
      );
    }
  }

  /* ---------------- actions ---------------- */

  /**
   * Navigates to the registration page, passing the event id in the URL
   * query string as suggested by the assessment brief.
   */
  protected goToRegistration(): void {
    const e = this.event();
    if (!e || !this.canRegister()) return;
    void this.router.navigate(['/register'], { queryParams: { eventId: e.event_id } });
  }
}
