import express from "express";
import cors from "cors";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOUR_DATA_API = process.env.TOUR_DATA_API_URL || "https://tour-data-api-602700957663.us-central1.run.app";
const PORT = process.env.PORT || 8787;
const RUN_JOBS_API =
  "https://run.googleapis.com/v2/projects/liifecalling-academy/locations/us-central1/jobs/tour-campaign-orchestrator:run";

// On Cloud Run, fetch an ID token from the instance metadata server using the
// service's own attached identity — no credential file needed. Locally (no
// metadata server reachable) fall back to the already-authenticated gcloud
// CLI session, same pattern as orchestration_driver/run_campaign.py. Cached
// briefly since identity tokens are valid for ~1 hour and re-fetching per
// request would add real latency either way.
let cachedToken = null;
let cachedAt = 0;
const TOKEN_TTL_MS = 45 * 60 * 1000;

async function fetchMetadataServerToken() {
  const url = `http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience=${encodeURIComponent(TOUR_DATA_API)}`;
  const res = await fetch(url, {
    headers: { "Metadata-Flavor": "Google" },
    signal: AbortSignal.timeout(1000),
  });
  if (!res.ok) throw new Error(`metadata server returned ${res.status}`);
  return (await res.text()).trim();
}

async function getIdentityToken() {
  const now = Date.now();
  if (cachedToken && now - cachedAt < TOKEN_TTL_MS) return cachedToken;
  try {
    cachedToken = await fetchMetadataServerToken();
  } catch {
    cachedToken = execSync("gcloud auth print-identity-token").toString().trim();
  }
  cachedAt = now;
  return cachedToken;
}

// The Cloud Run Admin API (run.googleapis.com) is a Google API, not a
// service-to-service Cloud Run call — it needs an OAuth2 access token, not
// an audience-bound identity token (same access-vs-identity distinction
// documented in cloud_run/tour_data_api/CLAUDE.md for its own Vertex AI call).
let cachedAccessToken = null;
let cachedAccessTokenAt = 0;

async function fetchMetadataServerAccessToken() {
  const url = "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token";
  const res = await fetch(url, {
    headers: { "Metadata-Flavor": "Google" },
    signal: AbortSignal.timeout(1000),
  });
  if (!res.ok) throw new Error(`metadata server returned ${res.status}`);
  const body = await res.json();
  return body.access_token;
}

async function getAccessToken() {
  const now = Date.now();
  if (cachedAccessToken && now - cachedAccessTokenAt < TOKEN_TTL_MS) return cachedAccessToken;
  try {
    cachedAccessToken = await fetchMetadataServerAccessToken();
  } catch {
    cachedAccessToken = execSync("gcloud auth print-access-token").toString().trim();
  }
  cachedAccessTokenAt = now;
  return cachedAccessToken;
}

async function callTool(path, options = {}) {
  const res = await fetch(`${TOUR_DATA_API}${path}`, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${await getIdentityToken()}`,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${path} failed (${res.status}): ${text}`);
  }
  return res.json();
}

// In-memory read cache for the GET-only BigQuery lookups behind callTool().
// Every route here pays BigQuery's per-query job-orchestration floor
// (~0.5-0.7s, confirmed by direct timing) even for a single-row lookup, so a
// dashboard page load firing 3-6 of these in parallel/sequence was costing
// several real seconds. No new GCP resource: it's a plain Map living in this
// process's memory, cleared on every redeploy/restart and scoped per Cloud
// Run instance.
//
// TTL is deliberately NOT one global value. A first attempt used a flat 5s
// TTL, which turned out to be shorter than real human page-to-page browsing
// pace -- almost every real navigation was still a cold cache miss paying
// the full ~4s round trip, even though back-to-back automated calls looked
// fast. city_briefs is the one table that changes without any explicit
// invalidateCache() call (a Generate Briefs run flips status -> "final" in
// the background), so it keeps a short TTL matching the dashboard's
// GENERATION_POLL_MS (8s) poll cadence. Everything else here only changes on
// campaign creation, which already calls invalidateCache() explicitly, so it
// can safely cache far longer.
const SHORT_TTL_MS = 5000;
const LONG_TTL_MS = 5 * 60 * 1000;
const cache = new Map();

function ttlFor(path) {
  return path.startsWith("/city_briefs") ? SHORT_TTL_MS : LONG_TTL_MS;
}

function cacheGet(key) {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (Date.now() > hit.expiresAt) {
    cache.delete(key);
    return undefined;
  }
  return hit;
}

function cacheSet(key, entry) {
  cache.set(key, { ...entry, expiresAt: Date.now() + ttlFor(key) });
}

