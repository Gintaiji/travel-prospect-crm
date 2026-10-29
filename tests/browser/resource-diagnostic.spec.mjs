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

test("diagnostic déterministe : écriture active -> récupération puis conflit", async ({ sandbox }, info) => {
  const [one, two] = sandbox.pages;
  await call(one, "load", "one"); await call(two, "load", "two");
  const resume = await paused(sandbox.context, one, () => call(one, "pauseImportAt", "verified"),
    () => call(one, "startSave", "writer", "one", "candidate"));
  try {
    const before = await call(two, "snapshot");
    await call(two, "startSave", "during", "two", "refused");
    expect((await finished(two, "during")).error).toContain("Récupération nécessaire");
    expect(await call(two, "snapshot")).toEqual(before);
    expect((await call(two, "trace")).filter(e => e.action === "lock-request")).toHaveLength(0);
  } finally { await resume(); }
  expect((await finished(one, "writer")).status).toBe("fulfilled");
  await call(two, "startSave", "after", "two", "refused-again");
  expect((await finished(two, "after")).error).toContain("Conflit Ressources");
  invariants(await call(two, "snapshot"), sandbox.initial, 1);
  await evidence(info, sandbox.pages, "pause before verified marker; attempt; resume; retry stale base");
});

test("diagnostic déterministe : lecture journal et marqueur de générations différentes", async ({ sandbox }, info) => {
  const [one, two] = sandbox.pages;
  await call(one, "load", "first"); await call(one, "startSave", "first", "first", "generation-one");
  expect((await finished(one, "first")).status).toBe("fulfilled");
  await call(one, "load", "next"); await call(two, "load", "old");
  const resume = await paused(sandbox.context, two, () => call(two, "pauseReadAt", "resource-import-state"),
    () => call(two, "startSave", "skew", "old", "never-written"));
  try {
    await call(one, "startSave", "second", "next", "generation-two");
    expect((await finished(one, "second")).status).toBe("fulfilled");
  } finally { await resume(); }
  expect((await finished(two, "skew")).error).toContain("Récupération nécessaire");
  invariants(await call(one, "snapshot"), sandbox.initial, 2);
  expect((await call(two, "load", "fresh")).status).toBe("available");
  await evidence(info, sandbox.pages, "read journal v1; commit v2; read state v2; refuse; fresh read succeeds");
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
      // Safety classification recorded, never substituted for the strict original conflict test.
      expect(/Conflit Ressources|Récupération nécessaire/.test(refusal)).toBe(true);
      observations.push({ round, seed, refusal });
      invariants(await call(one, "snapshot"), sandbox.initial, round + 1);
    }
    await evidence(info, sandbox.pages, observations);
  });
}
