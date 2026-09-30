"""Create a portable source + prebuilt game archive without installed dependencies."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import hashlib
import json

root = Path(__file__).resolve().parents[1]
version = json.loads((root / "package.json").read_text(encoding="utf-8"))["version"]
target = root.parent / f"sakura-walk-{version}.zip"
allowed_dirs = ["src", "public", "dist", "scripts", "licenses", "docs", ".github"]
root_files = ["package.json", "package-lock.json", "index.html", "tsconfig.json", "vite.config.ts", "README.md", "Launch Sakura Walk.cmd", ".gitignore", ".gitattributes", "LICENSE"]
files = [root / name for name in root_files]
for directory in allowed_dirs:
    files += [p for p in (root / directory).rglob("*") if p.is_file() and "__pycache__" not in p.parts]
files = sorted(set(files))
with ZipFile(target, "w", ZIP_DEFLATED, compresslevel=6) as archive:
    for file in files:
        archive.write(file, Path("sakura-walk") / file.relative_to(root))
with ZipFile(target) as archive:
    assert archive.testzip() is None
    entries = archive.namelist()
    for required in ["dist/index.html", "src/main.ts", "public/models/bbs-companion.vrm", "public/models/sssi-walker.vrm", "dist/models/bbs-companion.vrm", "dist/models/sssi-walker.vrm", "scripts/serve.mjs", "Launch Sakura Walk.cmd", "licenses/VRoid-models.md", "licenses/User-models.md"]:
        assert "sakura-walk/" + required in entries, required
    assert not any("node_modules/" in name for name in entries)
checksum = hashlib.sha256(target.read_bytes()).hexdigest()
target.with_suffix(".sha256").write_text(f"{checksum}  {target.name}\n", encoding="utf-8")
print(json.dumps({"archive": str(target), "files": len(entries), "bytes": target.stat().st_size, "sha256": checksum}))
