import { GoogleGenAI } from "@google/genai";
import { findShortestPath } from "./graphTraversal.js";

/**
 * Find the relationship between two members and describe it in natural language.
 * Uses Graph Traversal Service to find the shortest path, then calls Google AI
 * Studio (Gemma 4) to produce a natural-language description.
 *
 * @param {string} fromMemberId - UUID of person A
 * @param {string} toMemberId - UUID of person B
 * @returns {Promise<{ path: object[], description: string|null, error?: string }>}
 */
export async function describeRelationship(fromMemberId, toMemberId) {
  const path = await findShortestPath(fromMemberId, toMemberId);

  if (path.length === 0) {
    return {
      path: [],
      description: "No known relationship path found between these two members.",
    };
  }

  // Build the path string for the prompt
  // e.g. "Alice --[Parent]--> Bob --[Spouse]--> Carol"
  const pathSegments = path.map((step, index) => {
    if (index < path.length - 1) {
      return `${step.memberName} --[${step.relationType}]-->`;
    }
    return step.memberName;
  });
  const pathString = pathSegments.join(" ");

  const firstPersonName = path[0].memberName;
  const lastPersonName = path[path.length - 1].memberName;

  const promptText = `You are a family relationship expert. Given the following family tree path, describe the relationship between the first and last person in simple, natural language. Include the specific relationship term (e.g., uncle, grandmother, cousin) if applicable.

Path:
${pathString}

Describe how ${firstPersonName} is related to ${lastPersonName}.`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY });
    const response = await ai.models.generateContent({
      model: "gemma-4-26b-a4b-it",
      contents: promptText,
      config: { abortSignal: controller.signal },
    });
    const description = response.text;

    return { path, description };
  } catch {
    return { path, description: null, error: "AI service unavailable" };
  } finally {
    clearTimeout(timeout);
  }
}
