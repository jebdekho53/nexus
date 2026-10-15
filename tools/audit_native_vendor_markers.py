"""Read-only repeatable marker audit; absence is not proof of zero native egress."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MARKERS = ["simplycoding.uk", "c9fe7387-f.b-cdn.net", "2jrp7sv7ddsketch", "captcha.enc", "brahmos", "xhamster"]
rows = []
for directory in [ROOT / "resources", ROOT / "vendor"]:
    for file in sorted(directory.rglob("*")):
        if not file.is_file() or file.suffix.lower() not in {".dll", ".exe", ".node"}:
            continue
        raw = file.read_bytes()
        folded = raw.lower()
        # Decode UTF-16 before lowercasing; byte-lowercasing Unicode is unsafe.
        wide = raw.decode("utf-16le", errors="ignore").lower()
        wide_shifted = raw[1:].decode("utf-16le", errors="ignore").lower()
        matches = [value for value in MARKERS if value.encode("ascii") in folded or value in wide or value in wide_shifted]
        rows.append({"file": file.relative_to(ROOT).as_posix(), "bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest(), "markers": matches})
report = {"files": rows, "matchingFiles": sum(bool(row["markers"]) for row in rows), "limits": "Literal ASCII/UTF-16 markers only. Does not detect encrypted or constructed URLs, arbitrary callback hosts, or native socket activity."}
output = ROOT / "diagnostics/link-audit/native-marker-audit.json"
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps(report, indent=2), encoding="utf-8")
print(json.dumps({"filesScanned": len(rows), "matchingFiles": report["matchingFiles"], "matches": [{"file": row["file"], "markers": row["markers"]} for row in rows if row["markers"]], "report": str(output)}))
