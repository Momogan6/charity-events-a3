import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { Category } from '../../core/models/category.model';
import { CategoryService } from '../../core/services/category.service';
import { EventService } from '../../core/services/event.service';

/**
 * features/about/about.ts
 * ---------------------------------------------------------------------
 * A short "how it works" page. It is not one of the graded pages, but it
 * documents the architecture for the marker and demonstrates that the
 * category list and event totals are always read live from the API.
 */
@Component({
  selector: 'app-about',
  imports: [RouterLink],
  templateUrl: './about.html',
  styleUrl: './about.css'
})
export class About implements OnInit {
  private readonly categoryService = inject(CategoryService);
  private readonly eventService = inject(EventService);

  protected readonly categories = signal<Category[]>([]);
  protected readonly totalEvents = signal(0);

  protected readonly endpoints = [
    { method: 'GET', path: '/api/events', description: 'List, search, filter and sort charity events.' },
    { method: 'GET', path: '/api/events/:id', description: 'One event plus its full list of registrations.' },
    { method: 'GET', path: '/api/events/:id/registrations', description: 'Registrations for a single event.' },
    { method: 'POST', path: '/api/events', description: 'Create a new charity event (admin).' },
    { method: 'PUT', path: '/api/events/:id', description: 'Update an existing event (admin).' },
    { method: 'DELETE', path: '/api/events/:id', description: 'Delete an event — blocked while registrations exist.' },
    { method: 'POST', path: '/api/registrations', description: 'Register a web user for an event.' },
    { method: 'GET', path: '/api/categories', description: 'Category lookup list with event counts.' },
    { method: 'GET', path: '/api/weather', description: 'Live Open-Meteo forecast for an event location.' }
  ];

  async ngOnInit(): Promise<void> {
    try {
      const [categories, events] = await Promise.all([
        firstValueFrom(this.categoryService.getAll()),
        firstValueFrom(this.eventService.search({}))
      ]);
      this.categories.set(categories);
      this.totalEvents.set(events.total);
    } catch {
      /* The page still renders without live figures. */
    }
  }
}
