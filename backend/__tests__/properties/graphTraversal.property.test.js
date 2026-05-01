// Feature: enhanced-family-tree, Property 1: Traversal returns correct subgraph
import { describe, it, expect, vi, beforeEach } from "vitest";
import fc from "fast-check";

// Mock dependencies before importing the module under test
vi.mock("../../services/relationQueries.js", () => ({
  getRelationsFrom: vi.fn(),
  getRelationsTo: vi.fn(),
}));

vi.mock("../../services/batchLoader.js", () => ({
  batchGetMembers: vi.fn(),
}));

import { traverseTree, findShortestPath } from "../../services/graphTraversal.js";
import { getRelationsFrom, getRelationsTo } from "../../services/relationQueries.js";
import { batchGetMembers } from "../../services/batchLoader.js";

/**
 * Arbitrary: generates a random family graph with members and relations.
 * - Members: 2-50, each with { id, name }
 * - Relations: 1-100, each with { id, fromId, toId, type }
 */
const familyGraphArb = fc
  .tuple(
    fc.integer({ min: 2, max: 50 }), // member count
    fc.integer({ min: 1, max: 100 }) // relation count
  )
  .chain(([memberCount, relationCount]) =>
    fc.tuple(
      // Generate member IDs
      fc.array(fc.uuid(), { minLength: memberCount, maxLength: memberCount }),
      // Generate relation IDs
      fc.array(fc.uuid(), { minLength: relationCount, maxLength: relationCount }),
      // Generate relation endpoint indices (pairs of member indices)
      fc.array(
        fc.tuple(
          fc.integer({ min: 0, max: memberCount - 1 }),
          fc.integer({ min: 0, max: memberCount - 1 })
        ),
        { minLength: relationCount, maxLength: relationCount }
      ),
      // Generate relation types
      fc.array(
        fc.constantFrom("Parent", "Child", "Spouse", "Sibling"),
        { minLength: relationCount, maxLength: relationCount }
      )
    ).map(([memberIds, relationIds, endpoints, types]) => {
      // Deduplicate member IDs
      const uniqueMemberIds = [...new Set(memberIds)];
      while (uniqueMemberIds.length < 2) {
        uniqueMemberIds.push(uniqueMemberIds[0] + "-dup-" + uniqueMemberIds.length);
      }

      const members = uniqueMemberIds.map((id, i) => ({
        id,
        name: `Member-${i}`,
      }));

      const relations = [];
      const usedRelIds = new Set();
      for (let i = 0; i < endpoints.length; i++) {
        const [fromIdx, toIdx] = endpoints[i];
        const safeFromIdx = fromIdx % uniqueMemberIds.length;
        const safeToIdx = toIdx % uniqueMemberIds.length;
        // Skip self-loops
        if (safeFromIdx === safeToIdx) continue;
        // Deduplicate relation IDs
        let relId = relationIds[i % relationIds.length];
        if (usedRelIds.has(relId)) {
          relId = relId + "-" + i;
        }
        usedRelIds.add(relId);

        relations.push({
          id: relId,
          fromId: uniqueMemberIds[safeFromIdx],
          toId: uniqueMemberIds[safeToIdx],
          type: types[i],
        });
      }

      // Ensure at least 1 relation
      if (relations.length === 0) {
        relations.push({
          id: relationIds[0] + "-fallback",
          fromId: uniqueMemberIds[0],
          toId: uniqueMemberIds[1],
          type: types[0],
        });
      }

      return { members, relations };
    })
  );

/**
 * Oracle BFS: computes the set of member IDs reachable from startId within
 * `depth` hops, treating all relations as bidirectional edges.
 */
function oracleBFS(members, relations, startId, depth) {
  const memberIdSet = new Set(members.map((m) => m.id));
  if (!memberIdSet.has(startId)) return new Set();

  const visited = new Set([startId]);
  let frontier = [startId];

  for (let level = 0; level < depth; level++) {
    const nextFrontier = [];
    for (const currentId of frontier) {
      for (const rel of relations) {
        let neighborId = null;
        if (rel.fromId === currentId) {
          neighborId = rel.toId;
        } else if (rel.toId === currentId) {
          neighborId = rel.fromId;
        }
        if (neighborId && !visited.has(neighborId)) {
          visited.add(neighborId);
          nextFrontier.push(neighborId);
        }
      }
    }
    frontier = nextFrontier;
    if (frontier.length === 0) break;
  }

  return visited;
}

/**
 * Sets up mocks so that getRelationsFrom/getRelationsTo and batchGetMembers
 * return data from the in-memory graph.
 */
function setupMocks(members, relations) {
  const memberMap = new Map(members.map((m) => [m.id, m]));

  getRelationsFrom.mockImplementation(async (memberId) => {
    return relations.filter((r) => r.fromId === memberId);
  });

  getRelationsTo.mockImplementation(async (memberId) => {
    return relations.filter((r) => r.toId === memberId);
  });

  batchGetMembers.mockImplementation(async (ids) => {
    return ids.map((id) => memberMap.get(id)).filter(Boolean);
  });
}

