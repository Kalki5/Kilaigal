import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";

// Mock the SurrealDB-backed store + services (HTTP behavior is under test, not the DB).
vi.mock("../../store/members.js", () => ({
  listMembers: vi.fn(),
  getMember: vi.fn(),
  createMember: vi.fn(),
  updateMember: vi.fn(),
  updatePosition: vi.fn(),
}));

vi.mock("../../store/relations.js", () => ({
  listRelations: vi.fn(),
  createRelation: vi.fn(),
  deleteRelation: vi.fn(),
  relationExists: vi.fn(),
}));

vi.mock("../../store/components.js", () => ({
  linkComponents: vi.fn().mockResolvedValue("comp_x"),
  componentInfo: vi.fn(),
}));

vi.mock("../../services/traversal.js", () => ({
  traverseTree: vi.fn(),
  findShortestPath: vi.fn(),
}));

vi.mock("../../services/aiRelationship.js", () => ({
  describeRelationship: vi.fn(),
}));

// Avoid file-system side effects from multer.
vi.mock("multer", () => {
  const multerInstance = { single: () => (req, res, next) => next() };
  const multerFn = () => multerInstance;
  multerFn.diskStorage = () => ({});
  return { default: multerFn };
});

import app from "../../index.js";
import { listMembers, getMember } from "../../store/members.js";
import { listRelations } from "../../store/relations.js";
import { componentInfo } from "../../store/components.js";
import { traverseTree } from "../../services/traversal.js";
import { describeRelationship } from "../../services/aiRelationship.js";

describe("API endpoint unit tests", () => {
  beforeEach(() => vi.clearAllMocks());

  describe("GET /api/members/:id/tree", () => {
    const memberId = "abc-123";
    const mockTreeResult = { members: [{ id: memberId, name: "Alice" }], relations: [] };

    it("defaults depth to 2 when depth query param is missing", async () => {
      getMember.mockResolvedValue({ id: memberId, name: "Alice" });
      traverseTree.mockResolvedValue(mockTreeResult);

      const res = await request(app).get(`/api/members/${memberId}/tree`);

      expect(res.status).toBe(200);
      expect(traverseTree).toHaveBeenCalledWith(memberId, 2);
    });

    it("uses the provided depth when valid", async () => {
      getMember.mockResolvedValue({ id: memberId, name: "Alice" });
      traverseTree.mockResolvedValue(mockTreeResult);

      const res = await request(app).get(`/api/members/${memberId}/tree`).query({ depth: "5" });

      expect(res.status).toBe(200);
      expect(traverseTree).toHaveBeenCalledWith(memberId, 5);
    });

    it("returns 404 for non-existent member ID", async () => {
      getMember.mockResolvedValue(null);

      const res = await request(app).get(`/api/members/${memberId}/tree`);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Member not found");
      expect(traverseTree).not.toHaveBeenCalled();
    });

    it.each([
      ["0", "less than 1"],
      ["11", "greater than 10"],
      ["abc", "non-integer"],
      ["-5", "negative"],
    ])("returns 400 for depth %s (%s)", async (depth) => {
      const res = await request(app).get(`/api/members/${memberId}/tree`).query({ depth });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Depth must be an integer between 1 and 10/);
      expect(traverseTree).not.toHaveBeenCalled();
    });
  });

  describe("GET /api/members/:id/component", () => {
    it("returns component info", async () => {
      getMember.mockResolvedValue({ id: "m1", name: "Alice" });
      componentInfo.mockResolvedValue({ componentId: "comp_m1", size: 42 });

      const res = await request(app).get("/api/members/m1/component");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ componentId: "comp_m1", size: 42 });
    });

    it("returns 404 when the member does not exist", async () => {
      getMember.mockResolvedValue(null);
      const res = await request(app).get("/api/members/nope/component");
      expect(res.status).toBe(404);
    });
  });

  describe("GET /api/members/search", () => {
    it.each([
      ["missing", undefined],
      ["single char", "A"],
      ["empty", ""],
    ])("returns 400 when query is %s", async (_label, q) => {
      const req = request(app).get("/api/members/search");
      const res = await (q === undefined ? req : req.query({ q }));
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Search query must be at least 2 characters");
    });

    it("returns matching members for a valid query (real filter)", async () => {
      listMembers.mockResolvedValue([
        { id: "1", name: "Alice Smith", gender: "Female", photoUrl: "/photo1.jpg" },
        { id: "2", name: "Bob Jones", gender: "Male", photoUrl: "/photo2.jpg" },
        { id: "3", name: "Alicia Keys", gender: "Female", photoUrl: "/photo3.jpg" },
      ]);

      const res = await request(app).get("/api/members/search").query({ q: "Ali" });

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0].name).toBe("Alice Smith");
      expect(res.body[1].name).toBe("Alicia Keys");
      expect(res.body[0]).toEqual({ id: "1", name: "Alice Smith", gender: "Female", photoUrl: "/photo1.jpg" });
    });
  });

  describe("POST /api/ai/relationship", () => {
    it("returns 401 when x-user-phone header is missing", async () => {
      const res = await request(app).post("/api/ai/relationship").send({ fromMemberId: "a", toMemberId: "b" });
      expect(res.status).toBe(401);
      expect(res.body.error).toBe("Login required");
    });

    it.each([
      ["fromMemberId missing", { toMemberId: "b" }],
      ["toMemberId missing", { fromMemberId: "a" }],
      ["both missing", {}],
    ])("returns 400 when %s", async (_label, body) => {
      const res = await request(app).post("/api/ai/relationship").set("x-user-phone", "+1234567890").send(body);
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Both fromMemberId and toMemberId are required");
    });

    it("returns the resolved relationship (works without an AI key)", async () => {
      const mockResult = {
        path: [
          { memberId: "a", memberName: "Alice", relationType: "Parent" },
          { memberId: "b", memberName: "Bob", relationType: null },
        ],
        slot: "FATHER",
        term: { script: "அப்பா", romanized: "Appa" },
        description: "Bob is Alice's Appa (அப்பா).",
      };
      describeRelationship.mockResolvedValue(mockResult);

      const res = await request(app)
        .post("/api/ai/relationship")
        .set("x-user-phone", "+1234567890")
        .send({ fromMemberId: "a", toMemberId: "b", packId: "spoken-tamil" });

      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockResult);
      expect(describeRelationship).toHaveBeenCalledWith("a", "b", "spoken-tamil");
    });
  });

  describe("GET /api/members (backward compatibility)", () => {
    it("returns all members from the store", async () => {
      const mockMembers = [
        { id: "1", name: "Alice" },
        { id: "2", name: "Bob" },
      ];
      listMembers.mockResolvedValue(mockMembers);

      const res = await request(app).get("/api/members");

      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockMembers);
    });

    it("returns empty array when no members exist", async () => {
      listMembers.mockResolvedValue([]);
      const res = await request(app).get("/api/members");
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  describe("GET /api/relations (backward compatibility)", () => {
    it("returns all relations in the external shape", async () => {
      const mockRelations = [
        { id: "parent_of:r1", fromId: "1", toId: "2", type: "Parent" },
        { id: "married_to:r2", fromId: "2", toId: "3", type: "Spouse" },
      ];
      listRelations.mockResolvedValue(mockRelations);

      const res = await request(app).get("/api/relations");

      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockRelations);
    });

    it("returns empty array when no relations exist", async () => {
      listRelations.mockResolvedValue([]);
      const res = await request(app).get("/api/relations");
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });
});
