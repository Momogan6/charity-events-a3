import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { CharityEvent } from '../../core/models/charity-event.model';
import {
  formatDate,
  formatDateShort,
  formatPrice,
  percentSold,
  statusClass,
  truncate
} from '../../core/utils/format.util';

/**
 * shared/event-card/event-card.ts
 * ---------------------------------------------------------------------
 * Reusable summary card for a single charity event. Used by the home
 * page and by the search results, so the presentation stays identical in
 * both places without duplicating markup.
 *
 * Receives its data through a SIGNAL INPUT; `computed()` derives every
 * display value from it, which is what makes the card update
 * automatically in a zoneless Angular 22 application.
 */
@Component({
  selector: 'app-event-card',
  imports: [RouterLink],
  templateUrl: './event-card.html',
  styleUrl: './event-card.css'
})
export class EventCard {
  readonly event = input.required<CharityEvent>();

  protected readonly dateLabel = computed(() => formatDate(this.event().event_date));
  protected readonly shortDate = computed(() => formatDateShort(this.event().event_date));
  protected readonly priceLabel = computed(() => formatPrice(this.event().ticket_price));
  protected readonly statusClass = computed(() => statusClass(this.event().event_status));
  protected readonly progress = computed(() =>
    percentSold(this.event().tickets_sold, this.event().event_capacity)
  );
  protected readonly summary = computed(() => truncate(this.event().event_description, 118));
  protected readonly isActive = computed(() => this.event().event_status === 'Active');
  protected readonly soldOut = computed(
    () => this.event().event_capacity > 0 && this.event().seats_remaining <= 0
  );
}
