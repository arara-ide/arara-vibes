#!/bin/sh
set -eu

case "${1:-}" in
    remove|purge|0)
        if command -v update-alternatives >/dev/null 2>&1; then
            update-alternatives --remove '${executable}' '/opt/${sanitizedProductName}/${executable}'
        else
            rm -f '/usr/bin/${executable}'
        fi
        ;;
esac

if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database /usr/share/applications || true
fi
if command -v gtk-update-icon-cache >/dev/null 2>&1; then
    gtk-update-icon-cache -q -t -f /usr/share/icons/hicolor || true
fi
