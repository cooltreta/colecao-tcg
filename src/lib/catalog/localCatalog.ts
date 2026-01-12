export type CatalogEntry = {
  code: string;
  name: string;
  set: string;
  setName?: string;
  rarity?: string;
  color?: string;
  type?: string;
  imageUrl?: string;
  cost?: string;
  power?: string;
  marketPrice?: number;
  inventoryPrice?: number;
  scrapedAt?: string;
};

let cache: CatalogEntry[] | null = null;

export async function loadCatalog(): Promise<CatalogEntry[]> {
  if (cache) return cache;
  const res = await fetch("/catalog/onepiece_cards.json");
  cache = (await res.json()) as CatalogEntry[];
  return cache;
}

export async function hasCardCode(code: string): Promise<boolean> {
  const data = await loadCatalog();
  return data.some((c) => c.code.toLowerCase() === code.toLowerCase());
}

export async function nameByCode(code: string): Promise<string | null> {
  const data = await loadCatalog();
  const found = data.find((c) => c.code.toLowerCase() === code.toLowerCase());
  return found?.name ?? null;
}

/**
 * 🔍 Search por código ou nome (para autocomplete)
 */
export async function searchCatalog(
  query: string,
  limit = 10
): Promise<CatalogEntry[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const data = await loadCatalog();

  return data
    .filter(
      (c) =>
        c.code.toLowerCase().includes(q) ||
        c.name.toLowerCase().includes(q)
    )
    .slice(0, limit);
}

export async function getByCode(code: string): Promise<CatalogEntry | null> {
  const data = await loadCatalog();
  const found = data.find((c) => c.code.toLowerCase() === code.toLowerCase());
  return found ?? null;
}
