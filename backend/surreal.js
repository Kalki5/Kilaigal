import { Surreal } from "surrealdb";

// Lazy singleton connection to SurrealDB.
// Endpoint: SDK connects to the RPC endpoint; prefer WebSocket (wss) so live
// queries work. Surreal Cloud gives an https base URL — derive wss .../rpc.

let dbPromise = null;

function rpcEndpoint(url) {
  const base = (url || "").replace(/\/+$/, "");
  const ws = base.replace(/^http/, "ws"); // http->ws, https->wss
  return `${ws}/rpc`;
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
