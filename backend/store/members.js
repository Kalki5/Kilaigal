import { query } from "../surreal.js";
import { bareId } from "./ids.js";

// Shape a SurrealDB member record into the flat API shape (plain string id).
export function toApiMember(rec) {
  if (!rec) return rec;
  const { id, ...rest } = rec;
  return { id: bareId(id), ...rest };
}

export async function listMembers() {
  const rows = await query("SELECT * FROM member");
  return (rows || []).map(toApiMember);
}

export async function getMember(id) {
  const rows = await query("SELECT * FROM type::thing('member', $id)", { id });
  const rec = rows && rows[0];
  return rec ? toApiMember(rec) : null;
}

export async function createMember(id, data) {
  const now = new Date().toISOString();
  const content = {
    name: data.name,
    gender: data.gender || "Other",
    dob: data.dob ?? null,
    manualAge: data.manualAge ?? null,
    location: data.location ?? null,
    phone: data.phone ?? null,
    photoUrl: data.photoUrl ?? null,
    x: data.x ?? null,
    y: data.y ?? null,
    createdBy: data.createdBy ?? null,
    createdAt: now,
    updatedAt: now,
  };
  const rows = await query("CREATE type::thing('member', $id) CONTENT $content", { id, content });
  return toApiMember(rows && rows[0]);
}

export async function updateMember(id, data) {
  const patch = { updatedAt: new Date().toISOString() };
  for (const k of ["name", "gender", "dob", "manualAge", "location", "phone", "photoUrl", "x", "y"]) {
    if (data[k] !== undefined) patch[k] = data[k];
  }
  const rows = await query("UPDATE type::thing('member', $id) MERGE $patch", { id, patch });
  const rec = rows && rows[0];
  return rec ? toApiMember(rec) : null;
}

export async function updatePosition(id, x, y) {
  await query("UPDATE type::thing('member', $id) MERGE { x: $x, y: $y }", { id, x, y });
}
