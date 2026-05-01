import { describe, it, expect, vi, beforeEach } from "vitest";

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
 * Helper: sets up mocks so getRelationsFrom/getRelationsTo return data
 * from the in-memory graph, and batchGetMembers resolves member records.
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

// --- Test data ---

// Simple linear graph: A --Parent--> B --Spouse--> C --Sibling--> D
const membersLinear = [
  { id: "A", name: "Alice" },
  { id: "B", name: "Bob" },
  { id: "C", name: "Carol" },
  { id: "D", name: "Dave" },
];

const relationsLinear = [
  { id: "r1", fromId: "A", toId: "B", type: "Parent" },
  { id: "r2", fromId: "B", toId: "C", type: "Spouse" },
  { id: "r3", fromId: "C", toId: "D", type: "Sibling" },
];

// Diamond graph: A connects to B and C, both B and C connect to D
//   A --Parent--> B
//   A --Child-->  C
//   B --Spouse--> D
//   C --Sibling-> D
const membersDiamond = [
  { id: "A", name: "Alice" },
  { id: "B", name: "Bob" },
  { id: "C", name: "Carol" },
  { id: "D", name: "Dave" },
];

const relationsDiamond = [
  { id: "r1", fromId: "A", toId: "B", type: "Parent" },
  { id: "r2", fromId: "A", toId: "C", type: "Child" },
  { id: "r3", fromId: "B", toId: "D", type: "Spouse" },
  { id: "r4", fromId: "C", toId: "D", type: "Sibling" },
];

// Disconnected graph: A--B and C--D (two separate components)
const membersDisconnected = [
  { id: "A", name: "Alice" },
  { id: "B", name: "Bob" },
  { id: "C", name: "Carol" },
  { id: "D", name: "Dave" },
];

const relationsDisconnected = [
  { id: "r1", fromId: "A", toId: "B", type: "Parent" },
  { id: "r2", fromId: "C", toId: "D", type: "Spouse" },
];

