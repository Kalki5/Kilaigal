import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

// Mock db module
vi.mock("../../db.js", () => ({
  db: {
    query: vi.fn(),
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    updatePosition: vi.fn(),
    queryIndex: vi.fn(),
  },
}));

// Mock graphTraversal
vi.mock("../../services/graphTraversal.js", () => ({
  traverseTree: vi.fn(),
  findShortestPath: vi.fn(),
}));

// Mock aiRelationship
vi.mock("../../services/aiRelationship.js", () => ({
  describeRelationship: vi.fn(),
}));

// Mock batchLoader (used indirectly)
vi.mock("../../services/batchLoader.js", () => ({
  batchGetMembers: vi.fn(),
}));

// Mock relationQueries (used by duplicate check in POST /api/relations)
vi.mock("../../services/relationQueries.js", () => ({
  getRelationsFrom: vi.fn(),
  getRelationsTo: vi.fn(),
  getAllRelationsForMember: vi.fn(),
}));

// Mock duplicateCheck
vi.mock("../../utils/duplicateCheck.js", () => ({
  isDuplicate: vi.fn(),
}));

// Mock multer to avoid file system side effects
vi.mock("multer", () => {
  const multerInstance = {
    single: () => (req, res, next) => next(),
  };
  const multerFn = () => multerInstance;
  multerFn.diskStorage = () => ({});
  return { default: multerFn };
});

import app from "../../index.js";
import { db } from "../../db.js";
import { traverseTree } from "../../services/graphTraversal.js";
import { describeRelationship } from "../../services/aiRelationship.js";
import { getRelationsFrom } from "../../services/relationQueries.js";
import { isDuplicate } from "../../utils/duplicateCheck.js";

