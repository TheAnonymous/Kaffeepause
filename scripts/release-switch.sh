#!/usr/bin/env bash
# Läuft auf dem Server (als root, über `ssh … sudo bash -s`), lässt sich aber auch
# lokal gegen einen Testordner ausführen:
#
#   release-switch.sh <site_root> <release_id>   current auf releases/<release_id> stellen
#   release-switch.sh <site_root> rollback       current und previous tauschen
#
# Danach bleiben nur die fünf neuesten Releases liegen; alles, worauf current oder
# previous zeigt, wird nie gelöscht.
set -Eeuo pipefail

site_root="$1"
mode="$2"
keep=5
release_pattern='^releases/[0-9]{8}T[0-9]{6}Z$'

cd -- "${site_root}"
link_target() { if [[ -L "$1" ]]; then readlink -- "$1"; fi; }
current="$(link_target current)"
previous="$(link_target previous)"
for value in "${current}" "${previous}"; do
  [[ -z "${value}" || "${value}" =~ ${release_pattern} ]] || { echo "unerwarteter Symlink: ${value}" >&2; exit 1; }
done

if [[ "${mode}" == rollback ]]; then
  [[ -n "${previous}" && -d "${previous}" ]] || { echo "kein vorheriges Release vorhanden" >&2; exit 1; }
  next="${previous}"
else
  next="releases/${mode}"
  [[ "${next}" =~ ${release_pattern} ]] || { echo "ungültige Release-ID: ${mode}" >&2; exit 1; }
  [[ -f "${next}/index.html" ]] || { echo "${next} enthält keine index.html" >&2; exit 1; }
fi

stamp="$(date -u +%s%N)"
if [[ -n "${current}" ]]; then
  ln -s -- "${current}" ".previous.${stamp}"
  mv --no-copy -T -- ".previous.${stamp}" previous
fi
ln -s -- "${next}" ".current.${stamp}"
mv --no-copy -T -- ".current.${stamp}" current
echo "current -> ${next}"

# Alte Releases aufräumen: die fünf neuesten behalten, current und previous immer.
protected_current="$(link_target current)"
protected_previous="$(link_target previous)"
mapfile -t releases < <(find releases -mindepth 1 -maxdepth 1 -type d -printf 'releases/%f\n' | grep -E "${release_pattern}" | sort -r)
for index in "${!releases[@]}"; do
  release="${releases[${index}]}"
  (( index < keep )) && continue
  [[ "${release}" == "${protected_current}" || "${release}" == "${protected_previous}" ]] && continue
  rm -rf -- "${release:?}"
  echo "altes Release entfernt: ${release}"
done
