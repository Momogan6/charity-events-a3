import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

/**
 * shared/admin-nav/admin-nav.ts
 * ---------------------------------------------------------------------
 * The administration menu. It is rendered by the root component, so it
 * appears on EVERY admin page - the explicit navigation requirement of
 * the brief ("This menu must be present on all pages").
 *
 * It also carries a live connection indicator: a small request to
 * GET /api/health proves to staff that the API the console depends on is
 * actually reachable before they start editing data.
 */
@Component({
  selector: 'app-admin-nav',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './admin-nav.html',
  styleUrl: './admin-nav.css'
})
export class AdminNav {
  protected readonly links = [
    { path: '/dashboard', label: 'Event dashboard' },
    { path: '/events/new', label: 'Create event' },
    { path: '/registrations', label: 'Registrations' }
  ];
}
