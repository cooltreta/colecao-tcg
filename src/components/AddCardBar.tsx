"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { searchCatalog } from "@/lib/catalog/localCatalog";

type Suggestion = {
  code: string;
  name: string;
  set?: string;
  setName?: string;
  type?: string;
  imageUrl?: string;
};

const PAGE_SIZE = 10;
const SCROLL_BOTTOM_PX = 24;

export default function AddCardBar(props: {
  onAdd: (code: string, qty: number) => Promise<void>;
}) {
  const [q, setQ] = useState("");
  const [qty, setQty] = useState(1);

  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selected, setSelected] = useState<Suggestion | null>(null);

  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  // Preview (desktop hover + mobile modal)
  const [preview, setPreview] = useState<Suggestion | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const listRef = useRef<HTMLDivElement | null>(null);

  // Reset quando query muda
  useEffect(() => {
    setOffset(0);
    setSuggestions([]);
    setHasMore(false);
    setPreview(null);
    setPreviewOpen(false);
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [q]);

  useEffect(() => {
    let alive = true;

    async function run() {
      const query = q.trim();
      setSelected(null);

      if (query.length < 2) {
        setSuggestions([]);
        setHasMore(false);
        return;
      }

      setLoading(true);
      try {
        // IMPORTANTE: assumes searchCatalog(query, limit, offset)
        const page: Suggestion[] = await searchCatalog(query, PAGE_SIZE, offset);

        if (!alive) return;

        setSuggestions((prev) => {
          const seen = new Set(prev.map((x) => x.code));
          const merged = [...prev];
          for (const it of page) {
            if (!seen.has(it.code)) merged.push(it);
          }
          return merged;
        });

        setHasMore(page.length === PAGE_SIZE);

        // Primeiro resultado: dá logo preview em desktop (opcional)
        if (offset === 0 && page.length > 0) {
          setPreview(page[0]);
        }
      } finally {
        if (alive) setLoading(false);
      }
    }

    void run();
    return () => {
      alive = false;
    };
  }, [q, offset]);

  const canAdd = useMemo(() => {
    const code = (selected?.code ?? q).trim();
    return code.length >= 4 && qty > 0;
  }, [q, qty, selected]);

  function onScrollSuggestions() {
    const el = listRef.current;
    if (!el) return;
    if (loading) return;
    if (!hasMore) return;

    const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (remaining <= SCROLL_BOTTOM_PX) {
      setOffset((prev) => prev + PAGE_SIZE);
    }
  }

  function openPreviewMobile(s: Suggestion) {
    setPreview(s);
    setPreviewOpen(true);
  }

  return (
    <div className="rounded-lg border p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-end">
        <div className="flex-1">
          <label className="text-xs font-semibold text-gray-600">
            Adicionar carta (código ou nome)
          </label>

          <input
            className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder='Ex: "Perona" ou "OP01" ou "Character" ou "OP01-077" ou "Thriller Bark Pirates"'
          />

          {suggestions.length > 0 && (
            <div className="relative mt-2">
              {/* Lista */}
              <div
                ref={listRef}
                onScroll={onScrollSuggestions}
                className="max-h-56 overflow-auto rounded-lg border bg-black"
              >
                {suggestions.map((s) => (
                  <div
                    key={s.code}
                    className="flex w-full items-stretch justify-between gap-2 border-b last:border-b-0"
                    onMouseEnter={() => setPreview(s)}
                  >
                    {/* Botão principal: selecionar */}
                    <button
                      type="button"
                      className="flex flex-1 items-start gap-3 px-3 py-2 text-left text-sm text-white hover:bg-white/10 transition-colors"
                      onClick={() => {
                        setSelected(s);
                        setQ(`${s.code} — ${s.name}`);
                        setSuggestions([]);
                        setHasMore(false);
                        setOffset(0);
                        setPreview(null);
                        setPreviewOpen(false);
                      }}
                    >
                      {/* thumbnail pequena (ajuda logo no mobile) */}
                      {s.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={s.imageUrl}
                          alt={s.name}
                          className="h-10 w-10 rounded-md border border-white/10 object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="h-10 w-10 rounded-md border border-white/10 bg-white/5" />
                      )}

                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2">
                          <span className="font-mono text-xs text-white/80">
                            {s.code}
                          </span>
                          <span className="truncate">{s.name}</span>
                        </div>
                        <div className="mt-0.5 text-xs text-white/60">
                          {s.setName ?? s.set ?? ""}
                          {s.type ? ` · ${s.type}` : ""}
                        </div>
                      </div>
                    </button>

                    {/* Botão "Ver" (mobile e desktop também funciona) */}
                    <button
                      type="button"
                      className="px-3 text-xs text-white/80 hover:bg-white/10 transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        openPreviewMobile(s);
                      }}
                      aria-label={`Ver ${s.code}`}
                      title="Ver carta"
                    >
                      Ver
                    </button>
                  </div>
                ))}

                {(loading || hasMore) && (
                  <div className="px-3 py-2 text-xs text-white/60">
                    {loading ? "A carregar..." : "Scroll para mais resultados…"}
                  </div>
                )}
              </div>

              {/* Preview lateral (só desktop) */}
              <div className="hidden md:block absolute top-0 right-[-220px] w-[210px]">
                {preview ? (
                  <div className="rounded-xl border bg-black p-2 shadow-lg">
                    <div className="text-xs text-white/70 font-mono">
                      {preview.code}
                    </div>
                    <div className="text-xs text-white truncate">
                      {preview.name}
                    </div>
                    <div className="mt-2">
                      {preview.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={preview.imageUrl}
                          alt={preview.name}
                          className="w-full rounded-lg border border-white/10 object-contain bg-black"
                          loading="lazy"
                        />
                      ) : (
                        <div className="aspect-[3/4] w-full rounded-lg border border-white/10 bg-white/5" />
                      )}
                    </div>
                    <div className="mt-2 text-[11px] text-white/60">
                      {preview.setName ?? preview.set ?? ""}
                      {preview.type ? ` · ${preview.type}` : ""}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </div>

        <div className="w-32">
          <label className="text-xs font-semibold text-gray-600">Qtd</label>
          <input
            type="number"
            min={1}
            className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
            value={qty}
            onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
          />
        </div>

        <button
          className="rounded-lg bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
          disabled={!canAdd}
          onClick={async () => {
            const code = (selected?.code ?? q).trim().split("—")[0].trim();
            await props.onAdd(code, qty);
            setQ("");
            setQty(1);
            setSuggestions([]);
            setSelected(null);
            setHasMore(false);
            setOffset(0);
            setPreview(null);
            setPreviewOpen(false);
          }}
        >
          Adicionar
        </button>
      </div>

      {/* Modal de preview (mobile + desktop também) */}
      {previewOpen && preview ? (
        <div
          className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-3"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setPreviewOpen(false);
          }}
          role="dialog"
          aria-modal="true"
        >
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative z-10 w-full max-w-md rounded-2xl bg-black border border-white/10 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs text-white/70 font-mono">
                  {preview.code}
                </div>
                <div className="text-sm text-white truncate">{preview.name}</div>
                <div className="mt-1 text-xs text-white/60">
                  {preview.setName ?? preview.set ?? ""}
                  {preview.type ? ` · ${preview.type}` : ""}
                </div>
              </div>
              <button
                className="rounded-lg border border-white/20 px-3 py-2 text-xs text-white"
                onClick={() => setPreviewOpen(false)}
              >
                Fechar
              </button>
            </div>

            <div className="mt-3">
              {preview.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={preview.imageUrl}
                  alt={preview.name}
                  className="w-full rounded-xl border border-white/10 object-contain bg-black"
                  loading="lazy"
                />
              ) : (
                <div className="aspect-[3/4] w-full rounded-xl border border-white/10 bg-white/5" />
              )}
            </div>

            <div className="mt-3 text-xs text-white/60">
              Dica: toca em “Adicionar” depois de escolheres a carta.
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
