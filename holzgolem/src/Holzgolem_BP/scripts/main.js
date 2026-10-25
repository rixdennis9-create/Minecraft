import { world, system } from "@minecraft/server";

// ============================================================
//  Holzgolem – Einstellungen
// ============================================================
const GOLEM_ID = "dr:wood_golem";
const GUARD_RADIUS = 50; // Schutzradius um den Beschwörungsort
const LEASH_RADIUS = 64; // weiter weg -> Golem wird zurückgeholt

// Kopf-Block, der den Bau "zündet" (wird zuletzt gesetzt)
const HEAD_BLOCKS = new Set(["minecraft:carved_pumpkin", "minecraft:lit_pumpkin"]);

// Welche Blöcke zählen als "Holz"? (alle Stämme/Hölzer, auch entrindet, Nether-Stängel)
function isWood(block) {
  const id = block?.typeId ?? "";
  return (
    id.endsWith("_log") ||
    id.endsWith("_wood") ||
    id.endsWith("_stem") ||
    id.endsWith("_hyphae") ||
    id === "minecraft:bamboo_block" ||
    id === "minecraft:stripped_bamboo_block"
  );
}

// Bauplan relativ zum Kopf (x = seitlich, y = Höhe). Wird automatisch
// für beide Ausrichtungen (Nord-Süd und Ost-West) geprüft.
//
//        [K]          K = geschnitzter Kürbis (zuletzt setzen)
//     [H][H][H]       H = Holzstamm
//        [H]
const PATTERN = [
  { x: 0, y: -1 }, // Brust
  { x: -1, y: -1 }, // linker Arm
  { x: 1, y: -1 }, // rechter Arm
  { x: 0, y: -2 }, // Beine
];
// Diese Felder müssen frei sein (sonst wäre es z. B. eine Wand)
const MUST_BE_EMPTY = [
  { x: -1, y: -2 },
  { x: 1, y: -2 },
];

// ============================================================
//  Bau erkennen
// ============================================================
function rel(head, axis, p) {
  return {
    x: head.x + (axis === "x" ? p.x : 0),
    y: head.y + p.y,
    z: head.z + (axis === "z" ? p.x : 0),
  };
}

function isAirish(block) {
  const id = block?.typeId ?? "minecraft:air";
  return id === "minecraft:air" || id === "minecraft:short_grass" || id === "minecraft:tall_grass" || id === "minecraft:snow_layer";
}

function findStructure(dim, head) {
  for (const axis of ["x", "z"]) {
    const ok =
      PATTERN.every((p) => isWood(dim.getBlock(rel(head, axis, p)))) &&
      MUST_BE_EMPTY.every((p) => isAirish(dim.getBlock(rel(head, axis, p))));
    if (ok) return axis;
  }
  return undefined;
}

function safeParticle(dim, id, loc) {
  try {
    dim.spawnParticle(id, loc);
  } catch {}
}

function summonGolem(dim, head, axis, player) {
  // Blöcke entfernen (Kopf + Körper)
  const all = [{ x: 0, y: 0 }, ...PATTERN];
  for (const p of all) {
    const pos = rel(head, axis, p);
    safeParticle(dim, "minecraft:villager_happy", { x: pos.x + 0.5, y: pos.y + 0.5, z: pos.z + 0.5 });
    dim.getBlock(pos)?.setType("minecraft:air");
  }

  const spawnLoc = { x: head.x + 0.5, y: head.y - 2, z: head.z + 0.5 };
  const golem = dim.spawnEntity(GOLEM_ID, spawnLoc);
  golem.setDynamicProperty("home_x", spawnLoc.x);
  golem.setDynamicProperty("home_y", spawnLoc.y);
  golem.setDynamicProperty("home_z", spawnLoc.z);
  golem.setDynamicProperty("home_dim", dim.id);
  golem.setDynamicProperty("owner", player?.name ?? "");

  // Effekte
  for (let i = 0; i < 12; i++) {
    safeParticle(dim, "minecraft:villager_happy", {
      x: spawnLoc.x + (Math.random() - 0.5) * 2,
      y: spawnLoc.y + Math.random() * 3,
      z: spawnLoc.z + (Math.random() - 0.5) * 2,
    });
  }
  safeParticle(dim, "minecraft:knockback_roar_particle", { x: spawnLoc.x, y: spawnLoc.y + 1.5, z: spawnLoc.z });
  try {
    dim.playSound("dig.wood", spawnLoc, { volume: 1.5, pitch: 0.6 });
    dim.playSound("random.anvil_use", spawnLoc, { volume: 0.6, pitch: 0.5 });
  } catch {}

  player?.onScreenDisplay.setActionBar(`§6Ein Holzgolem erwacht! §7Er beschützt jetzt ${GUARD_RADIUS} Blöcke um diesen Ort.`);
}

