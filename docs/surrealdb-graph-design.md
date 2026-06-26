# Kilaigal — SurrealDB Graph Migration & Kinship Engine Design

> **Status:** Design draft. No code changed yet. This captures the decisions from
> the DynamoDB→SurrealDB brainstorm so we can build against a shared plan.

## 1. Goals & decisions

| Concern | Decision |
|---|---|
| Database | SurrealDB. Store **3 primitive edges**; derive everything else. Traversal runs **in the DB**, not in app-code BFS. |
| Relation meaning | A **deterministic kinship rule engine** resolves a graph path to a community-independent **kin-slot**. The LLM only *narrates*; it never *derives*. |
| Terminology | A kin-slot maps to a surface term via a swappable **terminology pack**. "Spoken Tamil" is the default; users can switch to Iyer / Gounder / … like changing a language. |
| Access | **Full connected component** — everyone reachable through blood/marriage is visible. |
| "Largest tree" stat | `componentId` + a member counter, maintained via **union-find on edge write**. |
| Visualization | **vis-network** (keep its pan/zoom/drag) + **union-node layout** + an **HTML overlay card** for the focused node (level-of-detail rendering). |
| Identity | Phone number as a plain handle to "be" a node. **No authentication** for now. |

### Deferred (recorded, not built yet)
- **Privacy.** Full-component visibility + no auth ⇒ every member's phone is visible to
  everyone in the tree. Acceptable now; revisit before any public launch (per-field
  visibility for living people).
- **Real auth** (claim-links / social login) — out of scope until the above matters.

---

## 2. SurrealDB schema

The core idea: **store only what cannot be derived.** Parent/child is one fact, not two.
Siblings, grandparents, uncles, cousins, and every Tamil term are *computed* from paths.

```surql
DEFINE TABLE member SCHEMAFULL;
DEFINE FIELD name      ON member TYPE string;
DEFINE FIELD gender    ON member TYPE string ASSERT $value IN ['Male','Female','Other'];
DEFINE FIELD dob       ON member TYPE option<datetime>;   -- drives elder/younger
DEFINE FIELD manualAge ON member TYPE option<number>;
DEFINE FIELD location  ON member TYPE option<string>;
DEFINE FIELD phone     ON member TYPE option<string>;     -- handle, not auth
DEFINE FIELD photoUrl  ON member TYPE option<string>;
DEFINE FIELD componentId ON member TYPE option<string>;   -- connected-component id (§5)
DEFINE FIELD createdBy ON member TYPE option<string>;     -- phone of creator
DEFINE FIELD createdAt ON member TYPE datetime DEFAULT time::now();

DEFINE TABLE family SCHEMAFULL;        -- a kilai / branch label (optional grouping)

-- ── Primitive edges (the ONLY relations we store) ──
DEFINE TABLE parent_of  TYPE RELATION IN member OUT member SCHEMAFULL;  -- parent -> child
DEFINE FIELD kind ON parent_of TYPE string DEFAULT 'birth'
  ASSERT $value IN ['birth','adopted','step','foster'];

DEFINE TABLE married_to TYPE RELATION IN member OUT member SCHEMAFULL;  -- undirected pair
DEFINE FIELD status ON married_to TYPE string DEFAULT 'married'
  ASSERT $value IN ['married','divorced','widowed','engaged'];
DEFINE FIELD since  ON married_to TYPE option<datetime>;
DEFINE FIELD until  ON married_to TYPE option<datetime>;

DEFINE TABLE sibling_of TYPE RELATION IN member OUT member SCHEMAFULL;  -- ONLY when parents unknown
```

**Why these three:**
- `parent_of` is traversable both ways — `->parent_of->member` (children),
  `<-parent_of<-member` (parents). This deletes the old dual-GSI pattern
  (`MemberRelationsIndex` + `TargetRelationsIndex`) and the `Parent`/`Child`
  double-storage.
