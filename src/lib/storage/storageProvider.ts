import type { AppState, Collection, CollectionItem, PriceEntry } from "./types";

export interface StorageProvider {
  getAppState(): Promise<AppState>;
  setAppState(state: AppState): Promise<void>;

  listCollections(): Promise<Collection[]>;
  getCollection(id: string): Promise<Collection | null>;
  upsertCollection(col: Collection): Promise<void>;
  deleteCollection(id: string): Promise<void>;

  listItems(collectionId: string): Promise<CollectionItem[]>;
  upsertItem(item: CollectionItem): Promise<void>;
  deleteItem(itemId: string): Promise<void>;
  bulkUpsertItems(items: CollectionItem[]): Promise<void>;

    // ===== Prices =====
  listPrices(): Promise<PriceEntry[]>;
  upsertPrice(p: PriceEntry): Promise<void>;
  bulkUpsertPrices(ps: PriceEntry[]): Promise<void>;

}
