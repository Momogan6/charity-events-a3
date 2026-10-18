/**
 * core/utils/format.util.ts
 * ---------------------------------------------------------------------
 * Small, dependency-free presentation helpers.
 *
 * WHY NOT JUST USE ANGULAR'S DatePipe?
 * MySQL returns dates as plain strings such as "2026-11-07". `new Date()`
 * interprets that as UTC midnight, so a browser in a timezone behind UTC
 * would render the *previous* day. These helpers split the string and
 * build a LOCAL date instead, so an event always shows the date that is
 * actually stored in the database - an easy off-by-one-day bug to avoid.
 */

import { EventStatus } from '../models/charity-event.model';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Splits "YYYY-MM-DD" (optionally with a time part) into numeric parts. */
function splitDate(value: string | null | undefined): { y: number; m: number; d: number } | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

/** "2026-11-07" -> "Sat, 7 Nov 2026" */
export function formatDate(value: string | null | undefined): string {
  const parts = splitDate(value);
  if (!parts) return '—';
  const date = new Date(parts.y, parts.m - 1, parts.d);
  return `${DAYS[date.getDay()]}, ${parts.d} ${MONTHS[parts.m - 1]} ${parts.y}`;
}

/** "2026-11-07" -> "7 Nov" (compact, for cards) */
export function formatDateShort(value: string | null | undefined): string {
  const parts = splitDate(value);
  if (!parts) return '—';
  return `${parts.d} ${MONTHS[parts.m - 1]}`;
}

/** "2026-11-07" -> "Nov 2026" */
export function formatMonthYear(value: string | null | undefined): string {
  const parts = splitDate(value);
  if (!parts) return '—';
  return `${MONTHS[parts.m - 1]} ${parts.y}`;
}

/** "14:30:00" -> "2:30 PM" */
export function formatTime(value: string | null | undefined): string {
  if (!value) return '';
  const match = /^(\d{2}):(\d{2})/.exec(value);
  if (!match) return value;
  const hours = Number(match[1]);
  const minutes = match[2];
  const suffix = hours >= 12 ? 'PM' : 'AM';
  const display = hours % 12 === 0 ? 12 : hours % 12;
  return `${display}:${minutes} ${suffix}`;
}

/** "2026-10-14 15:25:00" -> "14 Oct 2026, 3:25 PM" */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const [datePart, timePart] = value.split(/[ T]/);
  const time = timePart ? formatTime(timePart) : '';
  return time ? `${formatDate(datePart)}, ${time}` : formatDate(datePart);
}

/** 25 -> "$25.00"; 0 -> "Free" */
export function formatPrice(value: number | null | undefined): string {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) return 'Free';
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 2
  }).format(amount);
}

/** 1500 -> "$1,500.00" */
export function formatMoney(value: number | null | undefined): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 2
  }).format(Number(value ?? 0));
}

/** CSS class used by the status pill. */
export function statusClass(status: EventStatus | string | null | undefined): string {
  switch (status) {
    case 'Active':
      return 'badge badge-active';
    case 'Past':
      return 'badge badge-past';
    case 'Suspended':
      return 'badge badge-suspended';
    default:
      return 'badge';
  }
}

/** Percentage of seats already sold (0-100). */
export function percentSold(sold: number, capacity: number): number {
  if (!capacity || capacity <= 0) return 0;
  return Math.min(100, Math.round((sold / capacity) * 100));
}

/** Truncates long prose for card summaries. */
export function truncate(value: string | null | undefined, max = 120): string {
  if (!value) return '';
  return value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}…`;
}
