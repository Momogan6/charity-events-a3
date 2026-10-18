import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { ApiClientError } from '../../core/api/api-error';
import { Category } from '../../core/models/category.model';
import { CharityEvent, EventRegistration, EventStatus } from '../../core/models/charity-event.model';
import { CategoryService } from '../../core/services/category.service';
import { EventAdminService } from '../../core/services/event-admin.service';
import { EventService } from '../../core/services/event.service';
import { formatDate, formatDateTime, formatMoney, formatPrice, statusClass } from '../../core/utils/format.util';

type FieldName =
  | 'event_name'
  | 'category_id'
  | 'event_description'
  | 'event_venue'
  | 'event_city'
  | 'latitude'
  | 'longitude'
  | 'event_date'
  | 'event_time'
  | 'event_status'
  | 'event_capacity'
  | 'ticket_price';

/**
 * features/event-form/event-form.ts
 * ---------------------------------------------------------------------
 * ONE component, TWO console pages, selected by the route's `data.mode`:
 *
 *   /events/new         mode = 'create'  -> the admin "New" feature
 *   /events/:id/edit    mode = 'edit'    -> the admin "Update" feature
 *
 * Sharing the component guarantees that the validation rules and the
 * field layout can never drift apart between creating and editing.
 *
 * UPDATE MODE EXTRAS (explicit brief requirement)
 *   As well as loading the event into the form, it calls
 *   GET /api/events/:id/registrations and renders the full registration
 *   list for that event, so staff can see who has already booked before
 *   they change the capacity, price or status.
 */
