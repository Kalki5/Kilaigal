import { describe, it, expect, vi, beforeEach } from "vitest";
import { getRelationsFrom, getRelationsTo, getAllRelationsForMember } from "../../services/relationQueries.js";

// Mock the db module
vi.mock("../../db.js", () => ({
  db: {
    queryIndex: vi.fn(),
  },
}));

import { db } from "../../db.js";

describe("relationQueries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getRelationsFrom", () => {
    it("queries MemberRelationsIndex with the correct parameters", async () => {
      db.queryIndex.mockResolvedValue({ Items: [] });

      await getRelationsFrom("member-1");

      expect(db.queryIndex).toHaveBeenCalledWith(
        "MemberRelationsIndex",
        "fromId = :fromId",
        { ":fromId": "member-1" }
      );
    });

    it("returns the items from the query result", async () => {
      const mockRelations = [
        { id: "rel-1", fromId: "member-1", toId: "member-2", type: "Parent" },
        { id: "rel-2", fromId: "member-1", toId: "member-3", type: "Spouse" },
      ];
      db.queryIndex.mockResolvedValue({ Items: mockRelations });

      const result = await getRelationsFrom("member-1");

      expect(result).toEqual(mockRelations);
    });

    it("returns empty array when no items found", async () => {
      db.queryIndex.mockResolvedValue({});

      const result = await getRelationsFrom("member-1");

      expect(result).toEqual([]);
    });
  });

  describe("getRelationsTo", () => {
    it("queries TargetRelationsIndex with the correct parameters", async () => {
      db.queryIndex.mockResolvedValue({ Items: [] });

      await getRelationsTo("member-2");

      expect(db.queryIndex).toHaveBeenCalledWith(
        "TargetRelationsIndex",
        "toId = :toId",
        { ":toId": "member-2" }
      );
    });

    it("returns the items from the query result", async () => {
      const mockRelations = [
        { id: "rel-1", fromId: "member-1", toId: "member-2", type: "Parent" },
      ];
      db.queryIndex.mockResolvedValue({ Items: mockRelations });

      const result = await getRelationsTo("member-2");

      expect(result).toEqual(mockRelations);
    });

    it("returns empty array when no items found", async () => {
      db.queryIndex.mockResolvedValue({});

      const result = await getRelationsTo("member-2");

      expect(result).toEqual([]);
    });
  });

  describe("getAllRelationsForMember", () => {
    it("queries both indexes and combines results", async () => {
      const fromRelations = [
        { id: "rel-1", fromId: "member-1", toId: "member-2", type: "Parent" },
      ];
      const toRelations = [
        { id: "rel-2", fromId: "member-3", toId: "member-1", type: "Child" },
      ];

      db.queryIndex
        .mockResolvedValueOnce({ Items: fromRelations })
        .mockResolvedValueOnce({ Items: toRelations });

      const result = await getAllRelationsForMember("member-1");

      expect(result).toHaveLength(2);
      expect(result).toEqual([...fromRelations, ...toRelations]);
    });

    it("deduplicates relations that appear in both directions", async () => {
      const sharedRelation = { id: "rel-1", fromId: "member-1", toId: "member-2", type: "Spouse" };

      db.queryIndex
        .mockResolvedValueOnce({ Items: [sharedRelation] })
        .mockResolvedValueOnce({ Items: [sharedRelation] });

      const result = await getAllRelationsForMember("member-1");

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("rel-1");
    });

    it("returns empty array when member has no relations", async () => {
      db.queryIndex
        .mockResolvedValueOnce({ Items: [] })
        .mockResolvedValueOnce({ Items: [] });

      const result = await getAllRelationsForMember("member-1");

      expect(result).toEqual([]);
    });

    it("handles mixed duplicates and unique relations", async () => {
      const fromRelations = [
        { id: "rel-1", fromId: "member-1", toId: "member-2", type: "Parent" },
        { id: "rel-2", fromId: "member-1", toId: "member-3", type: "Spouse" },
      ];
      const toRelations = [
        { id: "rel-1", fromId: "member-1", toId: "member-2", type: "Parent" }, // duplicate
        { id: "rel-3", fromId: "member-4", toId: "member-1", type: "Child" },
      ];

      db.queryIndex
        .mockResolvedValueOnce({ Items: fromRelations })
        .mockResolvedValueOnce({ Items: toRelations });

      const result = await getAllRelationsForMember("member-1");

      expect(result).toHaveLength(3);
      const ids = result.map((r) => r.id);
      expect(ids).toEqual(["rel-1", "rel-2", "rel-3"]);
    });
  });
});
