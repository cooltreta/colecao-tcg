"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ensureDefaultCollection,
  getActiveCollectionId,
} from "@/lib/storage/bootstrap";
import { indexedDbProvider } from "@/lib/storage/indexedDbProvider";
import { getByCode, hasCardCode, loadCatalog } from "@/lib/catalog/localCatalog";
import type { CatalogEntry } from "@/lib/catalog/localCatalog";
import AddCardBar from "@/components/AddCardBar";
import { randomId, nowIso } from "@/lib/storage/keys";
import type { CollectionItem } from "@/lib/storage/types";
import CardDetailsModal from "@/components/CardDetailsModal";
import { parseCsv } from "@/lib/utils/csv";

type UiItem = CollectionItem & {
  name?: string | null;
  imageUrl?: string | null;
  marketPrice?: number | null;
  set?: string | null;
  setName?: string | null;
};

type SetGroup = {
  setCode: string;
  setName: string;
  items: UiItem[];
  totalCards: number; // soma qty
  uniqueItems: number; // linhas (itens)
  ownedUniqueCodes: number; // para completion
  totalInSet: number | null; // total do catálogo
  missingInSet: number | null;
};

function padLikeTotal(n: number, total: number) {
  const w = Math.max(String(total).length, 2);
  return String(n).padStart(w, "0");
}

type ViewMode = "list" | "binder";
type TileSize = "sm" | "md" | "lg";

