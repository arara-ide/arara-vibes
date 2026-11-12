#!/bin/sh
set -eu

chown root:root '/opt/${sanitizedProductName}/chrome-sandbox'
chmod 4755 '/opt/${sanitizedProductName}/chrome-sandbox'

if command -v update-alternatives >/dev/null 2>&1; then
    update-alternatives --remove '${executable}' '/opt/Arara Vibes/${executable}' || true
    update-alternatives --install '/usr/bin/${executable}' '${executable}' '/opt/${sanitizedProductName}/${executable}' 100
else
    ln -sf '/opt/${sanitizedProductName}/${executable}' '/usr/bin/${executable}'
fi

if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database /usr/share/applications || true
fi
if command -v gtk-update-icon-cache >/dev/null 2>&1; then
    gtk-update-icon-cache -q -t -f /usr/share/icons/hicolor || true
fi
