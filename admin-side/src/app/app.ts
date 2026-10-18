import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { AdminNav } from './shared/admin-nav/admin-nav';

/**
 * app.ts — root component of the ADMIN website.
 * ---------------------------------------------------------------------
 * The shell renders the persistent console navigation above the routed
 * page, which satisfies the brief's requirement that the menu "must be
 * present on all pages".
 */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet, AdminNav],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {}