export default function CollectionPage() {
  const [items, setItems] = useState<UiItem[]>([]);
  const [query, setQuery] = useState("");

  const [selected, setSelected] = useState<UiItem | null>(null);
  const [selectedCatalog, setSelectedCatalog] = useState<CatalogEntry | null>(
    null
  );
  const [modalOpen, setModalOpen] = useState(false);

  // ===== Import CSV state =====
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [importStatus, setImportStatus] = useState<string>("");
  const [importErrors, setImportErrors] = useState<string[]>([]);
  // ============================

  // preços ==========================
  const pricesInputRef = useRef<HTMLInputElement | null>(null);
  const [priceImportStatus, setPriceImportStatus] = useState("");
  const [priceImportErrors, setPriceImportErrors] = useState<string[]>([]);

  // ===== Catálogo + Totais por Set =====
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [setTotals, setSetTotals] = useState<Record<string, number>>({});
  const [setNames, setSetNames] = useState<Record<string, string>>({});
  // ====================================

  // ===== Modal "Ver faltas" =====
  const [missingOpen, setMissingOpen] = useState(false);
  const [missingSetCode, setMissingSetCode] = useState<string>("");
  const [missingSetName, setMissingSetName] = useState<string>("");
  const [missingCards, setMissingCards] = useState<CatalogEntry[]>([]);
  const [missingFilter, setMissingFilter] = useState("");
  const [missingLoading, setMissingLoading] = useState(false);
  // ==============================

  // ===== UI: view modes / accordion / binder options =====
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [expandedSetCode, setExpandedSetCode] = useState<string | null>(null);

  const [binderShowMissing, setBinderShowMissing] = useState(true);
  const [tileSize, setTileSize] = useState<TileSize>("md");

  const INITIAL_SHOW = 70;
  const STEP_SHOW = 70;
  const [showCountBySet, setShowCountBySet] = useState<Record<string, number>>(
    {}
  );
  // ======================================================

  // ===== Preload cache para imagens =====
  const preloadedUrlsRef = useRef<Set<string>>(new Set());

function preloadImagesFromCatalog(list: CatalogEntry[], limit = 96) {
  const urls = list
    .map((x) => x.imageUrl)
    .filter((u): u is string => Boolean(u))
    .slice(0, limit);

  for (const url of urls) {
    if (preloadedUrlsRef.current.has(url)) continue;
    preloadedUrlsRef.current.add(url);

    // 1) Preload via <link> (ajuda MUITO em grids)
    if (typeof document !== "undefined") {
      const link = document.createElement("link");
      link.rel = "preload";
      link.as = "image";
      link.href = url;
      document.head.appendChild(link);
    }

    // 2) Warm cache via Image()
    const img = new Image();
    img.decoding = "async";
    img.src = url;
  }
}
  // =====================================

  // ======= SUMMARY STATS (BÓNUS) =======
  const stats = useMemo(() => {
    const unique = items.length;

    let totalCards = 0;
    let estimatedValue = 0;
    let missingPrice = 0;

    for (const it of items) {
      totalCards += it.qty;

      const p = typeof it.marketPrice === "number" ? it.marketPrice : null;
      if (p == null) missingPrice += it.qty;
      else estimatedValue += it.qty * p;
    }

    return { unique, totalCards, estimatedValue, missingPrice };
  }, [items]);

  const money = useMemo(() => {
    return new Intl.NumberFormat("pt-PT", {
      style: "currency",
      currency: "EUR",
    });
  }, []);

  function completionColor(ratio: number) {
  if (ratio >= 1) return "bg-green-500";
  if (ratio >= 0.7) return "bg-yellow-400";
  return "bg-red-500";
}


  const completion = useMemo(() => {
  const totalCatalog = catalog.length;

  const ownedUniqueCodes = new Set(
    items.map((it) => it.cardCode.toUpperCase())
  ).size;

  const ratio = totalCatalog > 0 ? ownedUniqueCodes / totalCatalog : 0;
  const percent = Math.round(ratio * 1000) / 10; // 1 decimal

  return { totalCatalog, ownedUniqueCodes, ratio, percent };
}, [items, catalog]);

  // ====================================

  async function load() {
    await ensureDefaultCollection();
    const collectionId = await getActiveCollectionId();
    const raw = await indexedDbProvider.listItems(collectionId);
    const prices = await indexedDbProvider.listPrices();
    const priceByCode = new Map(prices.map((p) => [p.cardCode.toUpperCase(), p]));

    const enriched: UiItem[] = [];
    for (const it of raw) {
      const c = await getByCode(it.cardCode);
      const p = priceByCode.get(it.cardCode.toUpperCase());
      const marketPrice =
        typeof p?.trendEur === "number" ? p.trendEur : c?.marketPrice ?? null;

      enriched.push({
        ...it,
        name: c?.name ?? null,
        imageUrl: c?.imageUrl ?? null,
        marketPrice,
        set: c?.set ?? null,
        setName: c?.setName ?? null,
      });

    }

    enriched.sort((a, b) => a.cardCode.localeCompare(b.cardCode));
    setItems(enriched);
  }

  useEffect(() => {
    (async () => {
      await ensureDefaultCollection();

      const data = await loadCatalog();
      setCatalog(data);

      const totals: Record<string, number> = {};
      const names: Record<string, string> = {};

      for (const c of data) {
        const sc = (c.set ?? "UNKNOWN").toUpperCase();
        totals[sc] = (totals[sc] ?? 0) + 1;
        if (c.setName && !names[sc]) names[sc] = c.setName;
      }

      setSetTotals(totals);
      setSetNames(names);

      await load();
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (it) =>
        it.cardCode.toLowerCase().includes(q) ||
        (it.name ?? "").toLowerCase().includes(q)
    );
  }, [items, query]);

  const isSearching = query.trim().length > 0;

  // ======= GROUP BY SET + COMPLETION =======
  const groupedBySet: SetGroup[] = useMemo(() => {
    const map = new Map<string, UiItem[]>();

    for (const it of filtered) {
      const setCode = (it.set ?? "UNKNOWN").toUpperCase();
      const arr = map.get(setCode) ?? [];
      arr.push(it);
      map.set(setCode, arr);
    }

    const groups: SetGroup[] = [];
    for (const [setCode, arr] of map.entries()) {
      const totalCards = arr.reduce((sum, x) => sum + x.qty, 0);
      const uniqueItems = arr.length;

      const ownedUniqueCodes = new Set(arr.map((x) => x.cardCode)).size;

      const totalInSet =
        typeof setTotals[setCode] === "number" ? setTotals[setCode] : null;

      const missingInSet =
        totalInSet == null ? null : Math.max(0, totalInSet - ownedUniqueCodes);

      const setName =
        (arr.find((x) => x.setName && x.setName.trim())?.setName?.trim() ||
          setNames[setCode] ||
          setCode) ?? setCode;

      arr.sort((a, b) => a.cardCode.localeCompare(b.cardCode));

      groups.push({
        setCode,
        setName,
        items: arr,
        totalCards,
        uniqueItems,
        ownedUniqueCodes,
        totalInSet,
        missingInSet,
      });
    }

    groups.sort((a, b) => {
      if (a.setCode === "UNKNOWN" && b.setCode !== "UNKNOWN") return 1;
      if (b.setCode === "UNKNOWN" && a.setCode !== "UNKNOWN") return -1;
      return a.setCode.localeCompare(b.setCode);
    });

    return groups;
  }, [filtered, setTotals, setNames]);
  // ========================================

  // Index do catálogo por Set
  const catalogBySet = useMemo(() => {
    const map = new Map<string, CatalogEntry[]>();
    for (const c of catalog) {
      const sc = (c.set ?? "UNKNOWN").toUpperCase();
      const arr = map.get(sc) ?? [];
      arr.push(c);
      map.set(sc, arr);
    }
    for (const [k, arr] of map.entries()) {
      arr.sort((a, b) => a.code.localeCompare(b.code));
      map.set(k, arr);
    }
    return map;
  }, [catalog]);

  // ===== PRECOMPUTES por set (SEM hooks dentro de loop) =====
  const binderComputedBySet = useMemo(() => {
    const q = query.trim().toLowerCase();

    const result = new Map<
      string,
      {
        ownedCodes: Set<string>;
        ownedFirstByCode: Map<string, UiItem>;
        qtyByCode: Map<string, number>;
        allEntries: CatalogEntry[];
        filteredEntries: CatalogEntry[];
        ownedEntries: CatalogEntry[];
      }
    >();

    for (const g of groupedBySet) {
      const ownedCodes = new Set(g.items.map((x) => x.cardCode.toUpperCase()));
      
      const ownedFirstByCode = new Map<string, UiItem>();
      for (const it of g.items) {
        const k = it.cardCode.toUpperCase();
        if (!ownedFirstByCode.has(k)) ownedFirstByCode.set(k, it);
      }

      const qtyByCode = new Map<string, number>();
      for (const it of g.items) {
        const k = it.cardCode.toUpperCase();
        qtyByCode.set(k, (qtyByCode.get(k) ?? 0) + it.qty);
      }


      const allEntries = catalogBySet.get(g.setCode) ?? [];
      
      const filteredEntries =
        !q
          ? allEntries
          : allEntries.filter(
              (c) =>
                c.code.toLowerCase().includes(q) ||
                (c.name ?? "").toLowerCase().includes(q)
            );
      const ownedEntries = allEntries.filter((c) => ownedCodes.has(c.code.toUpperCase()));
      result.set(g.setCode, {
        ownedCodes,
        ownedFirstByCode,
        qtyByCode,
        allEntries,
        filteredEntries,
        ownedEntries,
      });
    }

    return result;
  }, [groupedBySet, catalogBySet, query]);
  // =========================================================

  // Preload quando expandes um set no binder
  useEffect(() => {
    if (viewMode !== "binder") return;
    if (!expandedSetCode) return;
    const pack = binderComputedBySet.get(expandedSetCode);
    if (!pack) return;
    preloadImagesFromCatalog(pack.allEntries, 160);
  }, [viewMode, expandedSetCode, binderComputedBySet]);

  async function openDetails(it: UiItem) {
    setSelected(it);
    setModalOpen(true);
    const c = await getByCode(it.cardCode);
    setSelectedCatalog(c);
  }

  function closeDetails() {
    setModalOpen(false);
    setSelectedCatalog(null);
    setSelected(null);
  }

  function openDetailsFromCatalog(c: CatalogEntry) {
    const pseudo: UiItem = {
      id: `missing:${c.code}`,
      collectionId: "",
      cardCode: c.code.toUpperCase(),
      qty: 0,
      variant: "normal",
      condition: "NM",
      language: "EN",
      createdAt: "",
      updatedAt: "",
      name: c.name ?? null,
      imageUrl: c.imageUrl ?? null,
      marketPrice: c.marketPrice ?? null,
      set: c.set ?? null,
      setName: c.setName ?? null,
    };

    setSelected(pseudo);
    setSelectedCatalog(c);
    setModalOpen(true);
  }

  // ===== Ver faltas =====
  function openMissingForSet(group: SetGroup) {
    const setCode = group.setCode;

    setMissingLoading(true);
    setMissingOpen(true);

    const ownedCodes = new Set(group.items.map((x) => x.cardCode.toUpperCase()));

    const missing = catalog
      .filter((c) => (c.set ?? "UNKNOWN").toUpperCase() === setCode)
      .filter((c) => !ownedCodes.has(c.code.toUpperCase()))
      .sort((a, b) => a.code.localeCompare(b.code));

    preloadImagesFromCatalog(missing, 48);

    setMissingSetCode(setCode);
    setMissingSetName(group.setName);
    setMissingCards(missing);
    setMissingFilter("");

    setTimeout(() => setMissingLoading(false), 0);
  }

  function closeMissing() {
    setMissingOpen(false);
    setMissingCards([]);
    setMissingSetCode("");
    setMissingSetName("");
    setMissingFilter("");
    setMissingLoading(false);
  }

  const missingFiltered = useMemo(() => {
    const q = missingFilter.trim().toLowerCase();
    if (!q) return missingCards;
    return missingCards.filter(
      (c) =>
        c.code.toLowerCase().includes(q) ||
        (c.name ?? "").toLowerCase().includes(q)
    );
  }, [missingCards, missingFilter]);

  async function addMissingCard(code: string) {
    setMissingCards((prev) =>
      prev.filter((x) => x.code.toUpperCase() !== code.toUpperCase())
    );
    await addCard(code, 1);
  }
  // ======================

  async function changeQty(itemId: string, delta: number) {
    const collectionId = await getActiveCollectionId();
    const raw = await indexedDbProvider.listItems(collectionId);
    const target = raw.find((x) => x.id === itemId);
    if (!target) return;

    const newQty = target.qty + delta;

    if (newQty <= 0) {
      await indexedDbProvider.deleteItem(itemId);
    } else {
      await indexedDbProvider.upsertItem({
        ...target,
        qty: newQty,
        updatedAt: nowIso(),
      });
    }

    await load();
  }

  async function deleteItem(itemId: string) {
    await indexedDbProvider.deleteItem(itemId);
    await load();
  }

  async function addCard(code: string, qty: number) {
    const collectionId = await getActiveCollectionId();
    const ts = nowIso();

    const existing = await indexedDbProvider.listItems(collectionId);

    const variant = "normal";
    const condition = "NM";
    const language = "EN";

    const normalizedCode = code.toUpperCase().trim();
    const key = `${normalizedCode}__${variant}__${condition}__${language}`;

    const byKey = new Map(
      existing.map((it) => [
        `${it.cardCode}__${it.variant}__${it.condition}__${it.language}`,
        it,
      ])
    );

    const found = byKey.get(key);

    if (found) {
      await indexedDbProvider.upsertItem({
        ...found,
        qty: found.qty + qty,
        updatedAt: ts,
      });
    } else {
      await indexedDbProvider.upsertItem({
        id: randomId("item"),
        collectionId,
        cardCode: normalizedCode,
        qty,
        variant,
        condition,
        language,
        createdAt: ts,
        updatedAt: ts,
      });
    }

    await load();
  }

  // ============ IMPORT CSV ============
  const keyOf = (
    code: string,
    variant: string,
    condition: string,
    language: string
  ) => `${code}__${variant}__${condition}__${language}`;

  function parsePricesCsv(text: string) {
    // Esperado: code,trend_eur,avg30_eur,updated_at,url
    // Aceita também apenas: code,trend_eur,avg30_eur
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length === 0) return [];

    const header = lines[0].toLowerCase();
    const startIdx = header.includes("code") ? 1 : 0;

    const out: {
      cardCode: string;
      trendEur: number | null;
      avg30Eur: number | null;
      updatedAt: string;
      url?: string | null;
    }[] = [];

    for (let i = startIdx; i < lines.length; i++) {
      const cols = lines[i].split(",");
      const code = (cols[0] ?? "").trim().toUpperCase();
      if (!code) continue;

      const trend = cols[1] != null && cols[1].trim() !== "" ? Number(cols[1]) : null;
      const avg30 = cols[2] != null && cols[2].trim() !== "" ? Number(cols[2]) : null;

      const updatedAt = (cols[3] ?? "").trim() || new Date().toISOString();
      const url = (cols[4] ?? "").trim() || null;

      out.push({
        cardCode: code,
        trendEur: Number.isFinite(trend as number) ? (trend as number) : null,
        avg30Eur: Number.isFinite(avg30 as number) ? (avg30 as number) : null,
        updatedAt,
        url,
      });
    }

    return out;
  }

  async function handleImportPricesFile(file: File) {
    setPriceImportStatus("A ler CSV de preços...");
    setPriceImportErrors([]);

    try {
      const text = await file.text();
      const rows = parsePricesCsv(text);

      if (rows.length === 0) {
        setPriceImportStatus("CSV de preços vazio (ou sem linhas válidas).");
        return;
      }

      setPriceImportStatus("A gravar preços no IndexedDB...");
      await indexedDbProvider.bulkUpsertPrices(rows);

      setPriceImportStatus(`Preços importados: ${rows.length} linha(s).`);
      await load(); // recarrega para refletir no UI
    } catch (e: any) {
      setPriceImportStatus("Erro no import de preços.");
      setPriceImportErrors([e?.message ?? "Erro desconhecido"]);
    } finally {
      if (pricesInputRef.current) pricesInputRef.current.value = "";
    }
  }


  async function handleImportFile(file: File) {
    setImportStatus("A ler CSV...");
    setImportErrors([]);

    try {
      const text = await file.text();
      const rows = parseCsv(text);

      if (rows.length === 0) {
        setImportStatus("CSV vazio (ou sem linhas válidas).");
        return;
      }

      await ensureDefaultCollection();
      const collectionId = await getActiveCollectionId();

      setImportStatus("A validar códigos...");
      const bad: string[] = [];
      for (const r of rows) {
        const ok = await hasCardCode(r.code);
        if (!ok) bad.push(r.code);
      }

      if (bad.length > 0) {
        setImportErrors([
          `Códigos não encontrados no catálogo (sample): ${bad
            .slice(0, 20)
            .join(", ")}${bad.length > 20 ? "..." : ""}`,
          "Por agora o catálogo é só um sample. Já a seguir metemos o catálogo completo.",
        ]);
        setImportStatus("Falhou validação.");
        return;
      }

      setImportStatus("A gravar no IndexedDB...");

      const ts = nowIso();
      const existing = await indexedDbProvider.listItems(collectionId);

      const byKey = new Map(
        existing.map((it) => [
          keyOf(it.cardCode, it.variant, it.condition, it.language),
          it,
        ])
      );

      const toUpsert: CollectionItem[] = [];

      for (const r of rows) {
        const code = r.code.toUpperCase().trim();
        const k = keyOf(code, r.variant, r.condition, r.language);
        const found = byKey.get(k);

        if (found) {
          const updated: CollectionItem = {
            ...found,
            qty: found.qty + r.qty,
            updatedAt: ts,
          };
          toUpsert.push(updated);
          byKey.set(k, updated);
        } else {
          const created: CollectionItem = {
            id: randomId("item"),
            collectionId,
            cardCode: code,
            qty: r.qty,
            variant: r.variant,
            condition: r.condition,
            language: r.language,
            createdAt: ts,
            updatedAt: ts,
          };
          toUpsert.push(created);
          byKey.set(k, created);
        }
      }

      await indexedDbProvider.bulkUpsertItems(toUpsert);

      setImportStatus(`Import concluído: ${toUpsert.length} linhas importadas.`);
      await load();
    } catch (e: any) {
      setImportStatus("Erro no import.");
      setImportErrors([e?.message ?? "Erro desconhecido"]);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }
  // ===================================

  function toggleSet(setCode: string) {
    setExpandedSetCode((prev) => {
      const next = prev === setCode ? null : setCode;
      if (next) {
        setShowCountBySet((m) => ({
          ...m,
          [next]: m[next] ?? INITIAL_SHOW,
        }));
      }
      return next;
    });
  }

  function showMore(setCode: string) {
    setShowCountBySet((m) => ({
      ...m,
      [setCode]: (m[setCode] ?? INITIAL_SHOW) + STEP_SHOW,
    }));
  }

  const tileDims =
    tileSize === "sm"
      ? "h-28 w-20"
      : tileSize === "md"
      ? "h-36 w-26"
      : "h-44 w-32";

  const tileGrid =
    tileSize === "sm"
      ? "grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8"
      : tileSize === "lg"
      ? "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6"
      : "grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7";

  return (
    <main className="mx-auto max-w-5xl p-6">
      {/* topo */}
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Coleção</h1>
          <p className="mt-1 text-sm text-gray-500">
            Guardado localmente (IndexedDB)
          </p>
        </div>

        <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row md:items-center md:justify-end">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleImportFile(f);
            }}
          />
          <input
            ref={pricesInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleImportPricesFile(f);
            }}
          />

          <button
            className="rounded-lg border px-3 py-2 text-sm md:w-auto"
            onClick={() => pricesInputRef.current?.click()}
            title="Importar CSV de preços (Cardmarket)"
          >
            Importar Preços
          </button>
          <button
          className="rounded-lg border px-3 py-2 text-sm md:w-auto"
          onClick={() => {
            const a = document.createElement("a");
            a.href = "/examples/import_collection_example.csv";
            a.download = "import_collection_example.csv";
            document.body.appendChild(a);
            a.click();
            a.remove();
          }}
          title="Download CSV exemplo"
        >
          CSV Exemplo
        </button>

          <button
            className="rounded-lg border px-3 py-2 text-sm md:w-auto"
            onClick={() => fileInputRef.current?.click()}
            title="Importar CSV"
          >
            Importar CSV
          </button>


        </div>
      </div>

      {/* summary */}
      <div className="mt-6 rounded-xl border bg-black p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div>
            <div className="text-xs text-gray-500">Total de cartas</div>
            <div className="text-2xl font-semibold">{stats.totalCards}</div>
          </div>

          <div>
            <div className="text-xs text-gray-500">Únicas</div>
            <div className="text-2xl font-semibold">{stats.unique}</div>
          </div>
            <div>
              <div className="text-xs text-gray-500">Completado</div>

              <div className="mt-1 flex items-baseline gap-2">
                <div className="text-2xl font-semibold">{completion.percent}%</div>
                <div className="text-xs text-gray-500">
                  ({completion.ownedUniqueCodes}/{completion.totalCatalog})
                </div>
              </div>
              {completion.ratio === 1 && (
                <div className="mb-1 inline-block rounded bg-green-500 px-2 py-0.5 text-[10px] font-semibold text-black">
                  COMPLETO
                </div>
              )}

              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-800">
                <div
                  className={`h-full rounded-full transition-all ${completionColor(
      completion.ratio
    )}`}
                  style={{ width: `${Math.min(100, completion.ratio * 100)}%` }}
                />
              </div>
            </div>

          <div>
            <div className="text-xs text-gray-500">Valor estimado</div>
            <div className="text-2xl font-semibold">
              {money.format(stats.estimatedValue)}
            </div>

            {stats.missingPrice > 0 && (
              <div className="mt-1 text-xs text-gray-500">
                {stats.missingPrice} carta(s) sem preço no catálogo
              </div>
            )}
          </div>
                {(priceImportStatus || priceImportErrors.length > 0) && (
        <div className="mt-2">
          {priceImportStatus && (
            <p className="text-sm text-gray-700">{priceImportStatus}</p>
          )}

          {priceImportErrors.length > 0 && (
            <div className="mt-2 rounded-lg border border-red-300 bg-red-50 p-4 text-sm">
              <ul className="list-disc pl-5">
                {priceImportErrors.map((er, i) => (
                  <li key={i}>{er}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

        </div>
      </div>

      {/* import status */}
      {(importStatus || importErrors.length > 0) && (
        <div className="mt-4">
          {importStatus && (
            <p className="text-sm text-gray-700">{importStatus}</p>
          )}

          {importErrors.length > 0 && (
            <div className="mt-2 rounded-lg border border-red-300 bg-red-50 p-4 text-sm">
              <ul className="list-disc pl-5">
                {importErrors.map((er, i) => (
                  <li key={i}>{er}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="mt-6">
        <AddCardBar onAdd={addCard} />
      </div>

      {/* search + toggles */}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <input
          className="w-full rounded-lg border px-3 py-2 text-sm sm:max-w-md"
          placeholder="Pesquisar por código ou nome..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border p-1">
            <button
              className={`rounded-md px-3 py-1.5 text-xs ${
                viewMode === "list" ? "bg-black text-white" : ""
              }`}
              onClick={() => setViewMode("list")}
            >
              Lista
            </button>
            <button
              className={`rounded-md px-3 py-1.5 text-xs ${
                viewMode === "binder" ? "bg-black text-white" : ""
              }`}
              onClick={() => setViewMode("binder")}
            >
              Binder
            </button>
          </div>

          {viewMode === "binder" && (
            <>
              <button
                className={`rounded-lg border px-3 py-2 text-xs ${
                  binderShowMissing ? "bg-black text-white" : ""
                }`}
                onClick={() => setBinderShowMissing((v) => !v)}
              >
                {binderShowMissing ? "Owned + Missing" : "Só owned"}
              </button>

              <select
                className="rounded-lg border px-3 py-2 text-xs"
                value={tileSize}
                onChange={(e) => setTileSize(e.target.value as TileSize)}
              >
                <option value="sm" className="bg-black text-white">Tiles pequenos</option>
                <option value="md" className="bg-black text-white">Tiles médios</option>
                <option value="lg" className="bg-black text-white">Tiles grandes</option>
              </select>
            </>
          )}
        </div>
      </div>

      {/* conteúdo */}
      {filtered.length === 0 ? (
        <div className="mt-6 rounded-lg border p-4 text-sm text-gray-500">
          Sem cartas ainda.
        </div>
      ) : (
        <div className="mt-6 rounded-lg border">
          {viewMode === "list" && (
            <div className="hidden sm:grid grid-cols-12 gap-2 border-b bg-gray-50 p-3 text-xs font-semibold text-gray-600">
              <div className="col-span-1">Img</div>
              <div className="col-span-3">Código</div>
              <div className="col-span-4">Nome</div>
              <div className="col-span-2">Var/Cond/Lang</div>
              <div className="col-span-2 text-right">Qtd</div>
            </div>
          )}

          {groupedBySet.map((g) => {
            const completion =
              g.totalInSet == null
                ? `${g.ownedUniqueCodes}/?`
                : `${padLikeTotal(g.ownedUniqueCodes, g.totalInSet)}/${g.totalInSet}`;

            const setRatio =
              g.totalInSet && g.totalInSet > 0 ? g.ownedUniqueCodes / g.totalInSet : 0;

            const setPercent = Math.round(setRatio * 100);


            const isExpanded = isSearching || expandedSetCode === g.setCode;

            const pack = binderComputedBySet.get(g.setCode);
            const ownedCodes = pack?.ownedCodes ?? new Set<string>();
            const ownedFirstByCode = pack?.ownedFirstByCode ?? new Map<string, UiItem>();
            const qtyByCode = pack?.qtyByCode ?? new Map<string, number>();
            const baseEntries = binderShowMissing ? (pack?.filteredEntries ?? []) : (pack?.ownedEntries ?? []);
            
            

          // respeitar a pesquisa também no "Só owned"
          const qBinder = query.trim().toLowerCase();
          const binderEntries =
            !qBinder
              ? baseEntries
              : baseEntries.filter(
                  (c) =>
                    c.code.toLowerCase().includes(qBinder) ||
                    (c.name ?? "").toLowerCase().includes(qBinder)
                );

          const showLimit = showCountBySet[g.setCode] ?? INITIAL_SHOW;
          const visibleEntries = binderEntries.slice(0, showLimit);
          const hasMore = binderEntries.length > visibleEntries.length;


            return (
              <div key={g.setCode} className="border-b last:border-b-0">
                <div className="flex items-center justify-between gap-3 bg-black px-3 py-2">
                  <button
                    className="min-w-0 flex-1 text-left"
                    onClick={() => toggleSet(g.setCode)}
                  >
                    <div className="flex flex-wrap items-baseline gap-2">
                      <div className="text-sm font-semibold truncate text-white">
                        {g.setName}
                      </div>
                      <div className="text-xs text-gray-400">({g.setCode})</div>

                      <div className="ml-1 rounded bg-white px-2 py-0.5 text-xs font-mono text-black">
                        {completion}
                      </div>

                      {g.missingInSet != null && (
                        <div className="text-xs text-gray-400">
                          • faltam {g.missingInSet}
                        </div>
                      )}
                    </div>
                      {g.totalInSet != null && (
                        <div className="mt-2">
                          <div className="flex items-center justify-between text-[11px] text-gray-400">
                            <span>{setPercent}%</span>
                            <span>
                              {g.ownedUniqueCodes}/{g.totalInSet}
                            </span>
                          </div>
                        {setRatio === 1 && (
                            <div className="mb-1 inline-block rounded bg-green-500 px-2 py-0.5 text-[10px] font-semibold text-black">
                              COMPLETO
                            </div>
                          )}

                          <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-gray-800">
                            <div
                              className={`h-full rounded-full transition-all ${completionColor(setRatio)}`}
                              style={{ width: `${Math.min(100, setRatio * 100)}%` }}
                            />
                          </div>
                        </div>
                      )}

                    <div className="text-xs text-gray-400">
                      {g.totalCards} carta(s) (qty) • {g.uniqueItems} item(s)
                      {!isSearching && (
                        <span className="ml-2 text-gray-500">
                          • {isExpanded ? "aberto" : "fechado"}
                        </span>
                      )}
                    </div>
                  </button>

                  <button
                    className="rounded-lg border border-gray-700 bg-black px-3 py-1.5 text-xs text-white"
                    onClick={() => openMissingForSet(g)}
                  >
                    Ver faltas
                  </button>
                </div>

                {isExpanded && (
                  <>
                    {viewMode === "list" && (
                      <div>
                        {g.items.map((it) => (
                          <div
                            key={it.id}
                            className="border-t p-3 text-sm cursor-pointer hover:bg-gray-50 sm:grid sm:grid-cols-12 sm:items-center sm:gap-2"
                            onClick={() => void openDetails(it)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ")
                                void openDetails(it);
                            }}
                          >
                            <div className="flex items-center gap-3 sm:col-span-1">
                              {it.imageUrl ? (
                                <img
                                  src={it.imageUrl}
                                  alt={it.name ?? it.cardCode}
                                  className="h-20 w-20 rounded object-cover shrink-0 sm:h-10 sm:w-10"
                                  loading="lazy"
                                  decoding="async"
                                />
                              ) : (
                                <div className="h-10 w-10 rounded bg-black shrink-0" />
                              )}

                              {/* MOBILE INFO (apenas mobile) */}
                              <div className="min-w-0 sm:hidden">
                                <div className="font-mono text-xs text-gray-700">{it.cardCode}</div>
                                <div className="truncate text-sm">{it.name ?? "—"}</div>
                                <div className="mt-0.5 text-[11px] text-gray-500">
                                  {it.variant}/{it.condition}/{it.language}
                                </div>
                              </div>
                            </div>


                            <div className="hidden sm:block sm:col-span-3 font-mono">
                              {it.cardCode}
                            </div>

                            <div className="hidden sm:block sm:col-span-4">
                              <div className="truncate">{it.name ?? "—"}</div>
                            </div>

                            <div className="hidden sm:block sm:col-span-2 text-xs text-gray-500">
                              {it.variant}/{it.condition}/{it.language}
                            </div>

                            <div className="mt-3 flex items-center justify-end gap-2 sm:mt-0 sm:col-span-2 sm:justify-end">
                              <button
                                className="flex items-center gap-2 rounded border px-2 py-1 text-xs"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void changeQty(it.id, -1);
                                }}
                                title="Diminuir"
                              >
                                -
                              </button>

                              <span className="min-w-[2.5rem] text-center tabular-nums">
                                {it.qty}
                              </span>

                              <button
                                className="rounded border px-2 py-1 text-xs"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void changeQty(it.id, +1);
                                }}
                                title="Aumentar"
                              >
                                +
                              </button>

                              <button
                                className="rounded border px-2 py-1 text-xs"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void deleteItem(it.id);
                                }}
                                title="Remover"
                              >
                                🗑️
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {viewMode === "binder" && (
                      <div className="border-t border-gray-800 bg-black p-4 overflow-x-hidden">
                        <div className={`grid gap-3 ${tileGrid}`}>
                          {visibleEntries.map((c, idx) => {
                            const code = c.code.toUpperCase();
                            const owned = ownedCodes.has(code);
                            const qty = qtyByCode.get(code) ?? 0;
                            const ownedItem = ownedFirstByCode.get(code); // para saber o id a alterar

                            if (!owned && !binderShowMissing) return null;

                            return (
                              <div
                                key={c.code}
                                className={`group relative rounded-lg border border-gray-800 bg-black p-2 hover:border-gray-600 cursor-pointer ${
                                  owned ? "" : "opacity-40 grayscale"
                                }`}
                                onClick={() => {
                                  if (owned) {
                                    const it = ownedFirstByCode.get(code);
                                    if (it) void openDetails(it);
                                    else openDetailsFromCatalog(c);
                                  } else {
                                    openDetailsFromCatalog(c);
                                  }
                                }}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    if (owned) {
                                      const it = ownedFirstByCode.get(code);
                                      if (it) void openDetails(it);
                                      else openDetailsFromCatalog(c);
                                    } else {
                                      openDetailsFromCatalog(c);
                                    }
                                  }
                                }}
                                title={c.name ?? c.code}
                              >
                                <div
                                  className={`mx-auto ${tileDims} overflow-hidden rounded-md bg-gray-900`}
                                >
                                  {c.imageUrl ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                      src={c.imageUrl}
                                      alt={c.name ?? c.code}
                                      className="h-full w-full object-cover"
                                      loading={idx < 30 ? "eager" : "lazy"}
                                      decoding="async"
                                      fetchPriority={idx < 30 ? "high" : "auto"}
                                    />
                                  ) : (
                                    <div className="h-full w-full bg-gray-800" />
                                  )}

                                    {owned && qty > 0 && (
                                      <div className="absolute right-2 top-2 rounded bg-white px-2 py-0.5 text-[10px] font-semibold text-black shadow">
                                        x{qty}
                                      </div>
                                    )}
                                </div>

                                <div className="mt-2 flex items-center justify-between gap-2">
                                  <div className="min-w-0">
                                    <div className="truncate font-mono text-[10px] text-gray-200">
                                      {c.code}
                                    </div>
                                    <div className="truncate text-[10px] text-gray-400">
                                      {c.name ?? "—"}
                                    </div>
                                  </div>

                                  {owned ? (
                                        <div className="flex gap-1">
                                          <button
                                            className="rounded-md bg-white px-2 py-1 text-[10px] text-black hover:opacity-90"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              if (!ownedItem) return;
                                              void changeQty(ownedItem.id, +1);
                                            }}
                                            title="Adicionar +1"
                                          >
                                            +1
                                          </button>

                                          <button
                                            className="rounded-md border border-gray-700 px-2 py-1 text-[10px] text-white hover:bg-gray-900"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              if (!ownedItem) return;
                                              void changeQty(ownedItem.id, -1);
                                            }}
                                            title="Remover -1"
                                          >
                                            −1
                                          </button>
                                        </div>
                                      ) : (
                                        <button
                                          className="shrink-0 rounded-md bg-white px-2 py-1 text-[10px] text-black hover:opacity-90"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            void addCard(c.code, 1);
                                          }}
                                          title="Adicionar à coleção"
                                        >
                                          +1
                                        </button>
                                      )}

                                </div>

                                {!owned && (
                                  <div className="pointer-events-none absolute left-2 top-2 rounded bg-black/70 px-2 py-0.5 text-[10px] text-gray-200">
                                    MISSING
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {hasMore && (
                          <div className="mt-4 flex justify-center">
                            <button
                              className="rounded-lg border border-gray-700 px-4 py-2 text-xs text-white hover:bg-gray-900"
                              onClick={() => showMore(g.setCode)}
                            >
                              Mostrar mais ({visibleEntries.length}/{binderEntries.length})
                            </button>
                          </div>
                        )}

                        {!hasMore && binderEntries.length > 0 && (
                          <div className="mt-4 text-center text-xs text-gray-500">
                            A mostrar {binderEntries.length} cartas do set.
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ===== Modal: Ver faltas ===== */}
      {missingOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeMissing();
          }}
        >
          <div className="w-full max-w-3xl rounded-xl bg-black shadow-lg">
            <div className="flex items-start justify-between gap-3 border-b border-gray-800 p-4">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-white">
                  Faltas — {missingSetName}{" "}
                  <span className="text-xs font-normal text-gray-400">
                    ({missingSetCode})
                  </span>
                </div>
                <div className="mt-1 text-xs text-gray-400">
                  {missingCards.length} carta(s) em falta
                </div>
              </div>

              <button
                className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-white"
                onClick={closeMissing}
              >
                Fechar
              </button>
            </div>

            <div className="p-4">
              <input
                className="w-full rounded-lg border border-gray-700 bg-black px-3 py-2 text-sm text-white placeholder:text-gray-500"
                placeholder="Filtrar por código ou nome..."
                value={missingFilter}
                onChange={(e) => setMissingFilter(e.target.value)}
              />

              <div className="mt-4 max-h-[60vh] overflow-auto rounded-lg border border-gray-800">
                {missingLoading ? (
                  <div className="p-4">
                    <div className="mb-3 h-4 w-48 animate-pulse rounded bg-gray-800" />
                    <div className="space-y-3">
                      {Array.from({ length: 10 }).map((_, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-3 rounded-lg border border-gray-800 p-3"
                        >
                          <div className="h-10 w-10 animate-pulse rounded bg-gray-800" />
                          <div className="min-w-0 flex-1">
                            <div className="h-3 w-32 animate-pulse rounded bg-gray-800" />
                            <div className="mt-2 h-3 w-56 animate-pulse rounded bg-gray-800" />
                          </div>
                          <div className="h-7 w-20 animate-pulse rounded bg-gray-800" />
                        </div>
                      ))}
                    </div>
                  </div>
                ) : missingFiltered.length === 0 ? (
                  <div className="p-4 text-sm text-gray-400">
                    Não há resultados.
                  </div>
                ) : (
                  missingFiltered.map((c, idx) => (
                    <div
                      key={c.code}
                      className="flex items-center gap-3 border-b border-gray-800 p-3 text-sm last:border-b-0 cursor-pointer hover:bg-gray-900"
                      onClick={() => openDetailsFromCatalog(c)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ")
                          openDetailsFromCatalog(c);
                      }}
                    >
                      <div className="h-10 w-10 shrink-0">
                        {c.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={c.imageUrl}
                            alt={c.name ?? c.code}
                            className="h-10 w-10 rounded object-cover"
                            loading={idx < 16 ? "eager" : "lazy"}
                            decoding="async"
                          />
                        ) : (
                          <div className="h-10 w-10 rounded bg-gray-800" />
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2">
                          <div className="font-mono text-xs text-gray-200">
                            {c.code}
                          </div>
                          {c.rarity && (
                            <div className="text-xs text-gray-500">
                              {c.rarity}
                            </div>
                          )}
                        </div>
                        <div className="truncate text-gray-200">
                          {c.name ?? "—"}
                        </div>
                        {(c.setName || c.set) && (
                          <div className="mt-0.5 text-xs text-gray-500">
                            {c.setName ?? c.set}
                          </div>
                        )}
                      </div>

                      {typeof c.marketPrice === "number" && (
                        <div className="shrink-0 text-xs text-gray-400">
                          {money.format(c.marketPrice)}
                        </div>
                      )}

                      <button
                        className="ml-2 shrink-0 rounded-lg bg-white px-3 py-1.5 text-xs text-black hover:opacity-90"
                        onClick={(e) => {
                          e.stopPropagation();
                          void addMissingCard(c.code);
                        }}
                        title="Adicionar à coleção"
                      >
                        + Adicionar
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <CardDetailsModal
        open={modalOpen}
        onClose={closeDetails}
        item={selected}
        catalog={selectedCatalog}
      />
    </main>
  );
}
