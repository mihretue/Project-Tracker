/** One page of a server-paginated list (shape returned by GET /organizations). */
export interface Page<T> {
  items: T[];
  /** Total number of items across all pages for this user. */
  count: number;
}

/** The API's maximum page size (PaginationDto: take <= 100). */
const MAX_PAGE_SIZE = 100;

/** Safety net against a misbehaving server: never loop forever. */
const MAX_PAGES = 100;

/**
 * Loads every page of a paginated list and returns all items exactly once, in server order.
 * Stops when the reported total of unique items is reached, a page comes back empty, or a page adds nothing new
 * (so a server that ignores `skip` cannot cause an endless loop).
 */
export async function fetchAllPages<T extends { id: string }>(
  fetchPage: (take: number, skip: number) => Promise<Page<T>>,
  pageSize: number = MAX_PAGE_SIZE,
): Promise<T[]> {
  const byId = new Map<string, T>();
  let skip = 0;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const { items, count } = await fetchPage(pageSize, skip);

    let added = 0;
    for (const item of items) {
      if (!byId.has(item.id)) {
        byId.set(item.id, item);
        added += 1;
      }
    }

    skip += items.length;
    // Completion is judged on unique items, so a repeated item can never end the loop early and
    // silently drop an organization.
    if (items.length === 0 || added === 0 || byId.size >= count) {
      break;
    }
  }

  return [...byId.values()];
}
