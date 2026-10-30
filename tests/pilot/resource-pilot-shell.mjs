/* eslint-disable @typescript-eslint/no-require-imports -- Standalone offline pilot only. */
/* global require */
// This module is never imported by app/ or Next. Authentication is deliberately fictional.
globalThis.ResourcePilotShell = function ResourcePilotShell({ children }) {
  const { createElement: h, useState, useSyncExternalStore } = require("react");
  const recipe = globalThis.chainRecipe;
  const session = useSyncExternalStore(recipe.store.subscribe, recipe.store.getSnapshot, recipe.store.getServerSnapshot);
  const [message, setMessage] = useState("");
  const button = (name, action, disabled = false) => h("button", { type: "button", disabled, onClick() {
    try { action(); setMessage(name); } catch (error) { setMessage(error.message); }
  }, className: "min-h-10 rounded-xl border border-emerald-300/50 px-3 py-2 text-sm disabled:opacity-40" }, name);
  return h("div", { className: "mx-auto max-w-6xl p-4", "data-resource-pilot": "fictional-only" },
    h("header", { className: "mb-6 grid gap-3 rounded-2xl border border-amber-300/40 bg-amber-300/10 p-4" },
      h("h1", { className: "text-2xl font-bold" }, "Pilote local Ressources — données fictives"),
      h("p", null, "Environnement séparé. Aucun compte réel. Aucun accès Supabase. Cloud suspendu. Aucune activation de production."),
      h("p", { role: "status", "aria-label": "Session fictive" }, session.status === "connected" ? `Compte fictif ${session.userId === recipe.A ? "A" : "B"}` : `Session fictive : ${session.status}`),
      h("div", { className: "flex flex-wrap gap-2" }, button("Connexion fictive A", () => recipe.signIn(recipe.A)), button("Connexion fictive B", () => recipe.signIn(recipe.B)), button("Déconnexion fictive", () => recipe.signIn(null))),
      h("nav", { "aria-label": "Navigation du pilote", className: "flex flex-wrap gap-4 text-emerald-300 underline" },
        ...[["Ressources", "resource-page"], ["Migration manuelle", "migration"], ["Sauvegarde et récupération", "backup"]].map(([label, id]) => h("a", { key: id, href: `#${id}` }, label))),
      h("details", null, h("summary", { className: "cursor-pointer" }, "Simulations réservées au pilote fictif"),
        h("div", { className: "mt-3 flex flex-wrap gap-2" },
          button("Interrompre la validation du prochain import", () => recipe.fault("verified"), session.status !== "connected"),
          button("Désactiver l’interruption simulée", () => recipe.fault(null)),
          button("Saturer le quota natif du profil fictif", () => {
            if (!confirm("Remplir uniquement ce profil fictif jetable pour tester le quota ? Aucune donnée ne sera supprimée.")) return;
            recipe.saturateNativeQuota();
          }, session.status !== "connected"),
          button("Simuler une session expirée", () => recipe.expire(), session.status !== "connected"))),
      message && h("p", { role: "status", "aria-label": "Simulation pilote" }, message)),
    children);
};
