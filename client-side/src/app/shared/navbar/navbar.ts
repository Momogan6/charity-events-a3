import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

/**
 * shared/navbar/navbar.ts
 * ---------------------------------------------------------------------
 * Primary site navigation. It is rendered ONCE by the root component, so
 * every route automatically shares the same menu - one of the OLO
 * navigation requirements for the admin website, and equally useful on
 * the client website.
 */
@Component({
  selector: 'app-navbar',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './navbar.html',
  styleUrl: './navbar.css'
})
export class Navbar {
  protected readonly links = [
    { path: '/', label: 'Home', exact: true },
    { path: '/events', label: 'Find events', exact: false },
    { path: '/about', label: 'About us', exact: false }
  ];
}
