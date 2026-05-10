
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;
const COMPETITION_ID = process.env.COMPETITION_ID || '3861';
const PUBLIC_DIR = path.join(__dirname, 'public');
const BASE = 'https://livescoreapi.thehindu.com/api/cricket';

const URLS = {
  fixtures: `${BASE}/grouped/fixtures/${COMPETITION_ID}`,
  points: `${BASE}/pointstable/${COMPETITION_ID}`,
  players: `${BASE}/top-three-players/${COMPETITION_ID}`
};

const browserHeaders = {
  'accept': 'application/json, text/plain, */*',
  'accept-language': 'en-US,en;q=0.9,hi;q=0.8',
  'origin': 'https://www.thehindu.com',
  'referer': 'https://www.thehindu.com/',
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
};

let cache = {
  fixtures: null,
  points: null,
  players: null,
  rawScorecard: null,
  rawMatchcentre: null,
  liveScore: null,
  liveUrl: null,
  updatedAt: null,
  errors: {}
};

function normalizeTeamCode(v) {
  const s = String(v || '').trim().toUpperCase();
  const map = {
    'ROYAL CHALLENGERS BENGALURU':'RCB','ROYAL CHALLENGERS BANGALORE':'RCB','BENGALURU':'RCB','BANGALORE':'RCB','RCB':'RCB',
    'LUCKNOW SUPER GIANTS':'LSG','LUCKNOW':'LSG','LSG':'LSG',
    'CHENNAI SUPER KINGS':'CSK','CHENNAI':'CSK','CSK':'CSK',
    'DELHI CAPITALS':'DC','DELHI':'DC','DCA':'DC','DC':'DC',
    'GUJARAT TITANS':'GT','GUJARAT':'GT','GUT':'GT','GT':'GT',
    'KOLKATA KNIGHT RIDERS':'KKR','KOLKATA':'KKR','KKR':'KKR',
    'MUMBAI INDIANS':'MI','MUMBAI':'MI','MIN':'MI','MI':'MI',
    'PUNJAB KINGS':'PBKS','PUNJAB':'PBKS','PNK':'PBKS','PBKS':'PBKS',
    'RAJASTHAN ROYALS':'RR','RAJASTHAN':'RR','RJR':'RR','RR':'RR',
    'SUNRISERS HYDERABAD':'SRH','HYDERABAD':'SRH','SRH':'SRH'
  };
  return map[s] || s;
}

async function fetchJson(url, timeoutMs = 9000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res, text;
  try {
    res = await fetch(url, { headers: browserHeaders, signal: ctrl.signal, cache: 'no-store' });
    text = await res.text();
  } finally {
    clearTimeout(timer);
  }
  let json;
  try { json = JSON.parse(text); }
  catch (e) { throw new Error(`Non-JSON from ${url}: ${String(text).slice(0, 180)}`); }
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}: ${JSON.stringify(json).slice(0, 220)}`);
  return json;
}

function unwrapData(x) {
  // Fixtures are normally direct. Scorecard is wrapped in data.scorecard.data[0].
  if (!x) return x;
  if (x.data && x.data.scorecard) return x;
  if (x.data && (x.data.current_matches || x.data.upcoming_matches || x.data.results)) return x.data;
  return x;
}

function scorecardMatch(raw) {
  return raw?.data?.scorecard?.data?.[0] || raw?.scorecard?.data?.[0] || raw?.data?.[0] || null;
}

function buildScorecardUrl(matchCenterUrl) {
  if (!matchCenterUrl) return null;
  let u = String(matchCenterUrl).trim();
  if (!u || u.includes('google.com/calendar')) return null;
  u = u.split('#')[0].replace(/\/+$/, '');
  try {
    if (u.startsWith('http')) {
      const parsed = new URL(u);
      u = parsed.pathname.replace(/\/+$/, '');
    }
  } catch (_) {}
  if (!u.startsWith('/')) u = '/' + u;
  u = u.replace('/cricket/matchcentre/', '/cricket/scorecard/');
  if (u.startsWith('/cricket/scorecard/')) {
    return `https://livescoreapi.thehindu.com/api${u}`;
  }
  if (u.startsWith('/scorecard/')) {
    return `${BASE}${u}`;
  }
  return null;
}

