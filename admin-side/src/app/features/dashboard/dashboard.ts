import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { ApiClientError } from '../../core/api/api-error';
import { Category } from '../../core/models/category.model';
import { CharityEvent, EventStatus } from '../../core/models/charity-event.model';
import { CategoryService } from '../../core/services/category.service';
import { EventAdminService } from '../../core/services/event-admin.service';
import { EventService } from '../../core/services/event.service';
import { formatDate, formatMoney, formatPrice, statusClass } from '../../core/utils/format.util';

interface Feedback {
  type: 'success' | 'error';
  title: string;
  message: string;
}

/**
 * features/dashboard/dashboard.ts
 * ---------------------------------------------------------------------
 * The admin "List" + "Delete" features of Part 4.
 *
 * LIST
 *   Calls GET /api/events WITHOUT a status filter, so every event is
 *   returned regardless of whether it is Active, Past or Suspended - an
 *   explicit requirement of the brief. The table shows the key details
 *   staff need plus the aggregate figures (tickets sold, seats left,
 *   registration count) that the API computes with a GROUP BY join.
 *
 * DELETE
 *   A destructive action is never fired straight from a click. The row's
 *   Delete button only records the event in a `pendingDelete` signal,
 *   which renders an inline confirmation block; only "Yes, delete"
 *   actually calls DELETE /api/events/:id. If the event still has
 *   registrations the API answers HTTP 409 and the exact server message
 *   is displayed, satisfying the brief's requirement for clear feedback
 *   when a deletion is blocked.
 */
@Component({
  selector: 'app-dashboard',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css'
})
export class Dashboard implements OnInit {
  private readonly eventService = inject(EventService);
  private readonly eventAdminService = inject(EventAdminService);
  private readonly categoryService = inject(CategoryService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  /* ---------------- state ---------------- */
  protected readonly events = signal<CharityEvent[]>([]);
  protected readonly categories = signal<Category[]>([]);
  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly feedback = signal<Feedback | null>(null);
  protected readonly pendingDelete = signal<CharityEvent | null>(null);
  protected readonly deleting = signal(false);

  /* ---------------- toolbar ---------------- */
  protected readonly filters = this.fb.nonNullable.group({
    search: [''],
    status: [''],
    categoryId: [''],
    sort: ['date'],
    order: ['asc']
  });

  /* ---------------- KPIs ---------------- */
  protected readonly kpi = computed(() => {
    const all = this.events();
    const sum = (list: CharityEvent[], pick: (e: CharityEvent) => number): number =>
      list.reduce((total, e) => total + Number(pick(e)), 0);

    return {
      total: all.length,
      active: all.filter((e) => e.event_status === 'Active').length,
      past: all.filter((e) => e.event_status === 'Past').length,
      suspended: all.filter((e) => e.event_status === 'Suspended').length,
      ticketsSold: sum(all, (e) => e.tickets_sold),
      registrations: sum(all, (e) => e.registration_count),
      revenue: sum(all, (e) => Number(e.tickets_sold) * Number(e.ticket_price))
    };
  });

  protected readonly suspendedWithBookings = computed(() =>
    this.events().filter((e) => e.event_status !== 'Active' && e.registration_count > 0).length
  );

  /* ---------------- formatting exposed to the template ---------------- */
  protected readonly fmtDate = formatDate;
  protected readonly fmtPrice = formatPrice;
  protected readonly fmtMoney = formatMoney;
  protected readonly statusClass = statusClass;

  /* ---------------- lifecycle ---------------- */
  async ngOnInit(): Promise<void> {
    await Promise.all([this.loadCategories(), this.loadEvents()]);
  }

  async loadEvents(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set(null);

    const raw = this.filters.getRawValue();
    const status = raw.status as EventStatus | '';

    try {
      const result = await firstValueFrom(
        this.eventService.search({
          search: raw.search?.trim() || undefined,
          status: status || undefined,
          categoryId: raw.categoryId ? Number(raw.categoryId) : null,
          sort: raw.sort as 'date' | 'name' | 'price' | 'capacity',
          order: raw.order === 'desc' ? 'desc' : 'asc',
          // Ask for one page big enough to cover the whole teaching data set.
          limit: 200
        })
      );
      this.events.set(result.events);
    } catch (error) {
      this.errorMessage.set(
        error instanceof ApiClientError ? error.message : 'The event list could not be loaded.'
      );
    } finally {
      this.loading.set(false);
    }
  }

  private async loadCategories(): Promise<void> {
    try {
      this.categories.set(await firstValueFrom(this.categoryService.getAll()));
    } catch {
      /* Filters degrade gracefully if categories are unavailable. */
    }
  }

  /* ---------------- actions ---------------- */

  protected async applyFilters(): Promise<void> {
    this.feedback.set(null);
    await this.loadEvents();
  }

  protected async clearFilters(): Promise<void> {
    this.filters.reset({ search: '', status: '', categoryId: '', sort: 'date', order: 'asc' });
    await this.loadEvents();
  }

  protected startDelete(event: CharityEvent): void {
    this.feedback.set(null);
    this.pendingDelete.set(event);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  protected cancelDelete(): void {
    this.pendingDelete.set(null);
  }

  /**
   * Confirms and performs the deletion.
   * Note that the decision to allow or block the delete belongs to the
   * API and the database - this method only relays the outcome.
   */
  protected async confirmDelete(): Promise<void> {
    const event = this.pendingDelete();
    if (!event) return;

    this.deleting.set(true);
    try {
      await firstValueFrom(this.eventAdminService.deleteEvent(event.event_id));

      this.events.update((list) => list.filter((e) => e.event_id !== event.event_id));
      this.feedback.set({
        type: 'success',
        title: 'Event deleted',
        message: `"${event.event_name}" (ID ${event.event_id}) was removed from the database.`
      });
    } catch (error) {
      const apiError = error instanceof ApiClientError ? error : null;
      this.feedback.set({
        type: 'error',
        title: apiError?.isConflict ? 'Deletion blocked by data integrity' : 'Deletion failed',
        message:
          apiError?.message ??
          'The event could not be deleted. Please try again or check the API is running.'
      });
    } finally {
      this.deleting.set(false);
      this.pendingDelete.set(null);
    }
  }

  protected goToEdit(event: CharityEvent): void {
    void this.router.navigate(['/events', event.event_id, 'edit']);
  }

  protected dismissFeedback(): void {
    this.feedback.set(null);
  }
}
