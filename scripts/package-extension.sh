#!/usr/bin/env bash
# Build deterministic, runtime-only Chrome Extension MV3 archives.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODE="unpacked"
if [[ "${1:-}" == "--unpacked" || "${1:-}" == "--store" ]]; then
  MODE="${1#--}"
  shift
fi
if [[ "${1:-}" == --* || $# -gt 1 ]]; then
  echo "Usage: bash scripts/package-extension.sh [--unpacked|--store] [output.zip]" >&2
  exit 2
fi
if [[ $# -eq 1 ]]; then
  OUT_ZIP="$1"
elif [[ "$MODE" == "store" ]]; then
  OUT_ZIP="$REPO_ROOT/linkedin-feed-scroller-store.zip"
else
  OUT_ZIP="$REPO_ROOT/linkedin-feed-scroller.zip"
fi

python3 - "$REPO_ROOT" "$MODE" "$OUT_ZIP" <<'PY'
import json
import os
import re
import sys
import zipfile
from pathlib import PurePosixPath

repo_root, mode, out_zip = sys.argv[1:]

with open(os.path.join(repo_root, "manifest.json"), "r", encoding="utf-8") as handle:
    manifest = json.load(handle)
with open(os.path.join(repo_root, "popup.html"), "r", encoding="utf-8") as handle:
    popup_html = handle.read()

files = {"manifest.json", manifest["background"]["service_worker"], manifest["action"]["default_popup"]}
for content_script in manifest.get("content_scripts", []):
    files.update(content_script.get("js", []))
    files.update(content_script.get("css", []))
files.update((manifest.get("icons") or {}).values())
files.update((manifest.get("action", {}).get("default_icon") or {}).values())
files.update(re.findall(r"<script\s+src=[\"']([^\"']+)[\"']", popup_html))
files.update(re.findall(r"<link\s+rel=[\"']stylesheet[\"']\s+href=[\"']([^\"']+)[\"']", popup_html))

for relative in files:
    path = PurePosixPath(relative)
    if path.is_absolute() or ".." in path.parts or "\\" in relative:
        raise ValueError(f"Unsafe runtime archive path: {relative}")
    if not os.path.isfile(os.path.join(repo_root, relative)):
        raise FileNotFoundError(f"Missing required extension file: {relative}")

prefix = "linkedin-feed-scroller/" if mode == "unpacked" else ""
archive_names = sorted(prefix + relative for relative in files)
out_zip = os.path.abspath(out_zip)
os.makedirs(os.path.dirname(out_zip), exist_ok=True)
with zipfile.ZipFile(out_zip, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for archive_name in archive_names:
        relative = archive_name[len(prefix):] if prefix else archive_name
        with open(os.path.join(repo_root, relative), "rb") as handle:
            contents = handle.read()
        entry = zipfile.ZipInfo(archive_name, date_time=(1980, 1, 1, 0, 0, 0))
        entry.create_system = 3
        entry.external_attr = 0o100644 << 16
        entry.compress_type = zipfile.ZIP_DEFLATED
        archive.writestr(entry, contents)

print(f"Wrote {out_zip} ({len(files)} files, {mode}, deterministic)")
PY