function buildMatchcentreUrl(matchCenterUrl) {
  if (!matchCenterUrl) return null;
  let u = String(matchCenterUrl).trim();
  if (!u || u.includes('google.com/calendar')) return null;
  u = u.split('#')[0].replace(/\/+$/, '');
  try {
    if (u.startsWith('http')) {
      const parsed = new URL(u);
      u = parsed.pathname.replace(/\/+$/, '');
    }
  } catch (_) {}
  if (!u.startsWith('/')) u = '/' + u;
  u = u.replace('/cricket/scorecard/', '/cricket/matchcentre/');
  if (u.startsWith('/cricket/matchcentre/')) {
    return `https://livescoreapi.thehindu.com/api${u}`;
  }
  if (u.startsWith('/matchcentre/')) {
    return `${BASE}${u}`;
  }
  return null;
}

function oversToBalls(overs) {
  if (overs === null || overs === undefined || overs === '') return 0;
  const [o,b] = String(overs).split('.');
  return (Number(o) || 0) * 6 + (Number(b) || 0);
}
function ballsToOvers(balls) {
  balls = Number(balls || 0);
  return `${Math.floor(balls / 6)}.${balls % 6}`;
}
function fmtOvers(overs) {
  if (overs === null || overs === undefined || overs === '') return '0.0 Overs';
  return `${overs} Overs`;
}
function playerNameFrom(obj, key) {
  const arr = obj?.[key] || obj?.player_ids || obj?.batsman_ids || obj?.bowler_ids || [];
  const p = Array.isArray(arr) ? arr[0] : arr;
  return p?.player_name || [p?.player_first_name, p?.player_last_name].filter(Boolean).join(' ') || obj?.player_name || obj?.name || '---';
}
function teamFromInnings(inn) {
  const t = (inn?.battingteams && inn.battingteams[0]) || {};
  return {
    id: inn?.battingteam || t.opta_team_id || t.team_id || null,
    name: t.team_full_name || t.team_name || String(inn?.battingteam || ''),
    code: normalizeTeamCode(t.team_short_name || t.team_name || t.team_full_name || '')
  };
}
function inningsToResult(inn, index) {
  const T = inn?.Total || {};
  return {
    innings: Number(inn?.innigsid || index + 1),
    batting_team_id: inn?.battingteam,
    bowling_team_id: inn?.bowlingteam,
    score_info: {
      runs_scored: Number(T.runs_scored || 0),
      wickets: Number(T.wickets || 0),
      overs: T.overs ?? 0,
      balls: oversToBalls(T.overs ?? 0)
    }
  };
}
function batsmanToCurrent(b) {
  return {
    name: playerNameFrom(b, 'batsman_ids') + (Number(b?.on_strike) === 1 ? ' *' : ''),
    player_name: playerNameFrom(b, 'batsman_ids') + (Number(b?.on_strike) === 1 ? ' *' : ''),
    player_id: b?.batsman_id,
    runs: b?.runs_scored ?? 0,
    runs_scored: b?.runs_scored ?? 0,
    balls: b?.balls_faced ?? 0,
    balls_faced: b?.balls_faced ?? 0,
    fours: b?.fours_scored ?? 0,
    sixes: b?.sixes_scored ?? 0,
    on_strike: Number(b?.on_strike) === 1,
    non_strike: Number(b?.non_strike) === 1
  };
}
function bowlerToCurrent(b) {
  const overs = `${b?.overs_bowled ?? 0}.${b?.balls_bowled ?? 0}`;
  const runs = b?.runs_conceded ?? 0;
  const wk = b?.wickets_taken ?? 0;
  const balls = oversToBalls(overs);
  const economy = balls ? ((Number(runs) * 6) / balls).toFixed(2) : '0.00';
  return {
    name: playerNameFrom(b, 'bowler_ids'),
    player_name: playerNameFrom(b, 'bowler_ids'),
    player_id: b?.bowler_id,
    overs,
    overs_bowled: overs,
    maidens: b?.maidens_bowled ?? 0,
    maidens_bowled: b?.maidens_bowled ?? 0,
    runs,
    runs_conceded: runs,
    wickets: wk,
    wickets_taken: wk,
    economy,
    figures: `${overs}-${b?.maidens_bowled ?? 0}-${runs}-${wk}`,
    on_strike: Number(b?.on_strike) === 1
  };
}


