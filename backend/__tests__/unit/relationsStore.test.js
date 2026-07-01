import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the surreal query choke point; assert the SurrealQL + params the store builds.
vi.mock("../../surreal.js", () => ({ query: vi.fn() }));

import { query } from "../../surreal.js";
import { createRelation, listRelations, deleteRelation, relationExists } from "../../store/relations.js";

describe("relations store — external type <-> primitive edge mapping", () => {
  beforeEach(() => vi.clearAllMocks());

  it("Parent maps to parent_of with parent as `in`", async () => {
    query.mockResolvedValue([{ id: { tb: "parent_of", id: "x" } }]);
    const rel = await createRelation({ fromId: "p", toId: "c", type: "Parent" });

    const [surql, vars] = query.mock.calls[0];
    expect(surql).toContain("->parent_of->");
    expect(vars.inRec.id).toBe("p"); // parent
    expect(vars.outRec.id).toBe("c"); // child
    expect(rel).toEqual({ id: "parent_of:x", fromId: "p", toId: "c", type: "Parent" });
  });

  it("Child maps to parent_of but swaps direction (target becomes parent)", async () => {
    query.mockResolvedValue([{ id: { tb: "parent_of", id: "y" } }]);
    await createRelation({ fromId: "child", toId: "parent", type: "Child" });

    const vars = query.mock.calls[0][1];
    expect(vars.inRec.id).toBe("parent"); // toId is the parent
    expect(vars.outRec.id).toBe("child");
  });

  it("Spouse maps to married_to", async () => {
    query.mockResolvedValue([{ id: { tb: "married_to", id: "z" } }]);
    const rel = await createRelation({ fromId: "a", toId: "b", type: "Spouse" });
    expect(query.mock.calls[0][0]).toContain("->married_to->");
    expect(rel.type).toBe("Spouse");
  });

  it("rejects unknown relation types", async () => {
    await expect(createRelation({ fromId: "a", toId: "b", type: "Bogus" })).rejects.toThrow(/Unknown relation type/);
  });

  it("listRelations reconstructs the external shape from all three edge tables", async () => {
    query
      .mockResolvedValueOnce([{ id: { tb: "parent_of", id: "1" }, in: { tb: "member", id: "p" }, out: { tb: "member", id: "c" } }])
      .mockResolvedValueOnce([{ id: { tb: "married_to", id: "2" }, in: { tb: "member", id: "h" }, out: { tb: "member", id: "w" } }])
      .mockResolvedValueOnce([{ id: { tb: "sibling_of", id: "3" }, in: { tb: "member", id: "s1" }, out: { tb: "member", id: "s2" } }]);

    const rels = await listRelations();
    expect(rels).toEqual([
      { id: "parent_of:1", fromId: "p", toId: "c", type: "Parent" },
      { id: "married_to:2", fromId: "h", toId: "w", type: "Spouse" },
      { id: "sibling_of:3", fromId: "s1", toId: "s2", type: "Sibling" },
    ]);
  });

  it("deleteRelation parses table:key and reports removal", async () => {
    query.mockResolvedValue([{ id: { tb: "parent_of", id: "1" } }]);
    const removed = await deleteRelation("parent_of:1");
    const [surql, vars] = query.mock.calls[0];
    expect(surql).toContain("DELETE type::thing($tb, $key)");
    expect(vars).toEqual({ tb: "parent_of", key: "1" });
    expect(removed).toBe(true);
  });

  it("deleteRelation refuses unknown tables", async () => {
    const removed = await deleteRelation("member:1");
    expect(removed).toBe(false);
    expect(query).not.toHaveBeenCalled();
  });

  it("relationExists checks undirected match for Spouse", async () => {
    query.mockResolvedValue([{ id: "x" }]);
    const exists = await relationExists("a", "b", "Spouse");
    expect(query.mock.calls[0][0]).toMatch(/in = \$a AND out = \$b\) OR \(in = \$b AND out = \$a/);
    expect(exists).toBe(true);
  });
});
