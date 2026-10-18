import { Routes } from '@angular/router';

/**
 * app.routes.ts — admin website
 * ---------------------------------------------------------------------
 * A multi-page console rather than a single dashboard. The brief allows
 * either, and separate pages make each C.R.U.D. operation independently
 * demonstrable in the video walkthrough.
 *
 * Every route is lazy-loaded with `loadComponent`.
 */
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  {
    path: 'dashboard',
    title: 'Event dashboard | Charity Events Admin',
    loadComponent: () => import('./features/dashboard/dashboard').then((m) => m.Dashboard)
  },
  {
    path: 'events/new',
    title: 'Create a new event | Charity Events Admin',
    loadComponent: () => import('./features/event-form/event-form').then((m) => m.EventFormPage),
    data: { mode: 'create' }
  },
  {
    path: 'events/:id/edit',
    title: 'Update an event | Charity Events Admin',
    loadComponent: () => import('./features/event-form/event-form').then((m) => m.EventFormPage),
    data: { mode: 'edit' }
  },
  {
    path: 'registrations',
    title: 'Registrations | Charity Events Admin',
    loadComponent: () => import('./features/registrations/registrations').then((m) => m.RegistrationsPage)
  },
  {
    path: '**',
    title: 'Page not found | Charity Events Admin',
    loadComponent: () => import('./features/not-found/not-found').then((m) => m.NotFound)
  }
];
