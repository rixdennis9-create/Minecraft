#!/usr/bin/env python3
"""Statische Prüfung eines Bedrock-Add-ons (Behavior Pack + Resource Pack).

Prüft: gültiges JSON, Manifest-UUIDs/Abhängigkeiten, Entity-Identifier BP <-> RP,
Geometrie, Animationen, Animation-Controller, Render-Controller, Texturen,
Loot-Tables, Script-Entry und Sprachdateien.

    python3 tools/check_addon.py holzgolem/src/Holzgolem_BP holzgolem/src/Holzgolem_RP
"""
import json
import re
import sys
from pathlib import Path

# Vanilla-Ressourcen, die Custom-Entities gefahrlos mitbenutzen dürfen
VANILLA_ANIMATIONS = {"animation.common.look_at_target"}
VANILLA_MATERIALS = {"entity", "entity_alphatest", "entity_alphablend", "entity_emissive", "entity_emissive_alpha"}

errors = []
warnings = []


def err(msg):
    errors.append(msg)


def load(path):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except Exception as e:  # noqa: BLE001
        err(f"Ungültiges JSON: {path}: {e}")
        return None


def collect(root, sub, key):
    """Sammelt alle Definitionen (z. B. Animationen) aus einem Unterordner."""
    found = {}
    for f in sorted((root / sub).rglob("*.json")):
        data = load(f)
        if isinstance(data, dict):
            for name in (data.get(key) or {}):
                found[name] = f
    return found


