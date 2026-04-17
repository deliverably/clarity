# Clarity UI

Static HTML mockups wired to the Clarity API. Open any page through a local HTTP server so `fetch` is not blocked by `file://` CORS (or enable CORS for `null` origin in the API for local file use only).

## Pages

| File | Feature |
|------|---------|
| `index.html` | **End-to-end workflow** (main page → saved designs → studio with all 9 modules; analyses start when you save) |
| `grammar.html` | Spelling & grammar (01) |
| `link_analysis.html` | Link analysis (02) |
| `spamtrigger_list.html` / `spamtrigger_visual.html` | Spam triggers (03) |
| `multi-analysis.html` | Open/CTR, keywords, heatmap (04–06) |
| `content_analysis.html` | Design analysis (07) |
| `accessibilty.html` | Accessibility (08) |
| `html_analyzer.html` | HTML analyzer (09) |
| `main_list.html`, `main_image.html` | Shell / navigation reference |

## API base URL

Each wired page includes:

```html
<script>window.CLARITY_API_BASE = "http://localhost:3000";</script>
```

Optional API key:

```html
<script>window.CLARITY_API_KEY = "same-as-CLARITY_API_KEY";</script>
```

On **`index.html`**, module analyses run **one after another** with a **3s pause** after each request by default (helps with LLM rate limits). Override in the page (or console) with:

```html
<script>window.CLARITY_ANALYSIS_STAGGER_MS = 5000;</script>
```

`window.CLARITY_ANALYSIS_STAGGER_MS`: set **`0`** to remove the pause (old back-to-back timing, **still sequential** so only one in-flight request at a time).

## Run locally

```bash
npx --yes serve .
# open the printed local URL + /index.html (workflow) or /grammar.html (port is chosen by the static server)
```

## Docker (with API)

If you use the compose stack in [`../clarity-api/docker-compose.yml`](../clarity-api/docker-compose.yml), run **`npm run setup:env`** in `clarity-api/` first so a `.env` exists (only `.env.example` is in git), add **AWS credentials and `BEDROCK_MODEL_ID`** (see `clarity-api/.env.example`), then `docker compose up --build`. Open **http://localhost:8080/index.html** or **http://localhost:8080/grammar.html** — the UI talks to the API on port **3000** by default.
