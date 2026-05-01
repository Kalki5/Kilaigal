import { getRelationsFrom, getRelationsTo } from "./relationQueries.js";
import { batchGetMembers } from "./batchLoader.js";

/**
 * Traverse the family graph from a starting member up to a given depth using BFS.
 * All relation types (Parent, Child, Spouse, Sibling) are treated as bidirectional edges.
 *
 * @param {string} startMemberId - UUID of the starting member
 * @param {number} depth - Number of hops (1-10)
 * @returns {Promise<{ members: object[], relations: object[] }>}
 */
export async function traverseTree(startMemberId, depth) {
  const visited = new Set();
  const relationMap = new Map(); // keyed by relation id for deduplication
  let frontier = [startMemberId];

  visited.add(startMemberId);

  for (let level = 0; level < depth; level++) {
    const nextFrontier = [];

    // Query relations for all frontier members in parallel
    const relationResults = await Promise.all(
      frontier.map(async (memberId) => {
        const [fromRelations, toRelations] = await Promise.all([
          getRelationsFrom(memberId),
          getRelationsTo(memberId),
        ]);
        return [...fromRelations, ...toRelations];
      })
    );

    for (const relations of relationResults) {
      for (const relation of relations) {
        // Deduplicate relations by id
        if (!relationMap.has(relation.id)) {
          relationMap.set(relation.id, relation);
        }

        // Discover new members from both ends of the relation
        const neighborIds = [relation.fromId, relation.toId];
        for (const neighborId of neighborIds) {
          if (!visited.has(neighborId)) {
            visited.add(neighborId);
            nextFrontier.push(neighborId);
          }
        }
      }
    }

    frontier = nextFrontier;

    // No new members discovered, stop early
    if (frontier.length === 0) {
      break;
    }
  }

  // Batch-load all discovered member records
  const memberIds = [...visited];
  const members = await batchGetMembers(memberIds);
  const relations = [...relationMap.values()];

  return { members, relations };
}

/**
 * Find the shortest path between two members using BFS with parent-tracking.
 * Returns an ordered array of { memberId, memberName, relationType } steps.
 * Returns empty array if no path exists.
 *
 * @param {string} fromMemberId - UUID of the source member
 * @param {string} toMemberId - UUID of the target member
 * @returns {Promise<object[]>} - Ordered path steps, empty if no path
 */
export async function findShortestPath(fromMemberId, toMemberId) {
  if (fromMemberId === toMemberId) {
    const members = await batchGetMembers([fromMemberId]);
    if (members.length === 0) {
      return [];
    }
    return [{ memberId: fromMemberId, memberName: members[0].name, relationType: null }];
  }

  const visited = new Set();
  // parentMap stores: childId -> { parentId, relationType }
  // relationType is the relation connecting parentId to childId
  const parentMap = new Map();
  let queue = [fromMemberId];

  visited.add(fromMemberId);

  let found = false;

  while (queue.length > 0 && !found) {
    const nextQueue = [];

    const relationResults = await Promise.all(
      queue.map(async (memberId) => {
        const [fromRelations, toRelations] = await Promise.all([
          getRelationsFrom(memberId),
          getRelationsTo(memberId),
        ]);
        return { memberId, relations: [...fromRelations, ...toRelations] };
      })
    );

    for (const { memberId, relations } of relationResults) {
      for (const relation of relations) {
        // Determine the neighbor: the other end of the relation
        const neighborId = relation.fromId === memberId ? relation.toId : relation.fromId;

        if (!visited.has(neighborId)) {
          visited.add(neighborId);
          parentMap.set(neighborId, { parentId: memberId, relationType: relation.type });
          nextQueue.push(neighborId);

          if (neighborId === toMemberId) {
            found = true;
            break;
          }
        }
      }
      if (found) break;
    }

    queue = nextQueue;
  }

  if (!found) {
    return [];
  }

  // Reconstruct path from toMemberId back to fromMemberId
  const pathIds = [];
  const relationTypes = [];
  let current = toMemberId;

  while (current !== fromMemberId) {
    const entry = parentMap.get(current);
    pathIds.unshift(current);
    relationTypes.unshift(entry.relationType);
    current = entry.parentId;
  }
  pathIds.unshift(fromMemberId);

  // Load member records to get names
  const members = await batchGetMembers(pathIds);
  const memberNameMap = new Map();
  for (const member of members) {
    memberNameMap.set(member.id, member.name);
  }

  // Build the ordered path steps
  // Each step has: memberId, memberName, relationType (relation connecting this member to the next)
  // The last member has relationType: null (no next member)
  const path = pathIds.map((id, index) => ({
    memberId: id,
    memberName: memberNameMap.get(id) || "Unknown",
    relationType: index < relationTypes.length ? relationTypes[index] : null,
  }));

  return path;
}
