# IPL TV Display - Final Desktop Node.js Scorecard Build

This build uses the fixtures API first, reads `current_matches[0].match_center_url`, converts `/cricket/matchcentre/.../#live` into both the scorecard API URL and the current API URL. Scorecard decodes `data.scorecard.data[0]`; current API supplies current-over ball-by-ball.

## Run on desktop

```bash
npm install
npm start
```

Open:

```text
http://localhost:3000
```

## Test endpoints

```text
http://localhost:3000/api/status
http://localhost:3000/api/fixtures-results
http://localhost:3000/api/live-score
http://localhost:3000/api/raw-scorecard
```

## Important logic fixed

- Live URL is built as `https://livescoreapi.thehindu.com/api/cricket/scorecard/...`
- Scorecard root is decoded from `raw.data.scorecard.data[0]`
- Innings order comes from `innings[].innigsid`
- Totals come from `innings[].Total`
- Current batters come from `innings[].batsmen` where `on_strike` or `non_strike` is `1`
- Current bowler comes from `innings[].bowlers` where `on_strike` is `1`
- Existing assets are preserved under `public/assets/`
- Current over ball-by-ball is pulled from the `/api/cricket/current/...` companion endpoint, while scorecard remains the main source for innings/batters/bowler.
- Extra test endpoint added: `http://localhost:3000/api/raw-current`
