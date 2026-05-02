
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(cors());

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
  const res = await fetch(url, { headers });
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
setInterval(() => downloadNow().catch(err => console.error("Scheduled download failed:", err.message)), 15000);

app.listen(PORT, "0.0.0.0", () => {
  console.log(`IPL live API build running on http://localhost:${PORT}`);
  console.log(`For TV/phone/ScreenCloud use: http://YOUR-COMPUTER-IP:${PORT}`);
});