function invalidateCache() {
  cache.clear();
}

// Guards against firing the Generate Briefs job twice for the same campaign
// -- caught live in production: two Cloud Run Job executions started 30s
// apart for one campaign (a double-click, or a page reload racing the first
// click before isGenerating had a chance to reflect reality), each running
// the full 5-city pipeline independently and silently doubling real
// Dialogflow/Gemini/Parallel API costs for that run. TTL matches the job's
// own --task-timeout (1 hour) as a self-clearing safety net -- no callback
// exists from the job on completion, so this can't rely on being told when
// it's actually done. Same known scope as the read cache above: in-memory,
// per Cloud Run instance, resets on redeploy.
const GENERATION_LOCK_TTL_MS = 60 * 60 * 1000;
const inFlightGenerations = new Map();

function isGenerationInFlight(campaignId) {
  const expiresAt = inFlightGenerations.get(campaignId);
  if (!expiresAt) return false;
  if (Date.now() > expiresAt) {
    inFlightGenerations.delete(campaignId);
    return false;
  }
  return true;
}

async function cachedCallTool(path) {
  const hit = cacheGet(path);
  if (hit) {
    if (hit.isError) throw new Error(hit.error);
    return hit.data;
  }
  // Cache failures too (e.g. a 404 for a city/genre combo with no fan_signals
  // row) -- otherwise every request for a legitimately-missing record hits
  // BigQuery fresh every time, uncached, since the old version only wrote to
  // the cache on the success path.
  try {
    const data = await callTool(path);
    cacheSet(path, { data });
    return data;
  } catch (err) {
    cacheSet(path, { isError: true, error: String(err) });
    throw err;
  }
}

function artistTypeFor(campaignType) {
  return campaignType === "music_world_tour" ? "musician" : "film_cast";
}

function slugify(text) {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/campaigns", async (req, res) => {
  try {
    const result = await cachedCallTool("/campaigns_list");
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: String(err) });
  }
});

app.post("/api/campaigns", async (req, res) => {
  try {
    const { title, campaign_type, genre, talent_roster, stops, selected_metrics } = req.body;
    if (!title || !campaign_type || !genre || !Array.isArray(stops) || stops.length === 0) {
      res.status(400).json({ error: "title, campaign_type, genre, and at least one stop are required" });
      return;
    }

    const campaignId = `${slugify(title)}_${Date.now().toString(36)}`;

    await callTool("/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaign_id: campaignId,
        title,
        campaign_type,
        genre,
        talent_roster: talent_roster || [],
        selected_metrics: selected_metrics || [],
      }),
    });

    await callTool("/campaign_stops", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaign_id: campaignId,
        stops: stops.map((s, i) => ({ ...s, sequence_order: i + 1 })),
      }),
    });

    invalidateCache();
    res.json({ campaign_id: campaignId, status: "created" });
  } catch (err) {
    res.status(502).json({ error: String(err) });
  }
});

app.get("/api/campaigns/:campaignId/overview", async (req, res) => {
  try {
    const { campaignId } = req.params;
    const [campaign, stopsResp, briefsResp] = await Promise.all([
      cachedCallTool(`/campaigns?campaign_id=${encodeURIComponent(campaignId)}`),
      cachedCallTool(`/campaign_stops?campaign_id=${encodeURIComponent(campaignId)}`),
      cachedCallTool(`/city_briefs?campaign_id=${encodeURIComponent(campaignId)}`),
    ]);
    const briefByCity = Object.fromEntries(briefsResp.briefs.map((b) => [b.city_id, b]));

    const cities = await Promise.all(
      stopsResp.stops.map(async (stop) => {
        const brief = briefByCity[stop.city_id];
        if (brief) {
          return {
            ...stop,
            status: brief.status,
            enthusiasm_score: brief.enthusiasm_score,
            grounding_check_passed: brief.grounding_check_passed,
            delight_card_url: brief.delight_card_url,
          };
        }
        // No finalized brief yet — fall back to the raw fan signal so the
        // dashboard can still show a preview score for a pending city.
        try {
          const signal = await cachedCallTool(
            `/fan_signals?city_id=${stop.city_id}&genre=${encodeURIComponent(campaign.genre)}&artist_type=${artistTypeFor(campaign.campaign_type)}`
          );
          return { ...stop, status: "pending", enthusiasm_score: signal.enthusiasm_score, grounding_check_passed: null, delight_card_url: null };
        } catch {
          return { ...stop, status: "pending", enthusiasm_score: null, grounding_check_passed: null, delight_card_url: null };
        }
      })
    );

    res.json({ campaign, cities });
  } catch (err) {
    res.status(502).json({ error: String(err) });
  }
});

