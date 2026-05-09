import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <section className="mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-10">
        <header className="mb-12 flex items-center justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-emerald-400">
              Travel Prospect CRM
            </p>
            <h1 className="mt-3 text-4xl font-bold tracking-tight md:text-6xl">
              Trouver les bonnes personnes.
              <br />
              Créer les bonnes conversations.
            </h1>
          </div>

          <div className="hidden rounded-full border border-emerald-400/40 px-4 py-2 text-sm text-emerald-300 md:block">
            V1 en construction
          </div>
        </header>

        <div className="grid flex-1 gap-6 md:grid-cols-3">
          <article className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-xl">
            <h2 className="text-xl font-semibold text-emerald-300">
              1. Repérer
            </h2>
            <p className="mt-4 text-sm leading-6 text-slate-300">
              Ajouter manuellement les profils qui semblent aimer voyager :
              Instagram, Facebook, TikTok, LinkedIn ou autre.
            </p>
          </article>

          <article className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-xl">
            <h2 className="text-xl font-semibold text-emerald-300">
              2. Qualifier
            </h2>
            <p className="mt-4 text-sm leading-6 text-slate-300">
              Classer les personnes selon leur intérêt : voyage, bons plans,
              liberté, entrepreneuriat ou potentiel partenaire.
            </p>
          </article>

          <article className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-xl">
            <h2 className="text-xl font-semibold text-emerald-300">
              3. Échanger
            </h2>
            <p className="mt-4 text-sm leading-6 text-slate-300">
              Préparer des messages naturels pour engager la conversation sans
              forcer, tout en allant droit au but.
            </p>
          </article>
        </div>

        <section className="mt-10 rounded-3xl border border-emerald-400/20 bg-emerald-400/10 p-6">
          <h2 className="text-2xl font-bold text-emerald-200">
            Objectif de la V1
          </h2>
          <p className="mt-3 max-w-3xl text-slate-200">
            Créer un outil simple pour suivre les profils intéressants, noter
            les conversations, savoir qui relancer et éviter de perdre du temps
            avec les mauvaises personnes.
          </p>

          <Link
            href="/prospects"
            className="mt-6 inline-flex rounded-full bg-emerald-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300"
          >
            Ouvrir les prospects
          </Link>
        </section>
      </section>
    </main>
  );
}