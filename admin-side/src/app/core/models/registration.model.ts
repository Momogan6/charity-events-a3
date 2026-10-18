/**
 * core/models/registration.model.ts
 * ---------------------------------------------------------------------
 * Contracts for the NEW registrations resource introduced in Assessment 3.
 */

export interface Registration {
  registration_id: number;
  event_id: number;
  event_name?: string;
  full_name: string;
  email: string;
  phone: string;
  tickets_purchased: number;
  total_amount: number | null;
  registration_date: string;
  notes: string | null;
}

/** Payload accepted by POST /registrations. */
export interface RegistrationWriteModel {
  event_id: number;
  full_name: string;
  email: string;
  phone: string;
  tickets_purchased: number;
  registration_date?: string;
  notes?: string | null;
}
