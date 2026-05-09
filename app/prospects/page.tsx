export default function ProspectsPage() {
  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-white">
      <section className="mx-auto max-w-6xl">
        <header className="mb-10 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-emerald-400">
              CRM
            </p>
            <h1 className="mt-3 text-4xl font-bold tracking-tight">
              Prospects
            </h1>
            <p className="mt-3 max-w-2xl text-slate-300">
              Ici, tu retrouveras les personnes repérées sur les réseaux
              sociaux, leur niveau d’intérêt, le statut de la conversation et
              les prochaines actions à faire.
            </p>
          </div>

          <button className="rounded-full bg-emerald-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300">
            Ajouter un prospect
          </button>
        </header>

        <section className="rounded-3xl border border-white/10 bg-white/5 p-8 shadow-xl">
          <div className="flex min-h-[300px] flex-col items-center justify-center text-center">
            <div className="mb-5 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-5 py-3 text-emerald-300">
              Aucun prospect pour le moment
            </div>

            <h2 className="text-2xl font-bold">
              Commence par ajouter les profils les plus intéressants.
            </h2>

            <p className="mt-4 max-w-xl text-sm leading-6 text-slate-300">
              Pour la V1, tu ajouteras les profils manuellement. L’objectif est
              de rester propre, naturel et organisé : pas de spam, pas de robot,
              juste un vrai suivi des conversations.
            </p>
          </div>
        </section>
      </section>
    </main>
  );
}