describe("Property 1: Traversal returns correct subgraph", () => {
  // **Validates: Requirements 1.1, 1.5**

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returned members are exactly the reachable set within N hops", async () => {
    await fc.assert(
      fc.asyncProperty(
        familyGraphArb.chain((graph) =>
          fc.tuple(
            fc.constant(graph),
            // Pick a random start node from the graph's members
            fc.integer({ min: 0, max: graph.members.length - 1 }),
            // Pick a random depth 1-10
            fc.integer({ min: 1, max: 10 })
          )
        ),
        async ([graph, startIdx, depth]) => {
          const { members, relations } = graph;
          const startId = members[startIdx].id;

          // Set up mocks for this graph
          setupMocks(members, relations);

          // Run the actual traverseTree function
          const result = await traverseTree(startId, depth);

          // Compute expected reachable set via oracle BFS
          const expectedIds = oracleBFS(members, relations, startId, depth);

          // Extract returned member IDs
          const returnedIds = new Set(result.members.map((m) => m.id));

          // The returned set should exactly match the oracle
          expect(returnedIds).toEqual(expectedIds);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Feature: enhanced-family-tree, Property 3: Traversal output invariants
describe("Property 3: Traversal output invariants", () => {
  // **Validates: Requirements 1.6, 1.7**

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("traversal result has no duplicate member IDs, both arrays present, and all relations reference valid member IDs", async () => {
    await fc.assert(
      fc.asyncProperty(
        familyGraphArb.chain((graph) =>
          fc.tuple(
            fc.constant(graph),
            fc.integer({ min: 0, max: graph.members.length - 1 }),
            fc.integer({ min: 1, max: 10 })
          )
        ),
        async ([graph, startIdx, depth]) => {
          const { members, relations } = graph;
          const startId = members[startIdx].id;

          setupMocks(members, relations);

          const result = await traverseTree(startId, depth);

          // Verify both members and relations arrays are present
          expect(result).toHaveProperty("members");
          expect(result).toHaveProperty("relations");
          expect(Array.isArray(result.members)).toBe(true);
          expect(Array.isArray(result.relations)).toBe(true);

          // Verify no duplicate member IDs
          const memberIds = result.members.map((m) => m.id);
          const uniqueMemberIds = new Set(memberIds);
          expect(memberIds.length).toBe(uniqueMemberIds.size);

          // Verify every relation references only member IDs present in the members array
          for (const rel of result.relations) {
            expect(uniqueMemberIds.has(rel.fromId)).toBe(true);
            expect(uniqueMemberIds.has(rel.toId)).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Feature: enhanced-family-tree, Property 6: Shortest path correctness
describe("Property 6: Shortest path correctness", () => {
  // **Validates: Requirements 5.2**

  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Oracle BFS distance: returns the shortest hop count between two members,
   * or -1 if they are not connected. Treats all relations as bidirectional.
   */
  function oracleBFSDistance(members, relations, fromId, toId) {
    if (fromId === toId) return 0;

    const visited = new Set([fromId]);
    let frontier = [fromId];
    let distance = 0;

    while (frontier.length > 0) {
      distance++;
      const nextFrontier = [];
      for (const currentId of frontier) {
        for (const rel of relations) {
          let neighborId = null;
          if (rel.fromId === currentId) {
            neighborId = rel.toId;
          } else if (rel.toId === currentId) {
            neighborId = rel.fromId;
          }
          if (neighborId && !visited.has(neighborId)) {
            if (neighborId === toId) return distance;
            visited.add(neighborId);
            nextFrontier.push(neighborId);
          }
        }
      }
      frontier = nextFrontier;
    }

    return -1; // not connected
  }

  /**
   * Checks that each consecutive pair in the path is connected by a relation.
   */
  function isValidPath(path, relations) {
    for (let i = 0; i < path.length - 1; i++) {
      const currentId = path[i].memberId;
      const nextId = path[i + 1].memberId;
      const connected = relations.some(
        (r) =>
          (r.fromId === currentId && r.toId === nextId) ||
          (r.toId === currentId && r.fromId === nextId)
      );
      if (!connected) return false;
    }
    return true;
  }

  it("returned path is valid and shortest for any two connected members", async () => {
    await fc.assert(
      fc.asyncProperty(
        familyGraphArb.chain((graph) => {
          // Pick two distinct member indices
          const maxIdx = graph.members.length - 1;
          return fc.tuple(
            fc.constant(graph),
            fc.integer({ min: 0, max: maxIdx }),
            fc.integer({ min: 0, max: maxIdx })
          );
        }),
        async ([graph, fromIdx, toIdx]) => {
          const { members, relations } = graph;
          const fromId = members[fromIdx].id;
          const toId = members[toIdx].id;

          // Compute oracle distance to check connectivity
          const oracleDistance = oracleBFSDistance(members, relations, fromId, toId);

          // Only test connected pairs (skip disconnected ones)
          fc.pre(oracleDistance >= 0);

          setupMocks(members, relations);

          const path = await findShortestPath(fromId, toId);

          // Path should not be empty for connected members
          expect(path.length).toBeGreaterThan(0);

          // Path should start with fromId and end with toId
          expect(path[0].memberId).toBe(fromId);
          expect(path[path.length - 1].memberId).toBe(toId);

          // Last member should have relationType: null
          expect(path[path.length - 1].relationType).toBeNull();

          // Non-last members should have a non-null relationType
          for (let i = 0; i < path.length - 1; i++) {
            expect(path[i].relationType).not.toBeNull();
          }

          // Path should be valid: each consecutive pair connected by a relation
          expect(isValidPath(path, relations)).toBe(true);

          // Path should be shortest: hops = path.length - 1 should equal oracle distance
          expect(path.length - 1).toBe(oracleDistance);
        }
      ),
      { numRuns: 100 }
    );
  });
});
