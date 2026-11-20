# Rugby 08 Player Explorer

A searchable browser for every player in the 2007 PC game *Rugby 08*: all 23 ratings, special skills, squads, team depth charts and side-by-side comparisons.

**Live site:** https://marnoux.github.io/rugby08-player-explorer/

## What you can do

- **Search everything** with plain text or filters you can combine:
  `speed>90 pos:wing`, `skill:goalkicker team:bulls`, `nat:south-african`, `kick:80-90`, `height>195`, `-pos:prop`
- **Sort and scan** a table of all 1,765 players, with rating cells shaded by value
- **Open any player** to see every rating against the average for their position, their rank, special skills, the most similar players, and every squad they appear in
- **Open any team** for a squad profile, squad leaders and a depth chart
- **Compare** up to four players side by side
- **Copy for Excel** any filtered list

## Files

| Path | What it is |
| --- | --- |
| `index.html` | The page. It is written as a page body (no `<html>`/`<head>`), which `tools/build-pages.js` wraps for GitHub Pages |
| `players.json` | 1,765 players, one record per line |
| `teams.json` | 83 team lists, one record per line |
| `docs/` | The built site that GitHub Pages serves |
| `tools/bigdump.js` | Unpacks and decompresses entries from the game's `data.gob` archive (EA BIG format, RefPack compression) |
| `tools/build-data.js` | Turns the game's player database text file into `players.json` and `teams.json` |
| `tools/build-pages.js` | Builds `docs/` |
| `tools/serve.js` | Local preview server |

## Preview locally

```
node tools/serve.js
```

Then open http://localhost:4318.

## Rebuilding the data from the game disc

Needs Node.js and the *Rugby 08* PC disc. On Windows:

```
expand.exe -F:DataData_gob Data.cab extract
node tools/bigdump.js extract/DataData_gob extract/out 453779c39fd0d3f0742eb80e0cb2a7c7.txt
node tools/build-data.js extract/out/453779c39fd0d3f0742eb80e0cb2a7c7.txt .
node tools/build-pages.js
```

`453779c39fd0d3f0742eb80e0cb2a7c7.txt` is the archive entry that holds the player database. The archive uses hashed file names.

## Notes on the data

- 332 players appear in more than one squad (usually a national side and a club). Their ratings are identical in every squad, so each has one profile.
- Squad numbers are the order players appear in each team's list in the file.
- Names the file marks with `^` are shown with ★.
- The file's column headings swap the height and weight units. The values are inches/cm and pounds/kg.
- "I. Resist" is listed among the special skills but holds a level from 0 to 3.
- The rating groups (Ball play, Athletic, Contact, Set piece, Mindset) are this site's own grouping, not part of the game.
- Treviso's list repeats 27 rows (shown once), England appears twice with slightly different lists, and 10 team lists are empty.

*Rugby 08* is a trademark of Electronic Arts. This is an unofficial fan project, not affiliated with or endorsed by EA.
