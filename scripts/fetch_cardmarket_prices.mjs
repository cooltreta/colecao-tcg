// scripts/fetch_cardmarket_prices.mjs
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const ROOT = process.cwd();
const CATALOG_PATH = path.join(ROOT, "public", "catalog", "onepiece_cards.json");
// onde guardar o cache de preços
const OUT_PATH = path.join(ROOT, "public", "cardmarket_prices.json");

const TTL_HOURS = 24;          // só refresca se tiver mais velho que isto
const CONCURRENCY = 1;         // alpha: 1 é mais seguro
const RANDOM_DELAY_MS = [350, 850];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function randBetween(a, b) {
  return Math.floor(a + Math.random() * (b - a + 1));
}

function parseEuroNumber(text) {
  // exemplos: "0,42 €" , "2.608,15 €"
  if (!text) return null;
  const cleaned = text
    .replace(/\s/g, "")
    .replace("€", "")
    .replace(/\./g, "")   // milhares
    .replace(",", ".");   // decimal
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function readJsonSafe(p, fallback) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return fallback;
  }
}

function isStale(iso) {
  if (!iso) return true;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return true;
  const ageH = (Date.now() - t) / (1000 * 60 * 60);
  return ageH > TTL_HOURS;
}

// tenta ir direto via Products/Search (normalmente cai na página do produto)
function buildSearchUrl({ name, code }) {
  // usar nome+code melhora o match
  const q = `${name ?? ""} ${code}`.trim();
  const qs = encodeURIComponent(q);
  return `https://www.cardmarket.com/en/OnePiece/Products/Search?searchString=${qs}`;
}

async function extractPrices(page) {
  // Na página do produto aparecem linhas tipo:
  // "Price Trend 0,42 €" e "30-days average price 0,32 €" :contentReference[oaicite:2]{index=2}

  // estratégia robusta: procurar o texto e ler o valor a seguir
  // (seletores HTML mudam, texto costuma ficar)
  const bodyText = await page.locator("body").innerText();

  const trendMatch = bodyText.match(/Price Trend\s*([\d.,]+)\s*€/i);
  const avg30Match = bodyText.match(/30-days average price\s*([\d.,]+)\s*€/i);

  const trendEur = trendMatch ? parseEuroNumber(`${trendMatch[1]} €`) : null;
  const avg30Eur = avg30Match ? parseEuroNumber(`${avg30Match[1]} €`) : null;

  return { trendEur, avg30Eur };
}

async function fetchOne({ browser, entry }) {
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
  });
  const page = await context.newPage();

  const url = buildSearchUrl(entry);

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });

    // se aparecer “Contact Support” é um sinal de bloqueio/edge case
    // ainda assim tentamos extrair do body
    await page.waitForTimeout(500);

    const { trendEur, avg30Eur } = await extractPrices(page);

    return {
      ok: trendEur != null || avg30Eur != null,
      trendEur,
      avg30Eur,
      url: page.url(),
    };
  } catch (e) {
    return { ok: false, trendEur: null, avg30Eur: null, url, error: String(e?.message ?? e) };
  } finally {
    await context.close();
  }
}

async function main() {
  const catalog = readJsonSafe(CATALOG_PATH, []);
  if (!Array.isArray(catalog) || catalog.length === 0) {
    throw new Error(`Catálogo vazio ou não encontrado em ${CATALOG_PATH}`);
  }

  const existing = readJsonSafe(OUT_PATH, {});
  const out = { ...existing };

  // queue: só os que faltam ou estão stale
  const queue = [];
  for (const c of catalog) {
    const code = String(c.code ?? "").toUpperCase().trim();
    if (!code) continue;

    const prev = out[code];
    if (!prev || isStale(prev.fetchedAt)) {
      queue.push({ code, name: c.name ?? "", set: c.set ?? "" });
    }
  }

  console.log(`Catalog: ${catalog.length} | To fetch: ${queue.length} (TTL ${TTL_HOURS}h)`);

  const browser = await chromium.launch({ headless: true });

  try {
    let i = 0;
    while (i < queue.length) {
      const batch = queue.slice(i, i + CONCURRENCY);
      const results = await Promise.all(
        batch.map(async (entry) => {
          const r = await fetchOne({ browser, entry });
          await sleep(randBetween(...RANDOM_DELAY_MS));
          return { entry, r };
        })
      );

      for (const { entry, r } of results) {
        const code = entry.code;
        if (r.ok) {
          out[code] = {
            trendEur: r.trendEur,
            avg30Eur: r.avg30Eur,
            fetchedAt: new Date().toISOString(),
            url: r.url,
          };
          console.log(`[OK] ${code} trend=${r.trendEur ?? "-"} avg30=${r.avg30Eur ?? "-"} (${r.url})`);
        } else {
          // mantém o que já havia (se existia), e marca tentativa
          out[code] = {
            ...(out[code] ?? {}),
            fetchedAt: out[code]?.fetchedAt ?? null,
            lastErrorAt: new Date().toISOString(),
            lastError: r.error ?? "No prices found",
            url: r.url,
          };
          console.log(`[FAIL] ${code} (${r.url}) ${r.error ?? ""}`);
        }
      }

      fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2), "utf8");
      i += CONCURRENCY;
    }
  } finally {
    await browser.close();
  }

  console.log(`Saved: ${OUT_PATH}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