@Component({
  selector: 'app-event-form',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './event-form.html',
  styleUrl: './event-form.css'
})
export class EventFormPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly eventService = inject(EventService);
  private readonly eventAdminService = inject(EventAdminService);
  private readonly categoryService = inject(CategoryService);

  /* ---------------- mode ---------------- */
  protected readonly mode = signal<'create' | 'edit'>('create');
  protected readonly eventId = signal<number | null>(null);
  protected get isEdit(): boolean {
    return this.mode() === 'edit';
  }

  protected readonly statuses: EventStatus[] = ['Active', 'Past', 'Suspended'];

  /* ---------------- state ---------------- */
  protected readonly categories = signal<Category[]>([]);
  protected readonly event = signal<CharityEvent | null>(null);
  protected readonly registrations = signal<EventRegistration[]>([]);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly serverError = signal<string | null>(null);
  protected readonly serverFieldErrors = signal<Record<string, string>>({});
  protected readonly submitAttempted = signal(false);
  protected readonly successMessage = signal<string | null>(null);

  /** Number of tickets already sold - the capacity may never drop below it. */
  protected readonly ticketsSold = computed(() => {
    const e = this.event();
    if (e) return Number(e.tickets_sold);
    return this.registrations().reduce((sum, r) => sum + Number(r.tickets_purchased), 0);
  });

  protected readonly minimumCapacity = computed(() => this.ticketsSold());

  /* ---------------- form ---------------- */
  protected readonly form = this.fb.nonNullable.group({
    event_name: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(150)]],
    category_id: ['', [Validators.required]],
    event_description: ['', [Validators.maxLength(5000)]],
    event_venue: ['', [Validators.maxLength(200)]],
    event_city: ['', [Validators.maxLength(80)]],
    latitude: [''],
    longitude: [''],
    event_date: ['', [Validators.required]],
    event_time: [''],
    event_status: ['Active' as EventStatus, [Validators.required]],
    event_capacity: ['', [Validators.required, Validators.min(0)]],
    ticket_price: ['', [Validators.required, Validators.min(0)]]
  });

  /* ---------------- formatting exposed to the template ---------------- */
  protected readonly fmtDate = formatDate;
  protected readonly fmtDateTime = formatDateTime;
  protected readonly fmtPrice = formatPrice;
  protected readonly fmtMoney = formatMoney;
  protected readonly statusClass = statusClass;

  /* ---------------- lifecycle ---------------- */
  async ngOnInit(): Promise<void> {
    const configuredMode = this.route.snapshot.data['mode'] as 'create' | 'edit' | undefined;

    // `paramMap.get('id')` returns null for /events/new, and Number(null)
    // is 0 — so the id must be guarded explicitly rather than coerced
    // straight away, otherwise the create page would look like edit mode.
    const idParam = this.route.snapshot.paramMap.get('id');
    const paramId = idParam !== null ? Number(idParam) : Number.NaN;
    const hasValidId = Number.isInteger(paramId) && paramId > 0;

    this.mode.set(configuredMode === 'edit' && hasValidId ? 'edit' : 'create');
    const arrivedFromCreate = this.route.snapshot.queryParamMap.get('created') === '1';

    await this.loadCategories();

    if (this.isEdit && hasValidId) {
      this.eventId.set(paramId);
      await this.loadEvent(paramId);
      if (arrivedFromCreate) {
        this.successMessage.set(`The new event was created successfully (event ID ${paramId}).`);
      }
    }
  }

  private async loadCategories(): Promise<void> {
    try {
      this.categories.set(await firstValueFrom(this.categoryService.getAll()));
    } catch (error) {
      this.serverError.set(
        error instanceof ApiClientError ? error.message : 'Categories could not be loaded.'
      );
    }
  }

  private async loadEvent(eventId: number): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const event = await firstValueFrom(this.eventService.getById(eventId));
      this.event.set(event);

      this.form.patchValue({
        event_name: event.event_name,
        category_id: String(event.category_id),
        event_description: event.event_description ?? '',
        event_venue: event.event_venue ?? '',
        event_city: event.event_city ?? '',
        latitude: event.latitude !== null ? String(event.latitude) : '',
        longitude: event.longitude !== null ? String(event.longitude) : '',
        event_date: event.event_date,
        event_time: event.event_time ? event.event_time.slice(0, 5) : '',
        event_status: event.event_status,
        event_capacity: String(event.event_capacity),
        ticket_price: String(event.ticket_price)
      });

      this.registrations.set(event.registrations ?? []);
    } catch (error) {
      this.loadError.set(
        error instanceof ApiClientError ? error.message : 'The event could not be loaded.'
      );
    } finally {
      this.loading.set(false);
    }
  }

  /* ---------------- validation helpers ---------------- */

  protected showError(field: FieldName): boolean {
    const control = this.form.controls[field];
    return control.invalid && (control.touched || this.submitAttempted());
  }

  protected errorFor(field: FieldName): string | null {
    const serverMessage = this.serverFieldErrors()[field];
    if (serverMessage) return serverMessage;

    const errors = this.form.controls[field].errors;
    if (!errors) return null;

    if (errors['required']) {
      if (field === 'event_capacity') return 'Capacity is required (enter 0 if unlimited).';
      return 'This field is required.';
    }
    if (errors['minlength']) return `Please enter at least ${errors['minlength'].requiredLength} characters.`;
    if (errors['maxlength']) return `Please use no more than ${errors['maxlength'].requiredLength} characters.`;
    if (errors['min']) return `The minimum value is ${errors['min'].min}.`;
    if (errors['pattern']) return 'Please use a valid number.';
    return 'Please check this field.';
  }

  /** Both coordinates, or neither - the weather API needs the pair. */
  protected readonly coordinatesError = computed(() => {
    const lat = this.form.controls.latitude.value?.trim();
    const lng = this.form.controls.longitude.value?.trim();
    if (!!lat !== !!lng) {
      return 'Provide both latitude and longitude, or leave both empty. The weather forecast needs the pair.';
    }
    return null;
  });

  /** Capacity must not fall below the number of tickets already sold. */
  protected readonly capacityError = computed(() => {
    const raw = this.form.controls.event_capacity.value;
    const capacity = Number(raw);
    if (raw === '' || !Number.isFinite(capacity)) return null;
    if (this.isEdit && capacity < this.ticketsSold()) {
      return `Capacity cannot be lower than the ${this.ticketsSold()} ticket(s) already sold.`;
    }
    return null;
  });

  protected readonly invalidFieldLabels = computed<string[]>(() => {
    const labels: Record<FieldName, string> = {
      event_name: 'Event name',
      category_id: 'Category',
      event_description: 'Description',
      event_venue: 'Venue',
      event_city: 'City',
      latitude: 'Latitude',
      longitude: 'Longitude',
      event_date: 'Event date',
      event_time: 'Event time',
      event_status: 'Status',
      event_capacity: 'Capacity',
      ticket_price: 'Ticket price'
    };
    return (Object.keys(this.form.controls) as FieldName[])
      .filter((name) => this.form.controls[name].invalid)
      .map((name) => labels[name]);
  });

  /* ---------------- submission ---------------- */

  /**
   * Builds the payload, dropping empty optional strings so the API stores
   * NULL rather than an empty string.
   */
  private buildPayload() {
    const raw = this.form.getRawValue();
    const optional = (value: string): string | null => (value.trim() === '' ? null : value.trim());
    const optionalNumber = (value: string): number | null => {
      const trimmed = value.trim();
      return trimmed === '' ? null : Number(trimmed);
    };

    return {
      event_name: raw.event_name.trim(),
      category_id: Number(raw.category_id),
      event_description: optional(raw.event_description),
      event_venue: optional(raw.event_venue),
      event_city: optional(raw.event_city),
      latitude: optionalNumber(raw.latitude),
      longitude: optionalNumber(raw.longitude),
      event_date: raw.event_date,
      event_time: raw.event_time ? `${raw.event_time}:00`.slice(0, 8) : null,
      event_status: raw.event_status,
      event_capacity: Number(raw.event_capacity),
      ticket_price: Number(raw.ticket_price)
    };
  }

  protected async onSubmit(): Promise<void> {
    this.submitAttempted.set(true);
    this.serverError.set(null);
    this.serverFieldErrors.set({});
    this.successMessage.set(null);

    if (this.coordinatesError() || this.capacityError()) {
      this.form.markAllAsTouched();
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    try {
      const payload = this.buildPayload();

      if (this.isEdit) {
        const id = this.eventId();
        if (id === null) throw new ApiClientError(400, 'MISSING_ID', 'No event id was supplied.');
        const updated = await firstValueFrom(this.eventAdminService.updateEvent(id, payload));
        this.event.set(updated);
        this.registrations.set(updated.registrations ?? []);
        this.successMessage.set(`"${updated.event_name}" was updated successfully.`);
      } else {
        const created = await firstValueFrom(this.eventAdminService.createEvent(payload));

        // Navigate to the edit page of the event just created. The
        // confirmation is handed over as a query parameter rather than a
        // signal, because this component instance is destroyed by the
        // navigation and a fresh one is created for the edit route.
        await this.router.navigate(['/events', created.event_id, 'edit'], {
          queryParams: { created: '1' }
        });
        return;
      }

      this.submitAttempted.set(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      if (error instanceof ApiClientError) {
        this.serverError.set(error.message);
        this.serverFieldErrors.set(error.fieldErrors);
        for (const field of Object.keys(error.fieldErrors)) {
          this.form.get(field)?.markAsTouched();
        }
      } else {
        this.serverError.set('The event could not be saved. Please try again.');
      }
    } finally {
      this.saving.set(false);
    }
  }

  protected resetToLoadedValues(): void {
    const event = this.event();
    if (!event) return;
    this.form.reset({
      event_name: event.event_name,
      category_id: String(event.category_id),
      event_description: event.event_description ?? '',
      event_venue: event.event_venue ?? '',
      event_city: event.event_city ?? '',
      latitude: event.latitude !== null ? String(event.latitude) : '',
      longitude: event.longitude !== null ? String(event.longitude) : '',
      event_date: event.event_date,
      event_time: event.event_time ? event.event_time.slice(0, 5) : '',
      event_status: event.event_status,
      event_capacity: String(event.event_capacity),
      ticket_price: String(event.ticket_price)
    });
    this.submitAttempted.set(false);
    this.serverError.set(null);
    this.serverFieldErrors.set({});
  }

  protected async reload(): Promise<void> {
    const id = this.eventId();
    if (id !== null) await this.loadEvent(id);
  }
}
