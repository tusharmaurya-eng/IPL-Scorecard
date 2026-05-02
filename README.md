# IPL First Format API-only Build

This version:
- keeps the first-file format
- fixes uploaded headshot mapping
- makes Page 2 API-only instead of showing dummy live scores
- serves live data through Node endpoints

## Run

```bash
npm install
npm start
```

Open:

```text
http://localhost:3000
```

For phone / TV / ScreenCloud:

```text
http://YOUR-COMPUTER-IP:3000
```

Check API:

```text
http://localhost:3000/api/status
http://localhost:3000/api/fixtures-results
http://localhost:3000/api/players
```
