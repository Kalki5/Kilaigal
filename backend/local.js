import "dotenv/config";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import app from "./index.js";
import { queryAll, getDb } from "./surreal.js";

const PORT = 3001;
const __dirname = dirname(fileURLToPath(import.meta.url));

async function ensureSchema() {
  try {
    await getDb(); // fail fast if the connection/env is wrong
    const schema = await readFile(join(__dirname, "schema.surql"), "utf8");
    await queryAll(schema);
    console.log(`SurrealDB schema applied (ns=${process.env.SURREAL_NS}, db=${process.env.SURREAL_DB}).`);
  } catch (err) {
    console.error("⚠️  Could not connect / apply schema to SurrealDB:", err.message);
    console.error("   Check backend/.env (SURREAL_URL/NS/DB/USER/PASS) and that the DB is reachable.");
  }
}

app.listen(PORT, async () => {
  console.log(`Backend listening at http://localhost:${PORT}`);
  await ensureSchema();
});