describe("API endpoint unit tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---------------------------------------------------------------
  // GET /api/members/:id/tree — Depth-based tree traversal
  // _Requirements: 1.3, 1.4, 1.8_
  // ---------------------------------------------------------------
  describe("GET /api/members/:id/tree", () => {
    const memberId = "abc-123";
    const mockTreeResult = {
      members: [{ id: memberId, name: "Alice" }],
      relations: [],
    };

    it("defaults depth to 2 when depth query param is missing", async () => {
      db.get.mockResolvedValue({ Item: { id: memberId, name: "Alice" } });
      traverseTree.mockResolvedValue(mockTreeResult);

      const res = await request(app).get(`/api/members/${memberId}/tree`);

      expect(res.status).toBe(200);
      expect(traverseTree).toHaveBeenCalledWith(memberId, 2);
    });

    it("uses the provided depth when valid", async () => {
      db.get.mockResolvedValue({ Item: { id: memberId, name: "Alice" } });
      traverseTree.mockResolvedValue(mockTreeResult);

      const res = await request(app)
        .get(`/api/members/${memberId}/tree`)
        .query({ depth: "5" });

      expect(res.status).toBe(200);
      expect(traverseTree).toHaveBeenCalledWith(memberId, 5);
    });

    it("returns 404 for non-existent member ID", async () => {
      db.get.mockResolvedValue({ Item: undefined });

      const res = await request(app).get(`/api/members/${memberId}/tree`);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Member not found");
      expect(traverseTree).not.toHaveBeenCalled();
    });

    it("returns 400 for depth less than 1", async () => {
      const res = await request(app)
        .get(`/api/members/${memberId}/tree`)
        .query({ depth: "0" });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Depth must be an integer between 1 and 10/);
      expect(traverseTree).not.toHaveBeenCalled();
    });

    it("returns 400 for depth greater than 10", async () => {
      const res = await request(app)
        .get(`/api/members/${memberId}/tree`)
        .query({ depth: "11" });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Depth must be an integer between 1 and 10/);
    });

    it("returns 400 for non-integer depth", async () => {
      const res = await request(app)
        .get(`/api/members/${memberId}/tree`)
        .query({ depth: "abc" });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Depth must be an integer between 1 and 10/);
    });

    it("returns 400 for negative depth", async () => {
      const res = await request(app)
        .get(`/api/members/${memberId}/tree`)
        .query({ depth: "-5" });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Depth must be an integer between 1 and 10/);
    });
  });

  // ---------------------------------------------------------------
  // GET /api/members/search — Member search
  // _Requirements: 4.3_
  // ---------------------------------------------------------------
  describe("GET /api/members/search", () => {
    it("returns 400 when query is missing", async () => {
      const res = await request(app).get("/api/members/search");

      expect(res.status).toBe(400);
      expect(res.body.error).toBe(
        "Search query must be at least 2 characters"
      );
    });

    it("returns 400 when query is a single character", async () => {
      const res = await request(app)
        .get("/api/members/search")
        .query({ q: "A" });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe(
        "Search query must be at least 2 characters"
      );
    });

    it("returns 400 when query is empty string", async () => {
      const res = await request(app)
        .get("/api/members/search")
        .query({ q: "" });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe(
        "Search query must be at least 2 characters"
      );
    });

    it("returns matching members for a valid query", async () => {
      db.query.mockResolvedValue({
        Items: [
          { id: "1", name: "Alice Smith", gender: "Female", photoUrl: "/photo1.jpg" },
          { id: "2", name: "Bob Jones", gender: "Male", photoUrl: "/photo2.jpg" },
          { id: "3", name: "Alicia Keys", gender: "Female", photoUrl: "/photo3.jpg" },
        ],
      });

      const res = await request(app)
        .get("/api/members/search")
        .query({ q: "Ali" });

      expect(res.status).toBe(200);
      // searchMembers is NOT mocked — it runs the real filter logic
      expect(res.body).toHaveLength(2);
      expect(res.body[0].name).toBe("Alice Smith");
      expect(res.body[1].name).toBe("Alicia Keys");
      // Verify only the expected fields are returned
      expect(res.body[0]).toEqual({
        id: "1",
        name: "Alice Smith",
        gender: "Female",
        photoUrl: "/photo1.jpg",
      });
    });
  });

  // ---------------------------------------------------------------
  // POST /api/ai/relationship — AI relationship endpoint
  // _Requirements: 8.3_
  // ---------------------------------------------------------------
  describe("POST /api/ai/relationship", () => {
    const originalApiKey = process.env.GOOGLE_AI_API_KEY;

    beforeEach(() => {
      process.env.GOOGLE_AI_API_KEY = "test-key";
    });

    afterEach(() => {
      if (originalApiKey !== undefined) {
        process.env.GOOGLE_AI_API_KEY = originalApiKey;
      } else {
        delete process.env.GOOGLE_AI_API_KEY;
      }
    });

    it("returns 401 when x-user-phone header is missing", async () => {
      const res = await request(app)
        .post("/api/ai/relationship")
        .send({ fromMemberId: "a", toMemberId: "b" });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe("Login required");
    });

    it("returns 400 when fromMemberId is missing", async () => {
      const res = await request(app)
        .post("/api/ai/relationship")
        .set("x-user-phone", "+1234567890")
        .send({ toMemberId: "b" });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe(
        "Both fromMemberId and toMemberId are required"
      );
    });

    it("returns 400 when toMemberId is missing", async () => {
      const res = await request(app)
        .post("/api/ai/relationship")
        .set("x-user-phone", "+1234567890")
        .send({ fromMemberId: "a" });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe(
        "Both fromMemberId and toMemberId are required"
      );
    });

    it("returns 400 when both IDs are missing", async () => {
      const res = await request(app)
        .post("/api/ai/relationship")
        .set("x-user-phone", "+1234567890")
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe(
        "Both fromMemberId and toMemberId are required"
      );
    });

    it("returns AI result when both IDs are provided", async () => {
      const mockResult = {
        path: [
          { memberId: "a", memberName: "Alice", relationType: "Parent" },
          { memberId: "b", memberName: "Bob", relationType: null },
        ],
        description: "Alice is Bob's parent.",
      };
      describeRelationship.mockResolvedValue(mockResult);

      const res = await request(app)
        .post("/api/ai/relationship")
        .set("x-user-phone", "+1234567890")
        .send({ fromMemberId: "a", toMemberId: "b" });

      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockResult);
      expect(describeRelationship).toHaveBeenCalledWith("a", "b");
    });

    it("returns 500 when GOOGLE_AI_API_KEY is not set", async () => {
      delete process.env.GOOGLE_AI_API_KEY;

      const res = await request(app)
        .post("/api/ai/relationship")
        .set("x-user-phone", "+1234567890")
        .send({ fromMemberId: "a", toMemberId: "b" });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("AI service not configured");
    });
  });

  // ---------------------------------------------------------------
  // Backward compatibility: GET /api/members and GET /api/relations
  // _Requirements: 8.3, 8.4_
  // ---------------------------------------------------------------
  describe("GET /api/members (backward compatibility)", () => {
    it("returns all members from the database", async () => {
      const mockMembers = [
        { id: "1", name: "Alice", PK: "MEMBERS", SK: "MEMBER#1" },
        { id: "2", name: "Bob", PK: "MEMBERS", SK: "MEMBER#2" },
      ];
      db.query.mockResolvedValue({ Items: mockMembers });

      const res = await request(app).get("/api/members");

      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockMembers);
      expect(db.query).toHaveBeenCalledWith("MEMBERS", "MEMBER#");
    });

    it("returns empty array when no members exist", async () => {
      db.query.mockResolvedValue({ Items: [] });

      const res = await request(app).get("/api/members");

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it("returns empty array when Items is undefined", async () => {
      db.query.mockResolvedValue({});

      const res = await request(app).get("/api/members");

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  describe("GET /api/relations (backward compatibility)", () => {
    it("returns all relations from the database", async () => {
      const mockRelations = [
        {
          id: "r1",
          PK: "RELATIONS",
          SK: "REL#r1",
          fromId: "1",
          toId: "2",
          type: "Parent",
        },
        {
          id: "r2",
          PK: "RELATIONS",
          SK: "REL#r2",
          fromId: "2",
          toId: "3",
          type: "Spouse",
        },
      ];
      db.query.mockResolvedValue({ Items: mockRelations });

      const res = await request(app).get("/api/relations");

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(db.query).toHaveBeenCalledWith("RELATIONS", "REL#");
    });

    it("returns empty array when no relations exist", async () => {
      db.query.mockResolvedValue({ Items: [] });

      const res = await request(app).get("/api/relations");

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it("populates id from SK when id field is missing on relation items", async () => {
      const mockRelations = [
        {
          PK: "RELATIONS",
          SK: "REL#generated-id",
          fromId: "1",
          toId: "2",
          type: "Parent",
        },
      ];
      db.query.mockResolvedValue({ Items: mockRelations });

      const res = await request(app).get("/api/relations");

      expect(res.status).toBe(200);
      expect(res.body[0].id).toBe("generated-id");
    });
  });
});
