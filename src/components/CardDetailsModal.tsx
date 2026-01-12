"use client";

import type { CatalogEntry } from "@/lib/catalog/localCatalog";
import type { CollectionItem } from "@/lib/storage/types";

export default function CardDetailsModal(props: {
  open: boolean;
  onClose: () => void;
  item: (CollectionItem & { name?: string | null; imageUrl?: string | null; marketPrice?: number | null; }) | null;
  catalog: CatalogEntry | null;
}) {
  const { open, onClose, item, catalog } = props;

  if (!open || !item) return null;

  const market =
  item.marketPrice != null
    ? item.marketPrice
    : catalog?.marketPrice != null
      ? catalog.marketPrice
      : null;

  const qty = item.qty ?? 0;
  const inventoryValue = market != null ? market * qty : null;


  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        // clicar no backdrop fecha
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="absolute inset-0 bg-amber-50/50" />

      <div className="relative z-10 w-full max-w-[920px] rounded-2xl bg-black shadow-xl max-h-[calc(100dvh-24px)] overflow-hidden">
        <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="text-sm text-white">{item.cardCode}</div>
            <h2 className="text-lg font-semibold text-white">{item.name ?? catalog?.name ?? "—"}</h2>
            <div className="mt-1 text-xs text-gray-500">
              {item.variant}/{item.condition}/{item.language}
              {catalog?.setName ? ` · ${catalog.setName}` : catalog?.set ? ` · ${catalog.set}` : ""}
            </div>
          </div>

          <button
            className="rounded-lg border border-gray-700 px-3 py-2 text-sm text-white w-full sm:w-auto"
            onClick={onClose}
            aria-label="Fechar"
          >
            Fechar
          </button>
        </div>

        <div className="grid gap-4 p-4 md:grid-cols-3 overflow-y-auto max-h-[calc(100dvh-200px)]">
          <div className="md:col-span-1">
            {item.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.imageUrl}
                alt={item.name ?? item.cardCode}
                className="w-full rounded-xl border object-contain  rounded-xl border object-cover"
                loading="lazy"
              />
            ) : (
              <div className="aspect-square w-full rounded-xl border bg-amber-50-100" />
            )}
          </div>

          <div className="md:col-span-2">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Info label="Código" value={item.cardCode} mono />
              <Info label="Set" value={catalog?.setName ?? catalog?.set ?? "—"} />

              <Info label="Raridade" value={catalog?.rarity ?? "—"} />
              <Info label="Cor" value={catalog?.color ?? "—"} />

              <Info label="Tipo" value={catalog?.type ?? "—"} />
              <Info label="Qtd" value={String(item.qty)} />

              <Info label="Custo" value={catalog?.cost ?? "—"} />
              <Info label="Power" value={catalog?.power ?? "—"} />
            </div>

            <div className="mt-6 rounded-xl border bg-amber-50-50 p-4">
              <div className="text-xs font-semibold text-gray-600">Preços (se disponíveis)</div>
              <div className="mt-2 grid grid-cols-2 gap-3 text-sm">
                <Info
                  label="Market"
                  value={market != null ? `${market}€` : "—"}
                />
                                
                <Info
                  label="Inventory"
                  value={inventoryValue != null ? `${inventoryValue}€` : "—"}
                />
              </div>
              <div className="mt-2 text-xs text-gray-500">
                {catalog?.scrapedAt ? `Atualizado: ${catalog.scrapedAt}` : "Sem data de scrape."}
              </div>
              <div className="mt-3 text-xs text-gray-500">
                Nota: isto é só para testes (vem do catálogo). Mais tarde fazemos snapshots reais.
              </div>
            </div>
          </div>
        </div>

        <div className="border-t p-4 text-xs text-gray-500 hidden sm:block">
          Dica: clica fora do modal para fechar.
        </div>
      </div>
    </div>
  );
}

function Info(props: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-lg border bg-amber-50 p-3">
      <div className="text-xs font-semibold text-black">{props.label}</div>
      <div className={`mt-1 text-black ${props.mono ? "font-mono" : ""}`}>{props.value}</div>
    </div>
  );
}