function runToken(v) {
  const s = String(v ?? '').trim().toLowerCase();
  if (!s) return '';
  if (['0','zero','dot','dot ball','no run','no runs'].includes(s)) return '0';
  if (['1','one','single'].includes(s)) return '1';
  if (['2','two'].includes(s)) return '2';
  if (['3','three'].includes(s)) return '3';
  if (['4','four','boundary'].includes(s)) return '4';
  if (['6','six'].includes(s)) return '6';
  if (s.includes('wicket') || s.includes('catch') || s.includes('caught') || s.includes('bowled') || s.includes('stumped') || s.includes('lbw') || s.includes('run out')) return 'W';
  if (s.includes('wide')) return 'WD';
  if (s.includes('no_ball') || s.includes('no ball') || s === 'nb') return 'NB';
  if (s.includes('leg_bye') || s.includes('leg bye')) return 'LB';
  if (s === 'bye' || s === 'byes') return 'B';
  return s.toUpperCase().replace(/\s+/g, ' ');
}

function normalizeBallRuns(runs) {
  if (!Array.isArray(runs)) return [];
  return runs
    .filter(x => x && String(x.run ?? '').trim() !== '')
    .sort((a,b) => Number(String(a.ball || '0').split('.')[1] || 0) - Number(String(b.ball || '0').split('.')[1] || 0))
    .map(x => runToken(x.run))
    .filter(Boolean);
}

function extractCurrentOver(rawScorecard, rawMatchcentre) {
  const roots = [rawMatchcentre, rawMatchcentre?.data, rawScorecard, rawScorecard?.data].filter(Boolean);

  // Best source: matchcentre timeline [{overs, runs:[{run, ball}]}]
  for (const root of roots) {
    const timelines = [];
    (function walk(o){
      if (!o || typeof o !== 'object') return;
      if (Array.isArray(o)) {
        if (o.length && o.some(x => x && typeof x === 'object' && Array.isArray(x.runs) && (x.overs !== undefined || x.over !== undefined))) timelines.push(o);
        o.forEach(walk);
        return;
      }
      Object.values(o).forEach(walk);
    })(root);
    for (const tl of timelines) {
      const candidates = tl
        .filter(x => Array.isArray(x.runs))
        .map(x => ({ over:Number(x.overs ?? x.over ?? -1), balls:normalizeBallRuns(x.runs) }))
        .filter(x => Number.isFinite(x.over) && x.balls.length)
        .sort((a,b)=>a.over-b.over);
      if (candidates.length) return candidates[candidates.length - 1].balls.slice(-8);
    }
  }

  // Second source: bowler.thisover.runs from matchcentre.
  const bowlerArrays = [];
  for (const root of roots) {
    (function walk(o){
      if (!o || typeof o !== 'object') return;
      if (Array.isArray(o)) {
        if (o.length && o.some(x => x && typeof x === 'object' && x.thisover && Array.isArray(x.thisover.runs))) bowlerArrays.push(o);
        o.forEach(walk);
        return;
      }
      Object.values(o).forEach(walk);
    })(root);
  }
  const bowlerCandidates = [];
  for (const arr of bowlerArrays) {
    for (const b of arr) {
      const balls = normalizeBallRuns(b?.thisover?.runs);
      if (balls.length) bowlerCandidates.push({ over:Number(b.thisover.overs ?? -1), on:Number(b.onstrike ?? b.on_strike ?? 0), balls });
    }
  }
  bowlerCandidates.sort((a,b)=>(a.over-b.over) || (a.on-b.on));
  if (bowlerCandidates.length) return bowlerCandidates[bowlerCandidates.length - 1].balls.slice(-8);

  // Third source: commentary entries with type + over_num.
  const commentaryArrays = [];
  for (const root of roots) {
    (function walk(o){
      if (!o || typeof o !== 'object') return;
      if (Array.isArray(o)) {
        if (o.length && o.some(x => x && typeof x === 'object' && (x.over_num || x.type || x.message_text))) commentaryArrays.push(o);
        o.forEach(walk);
        return;
      }
      Object.values(o).forEach(walk);
    })(root);
  }
  for (const arr of commentaryArrays) {
    const balls = arr
      .filter(x => x && x.over_num && String(x.over_num).includes('.') && String(x.type || '').trim())
      .map(x => ({ over:Math.floor(Number(x.over_num)), ball:Number(String(x.over_num).split('.')[1] || 0), token:runToken(x.type) }))
      .filter(x => Number.isFinite(x.over) && x.ball > 0 && x.token)
      .sort((a,b)=>a.over-b.over || a.ball-b.ball);
    if (balls.length) {
      const lastOver = balls[balls.length - 1].over;
      return balls.filter(x => x.over === lastOver).map(x => x.token).slice(-8);
    }
  }

  return [];
}


