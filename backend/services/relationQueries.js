import { db } from "../db.js";

/**
 * Get all relations where the given member is the source (fromId).
 * Queries the MemberRelationsIndex GSI.
 * @param {string} memberId
 * @returns {Promise<object[]>}
 */
export async function getRelationsFrom(memberId) {
  const result = await db.queryIndex(
    "MemberRelationsIndex",
    "fromId = :fromId",
    { ":fromId": memberId }
  );
  return result.Items || [];
}

/**
 * Get all relations where the given member is the target (toId).
 * Queries the TargetRelationsIndex GSI.
 * @param {string} memberId
 * @returns {Promise<object[]>}
 */
export async function getRelationsTo(memberId) {
  const result = await db.queryIndex(
    "TargetRelationsIndex",
    "toId = :toId",
    { ":toId": memberId }
  );
  return result.Items || [];
}

/**
 * Get all relations involving a member (both directions), deduplicated by relation id.
 * @param {string} memberId
 * @returns {Promise<object[]>}
 */
export async function getAllRelationsForMember(memberId) {
  const [fromRelations, toRelations] = await Promise.all([
    getRelationsFrom(memberId),
    getRelationsTo(memberId),
  ]);

  const seen = new Set();
  const deduplicated = [];

  for (const relation of [...fromRelations, ...toRelations]) {
    if (!seen.has(relation.id)) {
      seen.add(relation.id);
      deduplicated.push(relation);
    }
  }

  return deduplicated;
}