def main(bp, rp):
    bp, rp = Path(bp), Path(rp)

    # 1. Alle JSON-Dateien parsen
    for f in list(bp.rglob("*.json")) + list(rp.rglob("*.json")):
        load(f)

    # 2. Manifeste
    bpm, rpm = load(bp / "manifest.json"), load(rp / "manifest.json")
    if not (bpm and rpm):
        return
    uuids = [bpm["header"]["uuid"], rpm["header"]["uuid"]] + [m["uuid"] for m in bpm["modules"] + rpm["modules"]]
    if len(set(uuids)) != len(uuids):
        err("Doppelte UUIDs in den Manifesten")
    for dep in bpm.get("dependencies", []):
        if "uuid" in dep:
            if dep["uuid"] != rpm["header"]["uuid"]:
                err(f"BP-Abhängigkeit {dep['uuid']} zeigt nicht auf das RP")
            elif dep["version"] != rpm["header"]["version"]:
                err(f"BP-Abhängigkeit Version {dep['version']} != RP-Version {rpm['header']['version']}")
    for label, man in (("BP", bpm), ("RP", rpm)):
        v = "v" + ".".join(map(str, man["header"]["version"]))
        if not man["header"]["name"].endswith(v):
            err(f"{label}-Name '{man['header']['name']}' endet nicht auf '{v}' (tools/build_addon.py ausführen)")
    for m in bpm["modules"]:
        if m["type"] == "script" and not (bp / m["entry"]).is_file():
            err(f"Script-Entry fehlt: {m['entry']}")

    # 3. Definitionen im RP einsammeln
    geometries = {}
    for f in sorted((rp / "models").rglob("*.json")):
        data = load(f) or {}
        for g in data.get("minecraft:geometry", []):
            geometries[g["description"]["identifier"]] = f
    animations = collect(rp, "animations", "animations")
    controllers = collect(rp, "animation_controllers", "animation_controllers")
    render_controllers = collect(rp, "render_controllers", "render_controllers")

    client = {}
    for f in sorted((rp / "entity").rglob("*.json")):
        data = load(f) or {}
        d = data.get("minecraft:client_entity", {}).get("description", {})
        if d:
            client[d["identifier"]] = (f, d)

    lang = {}
    for f in sorted((rp / "texts").glob("*.lang")):
        lang[f.name] = {line.split("=", 1)[0] for line in f.read_text(encoding="utf-8").splitlines() if "=" in line}

    # 4. Jede BP-Entity durch die ganze Kette verfolgen
    for f in sorted((bp / "entities").rglob("*.json")):
        data = load(f) or {}
        ent = data.get("minecraft:entity", {})
        ident = ent.get("description", {}).get("identifier")
        comps = ent.get("components", {})
        loot = comps.get("minecraft:loot", {}).get("table")
        if loot and not (bp / loot).is_file():
            err(f"{ident}: Loot-Table fehlt: {loot}")
        if ident not in client:
            err(f"{ident}: keine Client-Entity im RP -> Entity wäre unsichtbar")
            continue
        cf, d = client[ident]

        for key, mat in d.get("materials", {}).items():
            if mat not in VANILLA_MATERIALS:
                warnings.append(f"{ident}: Material '{mat}' ist kein Standard-Entity-Material (Risiko: unsichtbar)")
        for key, geo in d.get("geometry", {}).items():
            if geo not in geometries:
                err(f"{ident}: Geometrie '{geo}' nicht im RP definiert")
        for key, tex in d.get("textures", {}).items():
            if not any((rp / (tex + ext)).is_file() for ext in (".png", ".tga", ".jpg")):
                err(f"{ident}: Textur fehlt: {tex}")

        anims = d.get("animations", {})
        for short, full in anims.items():
            if full.startswith("controller.animation."):
                if full not in controllers:
                    err(f"{ident}: Animation-Controller '{full}' nicht im RP definiert")
                    continue
                ctrl = json.loads(controllers[full].read_text(encoding="utf-8"))["animation_controllers"][full]
                for sname, state in ctrl["states"].items():
                    for a in state.get("animations", []):
                        name = a if isinstance(a, str) else next(iter(a))
                        if name not in anims:
                            err(f"{ident}: Controller '{full}' Zustand '{sname}' nutzt '{name}', das in der Client-Entity fehlt")
                    for t in state.get("transitions", []):
                        target = next(iter(t))
                        if target not in ctrl["states"]:
                            err(f"{ident}: Controller '{full}' springt zu unbekanntem Zustand '{target}'")
            elif full not in animations and full not in VANILLA_ANIMATIONS:
                err(f"{ident}: Animation '{full}' nicht im RP definiert")
        for a in d.get("scripts", {}).get("animate", []):
            name = a if isinstance(a, str) else next(iter(a))
            if name not in anims:
                err(f"{ident}: scripts.animate nutzt unbekanntes '{name}'")

        for rc in d.get("render_controllers", []):
            name = rc if isinstance(rc, str) else next(iter(rc))
            if name not in render_controllers:
                err(f"{ident}: Render-Controller '{name}' nicht im RP definiert")
                continue
            rcd = json.loads(render_controllers[name].read_text(encoding="utf-8"))["render_controllers"][name]
            text = json.dumps(rcd)
            for kind, table in (("Texture", d.get("textures", {})), ("Geometry", d.get("geometry", {}))):
                for ref in set(re.findall(kind + r"\.(\w+)", text)):
                    if ref not in table:
                        err(f"{ident}: Render-Controller '{name}' nutzt {kind}.{ref}, das nicht definiert ist")
            for ref in set(re.findall(r"Material\.(\w+)", text)):
                if ref not in d.get("materials", {}):
                    err(f"{ident}: Render-Controller '{name}' nutzt Material.{ref}, das nicht definiert ist")

        if "spawn_egg" in d:
            for lf, keys in lang.items():
                if f"item.spawn_egg.entity.{ident}.name" not in keys:
                    warnings.append(f"{ident}: Spawnei-Name fehlt in {lf}")
        for lf, keys in lang.items():
            if f"entity.{ident}.name" not in keys:
                warnings.append(f"{ident}: Name fehlt in {lf}")

        # Sichtbarkeit: Geometrie hat Würfel, Textur deckt die Würfel ab
        geo_file = geometries.get(d.get("geometry", {}).get("default"))
        if geo_file:
            g = json.loads(geo_file.read_text(encoding="utf-8"))["minecraft:geometry"][0]
            cubes = sum(len(b.get("cubes", [])) for b in g["bones"])
            if cubes == 0:
                err(f"{ident}: Geometrie hat keine Würfel")
            print(f"  {ident}: Geometrie {g['description']['identifier']} mit {len(g['bones'])} Knochen / {cubes} Würfeln")

    # 5. Items: Icon muss in item_texture.json stehen und die Datei existieren
    item_tex = {}
    if (rp / "textures" / "item_texture.json").is_file():
        item_tex = (load(rp / "textures" / "item_texture.json") or {}).get("texture_data", {})
    for f in sorted((bp / "items").rglob("*.json")) if (bp / "items").is_dir() else []:
        data = load(f) or {}
        item = data.get("minecraft:item", {})
        ident = item.get("description", {}).get("identifier")
        comps = item.get("components", {})
        icon = comps.get("minecraft:icon")
        icon = icon.get("textures", {}).get("default") if isinstance(icon, dict) else icon
        if not icon:
            err(f"{ident}: kein minecraft:icon")
        elif icon not in item_tex:
            err(f"{ident}: Icon '{icon}' fehlt in textures/item_texture.json")
        else:
            tex = item_tex[icon]["textures"]
            tex = tex[0] if isinstance(tex, list) else tex
            if not any((rp / (tex + ext)).is_file() for ext in (".png", ".tga")):
                err(f"{ident}: Item-Textur fehlt: {tex}")
        name = comps.get("minecraft:display_name", {}).get("value")
        if name and "." in name:
            for lf, keys in lang.items():
                if name not in keys:
                    warnings.append(f"{ident}: Sprachschlüssel '{name}' fehlt in {lf}")
        print(f"  {ident}: Item mit Icon {icon}")

    print(f"Geprüft: {bp} + {rp}")
    for w in warnings:
        print("WARNUNG:", w)
    for e in errors:
        print("FEHLER:", e)
    print("OK – keine Fehler" if not errors else f"{len(errors)} Fehler")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
    sys.exit(1 if errors else 0)