- `sibling_of` is stored **only** when parentage is unknown; normally siblings are
  derived (share a parent).
- `married_to` carries status/dates so divorce, remarriage, and widowhood are
  representable without new edge types.

### Replacing app-code BFS with in-DB traversal

`graphTraversal.js::traverseTree` (BFS firing 2 GSI queries per node per hop) collapses to
a recursive graph query:

```surql
-- Neighborhood around a member (depth N), bidirectional over all primitives
SELECT id, name,
  <->(parent_of, married_to, sibling_of)<->member.@.{..N} AS kin
FROM member:⟨id⟩;
```

> **Version note:** recursive path syntax (`.{..N}`) is a SurrealDB 2.x feature and has
> evolved across releases. Pin the deployment version and verify the exact syntax before
> relying on it. Until then, a bounded loop of `RELATE`-edge selects is the fallback.

`findShortestPath` similarly becomes a graph query rather than hand-rolled BFS with a
parent-map.

---

## 3. Kinship rule engine (the moat)

Tamil/Dravidian kinship is rule-governed, so it should be **computed deterministically**,
not guessed by an LLM. A kin term is a pure function of a path plus node attributes.

### 3.1 Derivation dimensions

Every term is determined by reading these off the path between **ego** and **alter**:

| Dimension | Source |
|---|---|
| **Generation** (+2…−2) | net up/down hops over `parent_of` |
| **Gender** of alter | `alter.gender` |
| **Side**: paternal / maternal | which parent the path first ascended through |
| **Cross vs parallel** | does the connecting sibling link *cross* gender? Father's **brother** = parallel; father's **sister** = cross. Mother's **sister** = parallel; mother's **brother** = cross. |
| **Relative age**: elder / younger | `dob` (or `manualAge`) comparison |
| **Affinal vs consanguineal** | did the path traverse a `married_to` edge? |

The **cross/parallel** and **elder/younger** axes are precisely what English flattens and
Tamil encodes — and precisely what an LLM gets wrong. They fall out of the graph for free.

### 3.2 Kin-slots (community-independent interface)

The engine outputs a **slot**, never a word. Representative slot enum (not exhaustive):

```
SELF
FATHER, MOTHER
FATHER_ELDER_BROTHER, FATHER_YOUNGER_BROTHER, FATHER_SISTER
MOTHER_BROTHER, MOTHER_ELDER_SISTER, MOTHER_YOUNGER_SISTER
ELDER_BROTHER, YOUNGER_BROTHER, ELDER_SISTER, YOUNGER_SISTER
PARALLEL_COUSIN_*        -- collapses to a sibling slot
CROSS_COUSIN_MALE_ELDER, CROSS_COUSIN_MALE_YOUNGER, CROSS_COUSIN_FEMALE
SON, DAUGHTER, SON_IN_LAW, DAUGHTER_IN_LAW
GRANDFATHER_PATERNAL, GRANDMOTHER_PATERNAL, GRANDFATHER_MATERNAL, GRANDMOTHER_MATERNAL
GRANDSON, GRANDDAUGHTER
HUSBAND, WIFE
... (in-law slots: BIL/SIL by side, etc.)
```

### 3.3 Worked examples (why rules beat an LLM)

- **Father's elder brother** → `FATHER_ELDER_BROTHER`. (path: ego ↑ father, ↑↓ to his
  *elder, same-gender* sibling ⇒ parallel.)
- **Father's sister** → `FATHER_SISTER`, a **cross** link ⇒ also the *mother-in-law*
  slot. This isn't a coincidence — it's a structural consequence of cross-cousin
  marriage, and the engine captures it for free.
- **Mother's brother** → `MOTHER_BROTHER` (cross) ⇒ also the *father-in-law* slot.
- **Father's brother's son** → parallel ⇒ a **sibling** slot (addressed as anna/thambi),
  *not* a cousin.
- **Mother's brother's son** → cross ⇒ `CROSS_COUSIN_MALE_*` — the marriageable category.

