import spokenTamil from "./spoken-tamil.js";
import iyer from "./iyer.js";

export const DEFAULT_PACK_ID = "spoken-tamil";

const PACKS = {
  [spokenTamil.id]: spokenTamil,
  [iyer.id]: iyer,
};

export function getPack(packId) {
  return PACKS[packId] || PACKS[DEFAULT_PACK_ID];
}

export function listPacks() {
  return Object.values(PACKS).map((p) => ({ id: p.id, label: p.label }));
}

// Coarser slot fallbacks: when a pack lacks a fine distinction (e.g. elder vs
// younger uncle), fall back to a more general slot before giving up.
const COARSEN = {
  FATHER_ELDER_BROTHER: "FATHER_BROTHER",
  FATHER_YOUNGER_BROTHER: "FATHER_BROTHER",
  MOTHER_ELDER_SISTER: "MOTHER_SISTER",
  MOTHER_YOUNGER_SISTER: "MOTHER_SISTER",
  FATHER_ELDER_BROTHER_WIFE: "FATHER_BROTHER_WIFE",
  FATHER_YOUNGER_BROTHER_WIFE: "FATHER_BROTHER_WIFE",
  MOTHER_ELDER_SISTER_HUSBAND: "MOTHER_SISTER_HUSBAND",
  MOTHER_YOUNGER_SISTER_HUSBAND: "MOTHER_SISTER_HUSBAND",
  CROSS_COUSIN_MALE_ELDER: "CROSS_COUSIN_MALE",
  CROSS_COUSIN_MALE_YOUNGER: "CROSS_COUSIN_MALE",
};

function candidateSlots(slot) {
  const out = [slot];
  let s = slot;
  while (COARSEN[s]) {
    s = COARSEN[s];
    out.push(s);
  }
  return out;
}

function lookupInChain(pack, slot) {
  let p = pack;
  const seen = new Set();
  while (p && !seen.has(p.id)) {
    seen.add(p.id);
    if (p.terms && p.terms[slot]) return p.terms[slot];
    p = p.fallback ? getPack(p.fallback) : null;
  }
  return null;
}

/**
 * Resolve a kin-slot to a surface term for the given pack.
 * Tries: exact slot in pack+fallback chain, then coarser slots, then the raw
 * slot name as a last resort.
 *
 * @param {string} slot
 * @param {string} [packId]
 * @returns {{ script?: string, romanized: string, aliases?: string[] }}
 */
export function resolveTerm(slot, packId = DEFAULT_PACK_ID) {
  const pack = getPack(packId);
  for (const candidate of candidateSlots(slot)) {
    const hit = lookupInChain(pack, candidate);
    if (hit) return hit;
  }
  return { romanized: slot };
}
