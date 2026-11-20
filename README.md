# Rugby 08 Player Explorer

A searchable browser for every player in the 2007 PC game *Rugby 08*: all 23 ratings, special skills, squads, team depth charts and side-by-side comparisons.

**Live site:** https://marnoux.github.io/rugby08-player-explorer/

## What you can do

- **Filter** by team, position, nationality, special skills and squad, with a count beside every option, and set ranges with sliders for overall, height, weight or any of the 23 ratings. On a phone the filters open full screen.
- **Sort** by any rating, size or name from the Sort by menu, or by clicking a column heading
- **Search** names, or type filters that add to the ones picked: `ovr>85 pos:wing`, `skill:goalkicker team:bulls`, `kick:80-90`, `-pos:prop`
- **Scan** a table of every player, with an overall rating and every rating cell shaded by value
- **Open any player** to see every rating against the average for their position, their rank, special skills, the most similar players, and every squad they appear in
- **Open any team** for a squad profile, squad leaders and a depth chart
- **Compare** up to four players side by side
- **Copy for Excel** any filtered list

## Squad and player editor

A local editor that changes the game itself: squads, captains and kickers, and every player's name, positions, nationality, height, weight, ratings, special skills and head model.

**Start it** (needs [Node.js](https://nodejs.org) 18 or later):

- **Windows:** double-click `Rugby 08 Editor.cmd`.
- **Linux or macOS, game under Wine:** run `./rugby08-editor.sh`. It looks for the game in `~/.wine`, `$WINEPREFIX` and `~/Games/*` (Lutris). If yours is elsewhere, add `--game "<the folder that contains Data/data.gob>"`.
- **Either:** `node editor/server.js --open`, with the same options.

It opens http://localhost:4319. Keep the window open while you edit.

**Squads tab:** pick a team, then replace, move or empty any of its 30 slots. Slots 1–15 are the starting line-up. Warnings show players out of position or of another nationality. Below the squad you can set the captain and kicking roles.

**Players tab:** search all 1,904 players and edit any field. Changed fields are highlighted with their original value, and the overall rating updates as you go.

**Save to game** (close the game first) updates both `Data/data.gob` and `Data/motion/data.gob`. Where it writes depends on the system:

- **Windows, game in Program Files:** the edited copies go to Windows' VirtualStore folder for the install. The game reads them when it's started normally from the Start menu or desktop shortcut, and ignores them if it's run as administrator. The files in Program Files are never changed. **Restore original** deletes the copies.
- **Linux or macOS (Wine), or a Windows install outside Program Files:** the first save keeps the original as `data.gob.original` next to it. Every save is built from that backup and written over `data.gob`. **Restore original** puts the backup back. Add `--direct` to use this on Windows too.

**If the game still shows the old squads after saving:** the game keeps a roster for each profile, a `<profile>.ros` folder in `Documents/EA SPORTS(TM) Rugby 08` (inside the Wine or Proton prefix on Linux, for example `~/.local/share/Steam/steamapps/compatdata/<app id>/pfx/drive_c/users/steamuser/Documents/EA SPORTS(TM) Rugby 08` on a Steam Deck). A profile that has one plays with that roster and ignores the squads in `data.gob`. With the game closed, move the `.ros` folder out of that folder (keep it as a backup; changes you made inside the game are in it) and start the game again. It builds a new roster from the edited `data.gob`. The same goes for **Restore original**: a profile's roster keeps your edits until it is moved aside. The editor lists the ones it finds when it starts and after each save. The folder name can start with a space, so keep the quotes in a shell command.

The Linux and macOS support is tested on Windows with a copied install, not yet on a real Wine setup. Moving the `.ros` folder aside is confirmed on a Steam Deck (Proton).

What isn't known yet:
- Role 2 of each team (role 1 is usually the captain, roles 3–7 are kicking duties)
- The 10 team values stored with each squad, which the game doesn't recalculate when you change players
- Nationality flags for Chile and Tunisia, which are inferred because no shipped player uses them

Edits change the game only. This website shows the game as shipped.

For scripts, `tools/squad-edit.js` does squad swaps from the command line and `tools/gob.js` holds the archive and database code.

## Files

| Path | What it is |
| --- | --- |
| `index.html` | The page. It is written as a page body (no `<html>`/`<head>`), which `tools/build-pages.js` wraps for GitHub Pages |
| `players.json` | One player per line. `t` lists each squad and squad number; empty for a player no team picks |
| `teams.json` | One team per line. Built from `data.gob`, each also has the game's team number (`tid`) and its 7 role player ids (`roles`) |
| `docs/` | The built site that GitHub Pages serves |
| `tools/bigdump.js` | Unpacks and decompresses entries from the game's `data.gob` archive (EA BIG format, RefPack compression) |
| `tools/build-data-gob.js` | Builds `players.json` and `teams.json` from the game's own database in `data.gob` |
| `tools/build-data.js` | Builds them from the disc's player database text file instead |
| `tools/team-groups.js` | Which group (Internationals, Super 14, English clubs…) each team is listed under |
| `tools/build-pages.js` | Builds `docs/` |
| `tools/serve.js` | Local preview server |
| `tools/gob.js` | Reads and writes `data.gob` and the game database inside it (player and team record layouts are documented at the top) |
| `tools/squad-edit.js` | Command-line squad viewer and editor |
| `editor/` | The squad and player editor: `server.js` and its page `index.html` |
| `Rugby 08 Editor.cmd` | Starts the editor on Windows (double-click) |
| `rugby08-editor.sh` | Starts the editor on Linux or macOS |

## Preview locally

```
node tools/serve.js
```

Then open http://localhost:4318.

## Rebuilding the data from the game

**From the installed game (recommended).** This reads the database the game actually plays with, the same one the editor edits: every player record (including players no team picks), every team, squads by slot and each team's captain and kickers. The disc's text export below is missing players and has squads that don't match the game (Connacht lists 56 players, though a squad holds 30).

```
node tools/build-data-gob.js
node tools/build-pages.js
```

Without a path it finds the game the way the editor does. Otherwise give the game folder (the one that contains `Data/data.gob`) or the `data.gob` itself. If you've saved edits in direct mode it reads `data.gob.original`, so the site shows the game as shipped. It prints every team with where its name came from: names already in `teams.json` are kept, then national sides, then the game's kit list. Check the list and fix any name in `teams.json`; the next run keeps it.

**From the disc's text export.** Needs the *Rugby 08* PC disc. On Windows:

```
expand.exe -F:DataData_gob Data.cab extract
node tools/bigdump.js extract/DataData_gob extract/out 453779c39fd0d3f0742eb80e0cb2a7c7.txt
node tools/build-data.js extract/out/453779c39fd0d3f0742eb80e0cb2a7c7.txt .
node tools/build-pages.js
```

`453779c39fd0d3f0742eb80e0cb2a7c7.txt` is the archive entry that holds the player database. The archive uses hashed file names.

## Notes on the data

The notes below describe the data built from the disc's text export (1,765 players, 83 team lists). Built from `data.gob`, squad numbers are the game's squad slots (1–15 the starting line-up), every player record is included, and `is:free` finds players in no squad.

- 332 players appear in more than one squad (usually a national side and a club). Their ratings are identical in every squad, so each has one profile.
- Squad numbers are the order players appear in each team's list in the file.
- Names the file marks with `^` are shown with ★.
- The file's column headings swap the height and weight units. The values are inches/cm and pounds/kg.
- "I. Resist" is listed among the special skills but holds a level from 0 to 3.
- The rating groups (Ball play, Athletic, Contact, Set piece, Mindset) are this site's own grouping, not part of the game.
- Overall (OVR) is this site's estimate, not a game value: a weighted average of the ratings that matter most for each player's main position. The weights are in `OVR_W` in `index.html`, and each player's page shows the ones used.
- Treviso's list repeats 27 rows (shown once), England appears twice with slightly different lists, and 10 team lists are empty.

*Rugby 08* is a trademark of Electronic Arts. This is an unofficial fan project, not affiliated with or endorsed by EA.
