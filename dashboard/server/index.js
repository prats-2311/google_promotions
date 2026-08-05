import express from "express";
import cors from "cors";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOUR_DATA_API = process.env.TOUR_DATA_API_URL || "https://tour-data-api-602700957663.us-central1.run.app";
const PORT = process.env.PORT || 8787;

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
    const result = await callTool("/campaigns_list");
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: String(err) });
  }
});

app.post("/api/campaigns", async (req, res) => {
  try {
    const { title, campaign_type, genre, talent_roster, stops } = req.body;
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

    res.json({ campaign_id: campaignId, status: "created" });
  } catch (err) {
    res.status(502).json({ error: String(err) });
  }
});

app.get("/api/campaigns/:campaignId/overview", async (req, res) => {
  try {
    const { campaignId } = req.params;
    const [campaign, stopsResp, briefsResp] = await Promise.all([
      callTool(`/campaigns?campaign_id=${encodeURIComponent(campaignId)}`),
      callTool(`/campaign_stops?campaign_id=${encodeURIComponent(campaignId)}`),
      callTool(`/city_briefs?campaign_id=${encodeURIComponent(campaignId)}`),
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
          const signal = await callTool(
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
    const [campaign, stopsResp, cultureNotes, localDelight, briefsResp] = await Promise.all([
      callTool(`/campaigns?campaign_id=${encodeURIComponent(campaignId)}`),
      callTool(`/campaign_stops?campaign_id=${encodeURIComponent(campaignId)}`),
      callTool(`/culture_notes?city_id=${encodeURIComponent(cityId)}`),
      callTool(`/local_delight?city_id=${encodeURIComponent(cityId)}`),
      callTool(`/city_briefs?campaign_id=${encodeURIComponent(campaignId)}&city_id=${encodeURIComponent(cityId)}`),
    ]);
    const stop = stopsResp.stops.find((s) => s.city_id === cityId);
    const fanSignal = await callTool(
      `/fan_signals?city_id=${cityId}&genre=${encodeURIComponent(campaign.genre)}&artist_type=${artistTypeFor(campaign.campaign_type)}`
    ).catch(() => null);

    res.json({
      campaign,
      stop,
      cultureNotes,
      localDelight,
      fanSignal,
      brief: briefsResp.briefs[0] || null,
    });
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
