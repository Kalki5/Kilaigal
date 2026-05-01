// Feature: enhanced-family-tree, Property 4: Batch loader chunking
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { chunkArray } from "../../services/batchLoader.js";

const CHUNK_SIZE = 100;

describe("Property 4: Batch loader chunking", () => {
  // **Validates: Requirements 3.1, 3.2**

  it("every chunk should contain at most 100 items", () => {
    fc.assert(
      fc.property(
        fc.array(fc.uuid(), { minLength: 0, maxLength: 500 }),
        (ids) => {
          const chunks = chunkArray(ids, CHUNK_SIZE);
          for (const chunk of chunks) {
            expect(chunk.length).toBeLessThanOrEqual(CHUNK_SIZE);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it("the union of all chunks should equal the original array with no items lost or added", () => {
    fc.assert(
      fc.property(
        fc.array(fc.uuid(), { minLength: 0, maxLength: 500 }),
        (ids) => {
          const chunks = chunkArray(ids, CHUNK_SIZE);
          const flattened = chunks.flat();

          // Same total length — no items lost or added
          expect(flattened.length).toBe(ids.length);

          // Same elements in the same order
          expect(flattened).toEqual(ids);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("empty input produces no chunks", () => {
    fc.assert(
      fc.property(
        fc.constant([]),
        (ids) => {
          const chunks = chunkArray(ids, CHUNK_SIZE);
          expect(chunks).toEqual([]);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("the set of unique IDs is preserved across chunks — no duplicates lost", () => {
    fc.assert(
      fc.property(
        fc.array(fc.uuid(), { minLength: 0, maxLength: 500 }),
        (ids) => {
          const chunks = chunkArray(ids, CHUNK_SIZE);
          const flattened = chunks.flat();

          const originalSet = new Set(ids);
          const chunkedSet = new Set(flattened);

          // Every original ID is present in the chunked output
          for (const id of originalSet) {
            expect(chunkedSet.has(id)).toBe(true);
          }

          // No extra IDs were introduced
          for (const id of chunkedSet) {
            expect(originalSet.has(id)).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
