import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Shortest path now comes from the traversal service and returns { members, edges }.
vi.mock("../../services/traversal.js", () => ({
  findShortestPath: vi.fn(),
}));

const mockGenerateContent = vi.fn();
vi.mock("@google/genai", () => ({
  GoogleGenAI: vi.fn().mockImplementation(function () {
    this.models = { generateContent: mockGenerateContent };
  }),
}));

import { describeRelationship } from "../../services/aiRelationship.js";
import { findShortestPath } from "../../services/traversal.js";
import { GoogleGenAI } from "@google/genai";

// ego(Alice) -> Bob, where Bob is Alice's father => slot FATHER, term Appa.
const fatherPath = {
  members: [
    { id: "a", name: "Alice", gender: "Female", dob: "1990-01-01" },
    { id: "b", name: "Bob", gender: "Male", dob: "1960-01-01" },
  ],
  edges: [{ id: "parent_of:b-a", fromId: "b", toId: "a", type: "Parent" }],
};

describe("aiRelationship — kinship-first with optional LLM narration", () => {
  const originalEnv = process.env.GOOGLE_AI_API_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GOOGLE_AI_API_KEY = "test-api-key-123";
  });
  afterEach(() => {
    if (originalEnv !== undefined) process.env.GOOGLE_AI_API_KEY = originalEnv;
    else delete process.env.GOOGLE_AI_API_KEY;
  });

  describe("no path", () => {
    it("returns an empty path with a message and does not call the LLM", async () => {
      findShortestPath.mockResolvedValue(null);
      const result = await describeRelationship("x", "y");
      expect(result).toEqual({
        path: [],
        slot: null,
        term: null,
        description: "No known relationship path found between these two members.",
      });
      expect(GoogleGenAI).not.toHaveBeenCalled();
    });
  });

  describe("deterministic resolution", () => {
    it("resolves the kin term regardless of the LLM (uses LLM text when present)", async () => {
      findShortestPath.mockResolvedValue(fatherPath);
      mockGenerateContent.mockResolvedValue({ text: "Bob is Alice's father." });

      const result = await describeRelationship("a", "b");

      expect(result.slot).toBe("FATHER");
      expect(result.term.romanized).toBe("Appa");
      expect(result.description).toBe("Bob is Alice's father.");
      expect(result.path[0]).toEqual({ memberId: "a", memberName: "Alice", relationType: "Parent" });
    });

    it("falls back to a deterministic sentence when the LLM fails", async () => {
      findShortestPath.mockResolvedValue(fatherPath);
      mockGenerateContent.mockRejectedValue(new Error("API error"));

      const result = await describeRelationship("a", "b");

      expect(result.slot).toBe("FATHER");
      expect(result.term.romanized).toBe("Appa");
      // Deterministic fallback still names the correct term.
      expect(result.description).toBe("Bob is Alice's Appa (அப்பா).");
    });

    it("works with no API key set — no LLM call, deterministic description", async () => {
      delete process.env.GOOGLE_AI_API_KEY;
      findShortestPath.mockResolvedValue(fatherPath);

      const result = await describeRelationship("a", "b");

      expect(GoogleGenAI).not.toHaveBeenCalled();
      expect(result.term.romanized).toBe("Appa");
      expect(result.description).toBe("Bob is Alice's Appa (அப்பா).");
    });
  });

  describe("LLM prompt & timeout", () => {
    it("passes the pre-computed term and an AbortSignal to the model", async () => {
      findShortestPath.mockResolvedValue(fatherPath);
      mockGenerateContent.mockResolvedValue({ text: "ok" });

      await describeRelationship("a", "b");

      const callArgs = mockGenerateContent.mock.calls[0][0];
      expect(callArgs.model).toBe("gemma-4-26b-a4b-it");
      expect(callArgs.contents).toContain("Appa");
      expect(callArgs.config.abortSignal).toBeInstanceOf(AbortSignal);
    });
  });
});
