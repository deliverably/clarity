# Clarity API

Small Fastify service that exposes nine `POST /api/analyze/*` endpoints. Each route validates responses with Zod. Link analysis combines Cheerio extraction with real HTTP redirect checks; optional LLM enrichment adds short `location` labels when an LLM provider is configured.

**LLM providers (pick one):**

1. **Amazon Bedrock (default)** — Set `LLM_PROVIDER=bedrock` (or omit `LLM_PROVIDER` when neither OpenAI nor Gemini keys are set). Configure `AWS_REGION`, `BEDROCK_MODEL_ID`, and AWS credentials (or use an IAM role on EC2/ECS/Lambda). Uses the Bedrock **Converse** API (`@aws-sdk/client-bedrock-runtime`). Enable the model in the Bedrock console for your account/region. The repo default model ID is **`amazon.nova-micro-v1:0`** (Amazon Nova Micro — low on-demand cost for testing; change `BEDROCK_MODEL_ID` when you need stronger models).

2. **OpenAI** — `LLM_PROVIDER=openai`, `OPENAI_API_KEY`, optional `OPENAI_BASE_URL` / `OPENAI_MODEL`.

3. **Google Gemini** — `LLM_PROVIDER=gemini`, `GEMINI_API_KEY` from [Google AI Studio](https://aistudio.google.com/apikey), optional `GEMINI_MODEL`.

## Setup

There is **no committed `.env` file** (only [`.env.example`](.env.example)). Create one before running the API or Docker:

```bash
cd clarity-api
npm install
npm run setup:env    # copies .env.example → .env if .env does not exist yet
# edit .env — set AWS_* and BEDROCK_MODEL_ID for Bedrock (defaults in .env.example)
npm run dev
```

Manual equivalent: `cp .env.example .env`

Health check: `GET http://localhost:3000/health` — includes `llm.llmProviderResolved`, `llm.bedrockRegion`, `llm.bedrockModelId` (no secrets).

## Static UI

Serve [`../clarity-ui`](../clarity-ui) with any static server (VS Code Live Server, `npx serve clarity-ui`, etc.). The HTML files load `js/clarity-api.js` and set `window.CLARITY_API_BASE` (default `http://localhost:3000`). If you set `CLARITY_API_KEY` in `.env`, also set `window.CLARITY_API_KEY` in the page before loading `clarity-api.js`.

## Tests

```bash
npm test
```

## Docker (API + static UI)

From `clarity-api/` (expects `../clarity-ui` for the nginx volume):

```bash
npm run setup:env          # create .env from .env.example if missing
# edit .env — AWS credentials + Bedrock model (see .env.example)
docker compose up --build
```

Without a `.env` file, Compose only sees keys you **`export`** in the shell. Using `.env` next to `docker-compose.yml` is the usual approach.

- **API:** [http://localhost:3000/health](http://localhost:3000/health)
- **UI (examples):** [http://localhost:8080/index.html](http://localhost:8080/index.html) · [http://localhost:8080/grammar.html](http://localhost:8080/grammar.html) · [http://localhost:8080/link_analysis.html](http://localhost:8080/link_analysis.html)

The compose file sets `CORS_ORIGIN` for `http://localhost:8080` so the browser can call the API from the nginx-served pages. The HTML defaults `window.CLARITY_API_BASE` to `http://localhost:3000`, which matches this layout.

If you set `CLARITY_API_KEY` in `.env` or the environment, add before `clarity-api.js` on each page:

```html
<script>window.CLARITY_API_KEY = "same-secret";</script>
```

**API image only** (no UI service):

```bash
docker build -t clarity-api .
docker run --rm -p 3000:3000 \
  -e LLM_PROVIDER=bedrock \
  -e AWS_REGION=us-east-1 \
  -e AWS_ACCESS_KEY_ID=... \
  -e AWS_SECRET_ACCESS_KEY=... \
  -e BEDROCK_MODEL_ID=amazon.nova-micro-v1:0 \
  clarity-api
```

### Troubleshooting

- **`AccessDeniedException` on Bedrock** — Enable model access in the Bedrock console; confirm `BEDROCK_MODEL_ID` matches an allowed inference profile / model ARN for that region.
- **`LLM_PROVIDER` from your host** — Docker Compose substitutes `${VAR}` using your **shell environment**, which can override values in `clarity-api/.env`. If you see Gemini errors while using Bedrock, run `unset LLM_PROVIDER` (and `unset GEMINI_API_KEY` if empty) in the shell, then `docker compose up` again. The API also **falls back to Bedrock** when `LLM_PROVIDER=gemini` or `openai` is set but the matching key is missing.
- **Errors mentioning `set LLM_PROVIDER=openai and OPENAI_API_KEY`** — that text is from an **older API build**. Run `npm run build` locally, or **`docker compose build --no-cache clarity-api`** (then `docker compose up`) so the container runs the current Bedrock code.
- **`GOOGLE_API_KEY` alone** — with `LLM_PROVIDER` unset, only **`GEMINI_API_KEY`** selects Gemini automatically. If you use a Google AI Studio key in `GOOGLE_API_KEY`, set **`LLM_PROVIDER=gemini`** explicitly.
- **Stale `dist/`** — if you run `node dist/index.js` / Docker without rebuilding after a git pull, run `npm run build` or `docker compose build --no-cache`.
- **`GET /health`** — returns `llm: { llmProviderEnv, llmProviderResolved, hasGeminiKey, hasOpenaiKey, bedrockRegion, bedrockModelId }` so you can confirm which backend the process will call (no secrets).