app.get("/api/campaigns/:campaignId/cities/:cityId", async (req, res) => {
  try {
    const { campaignId, cityId } = req.params;
    // campaign is fetched first because fanSignal's query needs its
    // genre/campaign_type -- but it's cache-backed (same TTL window the
    // dashboard's overview call already warmed), so this is a real extra
    // network round trip only on a cold cache, not on every click. Every
    // other lookup, fanSignal included, then runs as one true parallel
    // batch instead of the old design's fully sequential extra call.
    const campaign = await cachedCallTool(`/campaigns?campaign_id=${encodeURIComponent(campaignId)}`);
    const [stopsResp, cultureNotes, localDelight, briefsResp, fanSignal] = await Promise.all([
      cachedCallTool(`/campaign_stops?campaign_id=${encodeURIComponent(campaignId)}`),
      cachedCallTool(`/culture_notes?city_id=${encodeURIComponent(cityId)}`),
      cachedCallTool(`/local_delight?city_id=${encodeURIComponent(cityId)}`),
      cachedCallTool(`/city_briefs?campaign_id=${encodeURIComponent(campaignId)}&city_id=${encodeURIComponent(cityId)}`),
      cachedCallTool(
        `/fan_signals?city_id=${cityId}&genre=${encodeURIComponent(campaign.genre)}&artist_type=${artistTypeFor(campaign.campaign_type)}`
      ).catch(() => null),
    ]);
    const stop = stopsResp.stops.find((s) => s.city_id === cityId);
    const brief = briefsResp.briefs[0] || null;
    let demographicSnapshot = null;
    if (brief?.demographic_snapshot_json) {
      try {
        demographicSnapshot = JSON.parse(brief.demographic_snapshot_json);
      } catch {
        demographicSnapshot = null;
      }
    }

    res.json({
      campaign,
      stop,
      cultureNotes,
      localDelight,
      fanSignal,
      brief,
      demographicSnapshot,
    });
  } catch (err) {
    res.status(502).json({ error: String(err) });
  }
});

app.post("/api/campaigns/:campaignId/generate-briefs", async (req, res) => {
  try {
    const { campaignId } = req.params;
    if (isGenerationInFlight(campaignId)) {
      res.status(409).json({ error: "Briefs are already being generated for this campaign." });
      return;
    }
    // Fire-and-forget: the Admin API's :run call returns as soon as the job
    // execution has *started*, not once it finishes (real orchestration takes
    // several minutes per city) — so this responds immediately and the
    // dashboard polls the campaign overview to watch Pending flip to Final.
    const runRes = await fetch(RUN_JOBS_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${await getAccessToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        overrides: {
          containerOverrides: [{ env: [{ name: "CAMPAIGN_ID", value: campaignId }] }],
        },
      }),
    });
    if (!runRes.ok) {
      const text = await runRes.text();
      throw new Error(`job trigger failed (${runRes.status}): ${text}`);
    }
    const operation = await runRes.json();
    inFlightGenerations.set(campaignId, Date.now() + GENERATION_LOCK_TTL_MS);
    res.json({ status: "started", operation: operation.name });
  } catch (err) {
    res.status(502).json({ error: String(err) });
  }
});

app.post("/api/campaign-strategy-chat", async (req, res) => {
  try {
    const result = await callTool("/campaign_strategy_chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
    });
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: String(err) });
  }
});

app.post("/api/rank-cities", async (req, res) => {
  try {
    const result = await callTool("/rank_cities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
    });
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: String(err) });
  }
});

// Production: serve the built frontend and let client-side routing handle the rest.
// Vite's hashed asset filenames (index-<hash>.js/css) are safe to cache forever —
// a new deploy always produces new hashes. index.html is not: it's the only thing
// pointing at those hashes, so a browser tab left open across a redeploy must
// always refetch it, or it'll reference asset files that no longer exist (Express's
// catch-all below would then silently serve index.html *as* the missing asset,
// producing a blank unstyled page instead of an honest 404 — this happened for
// real during 2026-08-05 verification, caught via a stale cached tab).
const distDir = path.join(__dirname, "..", "dist");
app.use(
  express.static(distDir, {
    index: false,
    setHeaders: (res, filePath) => {
      if (path.basename(filePath) !== "index.html") {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      }
    },
  })
);
app.get(/(.*)/, (_req, res) => {
  res.setHeader("Cache-Control", "no-cache");
  res.sendFile(path.join(distDir, "index.html"));
});

app.listen(PORT, () => {
  console.log(`BFF listening on :${PORT}, proxying to ${TOUR_DATA_API}`);
});
