#!/usr/bin/env python3
"""Baut das Holzgolem-Add-on und schreibt die Version in den Pack-Namen.

    python3 tools/build_addon.py            # Version bleibt, nur Namen + Packs neu bauen
    python3 tools/build_addon.py patch      # 1.1.0 -> 1.1.1
    python3 tools/build_addon.py minor      # 1.1.0 -> 1.2.0
    python3 tools/build_addon.py major      # 1.1.0 -> 2.0.0

Hält synchron: header.version (BP + RP), RP-Abhängigkeit im BP und die
Namen, z. B. "Holzgolem v1.1.1" / "Holzgolem (Ressourcen) v1.1.1".
Erzeugt danach Holzgolem.mcaddon und die beiden .mcpack-Dateien.
"""
import json
import re
import subprocess
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "holzgolem" / "src"
BP, RP = SRC / "Holzgolem_BP", SRC / "Holzgolem_RP"
BASE_NAMES = {BP: "Holzgolem", RP: "Holzgolem (Ressourcen)"}
OUTPUTS = {
    BP: ROOT / "holzgolem" / "Holzgolem_Verhalten.mcpack",
    RP: ROOT / "holzgolem" / "Holzgolem_Ressourcen.mcpack",
}
ADDON = ROOT / "Holzgolem.mcaddon"


def bump(version, part):
    major, minor, patch = version
    if part == "major":
        return [major + 1, 0, 0]
    if part == "minor":
        return [major, minor + 1, 0]
    if part == "patch":
        return [major, minor, patch + 1]
    raise SystemExit(f"Unbekannt: {part} (erlaubt: patch, minor, major)")


def set_header(text, version, name):
    """Ändert nur header.version und header.name – Formatierung bleibt erhalten."""
    v = f"[{version[0]}, {version[1]}, {version[2]}]"
    head, sep, rest = text.partition('"modules"')
    head = re.sub(r'("version":\s*)\[[^\]]*\]', lambda m: m.group(1) + v, head, count=1)
    head = re.sub(r'("name":\s*)"[^"]*"', lambda m: m.group(1) + json.dumps(name, ensure_ascii=False), head, count=1)
    return head + sep + rest


def zip_dir(src, out, prefix=""):
    out.unlink(missing_ok=True)
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for f in sorted(src.rglob("*")):
            if f.is_file():
                z.write(f, prefix + f.relative_to(src).as_posix())


def main():
    bp_text = (BP / "manifest.json").read_text(encoding="utf-8")
    rp_text = (RP / "manifest.json").read_text(encoding="utf-8")
    version = json.loads(bp_text)["header"]["version"]
    if len(sys.argv) > 1:
        version = bump(version, sys.argv[1])
    label = ".".join(map(str, version))

    rp_uuid = json.loads(rp_text)["header"]["uuid"]
    bp_text = set_header(bp_text, version, f"{BASE_NAMES[BP]} v{label}")
    bp_text = re.sub(
        r'(\{\s*"uuid":\s*"' + rp_uuid + r'",\s*"version":\s*)\[[^\]]*\]',
        lambda m: m.group(1) + f"[{version[0]}, {version[1]}, {version[2]}]",
        bp_text,
    )
    rp_text = set_header(rp_text, version, f"{BASE_NAMES[RP]} v{label}")
    for path, text in ((BP / "manifest.json", bp_text), (RP / "manifest.json", rp_text)):
        json.loads(text)  # muss gültig bleiben
        path.write_text(text, encoding="utf-8")

    for pack, out in OUTPUTS.items():
        zip_dir(pack, out)
    ADDON.unlink(missing_ok=True)
    with zipfile.ZipFile(ADDON, "w", zipfile.ZIP_DEFLATED) as z:
        for pack in (BP, RP):
            for f in sorted(pack.rglob("*")):
                if f.is_file():
                    z.write(f, f.relative_to(SRC).as_posix())

    print(f"Version {label}: '{BASE_NAMES[BP]} v{label}' + '{BASE_NAMES[RP]} v{label}'")
    print(f"Gebaut: {ADDON.relative_to(ROOT)}, " + ", ".join(str(o.relative_to(ROOT)) for o in OUTPUTS.values()))
    check = subprocess.run([sys.executable, "-I", str(ROOT / "tools" / "check_addon.py"), str(BP), str(RP)])
    sys.exit(check.returncode)


if __name__ == "__main__":
    main()
