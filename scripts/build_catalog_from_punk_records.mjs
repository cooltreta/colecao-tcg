// scripts/build_catalog_from_punk_records.mjs
// Usage:
//   node scripts/build_catalog_from_punk_records.mjs <repoDir> <language> <outFile>
//
// Examples:
//   node scripts/build_catalog_from_punk_records.mjs vendor/punk-records english public/catalog/onepiece_cards.json
//   node scripts/build_catalog_from_punk_records.mjs vendor/vegapull-records english public/catalog/onepiece_cards.json
//   node scripts/build_catalog_from_punk_records.mjs vendor/vega_out english public/catalog/onepiece_cards.json

import fs from "node:fs";
import path from "node:path";

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

function safeStr(v) {
  if (v === null || v === undefined) return undefined;
  const s = String(v).trim();
  return s.length ? s : undefined;
}

function listJsonFilesRec(dir) {
  const out = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listJsonFilesRec(p));
    else if (e.isFile() && e.name.toLowerCase().endsWith(".json")) out.push(p);
  }
  return out;
}

function inferSetFromCardId(cardId) {
  const id = safeStr(cardId)?.toUpperCase();
  if (!id) return "UNKNOWN";
  const parts = id.split("-");
  return parts[0] || "UNKNOWN";
}

function buildPackTitleById(packsPath) {
  if (!packsPath || !fs.existsSync(packsPath)) return {};

  const data = readJson(packsPath);

  // aceita:
  // - [ {id, ...}, ... ]
  // - { packs: [ {id,...}, ... ] }
  // - { "569001": { ... }, "569002": { ... } }
  // - { items: [...] } (fallback)
  let packs = [];
  if (Array.isArray(data)) {
    packs = data;
  } else if (data && typeof data === "object") {
    if (Array.isArray(data.packs)) packs = data.packs;
    else if (Array.isArray(data.items)) packs = data.items;
    else packs = Object.values(data);
  }

  const packTitleById = {};
  for (const p of packs) {
    if (!p) continue;
    const id = safeStr(p.id)?.toUpperCase();
    if (!id) continue;

    const title =
      (p.title_parts && (p.title_parts.title || p.title_parts.label)) ||
      p.raw_title ||
      p.title ||
      p.name ||
      id;

    packTitleById[id] = String(title).trim();
  }

  return packTitleById;
}


function toCatalogEntry(card, packTitleById) {
  const code = safeStr(card?.id)?.toUpperCase();
  if (!code) return null;

  const packId = safeStr(card?.pack_id)?.toUpperCase(); // "569001"
  const set = inferSetFromCardId(code);

  const setName =
    packId && packTitleById && packTitleById[packId]
      ? packTitleById[packId]
      : undefined;

  const colors = Array.isArray(card?.colors) ? card.colors : [];

  const traits = Array.isArray(card?.types)
  ? card.types.map((t) => String(t).trim()).filter(Boolean)
  : [];


  return {
    code,
    name: safeStr(card?.name) ?? code,

    set, // ✅ recomendado (OP14, OP13, ST01...)
    setName: setName ?? undefined,

    // útil para debug/source
    packId: packId ?? undefined,

    rarity: safeStr(card?.rarity),
    color: colors.length ? colors.join("/") : undefined,
    type: safeStr(card?.category),
    imageUrl: safeStr(card?.img_full_url) ?? safeStr(card?.img_url),

    cost:
      card?.cost === null || card?.cost === undefined
        ? undefined
        : String(card.cost),
    power:
      card?.power === null || card?.power === undefined
        ? undefined
        : String(card.power),


    traits,
  };
}

