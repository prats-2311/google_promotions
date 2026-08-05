# dashboard — frontend conventions

React 19 + TypeScript + Vite, Tailwind v4 (CSS-first `@theme` config in `src/index.css` — no `tailwind.config.js`), lucide-react, framer-motion, react-router-dom 7.18.1+ (pinned above the RSC-CSRF advisory range — moot anyway, this is a plain client-rendered SPA, no SSR/RSC in use).

## Design system — non-negotiable, already decided
- Deliberately not generic SaaS. Dark "cinema ops room" canvas shell (single committed aesthetic — **no light/dark toggle**) holding warm "paper" (cue-card) content surfaces. Fraunces (serif, self-hosted via `@fontsource`) for display type, Inter for UI.
- Per-city categorical accent palette (`src/lib/cityTheme.ts`) **must pass the dataviz skill's `validate_palette.js`** (lightness band, chroma floor, CVD separation via OKLab ΔE, contrast vs. surface) before use — hand-picked hex values have already failed this once. Two variants exist (`cityAccent` for dark-canvas contexts, `cityAccentOnPaper` for paper-card contexts) since the same hue needs different lightness steps to pass contrast on each surface.
- Bar/mark specs also follow the dataviz skill: rounded data-end (`rounded-r-[4px]`), square baseline — not `rounded-full`/pill shapes.

## Architecture: BFF pattern
`server/index.js` is a thin Express BFF proxying the browser to `tour_data_api` (Cloud Run, requires auth) — **the browser never sees GCP credentials**. `getIdentityToken()` tries the Cloud Run instance metadata server first (production), falls back to `gcloud auth print-identity-token` (local dev, no metadata server reachable — fails fast via a 1s `AbortSignal.timeout`) — same code runs unmodified in both environments. Don't add a separate local-only auth path; extend this fallback chain instead if a new environment needs supporting.

- Dev: `npm run dev` (Vite, :5173) + `npm run server` (BFF, :8787, Vite proxies `/api` to it).
- Production: `npm run build` then `npm start` serves the built static files and `/api/*` from one Express process.
- Deploy: `gcloud run deploy tour-dashboard --source=dashboard/ --region=us-central1 --project=liifecalling-academy --service-account=dashboard-sa@liifecalling-academy.iam.gserviceaccount.com --set-build-env-vars=PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 --allow-unauthenticated` (public is intentional — this is the demo UI itself, the hackathon's required "hosted project URL"). The Playwright skip-download flag keeps Chromium out of the deployed container's build (Playwright itself is a harmless devDependency kept for UI verification).

## "Gemini thinking" trace — honest data note
`ThinkingTrace.tsx` is the click-to-expand reasoning panel (matches the Claude/Gemini chat UI pattern). The raw `detectIntent` conversation trace isn't persisted per-brief in BigQuery (the driver only holds it transiently in memory during a run) — `src/lib/deriveTrace.ts` **reconstructs** a factual step sequence from what each brief's real data actually implies (real tool order, real grounding-check notes, the real inserted `brief_id`), framed as "How this brief was generated," never presented as a verbatim captured transcript. If persisting the real trace ever becomes worth it, `orchestration_driver/run_campaign.py`'s `_actions()` output is the real source to capture and store — don't fabricate a more detailed trace than the data actually supports.

## Screens
Campaign Dashboard (city grid, live enthusiasm scores) → City Detail (3 tabs: Culture Intelligence / Delight Card / Talent Brief) → Compare Cities (ranked bar chart + table toggle, calls the real `rank_cities` tool). All populated from live `tour_data_api` data — never mocked.
