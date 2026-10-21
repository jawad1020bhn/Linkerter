#!/usr/bin/env bash
# Package ONLY the Chrome Extension MV3 runtime files into linkedin-feed-scroller.zip.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_ZIP="${1:-$REPO_ROOT/linkedin-feed-scroller.zip}"

python3 - "$REPO_ROOT" "$OUT_ZIP" <<'PY'
import json
import os
import sys
import zipfile

repo_root, out_zip = sys.argv[1], sys.argv[2]

with open(os.path.join(repo_root, "manifest.json"), "r", encoding="utf-8") as fh:
    manifest = json.load(fh)

files = ["manifest.json", "popup.html", "popup.css", "popup.js"]
for cs in manifest.get("content_scripts", []):
    for js in cs.get("js", []):
        if js not in files:
            files.append(js)
for icon_path in (manifest.get("icons") or {}).values():
    if icon_path not in files and os.path.exists(os.path.join(repo_root, icon_path)):
        files.append(icon_path)

with zipfile.ZipFile(out_zip, "w", compression=zipfile.ZIP_DEFLATED) as zf:
    for rel in files:
        full = os.path.join(repo_root, rel)
        if not os.path.isfile(full):
            raise FileNotFoundError(f"Missing required extension file: {rel}")
        zf.write(full, arcname=os.path.join("linkedin-feed-scroller", rel))

print(f"Wrote {out_zip} ({len(files)} files)")
PY
