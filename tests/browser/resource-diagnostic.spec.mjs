// Importing the original spec also runs its ten unchanged safety scenarios.
import { test, expect, call, job, key, A, B } from "./resource-isolation.spec.mjs";

async function paused(context, page, arm, start) {
  const cdp = await context.newCDPSession(page);
  await cdp.send("Debugger.enable");
  const hit = new Promise(resolve => cdp.once("Debugger.paused", resolve));
  await arm(); const started = start(); await hit;
  return async () => { await cdp.send("Debugger.resume"); await started; await cdp.detach(); };
}
const finished = async (page, name) => {
  await expect.poll(async () => (await job(page, name))?.status).not.toBe("pending");
  return job(page, name);
};
async function evidence(info, pages, schedule) {
  await info.attach("diagnostic-metadata.json", { contentType: "application/json", body: Buffer.from(JSON.stringify({
    scenario: info.title, schedule, tabs: await Promise.all(pages.map(page => call(page, "trace"))),
  }, null, 2)) });
}
function invariants(after, initial, entries) {
  expect(after[key(B, "resources")]).toBe(initial[key(B, "resources")]);
  expect(after["json-backup-sentinel"]).toBe(initial["json-backup-sentinel"]);
  const journal = JSON.parse(after[key(A, "resource-import-journal")]);
  expect(journal).toHaveLength(entries);
  expect(journal[0].beforeRaw).toBe(initial[key(A, "resources")]);
  expect(JSON.parse(after[key(A, "resource-import-state")]).status).toBe("verified");
  expect(journal.at(-1).candidateRaw).toBe(after[key(A, "resources")]);
}

test("écriture active : lecture, JSON et écriture attendent sans fausse récupération", async ({ sandbox }, info) => {
  const [one, two] = sandbox.pages;
  await call(one, "load", "one"); await call(two, "load", "two");
  const resume = await paused(sandbox.context, one, () => call(one, "pauseImportAt", "verified"),
    () => call(one, "startSave", "writer", "one", "candidate"));
  try {
    const before = await call(two, "snapshot");
    await call(two, "startSave", "during", "two", "refused");
    await call(two, "startLoad", "reader", "fresh");
    await call(two, "startExport", "export");
    await call(two, "startPreview", "preview", "preview-candidate");
    await expect.poll(async () => (await call(two, "pendingLocks")).pending.length).toBe(4);
    for (const name of ["during", "reader", "export", "preview"]) expect((await job(two, name)).status).toBe("pending");
    expect(await call(two, "snapshot")).toEqual(before);
  } finally { await resume(); }
  expect((await finished(one, "writer")).status).toBe("fulfilled");
  expect((await finished(two, "during")).error).toContain("Conflit Ressources");
  expect((await finished(two, "reader")).result.resources[0].id).toBe("candidate");
  expect(JSON.parse((await finished(two, "export")).result).resources[0].id).toBe("candidate");
  expect(JSON.parse((await finished(two, "preview")).result.safetyJson).resources[0].id).toBe("candidate");
  await call(two, "startSave", "after", "two", "refused-again");
  expect((await finished(two, "after")).error).toContain("Conflit Ressources");
  invariants(await call(two, "snapshot"), sandbox.initial, 1);
  await evidence(info, sandbox.pages, "pause before verified; four requests queue; resume; verified reads and stale conflict");
});

test("contrôle négatif : ancienne inspection hors verrou reproduit la fausse alerte", async ({ sandbox }, info) => {
  const [one, two] = sandbox.pages;
  await call(one, "load", "first"); await call(one, "startSave", "first", "first", "generation-one");
  expect((await finished(one, "first")).status).toBe("fulfilled");
  await call(one, "load", "next"); await call(two, "load", "old");
  const resume = await paused(sandbox.context, two, () => call(two, "pauseReadAt", "resource-import-state"),
    () => call(two, "startUnsafeInspection", "skew"));
  try {
    await call(one, "startSave", "second", "next", "generation-two");
    expect((await finished(one, "second")).status).toBe("fulfilled");
  } finally { await resume(); }
  expect((await finished(two, "skew")).error).toContain("Récupération nécessaire");
  invariants(await call(one, "snapshot"), sandbox.initial, 2);
  expect((await call(two, "load", "fresh")).status).toBe("available");
  await evidence(info, sandbox.pages, "read journal v1; commit v2; read state v2; refuse; fresh read succeeds");
});

