import { RecordId } from "surrealdb";
import { query } from "../surreal.js";
import { bareId } from "./ids.js";

const mid = (id) => new RecordId("member", id);

async function componentIdOf(memberId) {
  const rows = await query("SELECT componentId FROM type::thing('member', $id)", { id: memberId });
  return rows && rows[0] ? rows[0].componentId ?? null : null;
}

/**
 * Union the components of two members after an edge is created between them.
 * Simple union: if neither has a component, both get a new one keyed off aId;
 * if one has it, the other joins; if both differ, relabel B's whole component
 * to A's. Idempotent when already merged.
 *
 * NOTE: correctness needs live-DB validation — this environment can't reach the
 * cloud instance to run it.
 */
export async function linkComponents(aId, bId) {
  const [ca, cb] = await Promise.all([componentIdOf(aId), componentIdOf(bId)]);

  if (ca && cb) {
    if (ca === cb) return ca;
    // Merge: relabel every member of component B into component A.
    await query("UPDATE member SET componentId = $a WHERE componentId = $b", { a: ca, b: cb });
    return ca;
  }
  if (ca && !cb) {
    await query("UPDATE type::thing('member', $id) SET componentId = $c", { id: bId, c: ca });
    return ca;
  }
  if (!ca && cb) {
    await query("UPDATE type::thing('member', $id) SET componentId = $c", { id: aId, c: cb });
    return cb;
  }
  // Neither has one: create a fresh component keyed off aId.
  const newId = `comp_${aId}`;
  await query("UPDATE member SET componentId = $c WHERE id IN $ids", {
    c: newId,
    ids: [mid(aId), mid(bId)],
  });
  return newId;
}

/** The component id + member count for the tree a member belongs to. */
export async function componentInfo(memberId) {
  const cid = await componentIdOf(memberId);
  if (!cid) return { componentId: null, size: 1 };
  const rows = await query("SELECT count() AS c FROM member WHERE componentId = $c GROUP ALL", { c: cid });
  const size = rows && rows[0] ? rows[0].c : 1;
  return { componentId: cid, size };
}

export { bareId };
