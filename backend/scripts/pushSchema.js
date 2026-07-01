// Apply schema.surql to the configured SurrealDB instance.
// Usage: node scripts/pushSchema.js   (or: npm run db:push)
import "dotenv/config";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { queryAll, close } from "../surreal.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const schema = await readFile(join(__dirname, "..", "schema.surql"), "utf8");
  console.log(`Pushing schema to ${process.env.SURREAL_URL} (ns=${process.env.SURREAL_NS}, db=${process.env.SURREAL_DB})`);
  await queryAll(schema);
  console.log("Schema applied.");
  await close();
}

main().catch(async (err) => {
  console.error("Schema push failed:", err.message);
  await close();
  process.exit(1);
});
