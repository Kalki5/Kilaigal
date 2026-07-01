// Helpers for translating between SurrealDB RecordIds and the plain string ids
// the HTTP API / frontend use.

/** Extract the bare key from a RecordId or "table:key" string. */
export function bareId(rid) {
  if (rid == null) return rid;
  if (typeof rid === "string") {
    const i = rid.indexOf(":");
    return i === -1 ? rid : rid.slice(i + 1);
  }
  if (typeof rid === "object") {
    // SurrealDB RecordId: { tb, id }
    if ("id" in rid) return String(rid.id);
    return String(rid);
  }
  return String(rid);
}

/** Full "table:key" string for a RecordId or string. */
export function recordIdString(rid) {
  if (rid == null) return rid;
  if (typeof rid === "string") return rid;
  if (typeof rid === "object" && "tb" in rid && "id" in rid) return `${rid.tb}:${rid.id}`;
  return String(rid);
}

/** Split a "table:key" id into { table, key }. */
export function splitRecordId(str) {
  const s = String(str);
  const i = s.indexOf(":");
  if (i === -1) return { table: null, key: s };
  return { table: s.slice(0, i), key: s.slice(i + 1) };
}