function extractCurrentOverWithSource(rawMatchcentre) {
  // The scorecard API does not contain delivery-by-delivery current-over balls.
  // Current-over balls must come from the matchcentre companion API:
  // timeline[].runs[] OR bowlers[].thisover.runs OR commentary[].type + over_num.
  const balls = extractCurrentOver(null, rawMatchcentre);
  return {
    balls,
    source: balls.length ? 'matchcentre' : 'none'
  };
}

function pickActiveInnings(innings) {
  if (!Array.isArray(innings) || !innings.length) return null;
  // Active is the latest innings with score. In completed match, this is still second innings.
  return [...innings].filter(i => i?.Total).sort((a,b) => Number(b.innigsid || 0) - Number(a.innigsid || 0))[0] || innings[innings.length - 1];
}

function parseNeedFromResult(text, secondRuns) {
  const s = String(text || '');
  const m = s.match(/need\s+(\d+)\s+runs?.*?from\s+(\d+)\.(\d+)\s+overs?/i);
  if (!m) return null;
  const need = Number(m[1]);
  const ballsLeft = Number(m[2]) * 6 + Number(m[3]);
  return { need, ballsLeft, target: Number(secondRuns || 0) + need };
}

function normalizeScorecard(raw, fixtureMatch, rawMatchcentre = null) {
  const match = scorecardMatch(raw);
  if (!match) return null;
  const innings = Array.isArray(match.innings) ? [...match.innings].sort((a,b)=>Number(a.innigsid||0)-Number(b.innigsid||0)) : [];
  const first = innings[0] || null;
  const second = innings[1] || null;
  const active = pickActiveInnings(innings);
  const firstTeam = teamFromInnings(first || {});
  const secondTeam = teamFromInnings(second || {});
  const firstT = first?.Total || {};
  const secondT = second?.Total || {};
  const score = T => T ? `${Number(T.runs_scored || 0)}/${Number(T.wickets || 0)}` : '---/---';
  const activeT = active?.Total || {};
  const resultText = match?.results?.result_text || fixtureMatch?.match_status || fixtureMatch?.toss_status || '';
  const parsedNeed = parseNeedFromResult(resultText, secondT?.runs_scored || 0);
  const firstRuns = Number(firstT.runs_scored || 0);
  const secondRuns = Number(secondT.runs_scored || 0);
  const target = parsedNeed?.target || (first ? firstRuns + 1 : '--');
  const totalOvers = Number(match.total_overs || fixtureMatch?.total_overs || 20);
  const secondBalls = oversToBalls(secondT.overs || 0);
  const ballsLeft = parsedNeed?.ballsLeft ?? Math.max(0, totalOvers * 6 - secondBalls);
  const need = parsedNeed?.need ?? (second ? Math.max(0, Number(target) - secondRuns) : null);
  const activeBalls = oversToBalls(activeT.overs || 0);
  const crr = activeBalls ? ((Number(activeT.runs_scored || 0) * 6) / activeBalls).toFixed(2) : '0.00';
  const rrr = need !== null && ballsLeft > 0 ? ((need * 6) / ballsLeft).toFixed(2) : '0.00';

  let batters = [];
  if (active?.batsmen) {
    batters = active.batsmen.filter(b => Number(b.on_strike) === 1 || Number(b.non_strike) === 1)
      .sort((a,b)=>Number(b.on_strike || 0)-Number(a.on_strike || 0))
      .map(batsmanToCurrent);
    if (batters.length < 2) {
      const notOut = active.batsmen.filter(b => Number(b.dismissal_id) === 0 || /not out/i.test(String(b.how_out || ''))).slice(-2).map(batsmanToCurrent);
      batters = batters.length ? batters : notOut;
    }
  }
  const bowlerRaw = (active?.bowlers || []).find(b => Number(b.on_strike) === 1) || (active?.bowlers || [])[0];
  const bowler = bowlerRaw ? bowlerToCurrent(bowlerRaw) : null;
  const overInfo = extractCurrentOverWithSource(rawMatchcentre);

  const normalized = {
    liveActive: true,
    competition: match.competetions?.[0]?.comp_name || fixtureMatch?.comp_name || 'TATA IPL 2026',
    match: fixtureMatch?.match_full_name || match.description || fixtureMatch?.match_name || 'Live Match',
    status: match.gamestatus?.[0]?.game_status_name || fixtureMatch?.game_status?.game_status_name || 'Live',
    matchStatus: resultText,
    summary: resultText || `${firstTeam.code} ${score(firstT)} • ${secondTeam.code} ${second ? score(secondT) : 'Yet To Bat'}`,
    tossText: match.toss?.toss_text || fixtureMatch?.toss_status || '',
    team1: secondTeam.name || fixtureMatch?.teams?.[1]?.team_name || '',
    code1: secondTeam.code || normalizeTeamCode(fixtureMatch?.teams?.[1]?.team_short_name || ''),
    score1: second ? score(secondT) : 'Yet To Bat',
    overs1: second ? fmtOvers(secondT.overs) : '',
    team2: firstTeam.name || fixtureMatch?.teams?.[0]?.team_name || '',
    code2: firstTeam.code || normalizeTeamCode(fixtureMatch?.teams?.[0]?.team_short_name || ''),
    score2: first ? score(firstT) : '---/---',
    overs2: first ? fmtOvers(firstT.overs) : '--- Overs',
    firstInnings: {
      team: firstTeam.name,
      code: firstTeam.code,
      score: first ? score(firstT) : '---/---',
      overs: first ? fmtOvers(firstT.overs) : '--- Overs'
    },
    secondInnings: {
      team: secondTeam.name,
      code: secondTeam.code,
      score: second ? score(secondT) : 'Yet To Bat',
      overs: second ? fmtOvers(secondT.overs) : ''
    },
    target: target === '--' ? '--' : String(target),
    need: need === null ? '---' : `${need} Runs`,
    ballsLeft: `${ballsLeft} Balls Left`,
    crr,
    rrr,
    batters: batters.slice(0,2).map(b => ({ name:b.name, runs:String(b.runs), balls:String(b.balls), player_id:b.player_id })),
    current_batters: batters,
    bowler: bowler ? { name:bowler.name, figures:bowler.figures, economy:bowler.economy, player_id:bowler.player_id } : {name:'---', figures:'---', economy:''},
    current_bowler: bowler,
    partnership: '---',
    currentOver: (overInfo.balls.length ? overInfo.balls : ['-','-','-','-','-','-']),
    current_over: overInfo.balls,
    currentOverSource: overInfo.source,
    innings: innings.map((inn,i)=>({
      innings: Number(inn.innigsid || i+1),
      team: teamFromInnings(inn),
      total: inn.Total,
      score: score(inn.Total),
      overs: fmtOvers(inn.Total?.overs)
    }))
  };

  return {
    match,
    normalized,
    scoreResults: innings.map(inningsToResult),
    activeInnings: active,
    currentBatters: batters,
    currentBowler: bowler
  };
}

