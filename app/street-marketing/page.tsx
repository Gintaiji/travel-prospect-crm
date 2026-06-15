export default function StreetMarketingPage() {
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-6 text-white sm:px-6 sm:py-10">
      <section className="mx-auto max-w-6xl">
        <header className="mb-8">
          <p className="text-sm uppercase tracking-[0.3em] text-emerald-400">
            Terrain
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-5xl">
            Street Marketing
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-slate-300">
            Ajoute rapidement les contacts rencontrés sur le terrain.
          </p>
        </header>

        <section className="grid gap-4 md:grid-cols-2">
          <article className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-xl">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-300">
              Sondage rapide
            </p>
            <p className="mt-4 text-sm leading-6 text-slate-300">
              Bientôt : 2 questions modifiables.
            </p>
          </article>

          <article className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-xl">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-300">
              Contact rapide
            </p>
            <p className="mt-4 text-sm leading-6 text-slate-300">
              Bientôt : ajout d’un prospect avec téléphone et relance
              automatique.
            </p>
          </article>
        </section>
      </section>
    </main>
  );
}
