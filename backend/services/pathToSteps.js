// Convert a shortest-path ({members, edges}) into the primitive `steps` the
// kinship engine consumes. Pure function — fully unit-testable.
//
// Each edge carries the external {fromId,toId,type}. From ego's walking
// direction we derive the per-hop rel (parent/child/spouse/sibling), read the
// arrived member's gender, and compute elder/younger from birth data.

/** Approximate birth year for elder/younger comparison; lower = older. */
function birthYear(member) {
  if (!member) return null;
  if (member.dob) {
    const y = new Date(member.dob).getFullYear();
    if (!Number.isNaN(y)) return y;
  }
  if (member.manualAge != null) {
    const ref = member.updatedAt || member.createdAt;
    const base = ref ? new Date(ref).getFullYear() : new Date().getFullYear();
    return base - Number(member.manualAge);
  }
  return null;
}

/** Is `a` elder than `b`? Unknown birth data => false (default younger). */
function isElder(a, b) {
  const ya = birthYear(a);
  const yb = birthYear(b);
  if (ya == null || yb == null) return false;
  return ya < yb;
}

export function pathToSteps(members, edges) {
  if (!Array.isArray(members) || !Array.isArray(edges)) return [];
  const ego = members[0];
  const steps = [];

  for (let i = 0; i < edges.length; i++) {
    const prev = members[i];
    const cur = members[i + 1];
    const e = edges[i];

    let rel;
    if (e.type === "Parent") {
      // parent_of stored parent(fromId) -> child(toId).
      // If we depart from the parent, we move to a child; else to a parent.
      rel = prev.id === e.fromId ? "child" : "parent";
    } else if (e.type === "Spouse") {
      rel = "spouse";
    } else {
      rel = "sibling";
    }

    const step = { rel, gender: cur.gender };
    if (rel === "sibling") step.elder = isElder(cur, prev);
    steps.push(step);
  }

  // Same-generation terminal (sibling/cousin): elder is ego-relative, per the
  // kinship engine contract.
  const netGen = steps.reduce((g, s) => g + (s.rel === "parent" ? 1 : s.rel === "child" ? -1 : 0), 0);
  const last = steps[steps.length - 1];
  if (last && netGen === 0 && (last.rel === "child" || last.rel === "sibling")) {
    last.elder = isElder(members[members.length - 1], ego);
  }

  return steps;
}
