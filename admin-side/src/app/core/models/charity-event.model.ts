/**
 * core/models/charity-event.model.ts
 * ---------------------------------------------------------------------
 * TypeScript contracts for the `events` resource returned by the API.
 *
 * NOTE ON NAMING: the interface is called `CharityEvent` rather than
 * `Event` on purpose - `Event` is already a built-in DOM type, and
 * shadowing it would make the templates ambiguous to read.
 */

export type EventStatus = 'Active' | 'Past' | 'Suspended';

export const EVENT_STATUSES: readonly EventStatus[] = ['Active', 'Past', 'Suspended'];

/** A registration belonging to an event (subset of the full model). */
export interface EventRegistration {
  registration_id: number;
  event_id: number;
  full_name: string;
  email: string;
  phone: string;
  tickets_purchased: number;
  total_amount: number | null;
  registration_date: string;
  notes: string | null;
}

/** A charity event exactly as the API serialises it. */
export interface CharityEvent {
  event_id: number;
  event_name: string;
  category_id: number;
  category_name: string;
  event_description: string | null;
  event_venue: string | null;
  event_city: string | null;
  latitude: number | null;
  longitude: number | null;
  event_date: string;
  event_time: string | null;
  event_status: EventStatus;
  event_capacity: number;
  ticket_price: number;
  event_image: string | null;
  created_at: string;

  /* aggregates computed by the API */
  tickets_sold: number;
  seats_remaining: number;
  registration_count: number;

  /* present on GET /events/:id only */
  registrations?: EventRegistration[];
}

/** Payload accepted by POST /events and PUT /events/:id. */
export interface EventWriteModel {
  event_name: string;
  category_id: number;
  event_description?: string | null;
  event_venue?: string | null;
  event_city?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  event_date: string;
  event_time?: string | null;
  event_status?: EventStatus;
  event_capacity: number;
  ticket_price: number;
}

/** Query-string filters supported by GET /events. */
export interface EventFilters {
  search?: string;
  categoryId?: number | null;
  status?: string;
  city?: string;
  from?: string;
  to?: string;
  sort?: 'date' | 'name' | 'price' | 'capacity' | 'status' | 'popularity' | 'city';
  order?: 'asc' | 'desc';
  /** Page size requested from the API (the API caps this at 200). */
  limit?: number;
  offset?: number;
}

export interface EventSearchResult {
  events: CharityEvent[];
  count: number;
  total: number;
}
