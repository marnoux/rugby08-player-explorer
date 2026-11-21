#!/bin/sh
# Starts the Rugby 08 squad and player editor and opens it in your browser (Linux and macOS, game under Wine).
# The editor finds the game in ~/.wine, $WINEPREFIX, ~/Games/* or an install folder directly in ~/Games. If yours is elsewhere, pass the folder that
# contains Data/data.gob:
#   ./rugby08-editor.sh --game "$HOME/.wine/drive_c/Program Files (x86)/EA SPORTS/EA SPORTS(TM) Rugby 08"
# Keep this terminal open while you edit; press Ctrl+C when you're done.
cd "$(dirname "$0")" || exit 1
exec node editor/server.js --open "$@"
