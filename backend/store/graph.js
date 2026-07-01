import { RecordId } from "surrealdb";
import { query } from "../surreal.js";
import { recordIdString, bareId } from "./ids.js";
import { toApiMember } from "./members.js";

const mid = (id) => new RecordId("member", id);

/**
 * All primitive edges touching any of the given member ids, in the external
 * {id,fromId,toId,type} shape. Used level-by-level by the traversal service.
 */
export async function getEdgesForMembers(ids) {
  if (!ids || ids.length === 0) return [];
  const rids = ids.map(mid);
  const [parents, marriages, siblings] = await Promise.all([
    query("SELECT id, in, out FROM parent_of WHERE in IN $ids OR out IN $ids", { ids: rids }),
    query("SELECT id, in, out FROM married_to WHERE in IN $ids OR out IN $ids", { ids: rids }),
    query("SELECT id, in, out FROM sibling_of WHERE in IN $ids OR out IN $ids", { ids: rids }),
  ]);
  const out = [];
  for (const e of parents || []) out.push({ id: recordIdString(e.id), fromId: bareId(e.in), toId: bareId(e.out), type: "Parent" });
  for (const e of marriages || []) out.push({ id: recordIdString(e.id), fromId: bareId(e.in), toId: bareId(e.out), type: "Spouse" });
  for (const e of siblings || []) out.push({ id: recordIdString(e.id), fromId: bareId(e.in), toId: bareId(e.out), type: "Sibling" });
  return out;
}

export async function getMembersByIds(ids) {
  if (!ids || ids.length === 0) return [];
  const rows = await query("SELECT * FROM member WHERE id IN $ids", { ids: ids.map(mid) });
  return (rows || []).map(toApiMember);
}
