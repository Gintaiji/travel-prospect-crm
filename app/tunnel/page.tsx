import { MESSAGE_TUNNEL_STEPS } from "../lib/messageTemplates";

function formatSuggestedFollowUp(daysToAdd: number | null) {
  if (daysToAdd === null) {
    return "";
  }

  return `Relance suggérée : dans ${daysToAdd} jour${daysToAdd > 1 ? "s" : ""}`;
}

export default function TunnelPage() {
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-6 text-white sm:px-6 sm:py-10">
      <section className="mx-auto max-w-6xl">
        <header className="mb-8">
          <p className="text-sm uppercase tracking-[0.3em] text-emerald-400">
            Méthode
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-5xl">
            Tunnel de prospection
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-slate-300">
            Une méthode simple pour avancer dans les conversations sans forcer, sans perdre le fil.
          </p>
        </header>

        <section className="mb-6 rounded-3xl border border-emerald-400/20 bg-emerald-400/10 p-5">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-emerald-200">
            Guide
          </p>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-200">
            Cette page sert de guide. Les messages personnalisés restent disponibles dans les fiches prospects.
          </p>
        </section>

        <section className="mb-6 rounded-3xl border border-white/10 bg-white/5 p-5 shadow-xl">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-emerald-300">
            Règles importantes
          </p>
          <ul className="mt-4 grid gap-3 text-sm leading-6 text-slate-200 md:grid-cols-2">
            <li className="rounded-2xl border border-white/10 bg-slate-950/60 p-3">
              Ouvrir une conversation avant de présenter.
            </li>
            <li className="rounded-2xl border border-white/10 bg-slate-950/60 p-3">
              Qualifier l’intérêt voyage avant de parler du club privé.
            </li>
            <li className="rounded-2xl border border-white/10 bg-slate-950/60 p-3">
              Ne jamais forcer une personne qui dit non.
            </li>
            <li className="rounded-2xl border border-white/10 bg-slate-950/60 p-3">
              Relancer avec douceur, puis clôturer proprement si besoin.
            </li>
            <li className="rounded-2xl border border-white/10 bg-slate-950/60 p-3 md:col-span-2">
              Rester humain : le CRM aide, mais ne remplace pas la relation.
            </li>
          </ul>
        </section>

        <section className="grid gap-5 lg:grid-cols-2">
          {MESSAGE_TUNNEL_STEPS.map((messageStep, index) => {
            const naturalVariant =
              messageStep.variants.find((variant) => variant.tone === "Naturel") ??
              messageStep.variants[0];
            const suggestedFollowUp = formatSuggestedFollowUp(messageStep.suggestedFollowUpDays);

            return (
              <article
                className="rounded-3xl border border-white/10 bg-white/5 p-4 shadow-xl sm:p-5"
                key={messageStep.step}
              >
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-emerald-400/30 bg-emerald-400/10 text-sm font-bold text-emerald-200">
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">
                      {messageStep.step}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-300">
                      {messageStep.objective}
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid gap-3">
                  <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                      Prochaine action conseillée
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-100">
                      {messageStep.nextAction}
                    </p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/5 p-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                        Relance
                      </p>
                      <p className="mt-2 text-sm text-slate-100">
                        {suggestedFollowUp || "Aucune relance automatique suggérée"}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/5 p-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                        Statut suggéré
                      </p>
                      <p className="mt-2 text-sm text-slate-100">
                        {messageStep.suggestedStatus ?? "Garder le statut actuel"}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                      Exemple naturel
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-100">
                      {naturalVariant.message}
                    </p>
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      </section>
    </main>
  );
}
