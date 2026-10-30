const utf8 = value => Buffer.byteLength(value ?? "", "utf8");
const utf16 = value => (value?.length ?? 0) * 2;

/** Bounded, iterative forensic reader: never recursively expands embedded journals. */
export function journalMetrics(raw, { maxLayers = 16, maxDecodedBytes = 64 * 1024 * 1024 } = {}) {
  const layers = [];
  let rootEntries = raw === null ? [] : null;
  let cursor = raw, decodedBytes = 0, bounded = false;
  while (cursor !== null && cursor !== undefined) {
    if (layers.length >= maxLayers || decodedBytes + utf16(cursor) > maxDecodedBytes) { bounded = true; break; }
    decodedBytes += utf16(cursor);
    const entries = JSON.parse(cursor);
    if (!Array.isArray(entries)) throw Error("Journal must be an array");
    if (layers.length === 0) rootEntries = entries;
    const latest = [...entries].reverse().find(entry => entry.replacement || (entry.kind === "recovery" && entry.archiveVersion === undefined));
    let previous = null, duplicatedPreviousJournal = false;
    if (latest?.replacement) {
      const diagnostic = JSON.parse(latest.replacement.diagnosticJson);
      const safety = JSON.parse(latest.replacement.safetyJson);
      previous = diagnostic.rawJournal;
      duplicatedPreviousJournal = previous !== null && previous === safety.recoveryDiagnostic.rawJournal;
    } else if (latest?.kind === "recovery") previous = JSON.parse(latest.diagnosticJson).rawJournal;
    layers.push({ depth: layers.length, entries: entries.length, utf8Bytes: utf8(cursor), utf16ValueBytes: utf16(cursor), duplicatedPreviousJournal });
    cursor = previous;
  }
  const entries = rootEntries ?? [];
  return {
    utf8Bytes: utf8(raw), utf16ValueBytes: utf16(raw), entries: rootEntries === null ? null : entries.length,
    embeddedJournalDepth: Math.max(0, layers.length - 1), bounded, decodedBytes, layers,
    archives: entries.filter(entry => entry.replacement).map(entry => ({
      operationId: entry.importId,
      diagnosticEncodedUtf16Bytes: utf16(JSON.stringify(entry.replacement.diagnosticJson)),
      safetyEncodedUtf16Bytes: utf16(JSON.stringify(entry.replacement.safetyJson)),
      stagedValueUtf16Bytes: utf16(entry.replacement.stagedRaw),
    })),
  };
}

export function snapshotMetrics(snapshot, userId) {
  const prefix = `travel-prospect-crm:account:v1:${userId}:`;
  const journal = snapshot[prefix + "resource-import-journal"] ?? null;
  return {
    resourceUtf8Bytes: utf8(snapshot[prefix + "resources"]), resourceUtf16Bytes: utf16(snapshot[prefix + "resources"]),
    allValueUtf16Bytes: Object.values(snapshot).reduce((sum, value) => sum + utf16(value), 0),
    journal: journalMetrics(journal),
  };
}
