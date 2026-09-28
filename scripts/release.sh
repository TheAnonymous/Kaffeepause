#!/usr/bin/env bash
# Prüft Kaffeepause lokal und veröffentlicht dist/ auf kaffeepause.jodie-oesterling.de.
#
#   npm run release                 prüfen, bauen, nachfragen, veröffentlichen
#   npm run release -- --yes        ohne Rückfrage veröffentlichen
#   npm run release -- --rollback   zurück auf das vorherige Release
#
# Jedes Release landet in einem eigenen Ordner unter releases/. Der Symlink
# `current` wird atomar umgestellt, `previous` merkt sich den Stand davor.
# Auf dem Server bleiben die fünf neuesten Releases (siehe release-switch.sh).
set -Eeuo pipefail

target="admin@10.77.0.1" # RS2000 über WireGuard
site_root="/srv/www/kaffeepause.jodie-oesterling.de"
site_url="https://kaffeepause.jodie-oesterling.de/"

cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."

die() { printf 'Fehler: %s\n' "$*" >&2; exit 1; }

# Stellt current und previous auf dem Server atomar um und räumt alte Releases auf.
remote_switch() {
  ssh -- "${target}" sudo bash -s -- "${site_root}" "$1" < scripts/release-switch.sh
}

live_check() {
  local entry
  entry="$(grep -o 'assets/index-[^"]*\.js' dist/index.html | head -n 1)"
  [[ -n "${entry}" ]] || die "dist/index.html nennt kein Einstiegsskript"
  if curl -fsS --max-time 20 "${site_url}" | grep -q -- "${entry}"; then
    printf 'Live-Check ok: %s liefert %s\n' "${site_url}" "${entry}"
  else
    die "Live-Check: ${site_url} liefert nicht ${entry}"
  fi
}

case "${1:-}" in
  --rollback)
    remote_switch rollback
    printf 'Zurückgeschaltet. %s zeigt jetzt das vorherige Release.\n' "${site_url}"
    exit 0
    ;;
  --yes | '') ;;
  *) die "unbekannte Option: $1 (erlaubt: --yes, --rollback)" ;;
esac

if [[ -n "$(git status --porcelain)" ]]; then
  printf 'Hinweis: Es gibt nicht committete Änderungen; sie werden mit veröffentlicht.\n'
fi

npm run check

if [[ "${1:-}" != --yes ]]; then
  read -r -p "Jetzt auf ${site_url} veröffentlichen? [j/N] " answer
  [[ "${answer}" =~ ^[jJyY]$ ]] || { echo 'Abgebrochen, nichts veröffentlicht.'; exit 0; }
fi

release_id="$(date -u +%Y%m%dT%H%M%SZ)"
release_dir="${site_root}/releases/${release_id}"
if find dist -type l | grep -q .; then die "dist/ enthält Symlinks"; fi

ssh -- "${target}" sudo install -d -o root -g caddy -m 0750 -- "${site_root}/releases"
ssh -- "${target}" sudo install -d -o root -g caddy -m 0750 -- "${release_dir}"
tar --create --file=- --format=posix --directory=dist . \
  | ssh -- "${target}" sudo tar --extract --file=- --directory="${release_dir}" --no-same-owner --no-same-permissions
ssh -- "${target}" sudo chown -R root:caddy -- "${release_dir}"
ssh -- "${target}" sudo find "${release_dir}" -type d -exec chmod 0750 '{}' +
ssh -- "${target}" sudo find "${release_dir}" -type f -exec chmod 0640 '{}' +
remote_switch "${release_id}"
live_check
printf 'Veröffentlicht: %s (Release %s)\n' "${site_url}" "${release_id}"
