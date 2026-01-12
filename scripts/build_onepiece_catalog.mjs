import fs from "node:fs/promises";
import path from "node:path";

const OUT_PATH = path.join(process.cwd(), "public", "catalog", "onepiece_cards.json");

// OPTCG API (open, GET-only)
const BASE = "https://optcgapi.com";
const endpoints = [
  { name: "Set Cards", url: `${BASE}/api/allSetCards/` },
  { name: "Starter Deck Cards", url: `${BASE}/api/allSTCards/` },
  { name: "Promo Cards", url: `${BASE}/api/allPromoCards/` }, // pode estar offline (404)
];

function pick(obj, keys) {
  for (const k of keys) {
    if (obj && obj[k] !== undefined && obj[k] !== null && obj[k] !== "") return obj[k];
  }
  return undefined;
}

function normalizeCard(raw) {
  // Código “real” que queremos usar na app
  const code = raw?.card_set_id ?? raw?.card_image_id ?? raw?.card_id ?? raw?.id;
  const name = raw?.card_name ?? raw?.name;

  if (!code || !name) return null;

  // set_id vem como "OP-01" mas o código é "OP01-077"
  const setFromCode = String(code).split("-")[0]; // OP01, ST10, EB01...
  const set = raw?.set_id ?? setFromCode;

  return {
    code: String(code).toUpperCase().trim(),        // OP01-077
    name: String(name).trim(),                      // Perona
    set: String(set).trim(),                        // OP-01 (ou OP01 fallback)
    setName: raw?.set_name ? String(raw.set_name) : undefined,
    rarity: raw?.rarity ? String(raw.rarity) : undefined,
    color: raw?.card_color ? String(raw.card_color) : undefined,
    type: raw?.card_type ? String(raw.card_type) : undefined,
    imageUrl: raw?.card_image ? String(raw.card_image) : undefined,

    // extra (não obrigatório agora, mas já vem “de borla”)
    cost: raw?.card_cost != null ? String(raw.card_cost) : undefined,
    power: raw?.card_power != null ? String(raw.card_power) : undefined,

    // preços (do scrape da OPTCG API — úteis para testar tendências mais tarde)
    marketPrice: raw?.market_price != null ? Number(raw.market_price) : undefined,
    inventoryPrice: raw?.inventory_price != null ? Number(raw.inventory_price) : undefined,
    scrapedAt: raw?.date_scraped ? String(raw.date_scraped) : undefined,
  };
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Falha a pedir ${url} (${res.status})`);
  }
  return res.json();
}

async function main() {
  console.log("A buscar cartas da OPTCG API...");
  console.log("Isto é só para gerar o catálogo local (não é para correr a cada pedido).");

  const all = [];
 for (const ep of endpoints) {
  console.log("GET", ep.url);

  try {
    const data = await fetchJson(ep.url);

    if (Array.isArray(data)) all.push(...data);
    else if (data && Array.isArray(data.data)) all.push(...data.data);
    else if (data && typeof data === "object") all.push(...Object.values(data));
  } catch (err) {
    console.warn(`⚠️ Falhou ${ep.name}: ${err.message ?? err}`);
    console.warn("⚠️ A continuar sem esta fonte (o catálogo vai ser gerado na mesma).");
  }
}


  console.log("Total bruto:", all.length);
  console.log("Exemplo (primeiro item):");
console.log(JSON.stringify(all[0], null, 2));

  const byCode = new Map();
  for (const raw of all) {
    const c = normalizeCard(raw);
    if (!c) continue;
    // se houver duplicados, fica o primeiro com mais info (tens margem para melhorar depois)
    if (!byCode.has(c.code)) byCode.set(c.code, c);
  }

  const catalog = [...byCode.values()].sort((a, b) => a.code.localeCompare(b.code));
  console.log("Total normalizado:", catalog.length);

  await fs.mkdir(path.dirname(OUT_PATH), { recursive: true });
  await fs.writeFile(OUT_PATH, JSON.stringify(catalog, null, 2), "utf-8");

  console.log("✅ Catálogo guardado em:", OUT_PATH);
}

main().catch((err) => {
  console.error("❌ Erro:", err);
  process.exit(1);
});
