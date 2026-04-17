import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { getLlmHealthSnapshot } from "./lib/llm.js";
import { registerAnalyzeRoutes } from "./routes/analyze.js";

const app = Fastify({
  logger: true,
  bodyLimit: 3 * 1024 * 1024,
});

const port = Number(process.env.PORT || 3000);
const corsOrigin = process.env.CORS_ORIGIN?.split(",").map((s) => s.trim()) ?? true;

await app.register(cors, { origin: corsOrigin });

app.addHook("preHandler", async (request, reply) => {
  if (!request.url.startsWith("/api/")) return;
  const key = process.env.CLARITY_API_KEY;
  if (!key) return;
  const h = request.headers["x-api-key"];
  const provided = Array.isArray(h) ? h[0] : h;
  if (provided !== key) {
    return reply.code(401).send({ error: "Unauthorized" });
  }
});

app.get("/health", async () => ({
  ok: true,
  llm: getLlmHealthSnapshot(),
}));

await registerAnalyzeRoutes(app);

try {
  await app.listen({ port, host: "0.0.0.0" });
  app.log.info({ port, llm: getLlmHealthSnapshot() }, "clarity-api listening");
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