These derivations are deterministic and **property-testable** (you already have a strong
`__tests__/properties/` culture). Examples of invariants:
- a parallel cousin always resolves to a sibling slot;
- a cross cousin always resolves to a cross-cousin slot;
- `FATHER_SISTER` and the mother-in-law slot coincide under the cross rule.

### 3.4 LLM's reduced role

`aiRelationship.js` stays, but the flow becomes: **shortest path → rule engine → slot →
terminology pack → term**, and the LLM is handed the *resolved term + path* only to write
a friendly sentence. It can no longer be wrong about the kinship itself, and the 10s
timeout / "AI unavailable" path no longer breaks the core feature.

---

## 4. Terminology packs (switchable, like i18n)

A pack maps `slot → { script, romanized, aliases[] }`. Default = **Spoken Tamil**. Users
pick a pack in settings; switching swaps surface terms without touching rules. Missing
fine distinctions **fall back** to a coarser slot.

```jsonc
// pack: spoken-tamil (DEFAULT) — sample; validate full set with native speakers
{
  "id": "spoken-tamil",
  "label": "பேச்சு தமிழ் (Spoken Tamil)",
  "fallback": null,
  "terms": {
    "FATHER":                 { "script": "அப்பா",   "romanized": "Appa",      "aliases": ["Appah"] },
    "MOTHER":                 { "script": "அம்மா",   "romanized": "Amma" },
    "FATHER_ELDER_BROTHER":   { "script": "பெரியப்பா", "romanized": "Periyappa" },
    "FATHER_YOUNGER_BROTHER": { "script": "சித்தப்பா", "romanized": "Chithappa", "aliases": ["Chittappa"] },
    "FATHER_SISTER":          { "script": "அத்தை",   "romanized": "Attai",     "aliases": ["Athai"] },
    "MOTHER_BROTHER":         { "script": "மாமா",    "romanized": "Maama",     "aliases": ["Maaman","Mama"] },
    "ELDER_BROTHER":          { "script": "அண்ணா",   "romanized": "Anna",      "aliases": ["Annan"] },
    "YOUNGER_BROTHER":        { "script": "தம்பி",    "romanized": "Thambi" },
    "ELDER_SISTER":           { "script": "அக்கா",    "romanized": "Akka" },
    "YOUNGER_SISTER":         { "script": "தங்கை",    "romanized": "Thangai",   "aliases": ["Thangachi"] },
    "CROSS_COUSIN_MALE_ELDER":{ "script": "அத்தான்",  "romanized": "Athaan",    "aliases": ["Maccaan","Machaan"] }
    // ... remaining slots
  }
}
```

```jsonc
// pack: iyer — STUB. Differs mainly in surface terms; falls back to spoken-tamil
{ "id": "iyer", "label": "ஐயர்", "fallback": "spoken-tamil", "terms": { /* native-validated overrides */ } }

// pack: gounder (Kongu) — STUB. Kongu dialect has distinct terms; fill with native input
{ "id": "gounder", "label": "கவுண்டர் (கொங்கு)", "fallback": "spoken-tamil", "terms": { /* ... */ } }
```

> **Accuracy note:** the spoken-Tamil entries above are a starting set and a few
> (e.g. cross-cousin terms, in-law terms) vary by speaker — the full table and *all*
> community packs must be validated by native speakers before shipping. We encode
> structure here, not folklore.

Resolution order: `pack.terms[slot]` → walk `pack.fallback` chain → coarser slot → raw
slot name as last resort.

---

## 5. "Largest tree you're part of" (connected components)

Full-component access needs the component computed cheaply.

- Maintain **`componentId`** on every member via **union-find**, updated **on edge write**.
  Adding a `married_to`/`parent_of`/`sibling_of` edge that links two components merges them
  (point the smaller component's members at the larger id, or use union-by-rank with a
  `component` table holding a representative + member count).
