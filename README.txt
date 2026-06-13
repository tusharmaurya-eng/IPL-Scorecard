FIFA JSON MODE - NO FALSE LIVE + VERTICAL GROUPS

Fixes:
- It no longer shows LIVE by default.
- live is now null in fifa-data.json.
- The Live Match page shows NEXT MATCH unless you explicitly set live.isLive = true.
- Standings are arranged top-to-bottom.
- Still uses 4 groups per page:
  Groups A-D, E-H, I-L.

To mark a match live, add this to fifa-data.json:

"live": {
  "isLive": true,
  "status": "LIVE",
  "minute": "63'",
  "home": "Mexico",
  "homeCode": "MEX",
  "homeScore": "1",
  "away": "South Africa",
  "awayCode": "RSA",
  "awayScore": "0",
  "possessionHome": "57%",
  "possessionAway": "43%",
  "shotsHome": "12",
  "shotsAway": "7",
  "onTargetHome": "5",
  "onTargetAway": "2",
  "cornersHome": "6",
  "cornersAway": "3",
  "cardsHome": "1",
  "cardsAway": "2"
}

Run:
python -m http.server 8000