world.afterEvents.playerPlaceBlock.subscribe((ev) => {
  const { block, player, dimension } = ev;
  if (!HEAD_BLOCKS.has(block.typeId)) return;
  const head = block.location;
  const axis = findStructure(dimension, head);
  if (!axis) return;
  // einen Tick warten, damit die Platzierung sauber abgeschlossen ist
  system.run(() => summonGolem(dimension, head, axis, player));
});

// ============================================================
//  Schutzzone, Heimweg & Photosynthese
// ============================================================
function getHome(golem) {
  const x = golem.getDynamicProperty("home_x");
  if (typeof x !== "number") {
    // per Spawnei/Befehl erzeugt -> aktueller Ort wird Zuhause
    const l = golem.location;
    golem.setDynamicProperty("home_x", l.x);
    golem.setDynamicProperty("home_y", l.y);
    golem.setDynamicProperty("home_z", l.z);
    golem.setDynamicProperty("home_dim", golem.dimension.id);
    return { x: l.x, y: l.y, z: l.z, dim: golem.dimension.id };
  }
  return {
    x,
    y: golem.getDynamicProperty("home_y"),
    z: golem.getDynamicProperty("home_z"),
    dim: golem.getDynamicProperty("home_dim") ?? golem.dimension.id,
  };
}

let tick = 0;
system.runInterval(() => {
  tick++;
  const isDay = (() => {
    const t = world.getTimeOfDay();
    return t < 12000 || t > 23500;
  })();

  for (const dimId of ["overworld", "nether", "the_end"]) {
    let golems;
    try {
      golems = world.getDimension(dimId).getEntities({ type: GOLEM_ID });
    } catch {
      continue;
    }
    for (const golem of golems) {
      if (!golem.isValid) continue;
      const home = getHome(golem);
      const l = golem.location;
      const dist = Math.hypot(l.x - home.x, l.z - home.z);

      // zu weit weg (z. B. weggeschubst, gelockt, Fluss runtergetrieben, durchs Portal) -> zurück nach Hause
      if (home.dim !== golem.dimension.id || dist > LEASH_RADIUS) {
        const homeDim = world.getDimension(home.dim);
        safeParticle(golem.dimension, "minecraft:villager_happy", { x: l.x, y: l.y + 1.5, z: l.z });
        try {
          golem.teleport({ x: home.x, y: home.y, z: home.z }, { dimension: homeDim });
        } catch {
          continue; // Zuhause gerade nicht geladen -> nächste Sekunde nochmal
        }
        safeParticle(homeDim, "minecraft:villager_happy", { x: home.x, y: home.y + 1.5, z: home.z });
        continue;
      }

      // Photosynthese: tagsüber in der Oberwelt langsam heilen (alle 5 s, 1 HP)
      if (isDay && dimId === "overworld" && tick % 5 === 0) {
        const hp = golem.getComponent("minecraft:health");
        if (hp && hp.currentValue < hp.effectiveMax) {
          hp.setCurrentValue(Math.min(hp.effectiveMax, hp.currentValue + 1));
          safeParticle(golem.dimension, "minecraft:villager_happy", { x: l.x, y: l.y + 2.6, z: l.z });
        }
      }
    }
  }
}, 20); // jede Sekunde
