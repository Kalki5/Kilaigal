-- Kilaigal SurrealDB schema
-- Apply with: npm run db:push  (see scripts/pushSchema.js)
-- Store ONLY primitive edges; derive everything else (siblings-by-blood,
-- grandparents, uncles, cousins, in-laws, and all Tamil kin terms).

-- ── Members ──────────────────────────────────────────────
DEFINE TABLE member SCHEMAFULL;
DEFINE FIELD name        ON member TYPE string;
DEFINE FIELD gender      ON member TYPE string ASSERT $value IN ['Male','Female','Other'];
DEFINE FIELD dob         ON member TYPE option<datetime>;   -- drives elder/younger terms
DEFINE FIELD manualAge   ON member TYPE option<number>;
DEFINE FIELD location    ON member TYPE option<string>;
DEFINE FIELD phone       ON member TYPE option<string>;     -- handle only; not auth
DEFINE FIELD photoUrl    ON member TYPE option<string>;
DEFINE FIELD x           ON member TYPE option<number>;     -- saved canvas position
DEFINE FIELD y           ON member TYPE option<number>;
DEFINE FIELD componentId ON member TYPE option<string>;     -- connected-component id
DEFINE FIELD createdBy   ON member TYPE option<string>;     -- phone of creator
DEFINE FIELD createdAt   ON member TYPE datetime DEFAULT time::now();
DEFINE FIELD updatedAt   ON member TYPE option<datetime>;

DEFINE INDEX member_name   ON member FIELDS name;
DEFINE INDEX member_compid ON member FIELDS componentId;

-- ── Primitive edges (the ONLY relations stored) ──────────
-- parent_of: directed parent -> child. Traverse both ways:
--   ->parent_of->member  (children)   <-parent_of<-member (parents)
DEFINE TABLE parent_of TYPE RELATION IN member OUT member SCHEMAFULL;
DEFINE FIELD kind ON parent_of TYPE string DEFAULT 'birth'
  ASSERT $value IN ['birth','adopted','step','foster'];
DEFINE FIELD createdBy ON parent_of TYPE option<string>;
DEFINE FIELD createdAt ON parent_of TYPE datetime DEFAULT time::now();

-- married_to: one record per couple, treated undirected in queries.
DEFINE TABLE married_to TYPE RELATION IN member OUT member SCHEMAFULL;
DEFINE FIELD status ON married_to TYPE string DEFAULT 'married'
  ASSERT $value IN ['married','divorced','widowed','engaged'];
DEFINE FIELD since  ON married_to TYPE option<datetime>;
DEFINE FIELD until  ON married_to TYPE option<datetime>;
DEFINE FIELD createdBy ON married_to TYPE option<string>;
DEFINE FIELD createdAt ON married_to TYPE datetime DEFAULT time::now();

-- sibling_of: stored ONLY when shared parentage is unknown.
DEFINE TABLE sibling_of TYPE RELATION IN member OUT member SCHEMAFULL;
DEFINE FIELD createdBy ON sibling_of TYPE option<string>;
DEFINE FIELD createdAt ON sibling_of TYPE datetime DEFAULT time::now();

-- ── Connected components (the "largest tree you're part of") ──
DEFINE TABLE component SCHEMAFULL;
DEFINE FIELD memberCount ON component TYPE number DEFAULT 0;
