import { GoogleGenAI } from "@google/genai";
import { findShortestPath } from "./traversal.js";
import { pathToSteps } from "./pathToSteps.js";
import { describePath } from "./kinship/index.js";

/**
 * Describe the relationship between two members.
 *
 * The kinship engine is authoritative: shortest path -> steps -> { slot, term }.
 * The LLM is only used to phrase a friendly sentence around the resolved term,
 * and never determines the relationship itself. If the LLM is unavailable we
 * still return a deterministic description built from the term.
 *
 * @param {string} fromMemberId
 * @param {string} toMemberId
 * @param {string} [packId] terminology pack (spoken-tamil default)
 */
export async function describeRelationship(fromMemberId, toMemberId, packId) {
  const path = await findShortestPath(fromMemberId, toMemberId);

  if (!path || path.members.length === 0) {
    return { path: [], slot: null, term: null, description: "No known relationship path found between these two members." };
  }

  const steps = pathToSteps(path.members, path.edges);
  const { slot, term } = describePath(steps, packId);

  // External path shape (kept stable for the frontend).
  const apiPath = path.members.map((m, i) => ({
    memberId: m.id,
    memberName: m.name,
    relationType: i < path.edges.length ? path.edges[i].type : null,
  }));

  const fromName = path.members[0].name;
  const toName = path.members[path.members.length - 1].name;
  const termLabel = term?.script ? `${term.romanized} (${term.script})` : term?.romanized;
  const fallback = termLabel
    ? `${toName} is ${fromName}'s ${termLabel}.`
    : `${toName} is related to ${fromName}.`;

  const description = await narrate({ fromName, toName, termLabel, apiPath }).catch(() => null);
  return { path: apiPath, slot, term, description: description || fallback };
}

async function narrate({ fromName, toName, termLabel, apiPath }) {
  if (!process.env.GOOGLE_AI_API_KEY) return null;

  const pathString = apiPath
    .map((step, i) => (i < apiPath.length - 1 ? `${step.memberName} --[${step.relationType}]-->` : step.memberName))
    .join(" ");

  const promptText = `You are a Tamil family relationship expert. The kinship term has already been computed as "${termLabel}". Write one short, natural sentence explaining how ${toName} is related to ${fromName}, using that term. Do not contradict it.

Path: ${pathString}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY });
    const response = await ai.models.generateContent({
      model: "gemma-4-26b-a4b-it",
      contents: promptText,
      config: { abortSignal: controller.signal },
    });
    return response.text || null;
  } finally {
    clearTimeout(timeout);
  }
}
