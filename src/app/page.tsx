import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto max-w-5xl p-6">
      <h1 className="text-2xl font-semibold">Coleção TCG</h1>

      <p className="mt-2 text-sm text-gray-500">
        Fase 0 · Local-first · Sem login · Dados guardados no browser
      </p>

      <div className="mt-6 flex gap-3">


        <Link
          href="/collection"
          className="rounded-lg border px-4 py-2"
        >
          Ver Coleção
        </Link>
      </div>
    </main>
  );
}
