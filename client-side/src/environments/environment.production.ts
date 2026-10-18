/**
 * environment.production.ts
 * ---------------------------------------------------------------------
 * Used automatically by `ng build` (see angular.json > fileReplacements).
 *
 * Both websites and the API are deployed to the same SCU cPanel account,
 * so a site-relative URL is the most portable choice: it keeps working no
 * matter which sub-folder the Angular app is served from and avoids
 * hard-coding your student domain in the source code.
 *
 * If your marker deploys the API somewhere else, simply replace the value
 * below with the full URL, e.g. 'https://yourdomain.com/api'.
 */
export const environment = {
  production: true,
  apiBaseUrl: '/api'
};
