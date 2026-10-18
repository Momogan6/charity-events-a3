import { Routes } from '@angular/router';

/**
 * app.routes.ts
 * ---------------------------------------------------------------------
 * Client-side routes.
 *
 * Each feature is loaded with `loadComponent`, so Angular splits the app
 * into small chunks and only downloads the code for the page the visitor
 * actually opens. The initial bundle therefore stays well inside the
 * production budget set in angular.json.
 *
 * Customer journey required by the brief:
 *   Home  ->  Search  ->  Event details  ->  Registration
 *   ""        /events    /events/:id       /register?eventId=:id
 */
export const routes: Routes = [
  {
    path: '',
    title: 'Charity Events | Give Where It Counts',
    loadComponent: () => import('./features/home/home').then((m) => m.Home)
  },
  {
    path: 'events',
    title: 'Find a charity event | Charity Events',
    loadComponent: () => import('./features/search/search').then((m) => m.Search)
  },
  {
    path: 'events/:id',
    title: 'Event details | Charity Events',
    loadComponent: () => import('./features/event-details/event-details').then((m) => m.EventDetails)
  },
  {
    path: 'register',
    title: 'Register for an event | Charity Events',
    loadComponent: () => import('./features/registration/registration').then((m) => m.RegistrationPage)
  },
  {
    path: 'about',
    title: 'About us | Charity Events',
    loadComponent: () => import('./features/about/about').then((m) => m.About)
  },
  {
    path: '**',
    title: 'Page not found | Charity Events',
    loadComponent: () => import('./features/not-found/not-found').then((m) => m.NotFound)
  }
];
