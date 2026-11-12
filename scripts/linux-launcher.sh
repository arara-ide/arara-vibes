#!/bin/sh
set -eu

directory=$(dirname -- "$(readlink -f -- "$0")")
unset ELECTRON_RUN_AS_NODE
if [ -n "${APPIMAGE:-}" ]; then
    exec "$directory/arara-vibes.bin" --no-sandbox "$@"
fi
exec "$directory/arara-vibes.bin" "$@"