describe("graphTraversal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("traverseTree", () => {
    // _Requirements: 1.1, 1.5, 1.6_

    it("depth=1 returns only direct connections", async () => {
      setupMocks(membersLinear, relationsLinear);

      const result = await traverseTree("A", 1);

      const returnedIds = result.members.map((m) => m.id).sort();
      // A is connected directly to B (via r1: A->B)
      // No other members are 1 hop away from A
      expect(returnedIds).toEqual(["A", "B"]);
      // Should include only the relation connecting A and B
      expect(result.relations).toHaveLength(1);
      expect(result.relations[0].id).toBe("r1");
    });

    it("depth=2 returns connections of connections", async () => {
      setupMocks(membersLinear, relationsLinear);

      const result = await traverseTree("A", 2);

      const returnedIds = result.members.map((m) => m.id).sort();
      // A -> B (hop 1), B -> C (hop 2). D is 3 hops away, not included.
      expect(returnedIds).toEqual(["A", "B", "C"]);
      // Should include relations r1 (A-B) and r2 (B-C)
      const relIds = result.relations.map((r) => r.id).sort();
      expect(relIds).toEqual(["r1", "r2"]);
    });

    it("deduplicates members reachable via multiple paths", async () => {
      setupMocks(membersDiamond, relationsDiamond);

      // From A at depth=2: A->B (hop1), A->C (hop1), B->D (hop2), C->D (hop2)
      // D is reachable via both B and C, but should appear only once
      const result = await traverseTree("A", 2);

      const returnedIds = result.members.map((m) => m.id).sort();
      expect(returnedIds).toEqual(["A", "B", "C", "D"]);

      // No duplicate member IDs
      const idSet = new Set(result.members.map((m) => m.id));
      expect(idSet.size).toBe(result.members.length);
    });

    it("treats all relation types as bidirectional edges", async () => {
      // Start from B: B is the toId of r1 (A->B Parent), so traversing
      // backwards through a Parent relation should still reach A.
      // B is also the fromId of r2 (B->C Spouse).
      setupMocks(membersLinear, relationsLinear);

      const result = await traverseTree("B", 1);

      const returnedIds = result.members.map((m) => m.id).sort();
      // B connects to A (via r1, B is toId) and C (via r2, B is fromId)
      expect(returnedIds).toEqual(["A", "B", "C"]);
    });

    it("treats Sibling relation type as bidirectional", async () => {
      // Start from D: D is the toId of r3 (C->D Sibling)
      // Traversing backwards through a Sibling relation should reach C
      setupMocks(membersLinear, relationsLinear);

      const result = await traverseTree("D", 1);

      const returnedIds = result.members.map((m) => m.id).sort();
      expect(returnedIds).toEqual(["C", "D"]);
    });

    it("treats Child relation type as bidirectional", async () => {
      const members = [
        { id: "X", name: "Xavier" },
        { id: "Y", name: "Yara" },
      ];
      const relations = [
        { id: "r1", fromId: "X", toId: "Y", type: "Child" },
      ];
      setupMocks(members, relations);

      // Start from Y (toId side of a Child relation)
      const result = await traverseTree("Y", 1);

      const returnedIds = result.members.map((m) => m.id).sort();
      expect(returnedIds).toEqual(["X", "Y"]);
    });

    it("deduplicates relations by id", async () => {
      setupMocks(membersDiamond, relationsDiamond);

      const result = await traverseTree("A", 2);

      // All 4 relations should be present, each exactly once
      const relIds = result.relations.map((r) => r.id).sort();
      expect(relIds).toEqual(["r1", "r2", "r3", "r4"]);
      expect(new Set(relIds).size).toBe(relIds.length);
    });

    it("returns only the start member when no relations exist", async () => {
      const members = [{ id: "lonely", name: "Lonely" }];
      setupMocks(members, []);

      const result = await traverseTree("lonely", 3);

      expect(result.members).toHaveLength(1);
      expect(result.members[0].id).toBe("lonely");
      expect(result.relations).toHaveLength(0);
    });

    it("stops early when no new members are discovered", async () => {
      // A--B only, depth=5 should stop after level 1
      const members = [
        { id: "A", name: "Alice" },
        { id: "B", name: "Bob" },
      ];
      const relations = [
        { id: "r1", fromId: "A", toId: "B", type: "Spouse" },
      ];
      setupMocks(members, relations);

      const result = await traverseTree("A", 5);

      const returnedIds = result.members.map((m) => m.id).sort();
      expect(returnedIds).toEqual(["A", "B"]);
    });
  });

  describe("findShortestPath", () => {
    // _Requirements: 5.2_

    it("returns empty array for disconnected members", async () => {
      setupMocks(membersDisconnected, relationsDisconnected);

      const path = await findShortestPath("A", "D");

      expect(path).toEqual([]);
    });

    it("returns correct path for directly connected members", async () => {
      setupMocks(membersLinear, relationsLinear);

      const path = await findShortestPath("A", "B");

      expect(path).toHaveLength(2);
      expect(path[0].memberId).toBe("A");
      expect(path[0].memberName).toBe("Alice");
      expect(path[0].relationType).toBe("Parent");
      expect(path[1].memberId).toBe("B");
      expect(path[1].memberName).toBe("Bob");
      expect(path[1].relationType).toBeNull();
    });

    it("returns correct multi-hop path for connected members", async () => {
      setupMocks(membersLinear, relationsLinear);

      const path = await findShortestPath("A", "C");

      expect(path).toHaveLength(3);
      expect(path[0].memberId).toBe("A");
      expect(path[1].memberId).toBe("B");
      expect(path[2].memberId).toBe("C");
      expect(path[2].relationType).toBeNull();
    });

    it("returns shortest path when multiple paths exist (diamond)", async () => {
      setupMocks(membersDiamond, relationsDiamond);

      // A to D: shortest is 2 hops (A->B->D or A->C->D)
      const path = await findShortestPath("A", "D");

      expect(path).toHaveLength(3);
      expect(path[0].memberId).toBe("A");
      expect(path[2].memberId).toBe("D");
      // Middle member should be either B or C (both are valid shortest paths)
      expect(["B", "C"]).toContain(path[1].memberId);
    });

    it("returns single-member path when from and to are the same", async () => {
      setupMocks(membersLinear, relationsLinear);

      const path = await findShortestPath("A", "A");

      expect(path).toHaveLength(1);
      expect(path[0].memberId).toBe("A");
      expect(path[0].memberName).toBe("Alice");
      expect(path[0].relationType).toBeNull();
    });

    it("traverses bidirectionally (reverse direction)", async () => {
      setupMocks(membersLinear, relationsLinear);

      // B -> A: relation r1 has fromId=A, toId=B, so B must traverse backwards
      const path = await findShortestPath("B", "A");

      expect(path).toHaveLength(2);
      expect(path[0].memberId).toBe("B");
      expect(path[0].memberName).toBe("Bob");
      expect(path[1].memberId).toBe("A");
      expect(path[1].memberName).toBe("Alice");
      expect(path[1].relationType).toBeNull();
    });

    it("returns empty array when member does not exist", async () => {
      setupMocks(membersLinear, relationsLinear);

      const path = await findShortestPath("nonexistent", "A");

      // batchGetMembers returns [] for nonexistent, so path should be empty
      expect(path).toEqual([]);
    });

    it("each path step has memberId, memberName, and relationType fields", async () => {
      setupMocks(membersLinear, relationsLinear);

      const path = await findShortestPath("A", "C");

      for (const step of path) {
        expect(step).toHaveProperty("memberId");
        expect(step).toHaveProperty("memberName");
        expect(step).toHaveProperty("relationType");
      }
    });
  });
});