function enrichFixtureMatchWithScorecard(fixtureMatch, rawScorecard, rawMatchcentre = null) {
  const decoded = normalizeScorecard(rawScorecard, fixtureMatch, rawMatchcentre);
  if (!decoded) return fixtureMatch;
  const m = { ...fixtureMatch };
  m.results = decoded.scoreResults;
  m.normalized_live = decoded.normalized;
  m.current_batters = decoded.currentBatters;
  m.current_bowler = decoded.currentBowler;
  m.batters = decoded.currentBatters;
  m.batsmen = decoded.currentBatters;
  m.bowler = decoded.currentBowler;
  m.match_status = decoded.normalized.summary;
  m.toss_status = decoded.normalized.tossText || m.toss_status;
  return m;
}

function currentMatchFromFixtures(fixtures) {
  const arr = fixtures?.current_matches || [];
  if (!arr.length) return null;
  return arr.find(m => buildScorecardUrl(m.match_center_url)) || arr[0];
}

async function refresh() {
  const errors = {};
  let fixtures = null, points = cache.points, players = cache.players, rawScorecard = null, rawMatchcentre = null, liveScore = null, liveUrl = null, matchcentreUrl = null;

  try { fixtures = unwrapData(await fetchJson(URLS.fixtures)); }
  catch (e) { errors.fixtures = e.message; fixtures = cache.fixtures; }

  try { points = unwrapData(await fetchJson(URLS.points)); }
  catch (e) { errors.points = e.message; }

  try { players = unwrapData(await fetchJson(URLS.players)); }
  catch (e) { errors.players = e.message; }

  try {
    const cm = currentMatchFromFixtures(fixtures);
    liveUrl = buildScorecardUrl(cm?.match_center_url);
    matchcentreUrl = buildMatchcentreUrl(cm?.match_center_url);
    if (liveUrl) {
      rawScorecard = await fetchJson(liveUrl);
      if (matchcentreUrl) {
        try { rawMatchcentre = await fetchJson(matchcentreUrl, 7000); }
        catch (e) { errors.matchcentre = `Ball-by-ball source failed: ${e.message}`; }
      }
      liveScore = normalizeScorecard(rawScorecard, cm, rawMatchcentre);
      if (fixtures?.current_matches?.length && liveScore) {
        fixtures = { ...fixtures, current_matches: fixtures.current_matches.map((m,i) => {
          const isSame = String(m.game_id) === String(cm.game_id) || i === 0;
          return isSame ? enrichFixtureMatchWithScorecard(m, rawScorecard, rawMatchcentre) : m;
        }) };
      }
    } else if (cm) {
      errors.scorecard = 'Current match has not started yet. match_center_url is still calendar or not scorecard-ready.';
    } else {
      errors.scorecard = 'No current match in fixtures API.';
    }
  } catch (e) { errors.scorecard = e.message; }

  cache = { fixtures, points, players, rawScorecard, rawMatchcentre, liveScore, liveUrl, matchcentreUrl, updatedAt: new Date().toISOString(), errors };
  return cache;
}

