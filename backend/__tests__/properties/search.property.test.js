// Feature: enhanced-family-tree, Property 5: Search returns correct matches
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { searchMembers } from "../../utils/searchMembers.js";

/**
 * Generator for a single member record with random fields.
 */
const memberArb = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 30 }),
  gender: fc.constantFrom("Male", "Female", "Other"),
  photoUrl: fc.webUrl(),
});

/**
 * Generator for a query string containing only alphabetic characters (length 2-10).
 * Using alpha characters ensures meaningful substring matching.
 */
const queryArb = fc.stringMatching(/^[a-zA-Z]{2,10}$/);

describe("Property 5: Search returns correct matches", () => {
  // **Validates: Requirements 4.1, 4.2, 4.4**

  it("should return only members whose names contain the query (case-insensitive)", () => {
    fc.assert(
      fc.property(
        fc.array(memberArb, { minLength: 0, maxLength: 50 }),
        queryArb,
        (members, query) => {
          const results = searchMembers(members, query);

          // Every returned member must have a name that contains the query (case-insensitive)
          for (const result of results) {
            expect(
              result.name.toLowerCase().includes(query.toLowerCase())
            ).toBe(true);
          }

          // Every member whose name matches the query should be in the results
          // (up to the 20-result cap)
          const allMatching = members.filter((m) =>
            m.name.toLowerCase().includes(query.toLowerCase())
          );
          const expectedCount = Math.min(allMatching.length, 20);
          expect(results.length).toBe(expectedCount);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("should return at most 20 results", () => {
    fc.assert(
      fc.property(
        fc.array(memberArb, { minLength: 0, maxLength: 50 }),
        queryArb,
        (members, query) => {
          const results = searchMembers(members, query);
          expect(results.length).toBeLessThanOrEqual(20);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("each result should include id, name, gender, and photoUrl fields", () => {
    fc.assert(
      fc.property(
        fc.array(memberArb, { minLength: 0, maxLength: 50 }),
        queryArb,
        (members, query) => {
          const results = searchMembers(members, query);

          for (const result of results) {
            expect(result).toHaveProperty("id");
            expect(result).toHaveProperty("name");
            expect(result).toHaveProperty("gender");
            expect(result).toHaveProperty("photoUrl");

            // Should only have these four fields — no extra data leaked
            expect(Object.keys(result).sort()).toEqual(
              ["gender", "id", "name", "photoUrl"]
            );
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it("should not return any member whose name does not contain the query", () => {
    fc.assert(
      fc.property(
        fc.array(memberArb, { minLength: 0, maxLength: 50 }),
        queryArb,
        (members, query) => {
          const results = searchMembers(members, query);
          const resultIds = new Set(results.map((r) => r.id));

          // No non-matching member should appear in results
          for (const member of members) {
            if (!member.name.toLowerCase().includes(query.toLowerCase())) {
              expect(resultIds.has(member.id)).toBe(false);
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
