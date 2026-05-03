# IPL Final Folder-Based Assets Build

This version removes embedded player headshots from the HTML.

## Folder structure

```text
public/
  index.html
  assets/
    players/
      abhishek-sharma.png
      anshul-kamboj.png
      bhuvneshwar-kumar.png
      eshan-malinga.png
      heinrich-klaasen.png
      jofra-archer.png
      kl-rahul.png
      shubman-gill.png
      vaibhav-sooryavanshi.png
      virat-kohli.png
```

## Replace player photos

Replace the PNG file in:

```text
public/assets/players/
```

Keep the same filename and the HTML will automatically use the new picture.

## Run live API version

```bash
npm install
npm start
```

Open:

```text
http://localhost:3000
```

For TV / phone / ScreenCloud:

```text
http://YOUR-COMPUTER-IP:3000
```

## API endpoints

```text
/api/status
/api/download-now
/api/fixtures-results
/api/points
/api/players
```


## Team logos folder

Team logos are now external files too:

```text
public/assets/teams/
  csk.png
  dc.png
  gt.png
  kkr.png
  lsg.png
  mi.png
  pbks.png
  rcb.png
  rr.png
  srh.png
```

To replace a logo, replace the file with the same filename.
