// Do not recursively decode historical archives. Bound each external document before parsing.
export const RESOURCE_ARCHIVE_MAX_CHARACTERS = 16 * 1024 * 1024;
export function parseResourceArchive(raw: string): unknown {
  if (raw.length > RESOURCE_ARCHIVE_MAX_CHARACTERS) throw new Error("Archive Ressources trop volumineuse : lecture automatique refusée, octets conservés.");
  return JSON.parse(raw);
}

/** Synchronous SHA-256 permits integrity checks inside a locked synchronous read. */
export function resourceDigest(raw: string): string {
  const bytes = new TextEncoder().encode(raw);
  const length = Math.ceil((bytes.length + 9) / 64) * 64;
  const data = new Uint8Array(length); data.set(bytes); data[bytes.length] = 128;
  const view = new DataView(data.buffer);
  view.setUint32(length - 8, Math.floor(bytes.length / 0x20000000));
  view.setUint32(length - 4, bytes.length * 8);
  const primes: number[] = [];
  for (let n = 2; primes.length < 64; n++) {
    if (primes.every(p => n % p !== 0)) primes.push(n);
  }
  const fraction = (n: number) => (n - Math.floor(n)) * 0x100000000 >>> 0;
  const k = primes.map(p => fraction(Math.cbrt(p)));
  const h = primes.slice(0, 8).map(p => fraction(Math.sqrt(p)));
  const rotate = (n: number, bits: number) => n >>> bits | n << (32 - bits);
  for (let offset = 0; offset < length; offset += 64) {
    const w = Array<number>(64);
    for (let i = 0; i < 64; i++) {
      if (i < 16) w[i] = view.getUint32(offset + i * 4);
      else {
        const a = w[i - 15], b = w[i - 2];
        w[i] = (w[i - 16] + (rotate(a, 7) ^ rotate(a, 18) ^ a >>> 3) + w[i - 7] + (rotate(b, 17) ^ rotate(b, 19) ^ b >>> 10)) | 0;
      }
    }
    let [a, b, c, d, e, f, g, v] = h;
    for (let i = 0; i < 64; i++) {
      const t = (v + (rotate(e, 6) ^ rotate(e, 11) ^ rotate(e, 25)) + (e & f ^ ~e & g) + k[i] + w[i]) | 0;
      const u = ((rotate(a, 2) ^ rotate(a, 13) ^ rotate(a, 22)) + (a & b ^ a & c ^ b & c)) | 0;
      v = g; g = f; f = e; e = (d + t) | 0; d = c; c = b; b = a; a = (t + u) | 0;
    }
    [a, b, c, d, e, f, g, v].forEach((n, i) => { h[i] = (h[i] + n) | 0; });
  }
  return h.map(n => (n >>> 0).toString(16).padStart(8, "0")).join("");
}

export function archiveReceipt(userId: string, json: string) {
  return { version: 2, ownerUserId: userId, sha256: resourceDigest(json), utf16Bytes: json.length * 2 };
}

export function validFlatEntry(entry: Record<string, unknown>, userId: string) {
  if (entry.archiveVersion === undefined) return entry.receipts === undefined && entry.fingerprints === undefined; // Historical entries stay untouched.
  if (entry.archiveVersion !== 2 || entry.userId !== userId || entry.replacement !== undefined || entry.diagnosticJson !== undefined || entry.stagedRaw !== undefined) return false;
  if (Object.keys(entry).some(k => !["importId", "userId", "createdAt", "kind", "archiveVersion", "sourceOwnerUserId", "beforeRaw", "candidateRaw", "fingerprints", "receipts", "recoveredFrom"].includes(k))) return false;
  if (entry.sourceOwnerUserId != null && entry.sourceOwnerUserId !== userId) return false;
  const fingerprints = entry.fingerprints as Record<string, unknown> | null;
  if (!fingerprints || typeof fingerprints !== "object" || Array.isArray(fingerprints) || Object.keys(fingerprints).length !== 2) return false;
  for (const side of ["beforeRaw", "candidateRaw"] as const) {
    const raw = entry[side];
    if (raw !== null && typeof raw !== "string") return false;
    if (fingerprints[side] !== (raw === null ? null : resourceDigest(raw as string))) return false;
  }
  const receipts = entry.receipts as Record<string, unknown> | null;
  if (!receipts || typeof receipts !== "object" || Array.isArray(receipts) || Object.keys(receipts).some(k => !["diagnostic", "safety"].includes(k))) return false;
  return Object.values(receipts).every(value => {
    const r = value as ReturnType<typeof archiveReceipt> | null;
    return !!r && Object.keys(r).length === 4 && r.version === 2 && r.ownerUserId === userId && /^[a-f0-9]{64}$/.test(r.sha256) && Number.isSafeInteger(r.utf16Bytes) && r.utf16Bytes >= 0;
  }) && (entry.kind !== "recovery" || (!!entry.recoveredFrom && typeof (entry.recoveredFrom as Record<string, unknown>).operationId === "string" && ["beforeRaw", "candidateRaw"].includes(String((entry.recoveredFrom as Record<string, unknown>).side))));
}
