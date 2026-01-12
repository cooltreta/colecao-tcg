import { indexedDbProvider } from "./indexedDbProvider";
import { nowIso, randomId } from "./keys";
import type { Collection } from "./types";

export async function ensureDefaultCollection() {
  const state = await indexedDbProvider.getAppState();
  const existing = await indexedDbProvider.listCollections();

  // Se já existe activeCollectionId e a coleção existe, está feito
  if (state.activeCollectionId) {
    const col = await indexedDbProvider.getCollection(state.activeCollectionId);
    if (col) return col;
  }

  // Se já há coleções, escolhe a primeira
  if (existing.length > 0) {
    const pick = existing[0];
    await indexedDbProvider.setAppState({ version: 1, activeCollectionId: pick.id });
    return pick;
  }

  // Senão cria uma default
  const createdAt = nowIso();
  const col: Collection = {
    id: randomId("col"),
    name: "Minha coleção",
    tcg: "onepiece",
    createdAt,
    updatedAt: createdAt,
  };

  await indexedDbProvider.upsertCollection(col);
  await indexedDbProvider.setAppState({ version: 1, activeCollectionId: col.id });
  return col;
}

export async function getActiveCollectionId(): Promise<string> {
  const state = await indexedDbProvider.getAppState();
  if (state.activeCollectionId) return state.activeCollectionId;
  const col = await ensureDefaultCollection();
  return col.id;
}
