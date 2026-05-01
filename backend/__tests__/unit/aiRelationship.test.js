import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock graphTraversal before importing the module under test
vi.mock("../../services/graphTraversal.js", () => ({
  findShortestPath: vi.fn(),
}));

// Mock @google/genai before importing the module under test
const mockGenerateContent = vi.fn();
vi.mock("@google/genai", () => {
  return {
    GoogleGenAI: vi.fn().mockImplementation(function () {
      this.models = {
        generateContent: mockGenerateContent,
      };
    }),
  };
});

import { describeRelationship } from "../../services/aiRelationship.js";
import { findShortestPath } from "../../services/graphTraversal.js";
import { GoogleGenAI } from "@google/genai";

describe("AI Relationship Service unit tests", () => {
  // _Requirements: 5.6, 5.7, 5.9_

  const originalEnv = process.env.GOOGLE_AI_API_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GOOGLE_AI_API_KEY = "test-api-key-123";
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.GOOGLE_AI_API_KEY = originalEnv;
    } else {
      delete process.env.GOOGLE_AI_API_KEY;
    }
  });

  describe("returns 'no path' response when members are disconnected", () => {
    // Validates: Requirement 5.6

    it("returns empty path and descriptive message when no path exists", async () => {
      findShortestPath.mockResolvedValue([]);

      const result = await describeRelationship("member-a", "member-b");

      expect(result).toEqual({
        path: [],
        description:
          "No known relationship path found between these two members.",
      });
    });

    it("does not call Google AI SDK when no path exists", async () => {
      findShortestPath.mockResolvedValue([]);

      await describeRelationship("member-a", "member-b");

      expect(GoogleGenAI).not.toHaveBeenCalled();
      expect(mockGenerateContent).not.toHaveBeenCalled();
    });
  });

  describe("returns path with AI description when path exists", () => {
    // Validates: Requirement 5.5, 5.3, 5.4

    const mockPath = [
      { memberId: "id-1", memberName: "Alice", relationType: "Parent" },
      { memberId: "id-2", memberName: "Bob", relationType: "Spouse" },
      { memberId: "id-3", memberName: "Carol", relationType: null },
    ];

    it("returns path and AI-generated description on success", async () => {
      findShortestPath.mockResolvedValue(mockPath);
      mockGenerateContent.mockResolvedValue({
        text: "Alice is Bob's mother, and Carol is Bob's wife.",
      });

      const result = await describeRelationship("id-1", "id-3");

      expect(result.path).toEqual(mockPath);
      expect(result.description).toBe(
        "Alice is Bob's mother, and Carol is Bob's wife."
      );
      expect(result.error).toBeUndefined();
    });

    it("calls GoogleGenAI with the API key from environment", async () => {
      findShortestPath.mockResolvedValue(mockPath);
      mockGenerateContent.mockResolvedValue({
        text: "Some description",
      });

      await describeRelationship("id-1", "id-3");

      expect(GoogleGenAI).toHaveBeenCalledWith({
        apiKey: "test-api-key-123",
      });
    });

    it("calls generateContent with the correct model", async () => {
      findShortestPath.mockResolvedValue(mockPath);
      mockGenerateContent.mockResolvedValue({
        text: "Some description",
      });

      await describeRelationship("id-1", "id-3");

      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "gemma-4-26b-a4b-it",
        })
      );
    });

    it("includes member names and relation types in the prompt", async () => {
      findShortestPath.mockResolvedValue(mockPath);
      mockGenerateContent.mockResolvedValue({
        text: "Some description",
      });

      await describeRelationship("id-1", "id-3");

      const callArgs = mockGenerateContent.mock.calls[0][0];
      expect(callArgs.contents).toContain("Alice");
      expect(callArgs.contents).toContain("Bob");
      expect(callArgs.contents).toContain("Carol");
      expect(callArgs.contents).toContain("Parent");
      expect(callArgs.contents).toContain("Spouse");
    });
  });

  describe("returns path with null description on AI API failure", () => {
    // Validates: Requirement 5.7

    const mockPath = [
      { memberId: "id-1", memberName: "Alice", relationType: "Parent" },
      { memberId: "id-2", memberName: "Bob", relationType: null },
    ];

    it("returns path with null description and error message on AI failure", async () => {
      findShortestPath.mockResolvedValue(mockPath);
      mockGenerateContent.mockRejectedValue(new Error("API error"));

      const result = await describeRelationship("id-1", "id-2");

      expect(result.path).toEqual(mockPath);
      expect(result.description).toBeNull();
      expect(result.error).toBe("AI service unavailable");
    });

    it("returns error response on network timeout", async () => {
      findShortestPath.mockResolvedValue(mockPath);
      mockGenerateContent.mockRejectedValue(new DOMException("The operation was aborted", "AbortError"));

      const result = await describeRelationship("id-1", "id-2");

      expect(result.path).toEqual(mockPath);
      expect(result.description).toBeNull();
      expect(result.error).toBe("AI service unavailable");
    });
  });

  describe("10-second timeout is configured", () => {
    // Validates: Requirement 5.9

    const mockPath = [
      { memberId: "id-1", memberName: "Alice", relationType: "Parent" },
      { memberId: "id-2", memberName: "Bob", relationType: null },
    ];

    it("passes an AbortSignal in the config to generateContent", async () => {
      findShortestPath.mockResolvedValue(mockPath);
      mockGenerateContent.mockResolvedValue({ text: "description" });

      await describeRelationship("id-1", "id-2");

      const callArgs = mockGenerateContent.mock.calls[0][0];
      expect(callArgs.config).toBeDefined();
      expect(callArgs.config.abortSignal).toBeDefined();
      expect(callArgs.config.abortSignal).toBeInstanceOf(AbortSignal);
    });

    it("configures the timeout with setTimeout and AbortController", async () => {
      const setTimeoutSpy = vi.spyOn(global, "setTimeout");
      findShortestPath.mockResolvedValue(mockPath);
      mockGenerateContent.mockResolvedValue({ text: "description" });

      await describeRelationship("id-1", "id-2");

      // Verify setTimeout was called with 10000ms (10 seconds)
      const timeoutCall = setTimeoutSpy.mock.calls.find(
        (call) => call[1] === 10000
      );
      expect(timeoutCall).toBeDefined();

      setTimeoutSpy.mockRestore();
    });
  });

  describe("handles missing GOOGLE_AI_API_KEY", () => {
    // Validates: Requirement 5.8, 5.7

    const mockPath = [
      { memberId: "id-1", memberName: "Alice", relationType: "Parent" },
      { memberId: "id-2", memberName: "Bob", relationType: null },
    ];

    it("returns error response when GOOGLE_AI_API_KEY is undefined", async () => {
      delete process.env.GOOGLE_AI_API_KEY;
      findShortestPath.mockResolvedValue(mockPath);
      mockGenerateContent.mockRejectedValue(
        new Error("API key not found")
      );

      const result = await describeRelationship("id-1", "id-2");

      expect(result.path).toEqual(mockPath);
      expect(result.description).toBeNull();
      expect(result.error).toBe("AI service unavailable");
    });

    it("returns error response when GOOGLE_AI_API_KEY is empty string", async () => {
      process.env.GOOGLE_AI_API_KEY = "";
      findShortestPath.mockResolvedValue(mockPath);
      mockGenerateContent.mockRejectedValue(
        new Error("Invalid API key")
      );

      const result = await describeRelationship("id-1", "id-2");

      expect(result.path).toEqual(mockPath);
      expect(result.description).toBeNull();
      expect(result.error).toBe("AI service unavailable");
    });

    it("still returns no-path response when API key is missing and members are disconnected", async () => {
      delete process.env.GOOGLE_AI_API_KEY;
      findShortestPath.mockResolvedValue([]);

      const result = await describeRelationship("member-a", "member-b");

      expect(result).toEqual({
        path: [],
        description:
          "No known relationship path found between these two members.",
      });
    });
  });
});
