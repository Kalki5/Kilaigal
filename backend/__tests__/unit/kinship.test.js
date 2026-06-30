import { describe, it, expect } from "vitest";
import { resolveSlot, SLOTS } from "../../services/kinship/resolveSlot.js";
import { resolveTerm } from "../../services/kinship/packs/registry.js";
import { describePath } from "../../services/kinship/index.js";

const M = "Male";
const F = "Female";
const P = (gender) => ({ rel: "parent", gender });
const C = (gender, elder) => ({ rel: "child", gender, elder });
const S = (gender, elder) => ({ rel: "sibling", gender, elder });
const SP = (gender) => ({ rel: "spouse", gender });

describe("resolveSlot — direct relations", () => {
  it("father / mother", () => {
    expect(resolveSlot([P(M)])).toBe(SLOTS.FATHER);
    expect(resolveSlot([P(F)])).toBe(SLOTS.MOTHER);
  });
  it("son / daughter", () => {
    expect(resolveSlot([C(M)])).toBe(SLOTS.SON);
    expect(resolveSlot([C(F)])).toBe(SLOTS.DAUGHTER);
  });
  it("husband / wife", () => {
    expect(resolveSlot([SP(M)])).toBe(SLOTS.HUSBAND);
    expect(resolveSlot([SP(F)])).toBe(SLOTS.WIFE);
  });
  it("elder/younger brother & sister", () => {
    expect(resolveSlot([S(M, true)])).toBe(SLOTS.ELDER_BROTHER);
    expect(resolveSlot([S(M, false)])).toBe(SLOTS.YOUNGER_BROTHER);
    expect(resolveSlot([S(F, true)])).toBe(SLOTS.ELDER_SISTER);
    expect(resolveSlot([S(F, false)])).toBe(SLOTS.YOUNGER_SISTER);
  });
});

describe("resolveSlot — grandparents & grandchildren", () => {
  it("paternal vs maternal grandparents", () => {
    expect(resolveSlot([P(M), P(M)])).toBe(SLOTS.GRANDFATHER_PATERNAL);
    expect(resolveSlot([P(M), P(F)])).toBe(SLOTS.GRANDMOTHER_PATERNAL);
    expect(resolveSlot([P(F), P(M)])).toBe(SLOTS.GRANDFATHER_MATERNAL);
    expect(resolveSlot([P(F), P(F)])).toBe(SLOTS.GRANDMOTHER_MATERNAL);
  });
  it("grandson / granddaughter", () => {
    expect(resolveSlot([C(M), C(M)])).toBe(SLOTS.GRANDSON);
    expect(resolveSlot([C(M), C(F)])).toBe(SLOTS.GRANDDAUGHTER);
  });
});

describe("resolveSlot — parent's siblings (the cross/parallel heart)", () => {
  it("father's elder/younger brother (parallel)", () => {
    expect(resolveSlot([P(M), S(M, true)])).toBe(SLOTS.FATHER_ELDER_BROTHER);
    expect(resolveSlot([P(M), S(M, false)])).toBe(SLOTS.FATHER_YOUNGER_BROTHER);
  });
  it("father's sister is CROSS", () => {
    expect(resolveSlot([P(M), S(F, true)])).toBe(SLOTS.FATHER_SISTER);
  });
  it("mother's brother is CROSS", () => {
    expect(resolveSlot([P(F), S(M, true)])).toBe(SLOTS.MOTHER_BROTHER);
  });
  it("mother's elder/younger sister (parallel)", () => {
    expect(resolveSlot([P(F), S(F, true)])).toBe(SLOTS.MOTHER_ELDER_SISTER);
    expect(resolveSlot([P(F), S(F, false)])).toBe(SLOTS.MOTHER_YOUNGER_SISTER);
  });
});

describe("resolveSlot — cousins", () => {
  it("parallel cousins are addressed as siblings", () => {
    // father's brother's son -> brother
    expect(resolveSlot([P(M), S(M, true), C(M, true)])).toBe(SLOTS.ELDER_BROTHER);
    // mother's sister's daughter -> sister
    expect(resolveSlot([P(F), S(F, true), C(F, false)])).toBe(SLOTS.YOUNGER_SISTER);
  });
  it("cross cousins are the marriageable category", () => {
    // mother's brother's son -> cross cousin male
    expect(resolveSlot([P(F), S(M, true), C(M, true)])).toBe(SLOTS.CROSS_COUSIN_MALE_ELDER);
    expect(resolveSlot([P(F), S(M, true), C(M, false)])).toBe(SLOTS.CROSS_COUSIN_MALE_YOUNGER);
    // father's sister's daughter -> cross cousin female
    expect(resolveSlot([P(M), S(F, true), C(F, true)])).toBe(SLOTS.CROSS_COUSIN_FEMALE);
  });
});

describe("resolveSlot — in-laws", () => {
  it("parent-in-law", () => {
    expect(resolveSlot([SP(F), P(M)])).toBe(SLOTS.FATHER_IN_LAW);
    expect(resolveSlot([SP(F), P(F)])).toBe(SLOTS.MOTHER_IN_LAW);
  });
  it("child-in-law", () => {
    expect(resolveSlot([C(M), SP(F)])).toBe(SLOTS.DAUGHTER_IN_LAW);
    expect(resolveSlot([C(F), SP(M)])).toBe(SLOTS.SON_IN_LAW);
  });
});

describe("terminology packs", () => {
  it("spoken-tamil resolves canonical Tamil terms", () => {
    expect(resolveTerm(SLOTS.FATHER_ELDER_BROTHER).romanized).toBe("Periyappa");
    expect(resolveTerm(SLOTS.MOTHER_BROTHER).romanized).toBe("Maama");
    expect(resolveTerm(SLOTS.FATHER_SISTER).script).toBe("அத்தை");
  });
  it("the Attai = father's-sister derivation flows through describePath", () => {
    const { slot, term } = describePath([P(M), S(F, true)]);
    expect(slot).toBe(SLOTS.FATHER_SISTER);
    expect(term.romanized).toBe("Attai");
  });
  it("iyer pack overrides, falls back to spoken-tamil for the rest", () => {
    expect(resolveTerm(SLOTS.MOTHER_BROTHER, "iyer").romanized).toBe("Mama"); // override
    expect(resolveTerm(SLOTS.FATHER_ELDER_BROTHER, "iyer").romanized).toBe("Periyappa"); // fallback
  });
  it("coarsening fallback: a pack without the fine split still resolves", () => {
    // A hypothetical pack id that doesn't exist falls back to default; default
    // has the fine terms, so this checks the coarsen path doesn't throw.
    expect(resolveTerm(SLOTS.FATHER_ELDER_BROTHER, "nonexistent").romanized).toBe("Periyappa");
  });
  it("unknown slot degrades gracefully", () => {
    expect(resolveTerm("SOME_WEIRD_SLOT").romanized).toBe("SOME_WEIRD_SLOT");
  });
});

describe("resolveSlot — out of coverage", () => {
  it("great-grandparent falls through to UNKNOWN", () => {
    expect(resolveSlot([P(M), P(M), P(M)])).toBe(SLOTS.UNKNOWN);
  });
});
