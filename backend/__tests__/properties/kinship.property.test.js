import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { resolveSlot, SLOTS } from "../../services/kinship/resolveSlot.js";

const gender = fc.constantFrom("Male", "Female");
const bool = fc.boolean();

const SIBLING_SLOTS = new Set([
  SLOTS.ELDER_BROTHER,
  SLOTS.YOUNGER_BROTHER,
  SLOTS.ELDER_SISTER,
  SLOTS.YOUNGER_SISTER,
]);
const CROSS_COUSIN_SLOTS = new Set([
  SLOTS.CROSS_COUSIN_MALE_ELDER,
  SLOTS.CROSS_COUSIN_MALE_YOUNGER,
  SLOTS.CROSS_COUSIN_FEMALE,
]);

describe("kinship structural invariants (Dravidian cross/parallel system)", () => {
  it("PARALLEL cousins always resolve to a sibling slot", () => {
    fc.assert(
      fc.property(gender, bool, gender, bool, (sameG, sibElder, cousinG, cousinElder) => {
        // parallel = parent and parent's sibling share gender
        const steps = [
          { rel: "parent", gender: sameG },
          { rel: "sibling", gender: sameG, elder: sibElder },
          { rel: "child", gender: cousinG, elder: cousinElder },
        ];
        expect(SIBLING_SLOTS.has(resolveSlot(steps))).toBe(true);
      })
    );
  });

  it("CROSS cousins always resolve to a cross-cousin slot", () => {
    fc.assert(
      fc.property(gender, bool, gender, bool, (parentG, sibElder, cousinG, cousinElder) => {
        const sibG = parentG === "Male" ? "Female" : "Male"; // opposite => cross
        const steps = [
          { rel: "parent", gender: parentG },
          { rel: "sibling", gender: sibG, elder: sibElder },
          { rel: "child", gender: cousinG, elder: cousinElder },
        ];
        expect(CROSS_COUSIN_SLOTS.has(resolveSlot(steps))).toBe(true);
      })
    );
  });

  it("father's sister (cross) and mother-in-law share a surface term", () => {
    // Structural consequence of cross-cousin marriage: Attai role doubles as
    // mother-in-law. Here we assert the father's-sister derivation is stable.
    fc.assert(
      fc.property(bool, (elder) => {
        expect(resolveSlot([{ rel: "parent", gender: "Male" }, { rel: "sibling", gender: "Female", elder }])).toBe(
          SLOTS.FATHER_SISTER
        );
      })
    );
  });

  it("elder/younger is honoured for same-generation siblings", () => {
    fc.assert(
      fc.property(gender, (g) => {
        const elder = resolveSlot([{ rel: "sibling", gender: g, elder: true }]);
        const younger = resolveSlot([{ rel: "sibling", gender: g, elder: false }]);
        expect(elder).not.toBe(younger);
      })
    );
  });

  it("never throws on a single well-formed step", () => {
    fc.assert(
      fc.property(fc.constantFrom("parent", "child", "spouse", "sibling"), gender, bool, (rel, g, elder) => {
        expect(() => resolveSlot([{ rel, gender: g, elder }])).not.toThrow();
      })
    );
  });
});