test("lecture cohérente : un écrivain ne peut séparer journal et marqueur", async ({ sandbox }, info) => {
  const [one, two] = sandbox.pages;
  await call(one, "load", "initial"); await call(one, "startSave", "first", "initial", "generation-one");
  expect((await finished(one, "first")).status).toBe("fulfilled");
  await call(one, "load", "writer");
  const resume = await paused(sandbox.context, two, () => call(two, "pauseReadAt", "resource-import-state"),
    () => call(two, "startLoad", "consistent", "consistent-handle"));
  try {
    const before = await call(one, "snapshot");
    await call(one, "startSave", "second", "writer", "generation-two");
    await expect.poll(async () => (await call(one, "pendingLocks")).pending.length).toBe(1);
    expect((await job(one, "second")).status).toBe("pending");
    expect(await call(one, "snapshot")).toEqual(before);
  } finally { await resume(); }
  const read = await finished(two, "consistent");
  expect(read.status).toBe("fulfilled");
  expect(read.result.resources[0].id).toBe("generation-one");
  expect((await finished(one, "second")).status).toBe("fulfilled");
  await call(two, "startSave", "old-base", "consistent-handle", "must-not-write");
  expect((await finished(two, "old-base")).error).toContain("Conflit Ressources");
  invariants(await call(one, "snapshot"), sandbox.initial, 2);
  await evidence(info, sandbox.pages, "read journal v1 holding lock; writer queues; read marker v1; release; commit v2");
});

test("lecture en attente puis changement de compte : résultat ancien refusé", async ({ sandbox }, info) => {
  const [one, two] = sandbox.pages;
  await call(one, "holdLock", "barrier");
  await call(two, "startLoad", "old-account", "old-handle");
  await call(two, "startExport", "old-export");
  await expect.poll(async () => (await call(one, "pendingLocks")).pending.length).toBe(2);
  await call(one, "signIn", B);
  for (const page of sandbox.pages) await expect.poll(async () => (await call(page, "session")).userId).toBe(B);
  await call(one, "releaseLock", "barrier");
  for (const name of ["old-account", "old-export"]) expect((await finished(two, name)).status).toBe("rejected");
  expect((await call(two, "load", "B")).resources[0].id).toBe("B-original");
  const after = await call(one, "snapshot");
  for (const id of [A, B]) expect(after[key(id, "resources")]).toBe(sandbox.initial[key(id, "resources")]);
  expect(after[key(A, "resource-import-journal")]).toBeUndefined();
  expect(after["json-backup-sentinel"]).toBe(sandbox.initial["json-backup-sentinel"]);
  await evidence(info, sandbox.pages, "queue read and export under A; switch B; reject both; read only B");
});

test("échec de lecture : erreur propagée, aucune liste vide ni écriture", async ({ sandbox }, info) => {
  const [one] = sandbox.pages;
  await call(one, "setFailure", "read-state");
  await call(one, "startLoad", "failed-read", "never-available");
  expect((await finished(one, "failed-read")).error).toContain("Synthetic read failure");
  expect(await call(one, "snapshot")).toEqual(sandbox.initial);
  await call(one, "setFailure", null);
  expect((await call(one, "load", "recovered-read")).resources[0].id).toBe("A-original");
  await evidence(info, sandbox.pages, "read error propagates; storage unchanged; subsequent intact read succeeds");
});

for (const seed of [7, 19, 73, 103]) {
  test(`résistance bornée graine ${seed} : trois ordonnancements`, async ({ sandbox }, info) => {
    let state = seed;
    const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state; };
    const observations = [];
    for (let round = 0; round < 3; round++) {
      const pages = (random() >>> 16) % 2 ? sandbox.pages : [...sandbox.pages].reverse();
      const [one, two] = pages;
      await call(one, "load", "a"); await call(two, "load", "b");
      if (round !== 1) await call(one, "holdLock", "barrier");
      await call(one, "startSave", "a", "a", `seed-${seed}-${round}-a`);
      if (round === 1) expect((await finished(one, "a")).status).toBe("fulfilled");
      await call(two, "startSave", "b", "b", `seed-${seed}-${round}-b`);
      if (round !== 1) {
        await expect.poll(async () => (await call(one, "pendingLocks")).pending.length).toBe(2);
        await call(one, "releaseLock", "barrier");
      }
      const results = [await finished(one, "a"), await finished(two, "b")];
      expect(results.map(r => r.status).sort()).toEqual(["fulfilled", "rejected"]);
      const refusal = results.find(r => r.status === "rejected").error;
      expect(refusal).toContain("Conflit Ressources");
      observations.push({ round, seed, refusal });
      invariants(await call(one, "snapshot"), sandbox.initial, round + 1);
    }
    await evidence(info, sandbox.pages, observations);
  });
}