function detectLayout(repoDir, language) {
  // A) punk-records -> <repo>/<lang>/cards + packs.json
  const aLangDir = path.join(repoDir, language);
  const aCardsDir = path.join(aLangDir, "cards");
  const aPacks = path.join(aLangDir, "packs.json");
  if (fs.existsSync(aCardsDir)) {
    return { kind: "punk", baseDir: aLangDir, cardsMode: "rec", cardsDir: aCardsDir, packsPath: aPacks };
  }

  // B) vegapull-records -> <repo>/data/<lang>/*.json (cards_*.json)
  const bLangDir = path.join(repoDir, "data", language);
  if (fs.existsSync(bLangDir)) {
    return { kind: "vegapull-records", baseDir: bLangDir, cardsMode: "flat", cardsDir: bLangDir, packsPath: null };
  }

  // C) vega_out -> <repo>/data-*-english/json/cards_*.json
  // aqui language vem como "english"
  const entries = fs.readdirSync(repoDir, { withFileTypes: true });
  const candidates = entries
    .filter((e) => e.isDirectory())
    .map((e) => path.join(repoDir, e.name))
    .filter((p) => path.basename(p).toLowerCase().includes(`-${language.toLowerCase()}`));

  for (const c of candidates) {
    const jsonDir = path.join(c, "json");
    if (fs.existsSync(jsonDir)) {
      // packs pode estar em c/packs.json ou c/json/packs.json
      const packs1 = path.join(c, "packs.json");
      const packs2 = path.join(jsonDir, "packs.json");
      const packsPath = fs.existsSync(packs1) ? packs1 : fs.existsSync(packs2) ? packs2 : null;

      return { kind: "vega_out", baseDir: c, cardsMode: "glob_cards_", cardsDir: jsonDir, packsPath };
    }
  }

  throw new Error(
    `Unknown repo layout for repoDir="${repoDir}".\n` +
      `Tente:\n` +
      `- vendor/punk-records\n` +
      `- vendor/vegapull-records\n` +
      `- vendor/vega_out (onde existe data-*-english/json/cards_*.json)\n`
  );
}

function main() {
  const [repoDir, language, outFile] = process.argv.slice(2);
  if (!repoDir || !language || !outFile) {
    console.error(
      "Usage: node scripts/build_catalog_from_punk_records.mjs <repoDir> <language> <outFile>\n" +
        "Example: node scripts/build_catalog_from_punk_records.mjs vendor/vega_out english public/catalog/onepiece_cards.json"
    );
    process.exit(1);
  }

  const layout = detectLayout(repoDir, language);
  const packTitleById = buildPackTitleById(layout.packsPath);

  let files = [];
  if (layout.cardsMode === "rec") {
    files = listJsonFilesRec(layout.cardsDir);
  } else if (layout.cardsMode === "glob_cards_") {
    files = fs
      .readdirSync(layout.cardsDir)
      .filter((f) => f.toLowerCase().startsWith("cards_") && f.toLowerCase().endsWith(".json"))
      .map((f) => path.join(layout.cardsDir, f));
  } else {
    files = fs
      .readdirSync(layout.cardsDir)
      .filter((f) => f.toLowerCase().endsWith(".json"))
      .map((f) => path.join(layout.cardsDir, f));
  }

  console.log(`ℹ️ Layout: ${layout.kind}`);
  console.log(`ℹ️ Base: ${layout.baseDir}`);
  console.log(`ℹ️ Cards dir: ${layout.cardsDir}`);
  console.log(`ℹ️ Packs: ${layout.packsPath ?? "(none)"}`);
  console.log(`ℹ️ Found ${files.length} json files`);

  const byCode = new Map();
  let parseErrors = 0;

  for (const file of files) {
    let data;
    try {
      data = readJson(file);
    } catch {
      parseErrors += 1;
      continue;
    }

    let cards = [];
    if (Array.isArray(data)) cards = data;
    else if (data && typeof data === "object") {
      const looksLikeSingle = !!(data.id && data.name);
      cards = looksLikeSingle ? [data] : Object.values(data);
    }

    for (const card of cards) {
      const entry = toCatalogEntry(card, packTitleById);
      if (!entry) continue;

      const prev = byCode.get(entry.code);
      if (!prev) byCode.set(entry.code, entry);
      else {
        byCode.set(entry.code, {
          ...prev,
          ...entry,
          imageUrl: prev.imageUrl || entry.imageUrl,
          setName: prev.setName || entry.setName,
          rarity: prev.rarity || entry.rarity,
          color: prev.color || entry.color,
          type: prev.type || entry.type,
          cost: prev.cost || entry.cost,
          power: prev.power || entry.power,
          packId: prev.packId || entry.packId,
          set: prev.set || entry.set,
        });
      }
    }
  }

  const out = Array.from(byCode.values()).sort((a, b) =>
    a.code.localeCompare(b.code)
  );

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(out, null, 2), "utf-8");

  console.log(`✅ Wrote ${out.length} cards to ${outFile}`);
  if (parseErrors) console.log(`⚠️ JSON parse errors: ${parseErrors}`);
}

main();
