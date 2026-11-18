import { describe, it, expect, vi } from 'vitest';
import { fetchAllPages, Page } from './organizations';

interface Item {
  id: string;
}

const makeItems = (n: number): Item[] => Array.from({ length: n }, (_, i) => ({ id: `org-${i}` }));

/** A fake server over `all`, honouring take/skip like GET /organizations. */
const serverOver = (all: Item[]) =>
  vi.fn(async (take: number, skip: number): Promise<Page<Item>> => ({
    items: all.slice(skip, skip + take),
    count: all.length,
  }));

describe('fetchAllPages', () => {
  it('loads every organization when there are more than 10, in server order', async () => {
    const all = makeItems(25);
    const fetchPage = serverOver(all);

    const result = await fetchAllPages(fetchPage, 10);

    expect(result).toEqual(all);
    expect(fetchPage.mock.calls).toEqual([
      [10, 0],
      [10, 10],
      [10, 20],
    ]);
  });

  it('uses the API maximum page size (100) by default, so 120 items take two requests', async () => {
    const all = makeItems(120);
    const fetchPage = serverOver(all);

    const result = await fetchAllPages(fetchPage);

    expect(result).toHaveLength(120);
    expect(fetchPage.mock.calls).toEqual([
      [100, 0],
      [100, 100],
    ]);
  });

  it('makes a single request when everything fits on the first page', async () => {
    const fetchPage = serverOver(makeItems(3));
    expect(await fetchAllPages(fetchPage)).toHaveLength(3);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it('stops exactly at a page boundary without an extra request', async () => {
    const fetchPage = serverOver(makeItems(20));
    expect(await fetchAllPages(fetchPage, 10)).toHaveLength(20);
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it('returns an empty list for a user with no organizations', async () => {
    const fetchPage = serverOver([]);
    expect(await fetchAllPages(fetchPage)).toEqual([]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it('never returns duplicates when pages overlap (an item shifted between requests)', async () => {
    const pages: Page<Item>[] = [
      { items: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], count: 6 },
      { items: [{ id: 'c' }, { id: 'd' }, { id: 'e' }], count: 6 }, // 'c' repeated
      { items: [{ id: 'f' }], count: 6 },
    ];
    let call = 0;
    const result = await fetchAllPages(async () => pages[call++], 3);

    expect(result.map((i) => i.id)).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  });

  it('cannot loop forever if the server ignores skip and repeats the same page', async () => {
    const samePage: Page<Item> = { items: makeItems(10), count: 1000 };
    const fetchPage = vi.fn(async () => samePage);

    const result = await fetchAllPages(fetchPage, 10);

    expect(result).toHaveLength(10);
    expect(fetchPage).toHaveBeenCalledTimes(2); // second page added nothing new, so it stopped
  });

  it('stops on an empty page even when the reported total is larger', async () => {
    const fetchPage = vi.fn(async (_take: number, skip: number): Promise<Page<Item>> => ({
      items: skip === 0 ? makeItems(5) : [],
      count: 50,
    }));

    expect(await fetchAllPages(fetchPage, 5)).toHaveLength(5);
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it('propagates request errors instead of returning a partial list', async () => {
    const fetchPage = vi
      .fn<(take: number, skip: number) => Promise<Page<Item>>>()
      .mockResolvedValueOnce({ items: makeItems(10), count: 30 })
      .mockRejectedValueOnce(new Error('network down'));

    await expect(fetchAllPages(fetchPage, 10)).rejects.toThrow('network down');
  });
});
