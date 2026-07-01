import { getEdgesForMembers, getMembersByIds } from "../store/graph.js";

/**
 * BFS neighborhood around a member up to `depth` hops, over all primitive edges
 * (treated bidirectionally). Edge-fetching is pushed to SurrealDB per level.
 * Returns the external { members, relations } shape the frontend expects.
 */
export async function traverseTree(startMemberId, depth) {
  const visited = new Set([startMemberId]);
  const relById = new Map();
  let frontier = [startMemberId];

  for (let level = 0; level < depth && frontier.length > 0; level++) {
    const edges = await getEdgesForMembers(frontier);
    const next = [];
    for (const e of edges) {
      if (!relById.has(e.id)) relById.set(e.id, e);
      for (const nb of [e.fromId, e.toId]) {
        if (!visited.has(nb)) {
          visited.add(nb);
          next.push(nb);
        }
      }
    }
    frontier = next;
  }

  const members = await getMembersByIds([...visited]);
  return { members, relations: [...relById.values()] };
}

/**
 * Shortest path between two members via BFS over primitive edges.
 * Returns { members: [ordered], edges: [ordered edge used between i and i+1] }
 * or null if unreachable. `edges` has length members.length - 1.
 */
export async function findShortestPath(fromMemberId, toMemberId) {
  if (fromMemberId === toMemberId) {
    const members = await getMembersByIds([fromMemberId]);
    return members.length ? { members, edges: [] } : null;
  }

  const visited = new Set([fromMemberId]);
  const cameFrom = new Map(); // neighborId -> { prevId, edge }
  let frontier = [fromMemberId];
  let found = false;

  while (frontier.length > 0 && !found) {
    const edges = await getEdgesForMembers(frontier);
    const next = [];
    for (const e of edges) {
      const pairs = [
        [e.fromId, e.toId],
        [e.toId, e.fromId],
      ];
      for (const [a, b] of pairs) {
        if (frontier.includes(a) && !visited.has(b)) {
          visited.add(b);
          cameFrom.set(b, { prevId: a, edge: e });
          next.push(b);
          if (b === toMemberId) {
            found = true;
            break;
          }
        }
      }
      if (found) break;
    }
    frontier = next;
  }

  if (!found) return null;

  // Reconstruct ordered ids + edges from target back to source.
  const idPath = [];
  const edgePath = [];
  let cur = toMemberId;
  while (cur !== fromMemberId) {
    const { prevId, edge } = cameFrom.get(cur);
    idPath.unshift(cur);
    edgePath.unshift(edge);
    cur = prevId;
  }
  idPath.unshift(fromMemberId);

  const memberMap = new Map((await getMembersByIds(idPath)).map((m) => [m.id, m]));
  const members = idPath.map((id) => memberMap.get(id) || { id, name: "Unknown" });
  return { members, edges: edgePath };
}
