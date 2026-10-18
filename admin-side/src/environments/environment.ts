/**
 * environment.ts  (development)
 * ---------------------------------------------------------------------
 * Single place where the front-end learns where the REST API lives.
 * During development `ng serve` proxies nothing, so we point straight at
 * the Express server running on port 3000.
 */
export const environment = {
  production: false,
  /** Base URL of the Charity Events REST API (no trailing slash). */
  apiBaseUrl: 'http://localhost:3000/api'
};
