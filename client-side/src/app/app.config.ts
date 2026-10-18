import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection
} from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideRouter, withInMemoryScrolling } from '@angular/router';

import { routes } from './app.routes';

/**
 * app.config.ts
 * ---------------------------------------------------------------------
 * Application-wide providers (Angular 22, no NgModules).
 *
 *  - provideZonelessChangeDetection(): the application does NOT use
 *    zone.js. Change detection is driven by signals, which is the modern
 *    Angular approach and removes a large amount of monkey-patching from
 *    the runtime.
 *  - provideHttpClient(withFetch()): the HTTP client uses the native
 *    Fetch API instead of XMLHttpRequest.
 *  - withInMemoryScrolling(): restores the scroll position on back /
 *    forward navigation and enables in-page anchor scrolling, which the
 *    "Jump to registrations" link on the event page relies on.
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideHttpClient(withFetch()),
    provideRouter(
      routes,
      withInMemoryScrolling({
        scrollPositionRestoration: 'top',
        anchorScrolling: 'enabled'
      })
    )
  ]
};
