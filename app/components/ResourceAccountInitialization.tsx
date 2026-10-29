"use client";

import { useMemo, useState } from "react";
import { useUserSession } from "./UserSessionProvider";
import { ACCOUNT_SCOPED_RESOURCES_ENABLED } from "../lib/resourceIsolationSettings";
import { createResourceAccountInitialization } from "../lib/resourceAccountInitialization";

export default function ResourceAccountInitialization({ reload }: { reload: () => void }) {
  const session = useUserSession();
  const [owner, setOwner] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const api = useMemo(() => createResourceAccountInitialization({ enabled: ACCOUNT_SCOPED_RESOURCES_ENABLED, store: session.store }), [session.store]);
  const capture = { userId: session.userId ?? "", generation: session.generation };
  const current = () => { try { session.store.assertCurrent(capture); return true; } catch { return false; } };
  async function initialize() {
    if (!confirmed || owner !== capture.userId || !window.confirm("Créer un espace Ressources vide pour ce compte, sans reprendre les données historiques ?")) return;
    setBusy(true); setError("");
    try {
      await api.initialize(capture, { ownerUserId: owner, emptySpaceConfirmed: confirmed });
      if (current()) reload();
    } catch (failure) {
      if (current()) {
        setError(`${failure instanceof Error ? failure.message : "Initialisation non vérifiée."} Rechargez pour établir un diagnostic avant une nouvelle intervention.`);
        setConfirmed(false);
      }
    } finally { if (current()) setBusy(false); }
  }
  if (!ACCOUNT_SCOPED_RESOURCES_ENABLED || session.status !== "connected") return null;
  return <section className="mt-3 grid gap-3 text-sm" aria-label="Initialisation Ressources">
    <p>Compte confirmé : {session.userId}. Créez volontairement un espace vide, ou choisissez la migration manuelle si les données historiques vous appartiennent. Aucune ancienne donnée ne sera reprise ici.</p>
    <label>Confirmez votre user.id pour initialiser
      <input value={owner} disabled={busy} autoComplete="off" onChange={event => setOwner(event.target.value)} className="mt-1 block w-full rounded-lg bg-slate-950 p-2" />
    </label>
    <label><input type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)} /> Je demande un espace Ressources vide pour ce compte.</label>
    <button type="button" disabled={busy || !confirmed || owner !== capture.userId} onClick={() => void initialize()}>Initialiser mes ressources</button>
    {error && <p role="alert">{error}</p>}
  </section>;
}
