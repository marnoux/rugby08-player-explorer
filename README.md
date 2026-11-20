# Rugby 08 Player Explorer

A searchable browser for every player in the 2007 PC game *Rugby 08*: all 23 ratings, special skills, squads, team depth charts and side-by-side comparisons.

**Live site:** https://marnoux.github.io/rugby08-player-explorer/

## What you can do

- **Search everything** with plain text or filters you can combine:
  `ovr>85 pos:wing`, `skill:goalkicker team:bulls`, `nat:south-african`, `kick:80-90`, `height>195`, `-pos:prop`
- **Sort and scan** a table of all 1,765 players, with an overall rating and every rating cell shaded by value
- **Open any player** to see every rating against the average for their position, their rank, special skills, the most similar players, and every squad they appear in
- **Open any team** for a squad profile, squad leaders and a depth chart
- **Compare** up to four players side by side
- **Copy for Excel** any filtered list

## Squad and player editor

A local editor that changes the game itself: squads, captains and kickers, and every player's name, positions, nationality, height, weight, ratings, special skills and head model.

**Start it:** double-click `Rugby 08 Editor.cmd` (needs [Node.js](https://nodejs.org)), or run `node editor/server.js --open`. It opens http://localhost:4319. Keep the window open while you edit.

**Squads tab:** pick a team, then replace, move or empty any of its 30 slots. Slots 1–15 are the starting line-up. Warnings show players out of position or of another nationality. Below the squad you can set the captain and kicking roles.

**Players tab:** search all 1,904 players and edit any field. Changed fields are highlighted with their original value, and the overall rating updates as you go.

**Save to game** (close the game first) writes an edited `data.gob` to Windows' VirtualStore folder for the install, for both `Data\data.gob` and `Data\motion\data.gob`. The game reads those copies when it's started normally from the Start menu or desktop shortcut. It ignores them if it's run as administrator. The original files in Program Files are never changed.

**Restore original** deletes the edited copies, which puts the game back exactly as installed.

What isn't known yet:
- Role 2 of each team (role 1 is usually the captain, roles 3–7 are kicking duties)
- The 10 team values stored with each squad, which the game doesn't recalculate when you change players
- Nationality flags for Chile and Tunisia, which are inferred because no shipped player uses them

Edits change the game only. This website still shows the original data.

For scripts, `tools/squad-edit.js` does squad swaps from the command line and `tools/gob.js` holds the archive and database code.

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
| `tools/gob.js` | Reads and writes `data.gob` and the game database inside it (player and team record layouts are documented at the top) |
| `tools/squad-edit.js` | Command-line squad viewer and editor |
| `editor/` | The squad and player editor: `server.js` and its page `index.html` |
| `Rugby 08 Editor.cmd` | Double-click to start the editor |

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
- Overall (OVR) is this site's estimate, not a game value: a weighted average of the ratings that matter most for each player's main position. The weights are in `OVR_W` in `index.html`, and each player's page shows the ones used.
- Treviso's list repeats 27 rows (shown once), England appears twice with slightly different lists, and 10 team lists are empty.

*Rugby 08* is a trademark of Electronic Arts. This is an unofficial fan project, not affiliated with or endorsed by EA.
