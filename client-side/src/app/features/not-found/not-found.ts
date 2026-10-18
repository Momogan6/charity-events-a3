import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/** Wildcard route: shown for any URL that does not match a real page. */
@Component({
  selector: 'app-not-found',
  imports: [RouterLink],
  template: `
    <div class="page">
      <div class="container">
        <div class="empty-state">
          <h1 style="font-size: 3.5rem; margin-bottom: .25rem">404</h1>
          <h3>We couldn't find that page</h3>
          <p>The link may be broken, or the page may have been moved.</p>
          <div class="row" style="justify-content: center">
            <a class="btn" routerLink="/">Go to the home page</a>
            <a class="btn btn-secondary" routerLink="/events">Browse events</a>
          </div>
        </div>
      </div>
    </div>
  `
})
export class NotFound {}
