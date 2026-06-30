// Public API for the kinship engine.
//
// describePath(steps, packId) -> { slot, term }
//   steps: primitive hops from ego to alter (see resolveSlot.js for shape)
//   term:  { script?, romanized, aliases? } in the chosen terminology pack
//
// This is the deterministic core. The LLM (aiRelationship.js) is only used to
// turn { slot, term, path } into a friendly sentence — never to derive kinship.

import { resolveSlot, SLOTS } from "./resolveSlot.js";
import { resolveTerm, listPacks, DEFAULT_PACK_ID } from "./packs/registry.js";

export { resolveSlot, SLOTS, resolveTerm, listPacks, DEFAULT_PACK_ID };

/**
 * Resolve a path to a kin-slot and its surface term.
 * @param {Array<{rel:string, gender:string, elder?:boolean}>} steps
 * @param {string} [packId]
 * @returns {{ slot: string, term: { script?:string, romanized:string, aliases?:string[] } }}
 */
export function describePath(steps, packId = DEFAULT_PACK_ID) {
  const slot = resolveSlot(steps);
  const term = resolveTerm(slot, packId);
  return { slot, term };
}

/** Convenience: "Periyappa (பெரியப்பா)" style display string. */
export function displayTerm(steps, packId = DEFAULT_PACK_ID) {
  const { term } = describePath(steps, packId);
  if (term.script) return `${term.romanized} (${term.script})`;
  return term.romanized;
}
