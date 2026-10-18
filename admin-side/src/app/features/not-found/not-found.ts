import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/** Wildcard route for the console: shown for any unknown admin URL. */
@Component({
  selector: 'app-not-found',
  imports: [RouterLink],
  template: `
    <div class="page">
      <div class="container">
        <div class="empty-state">
          <h1 style="font-size: 3.5rem; margin-bottom: .25rem">404</h1>
          <h3>That console page does not exist</h3>
          <p>Check the address, or return to the event dashboard.</p>
          <div class="row" style="justify-content: center">
            <a class="btn" routerLink="/dashboard">Go to the dashboard</a>
            <a class="btn btn-secondary" routerLink="/events/new">Create an event</a>
          </div>
        </div>
      </div>
    </div>
  `
})
export class NotFound {}
