import { RecordId } from "surrealdb";
import { query } from "../surreal.js";
import { recordIdString, bareId, splitRecordId } from "./ids.js";

const mid = (id) => new RecordId("member", id);

// External relation type -> primitive edge table.
// Parent/Child both map to parent_of (direction differs); parent_of is always
// stored parent(in) -> child(out).
const TYPE_TO_EDGE = {
  Parent: "parent_of",
  Child: "parent_of",
  Spouse: "married_to",
  Sibling: "sibling_of",
};

const EDGE_TABLES = ["parent_of", "married_to", "sibling_of"];

/** Create a primitive edge from an external {fromId,toId,type}. */
export async function createRelation({ fromId, toId, type, createdBy }) {
  const edge = TYPE_TO_EDGE[type];
  if (!edge) throw new Error(`Unknown relation type: ${type}`);

  // Normalize so parent_of is always parent(in) -> child(out).
  let inId = fromId;
  let outId = toId;
  if (type === "Child") {
    inId = toId;
    outId = fromId;
  }

  const content = { createdBy: createdBy ?? null, createdAt: new Date().toISOString() };
  const rows = await query(`RELATE $inRec->${edge}->$outRec CONTENT $content`, {
    inRec: mid(inId),
    outRec: mid(outId),
    content,
  });
  const rec = Array.isArray(rows) ? rows[0] : rows;
  // Echo the caller's semantics; id is the real edge record id (for delete).
  return { id: recordIdString(rec?.id), fromId, toId, type };
}

/** All relations, reconstructed into the external {id,fromId,toId,type} shape. */
export async function listRelations() {
  const [parents, marriages, siblings] = await Promise.all([
    query("SELECT id, in, out FROM parent_of"),
    query("SELECT id, in, out FROM married_to"),
    query("SELECT id, in, out FROM sibling_of"),
  ]);
  const out = [];
  for (const e of parents || []) out.push({ id: recordIdString(e.id), fromId: bareId(e.in), toId: bareId(e.out), type: "Parent" });
  for (const e of marriages || []) out.push({ id: recordIdString(e.id), fromId: bareId(e.in), toId: bareId(e.out), type: "Spouse" });
  for (const e of siblings || []) out.push({ id: recordIdString(e.id), fromId: bareId(e.in), toId: bareId(e.out), type: "Sibling" });
  return out;
}

/** Delete an edge by its "table:key" id. Returns true if something was removed. */
export async function deleteRelation(id) {
  const { table, key } = splitRecordId(id);
  if (!EDGE_TABLES.includes(table)) return false;
  const rows = await query("DELETE type::thing($tb, $key) RETURN BEFORE", { tb: table, key });
  return Array.isArray(rows) ? rows.length > 0 : Boolean(rows);
}

/** Does an equivalent relation already exist? (dup guard) */
export async function relationExists(fromId, toId, type) {
  const edge = TYPE_TO_EDGE[type];
  if (!edge) return false;

  if (type === "Parent" || type === "Child") {
    let inId = fromId;
    let outId = toId;
    if (type === "Child") {
      inId = toId;
      outId = fromId;
    }
    const rows = await query(`SELECT id FROM ${edge} WHERE in = $inRec AND out = $outRec`, {
      inRec: mid(inId),
      outRec: mid(outId),
    });
    return (rows || []).length > 0;
  }

  // Spouse / Sibling are undirected — match either direction.
  const rows = await query(
    `SELECT id FROM ${edge} WHERE (in = $a AND out = $b) OR (in = $b AND out = $a)`,
    { a: mid(fromId), b: mid(toId) }
  );
  return (rows || []).length > 0;
}
