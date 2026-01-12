"use client";

import { useEffect, useMemo, useState } from "react";
import { searchCatalog } from "@/lib/catalog/localCatalog";

type Suggestion = { code: string; name: string; set?: string };

export default function AddCardBar(props: {
  onAdd: (code: string, qty: number) => Promise<void>;
}) {
  const [q, setQ] = useState("");
  const [qty, setQty] = useState(1);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selected, setSelected] = useState<Suggestion | null>(null);

  useEffect(() => {
    let alive = true;

    async function run() {
      const query = q.trim();
      setSelected(null);
      if (query.length < 2) {
        setSuggestions([]);
        return;
      }
      const res = await searchCatalog(query, 10);
      if (!alive) return;
      setSuggestions(res);
    }

    void run();
    return () => {
      alive = false;
    };
  }, [q]);

  const canAdd = useMemo(() => {
    const code = (selected?.code ?? q).trim();
    return code.length >= 4 && qty > 0;
  }, [q, qty, selected]);

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
            placeholder='Ex: "Perona" ou "OP01-077"'
          />

          {suggestions.length > 0 && (
            <div className="mt-2 max-h-56 overflow-auto rounded-lg border bg-black">
              {suggestions.map((s) => (
                <button
                  key={s.code}
                  type="button"
                  className="flex w-full items-start justify-between gap-3 border-b px-3 py-2 text-left text-sm last:border-b-0 hover:bg-gray-50"
                  onClick={() => {
                    setSelected(s);
                    setQ(`${s.code} — ${s.name}`);
                    setSuggestions([]);
                  }}
                >
                  <span className="font-mono">{s.code}</span>
                  <span className="flex-1">{s.name}</span>
                  {s.set ? <span className="text-xs text-gray-500">{s.set}</span> : null}
                </button>
              ))}
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
          }}
        >
          Adicionar
        </button>
      </div>
    </div>
  );
}
