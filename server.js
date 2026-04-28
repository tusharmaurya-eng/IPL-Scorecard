import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.static(path.join(__dirname, "public")));

const SOURCE = {
  fixturesResults: "https://livescoreapi.thehindu.com/api/cricket/grouped/fixtures/3861",
  points: "https://livescoreapi.thehindu.com/api/cricket/pointstable/3861",
  players: "https://livescoreapi.thehindu.com/api/cricket/top-three-players/3861"
};

const cache = new Map();
const CACHE_MS = 20000;

async function getJson(key, url) {
  const cached = cache.get(key);
  const now = Date.now();

  if (cached && now - cached.time < CACHE_MS) return cached.data;

  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 CricketTV ScreenCloud",
      "Accept": "application/json, text/plain, */*",
      "Referer": "https://sportstar.thehindu.com/"
    }
  });

  if (!response.ok) throw new Error(key + " API failed HTTP " + response.status);
  const data = await response.json();
  cache.set(key, { time: now, data });
  return data;
}

app.get("/api/fixtures-results", async (req, res) => {
  try { res.json(await getJson("fixturesResults", SOURCE.fixturesResults)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/points", async (req, res) => {
  try { res.json(await getJson("points", SOURCE.points)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/players", async (req, res) => {
  try { res.json(await getJson("players", SOURCE.players)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/current-scorecard/:comp/:id/:slug", async (req, res) => {
  try {
    const { comp, id, slug } = req.params;
    const url = `https://livescoreapi.thehindu.com/api/cricket/current-scorecard/${comp}/${id}/${slug}`;
    res.json(await getJson(`current-scorecard-${comp}-${id}-${slug}`, url));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/scorecard/:comp/:id/:slug", async (req, res) => {
  try {
    const { comp, id, slug } = req.params;
    const url = `https://livescoreapi.thehindu.com/api/cricket/scorecard/${comp}/${id}/${slug}`;
    res.json(await getJson(`scorecard-${comp}-${id}-${slug}`, url));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/health", (req, res) => {
  res.json({ ok: true, message: "Cricket TV ScreenCloud ready" });
});

app.listen(PORT, () => {
  console.log("Open http://localhost:" + PORT);
});