app.use((req,res,next)=>{
  if (req.url.startsWith('/assets/')) res.setHeader('Cache-Control','public, max-age=86400');
  else res.setHeader('Cache-Control','no-store');
  next();
});
app.use(express.static(PUBLIC_DIR));

app.get('/api/status', async (req,res)=>{
  if (!cache.updatedAt) await refresh().catch(()=>{});
  res.json({ ok: !cache.errors || Object.keys(cache.errors).length === 0 || !!cache.fixtures, updatedAt: cache.updatedAt, liveUrl: cache.liveUrl, matchcentreUrl: cache.matchcentreUrl, errors: cache.errors, endpoints: URLS });
});
app.get('/api/refresh', async (req,res)=>{
  try { res.json(await refresh()); } catch(e) { res.status(500).json({api_error:true,message:e.message}); }
});
app.get('/api/fixtures-results', async (req,res)=>{
  if (!cache.fixtures) await refresh().catch(()=>{});
  res.json(cache.fixtures || {api_error:true, message:'No fixtures data available', errors:cache.errors});
});
app.get('/api/current-match', async (req,res)=>{
  if (!cache.fixtures) await refresh().catch(()=>{});
  res.json(currentMatchFromFixtures(cache.fixtures) || {api_error:true, message:'No current match'});
});
app.get('/api/live-score', async (req,res)=>{
  if (!cache.liveScore) await refresh().catch(()=>{});
  if (!cache.liveScore) return res.json({api_error:true, message:'No scorecard live data yet', liveUrl:cache.liveUrl, errors:cache.errors});
  res.json({ ok:true, liveUrl:cache.liveUrl, matchcentreUrl:cache.matchcentreUrl, updatedAt:cache.updatedAt, normalized:cache.liveScore.normalized, rawDecoded: { currentBatters: cache.liveScore.currentBatters, currentBowler: cache.liveScore.currentBowler, innings: cache.liveScore.normalized.innings, currentOver: cache.liveScore.normalized.currentOver, currentOverSource: cache.liveScore.normalized.currentOverSource } });
});
app.get('/api/raw-scorecard', async (req,res)=>{
  if (!cache.rawScorecard) await refresh().catch(()=>{});
  res.json(cache.rawScorecard || {api_error:true, message:'No raw scorecard data yet', liveUrl:cache.liveUrl, errors:cache.errors});
});
app.get('/api/raw-matchcentre', async (req,res)=>{
  if (!cache.rawMatchcentre) await refresh().catch(()=>{});
  res.json(cache.rawMatchcentre || {api_error:true, message:'No raw matchcentre ball-by-ball data yet', matchcentreUrl:cache.matchcentreUrl, errors:cache.errors});
});
app.get('/api/points', async (req,res)=>{
  if (!cache.points) await refresh().catch(()=>{});
  res.json(cache.points || {api_error:true, message:'No points data available'});
});
app.get('/api/players', async (req,res)=>{
  if (!cache.players) await refresh().catch(()=>{});
  res.json(cache.players || {api_error:true, message:'No players data available'});
});

refresh().then(()=>console.log('Initial cricket data loaded')).catch(e=>console.error('Initial refresh failed:', e.message));
setInterval(()=>refresh().catch(e=>console.error('Scheduled refresh failed:', e.message)), Number(process.env.REFRESH_MS || 30000));

app.listen(PORT, '0.0.0.0', ()=>{
  console.log(`IPL TV desktop Node scorecard build running at http://localhost:${PORT}`);
  console.log(`Open http://localhost:${PORT}/api/status to verify liveUrl and errors.`);
});
