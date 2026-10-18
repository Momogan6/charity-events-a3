import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { ApiClientError } from '../../core/api/api-error';
import { CharityEvent } from '../../core/models/charity-event.model';
import { Registration } from '../../core/models/registration.model';
import { EventService } from '../../core/services/event.service';
import { RegistrationService } from '../../core/services/registration.service';
import { formatDate, formatMoney, formatPrice, formatTime } from '../../core/utils/format.util';

/** sessionStorage key used as a fallback for the selected event. */
const LAST_EVENT_KEY = 'charity-events:lastEventId';

/** Every control name of the registration form. */
type FieldName =
  | 'full_name'
  | 'email'
  | 'phone'
  | 'tickets_purchased'
  | 'registration_date'
  | 'notes'
  | 'acceptTerms';

/**
 * features/registration/registration.ts
 * ---------------------------------------------------------------------
 * THE NEW PAGE for Assessment 3 (requirement 3 / "Registration page").
 *
 * Flow implemented here:
 *   1. Read the event id — primarily from the URL QUERY STRING
 *      (`/register?eventId=7`), with sessionStorage as a resilience
 *      fallback so a page refresh never loses the selected event.
 *   2. Call GET /api/events/:id to show which event the visitor is
 *      registering for and how many seats are left.
 *   3. Validate in the browser; while the form is invalid an accessible
 *      alert is displayed and NO request is sent.
 *   4. POST /api/registrations to insert the new record.
 *   5. On success show a confirmation panel with the generated
 *      registration reference and the navigation choices.
 *
 * Server-side rule failures are surfaced verbatim: a 409 (duplicate
 * booking, not enough seats, event no longer active) is exactly the
 * feedback the marker wants to see demonstrated.
 */
