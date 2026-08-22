import { paginate, paginateAll, flattenPages } from "../src/pagination";

describe("paginate — cursor strategy", () => {
  it("iterates pages until fetchPage returns nextCursor: null", async () => {
    const calls: (string | undefined)[] = [];
    const fetchPage = vi.fn(async (cursor?: string) => {
      calls.push(cursor);
      if (cursor === undefined) return { items: [1, 2], nextCursor: "c2" };
      if (cursor === "c2") return { items: [3, 4], nextCursor: "c3" };
      return { items: [5], nextCursor: null };
    });

    const pages: number[][] = [];
    for await (const page of paginate({ fetchPage })) {
      pages.push(page);
    }

    expect(pages).toEqual([[1, 2], [3, 4], [5]]);
    expect(calls).toEqual([undefined, "c2", "c3"]);
  });

  it("stops if nextCursor: undefined (not just null)", async () => {
    const fetchPage = vi.fn(async () => ({ items: [1], nextCursor: undefined }));
    const pages: number[][] = [];
    for await (const page of paginate({ fetchPage })) pages.push(page);
    expect(pages).toEqual([[1]]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it("defaults to strategy 'cursor' (can be omitted)", async () => {
    const fetchPage = vi.fn(async () => ({ items: ["a"], nextCursor: null }));
    const pages: string[][] = [];
    for await (const page of paginate({ strategy: "cursor", fetchPage })) pages.push(page);
    expect(pages).toEqual([["a"]]);
  });

  it("an empty first page with nextCursor: null does not yield an empty array", async () => {
    const fetchPage = vi.fn(async () => ({ items: [], nextCursor: null }));
    const pages: unknown[][] = [];
    for await (const page of paginate({ fetchPage })) pages.push(page);
    expect(pages).toEqual([]);
  });

  it("throws AbortError and does not make a request if the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchPage = vi.fn(async () => ({ items: [1], nextCursor: null }));

    const iterate = async () => {
      for await (const _ of paginate({ fetchPage, signal: controller.signal })) {
        // no-op
      }
    };

    await expect(iterate()).rejects.toThrow();
    expect(fetchPage).not.toHaveBeenCalled();
  });
});

describe("paginate — offset strategy", () => {
  it("iterates pages by offset/limit until a page is shorter than limit", async () => {
    const calls: Array<{ offset: number; limit: number }> = [];
    const fetchPage = vi.fn(async (offset: number, limit: number) => {
      calls.push({ offset, limit });
      if (offset === 0) return { items: [1, 2] };
      if (offset === 2) return { items: [3, 4] };
      return { items: [5] }; // shorter than limit=2 -> last page
    });

    const pages: number[][] = [];
    for await (const page of paginate({ strategy: "offset", limit: 2, fetchPage })) {
      pages.push(page);
    }

    expect(pages).toEqual([[1, 2], [3, 4], [5]]);
    expect(calls).toEqual([
      { offset: 0, limit: 2 },
      { offset: 2, limit: 2 },
      { offset: 4, limit: 2 },
    ]);
  });

  it("stops based on total, without making an extra request past the last page", async () => {
    const fetchPage = vi.fn(async (offset: number, limit: number) => ({
      items: Array.from({ length: limit }, (_, i) => offset + i),
      total: 4,
    }));

    const pages: number[][] = [];
    for await (const page of paginate({ strategy: "offset", limit: 2, fetchPage })) {
      pages.push(page);
    }

    expect(pages).toEqual([[0, 1], [2, 3]]);
    expect(fetchPage).toHaveBeenCalledTimes(2); // no third request at offset=4
  });

  it("stops on an empty page when there is no total", async () => {
    const fetchPage = vi.fn(async (offset: number) => {
      if (offset === 0) return { items: [1, 2] };
      return { items: [] };
    });

    const pages: number[][] = [];
    for await (const page of paginate({ strategy: "offset", limit: 2, fetchPage })) {
      pages.push(page);
    }

    expect(pages).toEqual([[1, 2]]);
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it("honors startOffset", async () => {
    const calls: number[] = [];
    const fetchPage = vi.fn(async (offset: number) => {
      calls.push(offset);
      return { items: [] };
    });

    const pages: unknown[][] = [];
    for await (const page of paginate({ strategy: "offset", limit: 10, startOffset: 100, fetchPage })) {
      pages.push(page);
    }

    expect(calls).toEqual([100]);
  });
});

describe("paginateAll", () => {
  it("collects all pages into a single flat array", async () => {
    const fetchPage = vi.fn(async (cursor?: string) => {
      if (cursor === undefined) return { items: [1, 2], nextCursor: "c2" };
      return { items: [3, 4], nextCursor: null };
    });

    const all = await paginateAll({ fetchPage });
    expect(all).toEqual([1, 2, 3, 4]);
  });
});

describe("flattenPages", () => {
  it("unrolls a stream of pages into a stream of individual items", async () => {
    async function* pages() {
      yield [1, 2];
      yield [3];
      yield [] as number[];
      yield [4, 5];
    }

    const items: number[] = [];
    for await (const item of flattenPages(pages())) {
      items.push(item);
    }

    expect(items).toEqual([1, 2, 3, 4, 5]);
  });

  it("works directly on top of paginate()", async () => {
    const fetchPage = vi.fn(async (cursor?: string) => {
      if (cursor === undefined) return { items: ["a", "b"], nextCursor: "c2" };
      return { items: ["c"], nextCursor: null };
    });

    const items: string[] = [];
    for await (const item of flattenPages(paginate({ fetchPage }))) {
      items.push(item);
    }

    expect(items).toEqual(["a", "b", "c"]);
  });
});
