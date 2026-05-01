// Feature: enhanced-family-tree, Property 7: Bidirectional duplicate relation detection
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { isDuplicate } from "../../utils/duplicateCheck.js";

const RELATION_TYPES = ["Parent", "Child", "Spouse", "Sibling"];

/**
 * Generator for a relation type.
 */
const relationTypeArb = fc.constantFrom(...RELATION_TYPES);

/**
 * Generator for a single relation record with random fromId, toId, and type.
 */
const relationArb = fc.record({
  fromId: fc.uuid(),
  toId: fc.uuid(),
  type: relationTypeArb,
});

/**
 * Generator for a candidate relation (the relation being checked for duplicates).
 */
const candidateArb = fc.record({
  fromId: fc.uuid(),
  toId: fc.uuid(),
  type: relationTypeArb,
});

/**
 * Helper: Given a full set of existing relations and a candidate,
 * build the forwardRelations and reverseRelations arrays as the
 * route handler would — forwardRelations are those with fromId
 * matching the candidate's fromId, reverseRelations are those
 * with fromId matching the candidate's toId.
 */
function buildRelationArrays(existingRelations, candidateFromId, candidateToId) {
  const forwardRelations = existingRelations.filter(
    (rel) => rel.fromId === candidateFromId
  );
  const reverseRelations = existingRelations.filter(
    (rel) => rel.fromId === candidateToId
  );
  return { forwardRelations, reverseRelations };
}

/**
 * Oracle: checks whether a duplicate exists by scanning all existing
 * relations for either direction match.
 */
function oracleDuplicateCheck(existingRelations, fromId, toId, type) {
  return existingRelations.some(
    (rel) =>
      (rel.fromId === fromId && rel.toId === toId && rel.type === type) ||
      (rel.fromId === toId && rel.toId === fromId && rel.type === type)
  );
}

describe("Property 7: Bidirectional duplicate relation detection", () => {
  // **Validates: Requirements 7.1, 7.2**

  it("should detect a duplicate when forward direction (fromId, toId, type) exists", () => {
    fc.assert(
      fc.property(
        fc.array(relationArb, { minLength: 0, maxLength: 20 }),
        candidateArb,
        (baseRelations, candidate) => {
          // Inject the exact forward match into the existing relations
          const forwardMatch = {
            fromId: candidate.fromId,
            toId: candidate.toId,
            type: candidate.type,
          };
          const existingRelations = [...baseRelations, forwardMatch];

          const { forwardRelations, reverseRelations } = buildRelationArrays(
            existingRelations,
            candidate.fromId,
            candidate.toId
          );

          const result = isDuplicate(
            forwardRelations,
            reverseRelations,
            candidate.fromId,
            candidate.toId,
            candidate.type
          );

          expect(result).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("should detect a duplicate when reverse direction (toId, fromId, type) exists", () => {
    fc.assert(
      fc.property(
        fc.array(relationArb, { minLength: 0, maxLength: 20 }),
        candidateArb,
        (baseRelations, candidate) => {
          // Inject the reverse match into the existing relations
          const reverseMatch = {
            fromId: candidate.toId,
            toId: candidate.fromId,
            type: candidate.type,
          };
          const existingRelations = [...baseRelations, reverseMatch];

          const { forwardRelations, reverseRelations } = buildRelationArrays(
            existingRelations,
            candidate.fromId,
            candidate.toId
          );

          const result = isDuplicate(
            forwardRelations,
            reverseRelations,
            candidate.fromId,
            candidate.toId,
            candidate.type
          );

          expect(result).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("should not report a false positive when neither direction exists", () => {
    fc.assert(
      fc.property(
        fc.array(relationArb, { minLength: 0, maxLength: 20 }),
        candidateArb,
        (existingRelations, candidate) => {
          // Remove any relations that would match in either direction
          const filtered = existingRelations.filter(
            (rel) =>
              !(rel.fromId === candidate.fromId && rel.toId === candidate.toId && rel.type === candidate.type) &&
              !(rel.fromId === candidate.toId && rel.toId === candidate.fromId && rel.type === candidate.type)
          );

          const { forwardRelations, reverseRelations } = buildRelationArrays(
            filtered,
            candidate.fromId,
            candidate.toId
          );

          const result = isDuplicate(
            forwardRelations,
            reverseRelations,
            candidate.fromId,
            candidate.toId,
            candidate.type
          );

          expect(result).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("should agree with an oracle duplicate check for random relation sets", () => {
    fc.assert(
      fc.property(
        fc.array(relationArb, { minLength: 0, maxLength: 30 }),
        candidateArb,
        (existingRelations, candidate) => {
          const { forwardRelations, reverseRelations } = buildRelationArrays(
            existingRelations,
            candidate.fromId,
            candidate.toId
          );

          const actual = isDuplicate(
            forwardRelations,
            reverseRelations,
            candidate.fromId,
            candidate.toId,
            candidate.type
          );

          const expected = oracleDuplicateCheck(
            existingRelations,
            candidate.fromId,
            candidate.toId,
            candidate.type
          );

          expect(actual).toBe(expected);
        }
      ),
      { numRuns: 100 }
    );
  });
});
