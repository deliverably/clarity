/**
 * Creates `.env` from `.env.example` if `.env` is missing (never overwrites).
 * Docker Compose and `dotenv` both read `.env` from the project root.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env");
const examplePath = path.join(root, ".env.example");

if (fs.existsSync(envPath)) {
  console.log(".env already exists — not changed.");
  process.exit(0);
}

if (!fs.existsSync(examplePath)) {
  console.error("Missing .env.example");
  process.exit(1);
}

fs.copyFileSync(examplePath, envPath);
console.log("Created .env from .env.example");
console.log("Next: edit .env — for Bedrock set AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, and BEDROCK_MODEL_ID (see .env.example).");
