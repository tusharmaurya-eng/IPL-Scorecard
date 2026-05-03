
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(cors());

// TV DISPLAY SERVER PATCH: allow quicker local loading on Android/Chromecast.
app.use((req,res,next)=>{
  if (req.url.startsWith("/assets/")) res.setHeader("Cache-Control","public, max-age=86400");
  else res.setHeader("Cache-Control","no-store");
  next();
});

const PORT = process.env.PORT || 3000;
const COMPETITION_ID = process.env.COMPETITION_ID || "3861";
const PUBLIC_DIR = path.join(__dirname, "public");
const DATA_FILE = path.join(PUBLIC_DIR, "live-data.json");

const ENDPOINTS = {
  fixturesResults: `https://livescoreapi.thehindu.com/api/cricket/grouped/fixtures/${COMPETITION_ID}`,
  points: `https://livescoreapi.thehindu.com/api/cricket/pointstable/${COMPETITION_ID}`,
  players: `https://livescoreapi.thehindu.com/api/cricket/top-three-players/${COMPETITION_ID}`
};

const headers = {
  "accept": "application/json, text/plain, */*",
  "origin": "https://www.thehindu.com",
  "referer": "https://www.thehindu.com/",
  "user-agent": "Mozilla/5.0 IPL-Live-TV-API/1.0"
};

let latest = {
  ok: false,
  updated_at: null,
  fixturesResults: null,
  points: null,
  players: null,
  errors: {}
};

async function fetchJson(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 7000);
  const res = await fetch(url, { headers, signal: ctrl.signal }).finally(() => clearTimeout(timer));
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch (e) {
    throw new Error(`Non-JSON response: ${text.slice(0, 160)}`);
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${JSON.stringify(json).slice(0, 220)}`);
  }
  return json;
}

async function downloadNow() {
  const next = {
    ok: true,
    updated_at: new Date().toISOString(),
    fixturesResults: latest.fixturesResults,
    points: latest.points,
    players: latest.players,
    errors: {}
  };

  for (const [key, url] of Object.entries(ENDPOINTS)) {
    try {
      next[key] = await fetchJson(url);
    } catch (e) {
      next.ok = false;
      next.errors[key] = e.message;
    }
  }

  // Attach extra match-centre detail if The Hindu exposes it. The page still works if these calls fail.
  // We keep all successful detail responses because current batters, bowler and ball-by-ball
  // are sometimes split across scorecard / match / commentary endpoints.
  try {
    const current = next.fixturesResults && next.fixturesResults.current_matches && next.fixturesResults.current_matches[0];
    if (current && current.game_id) {
      const detailCandidates = {
        scorecard: `https://livescoreapi.thehindu.com/api/cricket/scorecard/${current.game_id}`,
        match: `https://livescoreapi.thehindu.com/api/cricket/match/${current.game_id}`,
        commentary: `https://livescoreapi.thehindu.com/api/cricket/commentary/${current.game_id}`,
        ball_by_ball: `https://livescoreapi.thehindu.com/api/cricket/ball-by-ball/${current.game_id}`
      };
      current.live_details = current.live_details || {};
      for (const [key, url] of Object.entries(detailCandidates)) {
        try { current.live_details[key] = await fetchJson(url); } catch(_) {}
      }
    }
  } catch(_) {}

  latest = next;
  fs.writeFileSync(DATA_FILE, JSON.stringify(latest, null, 2), "utf8");
  console.log(`[${new Date().toLocaleTimeString()}] live data`, latest.ok ? "OK" : latest.errors);
  return latest;
}

app.use(express.static(PUBLIC_DIR));

app.get("/api/status", (req, res) => {
  res.json({
    ok: latest.ok,
    updated_at: latest.updated_at,
    errors: latest.errors,
    endpoints: ENDPOINTS
  });
});

app.get("/api/download-now", async (req, res) => {
  try {
    res.json(await downloadNow());
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

app.get("/api/fixtures-results", async (req, res) => {
  if (!latest.fixturesResults) await downloadNow();
  res.json(latest.fixturesResults || { api_error: true, message: "No fixtures data downloaded" });
});

app.get("/api/points", async (req, res) => {
  if (!latest.points) await downloadNow();
  res.json(latest.points || { api_error: true, message: "No points data downloaded" });
});

app.get("/api/players", async (req, res) => {
  if (!latest.players) await downloadNow();
  res.json(latest.players || { api_error: true, message: "No players data downloaded" });
});

downloadNow().catch(err => console.error("Initial download failed:", err.message));
setInterval(() => downloadNow().catch(err => console.error("Scheduled download failed:", err.message)), 60000);

app.listen(PORT, "0.0.0.0", () => {
  console.log(`IPL live API folder-assets build running on http://localhost:${PORT}`);
  console.log(`For TV/phone/ScreenCloud use: http://YOUR-COMPUTER-IP:${PORT}`);
});
