import { openDB, type DBSchema } from "idb";
import type { StorageProvider } from "./storageProvider";
import type { AppState, Collection, CollectionItem, PriceEntry  } from "./types";

interface ColecaoDB extends DBSchema {
  appState: { key: "state"; value: AppState };
  collections: {
    key: string; // collection.id
    value: Collection;
    indexes: { "by-updatedAt": string };
  };
  items: {
    key: string; // item.id
    value: CollectionItem;
    indexes: { "by-collectionId": string };
  };
    prices: {
    key: string; // cardCode
    value: PriceEntry;
  };

}

const DB_NAME = "colecao-tcg";
const DB_VERSION = 2;

async function getDb() {
  return openDB<ColecaoDB>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        db.createObjectStore("appState");
        const collections = db.createObjectStore("collections", { keyPath: "id" });
        collections.createIndex("by-updatedAt", "updatedAt");
        const items = db.createObjectStore("items", { keyPath: "id" });
        items.createIndex("by-collectionId", "collectionId");
      }

      if (oldVersion < 2) {
        db.createObjectStore("prices", { keyPath: "cardCode" });
      }
    },
  });
}

export const indexedDbProvider: StorageProvider = {
  async getAppState() {
    const db = await getDb();
    return (await db.get("appState", "state")) ?? { version: 1 };
  },
  async setAppState(state) {
    const db = await getDb();
    await db.put("appState", state, "state");
  },
  
  async listCollections() {
    const db = await getDb();
    return await db.getAll("collections");
  },
  async getCollection(id) {
    const db = await getDb();
    return (await db.get("collections", id)) ?? null;
  },
  async upsertCollection(col) {
    const db = await getDb();
    await db.put("collections", col);
  },
  async deleteCollection(id) {
    const db = await getDb();
    const tx = db.transaction(["items", "collections"], "readwrite");
    const idx = tx.objectStore("items").index("by-collectionId");

    let cursor = await idx.openCursor(id);
    while (cursor) {
      await cursor.delete();
      cursor = await cursor.continue();
    }

    await tx.objectStore("collections").delete(id);
    await tx.done;
  },

  async listItems(collectionId) {
    const db = await getDb();
    return await db.getAllFromIndex("items", "by-collectionId", collectionId);
  },
  async upsertItem(item) {
    const db = await getDb();
    await db.put("items", item);
  },
  async deleteItem(itemId) {
    const db = await getDb();
    await db.delete("items", itemId);
  },
  async bulkUpsertItems(items) {
    const db = await getDb();
    const tx = db.transaction("items", "readwrite");
    for (const it of items) await tx.store.put(it);
    await tx.done;
  },

    // ===== Prices =====
  async listPrices() {
    const db = await getDb();
    return await db.getAll("prices");
  },
  async upsertPrice(p) {
    const db = await getDb();
    await db.put("prices", p);
  },
  async bulkUpsertPrices(ps) {
    const db = await getDb();
    const tx = db.transaction("prices", "readwrite");
    for (const p of ps) await tx.store.put(p);
    await tx.done;
  },

  
};
