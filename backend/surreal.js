import { Surreal } from "surrealdb";

// Lazy singleton connection to SurrealDB.
// Endpoint: the SDK auto-selects an engine from the URL scheme. We use the
// HTTP(S) engine (per-request RPC over plain HTTPS) rather than WebSocket
// (wss) because this deployment's outbound network policy only allows plain
// HTTPS CONNECT tunnels — WebSocket upgrades are not supported. Trade-off:
// no live queries (SurrealDB `LIVE SELECT`), which this codebase doesn't use.

let dbPromise = null;

function rpcEndpoint(url) {
  const base = (url || "").replace(/\/+$/, "");
  return `${base}/rpc`;
}

async function connect() {
  const {
    SURREAL_URL,
    SURREAL_NS,
    SURREAL_DB,
    SURREAL_USER,
    SURREAL_PASS,
  } = process.env;

  if (!SURREAL_URL) throw new Error("SURREAL_URL is not set (see backend/.env.example)");

  const db = new Surreal();
  await db.connect(rpcEndpoint(SURREAL_URL), {
    namespace: SURREAL_NS,
    database: SURREAL_DB,
    auth: { username: SURREAL_USER, password: SURREAL_PASS },
  });
  return db;
}

/** Get the shared SurrealDB connection, connecting on first use. */
export async function getDb() {
  if (!dbPromise) {
    dbPromise = connect().catch((err) => {
      dbPromise = null; // allow retry on next call
      throw err;
    });
  }
  return dbPromise;
}

/** Run a SurrealQL query. Returns the result array from the LAST statement. */
export async function query(surql, vars = {}) {
  const db = await getDb();
  const result = await db.query(surql, vars);
  return Array.isArray(result) ? result[result.length - 1] : result;
}

/** Run a SurrealQL query and return every statement's result. */
export async function queryAll(surql, vars = {}) {
  const db = await getDb();
  return db.query(surql, vars);
}

export async function close() {
  if (dbPromise) {
    const db = await dbPromise.catch(() => null);
    if (db) await db.close();
    dbPromise = null;
  }
}
