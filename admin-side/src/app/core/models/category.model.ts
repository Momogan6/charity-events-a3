/**
 * core/models/category.model.ts
 * ---------------------------------------------------------------------
 * The `categories` lookup resource. Populating the category drop-downs
 * from the API (instead of hard-coding them in the template) means a new
 * category added in the database appears on the website immediately.
 */
export interface Category {
  category_id: number;
  category_name: string;
  category_description: string | null;
  event_count: number;
}
