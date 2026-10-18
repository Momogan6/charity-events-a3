import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { Navbar } from './shared/navbar/navbar';
import { SiteFooter } from './shared/site-footer/site-footer';

/**
 * app.ts — the root (shell) component.
 * ---------------------------------------------------------------------
 * It only renders the shared chrome around the routed page:
 *
 *   <app-navbar>   persistent header / navigation
 *   <router-outlet> the page that matches the current URL
 *   <app-site-footer> persistent footer
 *
 * Keeping this shell thin is what allows every route to share exactly
 * the same navigation, which is one of the layout requirements of the
 * assessment.
 */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Navbar, SiteFooter],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {}