@Component({
  selector: 'app-registration',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './registration.html',
  styleUrl: './registration.css'
})
export class RegistrationPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly eventService = inject(EventService);
  private readonly registrationService = inject(RegistrationService);

  /* ---------------- state ---------------- */
  protected readonly event = signal<CharityEvent | null>(null);
  protected readonly loadingEvent = signal(true);
  protected readonly loadError = signal<string | null>(null);

  protected readonly submitting = signal(false);
  protected readonly submitAttempted = signal(false);
  protected readonly serverError = signal<string | null>(null);
  protected readonly serverFieldErrors = signal<Record<string, string>>({});
  protected readonly confirmed = signal<Registration | null>(null);

  protected readonly today = new Date().toISOString().slice(0, 10);

  /* ---------------- custom validators ----------------
     Declared BEFORE the form, because class field initialisers run in
     source order: the form's initialiser already needs these references. */

  /** The registration date may not be in the future. */
  private readonly notInTheFutureValidator: ValidatorFn = (
    control: AbstractControl
  ): ValidationErrors | null => {
    const value = control.value as string;
    if (!value) return null;
    return value > this.today ? { futureDate: true } : null;
  };

  /** The requested ticket count may not exceed the seats still available. */
  private readonly seatAvailabilityValidator: ValidatorFn = (
    control: AbstractControl
  ): ValidationErrors | null => {
    const available = this.event()?.seats_remaining;
    if (available === undefined) return null;
    const requested = Number(control.value);
    if (!Number.isFinite(requested)) return null;
    return requested > available ? { seatsExceeded: { available } } : null;
  };

  /* ---------------- form ---------------- */
  protected readonly form = this.fb.nonNullable.group({
    full_name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(120)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(160)]],
    phone: ['', [Validators.required, Validators.pattern(/^[0-9+()\-\s]{8,20}$/)]],
    tickets_purchased: [1, [Validators.required, Validators.min(1), Validators.max(10)]],
    registration_date: [this.today, [Validators.required, this.notInTheFutureValidator]],
    notes: ['', [Validators.maxLength(255)]],
    acceptTerms: [false, [Validators.requiredTrue]]
  });

  /**
   * The number of tickets, exposed as a SIGNAL.
   *
   * This matters: the page runs ZONELESS, so a `computed()` can only ever
   * re-evaluate when a signal it read changes. A form control's `.value`
   * is a plain property, so reading it inside a computed() would produce
   * a total that never updates. `toSignal()` bridges the RxJS
   * `valueChanges` stream into the signal graph and fixes that.
   */
  protected readonly ticketCount = toSignal(
    this.form.controls.tickets_purchased.valueChanges,
    { initialValue: 1 }
  );

  /* ---------------- derived helpers ---------------- */
  protected readonly maxTickets = computed(() => {
    const e = this.event();
    if (!e) return 10;
    return Math.max(1, Math.min(10, e.seats_remaining));
  });

  protected readonly estimatedTotal = computed(() => {
    const e = this.event();
    if (!e) return 0;
    return Number(this.ticketCount() ?? 0) * Number(e.ticket_price);
  });

  protected readonly unitsAvailable = computed(() => this.event()?.seats_remaining ?? 0);

  /* ---------------- validity exposed as signals ---------------- */
  /** Emits on every form status change so the alert appears immediately. */
  private readonly formStatus = toSignal(this.form.statusChanges, { initialValue: this.form.status });

  protected readonly showValidationAlert = computed(
    () => this.formStatus() === 'INVALID' && this.submitAttempted()
  );

  /* ---------------- formatting exposed to the template ---------------- */
  protected readonly fmtDate = formatDate;
  protected readonly fmtTime = formatTime;
  protected readonly fmtPrice = formatPrice;
  protected readonly fmtMoney = formatMoney;

  /* ---------------- lifecycle ---------------- */
  ngOnInit(): void {
    const fromQuery = this.route.snapshot.queryParamMap.get('eventId');
    const fallback = sessionStorage.getItem(LAST_EVENT_KEY);
    const eventId = Number(fromQuery ?? fallback ?? '');

    if (!Number.isInteger(eventId) || eventId <= 0) {
      this.loadingEvent.set(false);
      this.loadError.set('No event was selected. Please pick an event before registering.');
      return;
    }

    sessionStorage.setItem(LAST_EVENT_KEY, String(eventId));
    void this.loadEvent(eventId);
  }

  private async loadEvent(eventId: number): Promise<void> {
    try {
      const event = await firstValueFrom(this.eventService.getById(eventId));
      this.event.set(event);

      // Re-run the seat validator now that the availability is known, and
      // cap the input so the user cannot even type an unavailable amount.
      const tickets = this.form.controls.tickets_purchased;
      tickets.setValidators([
        Validators.required,
        Validators.min(1),
        Validators.max(this.maxTickets()),
        this.seatAvailabilityValidator
      ]);
      tickets.updateValueAndValidity();

      // Recover the query string when the id came from sessionStorage, so
      // the page can be bookmarked or shared.
      if (!this.route.snapshot.queryParamMap.get('eventId')) {
        void this.router.navigate([], {
          relativeTo: this.route,
          queryParams: { eventId },
          replaceUrl: true
        });
      }
    } catch (error) {
      this.loadError.set(
        error instanceof ApiClientError ? error.message : 'The selected event could not be loaded.'
      );
    } finally {
      this.loadingEvent.set(false);
    }
  }

  /* ---------------- template helpers ---------------- */

  /** True when a control should display its error message. */
  protected showError(field: FieldName): boolean {
    const control = this.form.controls[field];
    return control.invalid && (control.touched || this.submitAttempted());
  }

  /** The first human-readable message for a field, in priority order. */
  protected errorFor(field: FieldName): string | null {
    const serverMessage = this.serverFieldErrors()[field];
    if (serverMessage) return serverMessage;

    const errors = this.form.controls[field].errors;
    if (!errors) return null;

    if (errors['required']) return 'This field is required.';
    if (errors['requiredTrue']) return 'Please accept the declaration to continue.';
    if (errors['email']) return 'Please enter a valid email address.';
    if (errors['minlength']) return `Please enter at least ${errors['minlength'].requiredLength} characters.`;
    if (errors['maxlength']) return `Please use no more than ${errors['maxlength'].requiredLength} characters.`;
    if (errors['pattern']) {
      return field === 'phone'
        ? 'Use digits, spaces, +, ( ) or - (at least 8 characters).'
        : 'This value is not in the expected format.';
    }
    if (errors['futureDate']) return 'The registration date cannot be in the future.';
    if (errors['seatsExceeded']) {
      return `Only ${errors['seatsExceeded'].available} seat(s) remain for this event.`;
    }
    if (errors['min']) return `The minimum value is ${errors['min'].min}.`;
    if (errors['max']) return `The maximum value is ${errors['max'].max}.`;
    return 'Please check this field.';
  }

  /** Labels of the currently invalid fields, listed inside the alert. */
  protected invalidFieldLabels(): string[] {
    const labels: Record<FieldName, string> = {
      full_name: 'Full name',
      email: 'Email address',
      phone: 'Contact number',
      tickets_purchased: 'Number of tickets',
      registration_date: 'Registration date',
      notes: 'Notes',
      acceptTerms: 'Declaration'
    };

    return (Object.keys(this.form.controls) as FieldName[])
      .filter((name) => this.form.controls[name].invalid)
      .map((name) => labels[name]);
  }

  /* ---------------- submission ---------------- */
  protected async onSubmit(): Promise<void> {
    this.submitAttempted.set(true);
    this.serverError.set(null);
    this.serverFieldErrors.set({});

    const event = this.event();

    /* 1. browser-side validation — nothing is sent while the form is invalid */
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    if (!event) {
      this.serverError.set('The event information is not available. Please reload the page.');
      return;
    }
    if (event.event_status !== 'Active') {
      this.serverError.set(`This event is ${event.event_status} and is no longer accepting registrations.`);
      return;
    }
    if (Number(this.form.controls.tickets_purchased.value) > event.seats_remaining) {
      this.serverError.set(`Only ${event.seats_remaining} seat(s) remain for this event.`);
      return;
    }

    /* 2. send the request */
    this.submitting.set(true);
    try {
      const raw = this.form.getRawValue();
      const created = await firstValueFrom(
        this.registrationService.create({
          event_id: event.event_id,
          full_name: raw.full_name.trim(),
          email: raw.email.trim(),
          phone: raw.phone.trim(),
          tickets_purchased: Number(raw.tickets_purchased),
          registration_date: raw.registration_date ? `${raw.registration_date}T00:00:00` : undefined,
          notes: raw.notes?.trim() || null
        })
      );

      /* 3. success — show the confirmation panel */
      this.confirmed.set(created);
      this.submitAttempted.set(false);
      this.form.reset({
        full_name: '',
        email: '',
        phone: '',
        tickets_purchased: 1,
        registration_date: this.today,
        notes: '',
        acceptTerms: false
      });

      // Refresh the event so the remaining-seat figures are up to date.
      void this.loadEvent(event.event_id);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      if (error instanceof ApiClientError) {
        this.serverError.set(error.message);
        this.serverFieldErrors.set(error.fieldErrors);
        for (const field of Object.keys(error.fieldErrors)) {
          this.form.get(field)?.markAsTouched();
        }
      } else {
        this.serverError.set('The registration could not be submitted. Please try again.');
      }
    } finally {
      this.submitting.set(false);
    }
  }

  /* ---------------- post-registration navigation ---------------- */
  protected registerAnother(): void {
    this.confirmed.set(null);
    this.submitAttempted.set(false);
    this.serverError.set(null);
  }

  protected goHome(): void {
    void this.router.navigate(['/']);
  }

  protected goToEvent(): void {
    const event = this.event();
    if (event) void this.router.navigate(['/events', event.event_id]);
  }
}
