import { describe, it, expect } from "vitest";
import { pathToSteps } from "../../services/pathToSteps.js";
import { resolveSlot, SLOTS } from "../../services/kinship/resolveSlot.js";

// Helpers to build members and edges the way findShortestPath returns them.
const m = (id, gender, dob) => ({ id, name: id, gender, dob });
const parentEdge = (parentId, childId) => ({ id: `parent_of:${parentId}-${childId}`, fromId: parentId, toId: childId, type: "Parent" });
const spouseEdge = (a, b) => ({ id: `married_to:${a}-${b}`, fromId: a, toId: b, type: "Spouse" });

describe("pathToSteps", () => {
  it("ego -> parent yields a parent step with the parent's gender", () => {
    const members = [m("ego", "Male", "1990-01-01"), m("dad", "Male", "1960-01-01")];
    const edges = [parentEdge("dad", "ego")]; // dad is parent of ego
    const steps = pathToSteps(members, edges);
    expect(steps).toEqual([{ rel: "parent", gender: "Male" }]);
    expect(resolveSlot(steps)).toBe(SLOTS.FATHER);
  });

  it("ego -> child yields a child step", () => {
    const members = [m("ego", "Female", "1990-01-01"), m("kid", "Female", "2015-01-01")];
    const edges = [parentEdge("ego", "kid")]; // ego is parent of kid
    const steps = pathToSteps(members, edges);
    expect(steps).toEqual([{ rel: "child", gender: "Female" }]);
    expect(resolveSlot(steps)).toBe(SLOTS.DAUGHTER);
  });

  it("father's elder brother resolves through steps to FATHER_ELDER_BROTHER", () => {
    // ego -> dad (parent) -> dad's brother (sibling, elder than dad)
    const members = [m("ego", "Male", "1990"), m("dad", "Male", "1960"), m("uncle", "Male", "1955")];
    const edges = [
      parentEdge("dad", "ego"),
      { id: "sibling_of:dad-uncle", fromId: "dad", toId: "uncle", type: "Sibling" },
    ];
    const steps = pathToSteps(members, edges);
    expect(steps[0]).toEqual({ rel: "parent", gender: "Male" });
    expect(steps[1].rel).toBe("sibling");
    expect(steps[1].elder).toBe(true); // uncle (1955) elder than dad (1960)
    expect(resolveSlot(steps)).toBe(SLOTS.FATHER_ELDER_BROTHER);
  });

  it("cross cousin: terminal elder is computed relative to EGO, not the linking parent", () => {
    // ego(1990) -> mother -> mother's brother -> his son(1985, elder than ego)
    const members = [m("ego", "Male", "1990"), m("mom", "Female", "1962"), m("mb", "Male", "1965"), m("cousin", "Male", "1985")];
    const edges = [
      parentEdge("mom", "ego"),
      { id: "sibling_of:mom-mb", fromId: "mom", toId: "mb", type: "Sibling" },
      parentEdge("mb", "cousin"),
    ];
    const steps = pathToSteps(members, edges);
    expect(steps[2].rel).toBe("child");
    expect(steps[2].elder).toBe(true); // cousin 1985 elder than ego 1990
    expect(resolveSlot(steps)).toBe(SLOTS.CROSS_COUSIN_MALE_ELDER);
  });

  it("spouse step yields HUSBAND/WIFE", () => {
    const members = [m("ego", "Female", "1990"), m("h", "Male", "1988")];
    const steps = pathToSteps(members, [spouseEdge("ego", "h")]);
    expect(steps).toEqual([{ rel: "spouse", gender: "Male" }]);
    expect(resolveSlot(steps)).toBe(SLOTS.HUSBAND);
  });

  it("unknown birth data defaults elder to false (younger term)", () => {
    const members = [m("ego", "Male"), m("sib", "Male")];
    const steps = pathToSteps(members, [{ id: "sibling_of:ego-sib", fromId: "ego", toId: "sib", type: "Sibling" }]);
    expect(steps[0].elder).toBe(false);
    expect(resolveSlot(steps)).toBe(SLOTS.YOUNGER_BROTHER);
  });
});
