import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Use vi.hoisted so mockSend is available inside the hoisted vi.mock factories
const { mockSend } = vi.hoisted(() => {
  return { mockSend: vi.fn() };
});

vi.mock("@aws-sdk/lib-dynamodb", () => {
  class BatchGetCommand {
    constructor(params) {
      this.input = params;
    }
  }
  const DynamoDBDocumentClient = {
    from: vi.fn(() => ({
      send: mockSend,
    })),
  };
  return { BatchGetCommand, DynamoDBDocumentClient };
});

vi.mock("@aws-sdk/client-dynamodb", () => {
  class DynamoDBClient {
    constructor() {}
  }
  return { DynamoDBClient };
});

import { batchGetMembers, chunkArray } from "../../services/batchLoader.js";

describe("batchLoader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("chunkArray", () => {
    it("returns empty array for empty input", () => {
      expect(chunkArray([], 100)).toEqual([]);
    });

    it("returns a single chunk for exactly 100 items", () => {
      const items = Array.from({ length: 100 }, (_, i) => `item-${i}`);
      const chunks = chunkArray(items, 100);
      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toHaveLength(100);
    });

    it("returns two chunks for 101 items (100 + 1)", () => {
      const items = Array.from({ length: 101 }, (_, i) => `item-${i}`);
      const chunks = chunkArray(items, 100);
      expect(chunks).toHaveLength(2);
      expect(chunks[0]).toHaveLength(100);
      expect(chunks[1]).toHaveLength(1);
    });
  });

  describe("batchGetMembers", () => {
    // _Requirements: 3.1, 3.2, 3.3, 3.4_

    it("returns empty array for empty input", async () => {
      const result = await batchGetMembers([]);
      expect(result).toEqual([]);
      expect(mockSend).not.toHaveBeenCalled();
    });

    it("returns empty array for null input", async () => {
      const result = await batchGetMembers(null);
      expect(result).toEqual([]);
      expect(mockSend).not.toHaveBeenCalled();
    });

    it("sends a single BatchGetCommand for exactly 100 IDs", async () => {
      const ids = Array.from({ length: 100 }, (_, i) => `id-${i}`);
      const mockMembers = ids.map((id) => ({
        PK: "MEMBERS",
        SK: `MEMBER#${id}`,
        id,
        name: `Member ${id}`,
      }));

      mockSend.mockResolvedValueOnce({
        Responses: { FamilyTreeTable: mockMembers },
        UnprocessedKeys: {},
      });

      const result = await batchGetMembers(ids);

      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(result).toHaveLength(100);
      expect(result).toEqual(mockMembers);
    });

    it("sends two BatchGetCommands for 101 IDs (100 + 1)", async () => {
      const ids = Array.from({ length: 101 }, (_, i) => `id-${i}`);

      const firstBatchMembers = ids.slice(0, 100).map((id) => ({
        PK: "MEMBERS",
        SK: `MEMBER#${id}`,
        id,
        name: `Member ${id}`,
      }));
      const secondBatchMembers = ids.slice(100).map((id) => ({
        PK: "MEMBERS",
        SK: `MEMBER#${id}`,
        id,
        name: `Member ${id}`,
      }));

      mockSend
        .mockResolvedValueOnce({
          Responses: { FamilyTreeTable: firstBatchMembers },
          UnprocessedKeys: {},
        })
        .mockResolvedValueOnce({
          Responses: { FamilyTreeTable: secondBatchMembers },
          UnprocessedKeys: {},
        });

      const result = await batchGetMembers(ids);

      expect(mockSend).toHaveBeenCalledTimes(2);
      expect(result).toHaveLength(101);
    });

    it("retries UnprocessedKeys with exponential backoff", async () => {
      const ids = ["id-1", "id-2", "id-3"];

      const member1 = { PK: "MEMBERS", SK: "MEMBER#id-1", id: "id-1", name: "Member 1" };
      const member2 = { PK: "MEMBERS", SK: "MEMBER#id-2", id: "id-2", name: "Member 2" };
      const member3 = { PK: "MEMBERS", SK: "MEMBER#id-3", id: "id-3", name: "Member 3" };

      // First call: returns member1, leaves id-2 and id-3 unprocessed
      mockSend.mockImplementationOnce(() =>
        Promise.resolve({
          Responses: { FamilyTreeTable: [member1] },
          UnprocessedKeys: {
            FamilyTreeTable: {
              Keys: [
                { PK: "MEMBERS", SK: "MEMBER#id-2" },
                { PK: "MEMBERS", SK: "MEMBER#id-3" },
              ],
            },
          },
        })
      );

      // First retry (after 100ms): returns member2, leaves id-3 unprocessed
      mockSend.mockImplementationOnce(() =>
        Promise.resolve({
          Responses: { FamilyTreeTable: [member2] },
          UnprocessedKeys: {
            FamilyTreeTable: {
              Keys: [{ PK: "MEMBERS", SK: "MEMBER#id-3" }],
            },
          },
        })
      );

      // Second retry (after 200ms): returns member3, no unprocessed
      mockSend.mockImplementationOnce(() =>
        Promise.resolve({
          Responses: { FamilyTreeTable: [member3] },
          UnprocessedKeys: {},
        })
      );

      const resultPromise = batchGetMembers(ids);

      // Advance through the exponential backoff delays
      // First retry delay: 100ms
      await vi.advanceTimersByTimeAsync(100);
      // Second retry delay: 200ms
      await vi.advanceTimersByTimeAsync(200);

      const result = await resultPromise;

      expect(mockSend).toHaveBeenCalledTimes(3);
      expect(result).toHaveLength(3);
      expect(result).toEqual(expect.arrayContaining([member1, member2, member3]));
    });

    it("returns partial results and logs warning when retries are exhausted", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const ids = ["id-1", "id-2"];

      const member1 = { PK: "MEMBERS", SK: "MEMBER#id-1", id: "id-1", name: "Member 1" };

      const unprocessedKeys = {
        FamilyTreeTable: {
          Keys: [{ PK: "MEMBERS", SK: "MEMBER#id-2" }],
        },
      };

      // Initial call: returns member1, id-2 unprocessed
      mockSend.mockImplementationOnce(() =>
        Promise.resolve({
          Responses: { FamilyTreeTable: [member1] },
          UnprocessedKeys: unprocessedKeys,
        })
      );

      // All 3 retries still return id-2 as unprocessed
      for (let i = 0; i < 3; i++) {
        mockSend.mockImplementationOnce(() =>
          Promise.resolve({
            Responses: { FamilyTreeTable: [] },
            UnprocessedKeys: unprocessedKeys,
          })
        );
      }

      const resultPromise = batchGetMembers(ids);

      // Advance through all backoff delays: 100ms, 200ms, 400ms
      await vi.advanceTimersByTimeAsync(100);
      await vi.advanceTimersByTimeAsync(200);
      await vi.advanceTimersByTimeAsync(400);

      const result = await resultPromise;

      // Should return partial results (only member1)
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(member1);

      // Should have logged a warning about unprocessed IDs
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("could not be loaded after"),
        expect.arrayContaining(["id-2"])
      );

      warnSpy.mockRestore();
    });

    it("deduplicates input member IDs", async () => {
      const ids = ["id-1", "id-1", "id-2", "id-2", "id-2"];

      const members = [
        { PK: "MEMBERS", SK: "MEMBER#id-1", id: "id-1", name: "Member 1" },
        { PK: "MEMBERS", SK: "MEMBER#id-2", id: "id-2", name: "Member 2" },
      ];

      mockSend.mockResolvedValueOnce({
        Responses: { FamilyTreeTable: members },
        UnprocessedKeys: {},
      });

      const result = await batchGetMembers(ids);

      // Should only send 2 unique keys, not 5
      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(result).toHaveLength(2);
    });

    it("handles DynamoDB send error gracefully and continues with next chunk", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      // Create 101 IDs to force two chunks
      const ids = Array.from({ length: 101 }, (_, i) => `id-${i}`);

      // First chunk fails
      mockSend.mockRejectedValueOnce(new Error("DynamoDB connection error"));

      // Second chunk succeeds
      const secondChunkMember = {
        PK: "MEMBERS",
        SK: "MEMBER#id-100",
        id: "id-100",
        name: "Member 100",
      };
      mockSend.mockResolvedValueOnce({
        Responses: { FamilyTreeTable: [secondChunkMember] },
        UnprocessedKeys: {},
      });

      const result = await batchGetMembers(ids);

      expect(mockSend).toHaveBeenCalledTimes(2);
      // Only results from the second chunk
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(secondChunkMember);

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("BatchGetCommand failed"),
        expect.any(String)
      );

      errorSpy.mockRestore();
    });
  });
});
