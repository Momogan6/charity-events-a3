import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * shared/site-footer/site-footer.ts
 * ---------------------------------------------------------------------
 * Shared page footer. Also the place where the optional APIs used by the
 * site are acknowledged, which is good referencing practice for the
 * external-data requirements of the brief.
 */
@Component({
  selector: 'app-site-footer',
  imports: [RouterLink],
  templateUrl: './site-footer.html'
})
export class SiteFooter {
  protected readonly year = new Date().getFullYear();
}