- Keep a **counter** per component. Then "you're connected to **N people across G
  generations**" is one lookup, not a graph crawl.
- The counter and the *rendered* nodes are decoupled — show the number immediately,
  stream nodes progressively (§6).

> SurrealDB has no cheap native connected-components; the maintained id is the scalable
> answer. Recomputing on demand is fine for small graphs but won't hold as trees grow.

---

## 6. Visualization — vis-network + union nodes + LOD overlay

The constraint set (rich cards **and** vis-grade pan/zoom/drag **and** possibly unbounded
size) rules out DOM-node renderers as the primary canvas. The pattern that satisfies all
three is **level-of-detail**:

1. **Keep vis-network** as the graph renderer (its pan/zoom/drag is exactly what we want).
   Render everyone as cheap avatars/dots.
2. **Union-node layout.** A marriage becomes a tiny invisible "union" node; both spouses
   connect to it; children descend from the *union*, not from one parent. This fixes the
   couple/sibling grouping that `Canvas.jsx::computeLevels` currently hacks (spouse-level
   equalization + age heuristics). Mirrors GEDCOM's `FAM` record.
3. **HTML overlay card** for the focused/hovered node only — the rich bilingual card
   (photo, Tamil + romanized kin term, actions) renders in the DOM at the node's screen
   coords (via `network.getPositions` / `canvasToDOM`). Rich where you look; cheap
   everywhere else. This is "HTML on canvas," done at one node instead of thousands.
4. **Progressive loading.** Load the viewport neighborhood; stream more on pan. The
   component *count* (§5) is shown up front regardless of how much is loaded.

Escape hatches if vis's layout is outgrown: **Cytoscape.js** (better dagre/ELK tree
layouts + `node-html-label`), then **Sigma.js** (WebGL, 10k+ nodes).

---

## 7. Migration plan (DynamoDB → SurrealDB)

`backend/db.js` is a thin 6-method abstraction — the swap is contained.

1. **Stand up SurrealDB** (local: replace `docker-compose.yml` DynamoDB-Local service;
   `backend/local.js` table auto-create → schema definition above).
2. **Rewrite `db.js`** against `surrealdb.js` (the client surface; keep method names where
   sensible so `index.js` churn is minimal).
3. **Reshape handlers** in `index.js`: members → `member` records; relations → `RELATE`
   into `parent_of` / `married_to` / `sibling_of` (map old `type` → primitive + reverse).
4. **Delete derived storage & BFS:** drop `Parent`/`Child` double-rows, the two GSIs,
   `relationQueries.js` dual-direction queries, and most of `graphTraversal.js` (now SurrealQL).
5. **Add the kinship engine** (`services/kinship/`): path → slot resolver + terminology
   packs + property tests. Re-point `aiRelationship.js` to narrate the resolved term.
6. **Add union-find** on edge writes; expose component size via an endpoint.
7. **Frontend:** union-node graph build in `Canvas.jsx`; HTML overlay card; terminology
   pack setting in UI; `api.js` unchanged in shape.
8. **Infra:** `infrastructure/*.tf` — replace the DynamoDB table resource with however
   SurrealDB is hosted (managed Surreal Cloud vs self-hosted on compute); revisit Lambda
   fit (SurrealDB favors a persistent connection over per-invocation cold starts).

---

## 8. Open questions

- **SurrealDB hosting**: Surreal Cloud (managed) vs self-hosted? This affects the Lambda
  decision in step 8 (persistent connection vs serverless cold starts).
- **Community pack sourcing**: who validates the Iyer / Gounder / … term tables? These
  must come from native speakers, not be inferred.
- **`married_to` directionality**: store one edge per couple and treat undirected, or two
  reciprocal edges? (One edge + bidirectional traversal is simpler.)
- **Birth order without DOB**: when `dob` is unknown, how is elder/younger decided —
  explicit order field, or default to "unknown" and show the neutral term?
