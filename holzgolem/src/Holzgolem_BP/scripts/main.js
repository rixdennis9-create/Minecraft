import { world, system } from "@minecraft/server";
import { findColumn, columnPositions, blockedAround, isStructureBlock, isPassable } from "./structure.js";
import { GolemRegistry, cardText } from "./registry.js";
import { CARD_ID, giveCard, refreshCard, isHoldingCard } from "./card.js";

// ============================================================
//  Holzgolem – Einstellungen
// ============================================================
const GOLEM_ID = "dr:wood_golem";
const GUARD_RADIUS = 50; // Schutzradius um den Beschwörungsort
const LEASH_RADIUS = 64; // weiter weg -> Golem wird zurückgeholt

// Bestand pro Spieler, gespeichert in World-Dynamic-Properties
const registry = new GolemRegistry({
  get: (k) => world.getDynamicProperty(k),
  set: (k, v) => world.setDynamicProperty(k, v),
  keys: () => world.getDynamicPropertyIds(),
});

function safeParticle(dim, id, loc) {
  try {
    dim.spawnParticle(id, loc);
  } catch {}
}

function onlinePlayer(pid) {
  return world.getAllPlayers().find((p) => p.id === pid);
}

function updateCardFor(pid, redeliver = false) {
  const player = onlinePlayer(pid);
  if (player) refreshCard(player, registry.count(pid), registry.limit(pid), redeliver);
}

// ============================================================
//  Bau erkennen (nur wenn ein Holzblock oder Stamm gesetzt wird)
// ============================================================
function typeAt(dim, x, y, z) {
  try {
    return dim.getBlock({ x, y, z })?.typeId;
  } catch {
    return undefined; // nicht geladen / außerhalb der Welt
  }
}

function isFreeAt(dim, x, y, z) {
  try {
    const b = dim.getBlock({ x, y, z });
    return !!b && (b.isAir || b.isLiquid || isPassable(b.typeId));
  } catch {
    return false;
  }
}

const busy = new Set(); // Säulen, die gerade verarbeitet werden (gegen Doppel-Events)
const posKey = (dim, p) => `${dim.id}:${p.x}:${p.y}:${p.z}`;

world.afterEvents.playerPlaceBlock.subscribe((ev) => {
  const { block, player, dimension } = ev;
  if (!isStructureBlock(block.typeId)) return;
  const base = findColumn((x, y, z) => typeAt(dimension, x, y, z), block.location);
  if (!base) return;
  const key = posKey(dimension, base);
  if (busy.has(key)) return;
  busy.add(key);
  // einen Tick warten, damit die Platzierung sauber abgeschlossen ist
  system.run(() => {
    try {
      trySummon(player, dimension, base);
    } finally {
      busy.delete(key);
    }
  });
});

function trySummon(player, dim, base) {
  if (!player?.isValid) return;
  // Bau nochmal prüfen – er könnte inzwischen verändert worden sein
  if (!findColumn((x, y, z) => typeAt(dim, x, y, z), base)) return;

  const pid = player.id;
  const count = registry.count(pid);
  const limit = registry.limit(pid);
  if (count >= limit) {
    player.onScreenDisplay.setActionBar(`§cGolem-Limit erreicht: ${count}/${limit}`);
    player.sendMessage(`§cGolem-Limit erreicht: ${count}/${limit}. §7Dein Bauwerk bleibt stehen.`);
    return;
  }

  const blocked = blockedAround((x, y, z) => isFreeAt(dim, x, y, z), base);
  if (blocked.length > 0) {
    player.onScreenDisplay.setActionBar("§cZu wenig Platz für den Holzgolem!");
    player.sendMessage(
      `§cZu wenig Platz: §7Rund um die unteren 3 Blöcke der Säule muss es frei sein (${blocked.length} Blöcke im Weg). Dein Bauwerk bleibt stehen.`
    );
    return;
  }

  const spawnLoc = { x: base.x + 0.5, y: base.y, z: base.z + 0.5 };
  let golem;
  try {
    golem = dim.spawnEntity(GOLEM_ID, spawnLoc);
  } catch (e) {
    player.sendMessage(`§cDer Holzgolem konnte nicht erscheinen (${e}). Dein Bauwerk bleibt stehen.`);
    return;
  }

  golem.setDynamicProperty("home_x", spawnLoc.x);
  golem.setDynamicProperty("home_y", spawnLoc.y);
  golem.setDynamicProperty("home_z", spawnLoc.z);
  golem.setDynamicProperty("home_dim", dim.id);
  golem.setDynamicProperty("owner", player.name);
  golem.setDynamicProperty("owner_id", pid);
  registry.add(pid, player.name, golem.id, spawnLoc, dim.id);

  // Bauwerk erst jetzt verbrauchen – der Golem steht schon
  for (const pos of columnPositions(base)) {
    safeParticle(dim, "minecraft:villager_happy", { x: pos.x + 0.5, y: pos.y + 0.5, z: pos.z + 0.5 });
    try {
      dim.getBlock(pos)?.setType("minecraft:air");
    } catch {}
  }

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

  const now = registry.count(pid);
  player.onScreenDisplay.setActionBar(`§6Ein Holzgolem erwacht! §7(${now}/${limit}) Er beschützt ${GUARD_RADIUS} Blöcke um diesen Ort.`);

  if (!registry.cardGiven(pid)) {
    const where = giveCard(player, now, limit);
    registry.setCardGiven(pid);
    player.sendMessage(
      where === "inventory"
        ? "§6Du hast die §eHolzgolem-Live-Card §6erhalten! §7Halte sie in der Hand, um deinen Bestand zu sehen."
        : "§6Dein Inventar ist voll – die §eHolzgolem-Live-Card §6liegt vor deinen Füßen."
    );
  } else {
    refreshCard(player, now, limit);
  }
}

// ============================================================
//  Tod & Entfernen
// ============================================================
world.afterEvents.entityDie.subscribe(
  (ev) => {
    const pid = registry.remove(ev.deadEntity.id);
    if (pid === undefined) return;
    const player = onlinePlayer(pid);
    if (player) {
      player.sendMessage(`§7Einer deiner Holzgolems ist gefallen. §6Bestand: ${registry.count(pid)}/${registry.limit(pid)}`);
      updateCardFor(pid);
    }
  },
  { entityTypes: [GOLEM_ID] }
);

// Ist das Gebiet um einen Ort geladen? (getBlock wirft/liefert nichts, wenn nicht)
function isAreaLoaded(dim, loc) {
  for (const [dx, dz] of [[0, 0], [4, 0], [-4, 0], [0, 4], [0, -4]]) {
    try {
      if (!dim.getBlock({ x: loc.x + dx, y: loc.y, z: loc.z + dz })) return false;
    } catch {
      return false;
    }
  }
  return true;
}

/**
 * Abgleich: Golems, die im Bestand stehen, aber trotz geladenem Gebiet
 * mehrfach nicht auffindbar sind (z. B. per Befehl entfernt), werden
 * ausgetragen. Golems in entladenen Chunks bleiben unangetastet.
 */
function reconcile() {
  for (const pid of registry.players()) {
    let changed = false;
    for (const g of registry.golems(pid)) {
      const e = world.getEntity(g.eid);
      if (e?.isValid) {
        registry.seen(g.eid, e.location, e.dimension.id);
        continue;
      }
      let dim;
      try {
        dim = world.getDimension(g.d);
      } catch {
        continue;
      }
      if (isAreaLoaded(dim, g) && registry.missed(g.eid) !== undefined) changed = true;
    }
    if (changed) updateCardFor(pid);
  }
}

// ============================================================
//  Karte: Beitreten/Respawn, Benutzen
// ============================================================
world.afterEvents.playerSpawn.subscribe((ev) => {
  const pid = ev.player.id;
  if (!registry.cardGiven(pid)) return;
  // kurz warten, bis das Inventar geladen ist
  system.runTimeout(() => updateCardFor(pid, true), 20);
});

world.afterEvents.itemUse.subscribe((ev) => {
  if (ev.itemStack?.typeId !== CARD_ID) return;
  const player = ev.source;
  const pid = player.id;
  const t = cardText(registry.count(pid), registry.limit(pid));
  const lines = ["§6=== HOLZGOLEM-LIVE-CARD ===", ...t.lore.slice(0, 2)];
  for (const g of registry.golems(pid)) {
    lines.push(`§7- Golem bei ${g.x} ${g.y} ${g.z} (${g.d.replace("minecraft:", "")})`);
  }
  player.sendMessage(lines.join("\n"));
  refreshCard(player, registry.count(pid), registry.limit(pid));
});

// ============================================================
//  Schutzzone, Heimweg, Photosynthese & Bestandspflege
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

// Golem mit Besitzer, der (noch) nicht im Bestand steht -> wieder aufnehmen
function adopt(golem) {
  const pid = golem.getDynamicProperty("owner_id");
  if (typeof pid !== "string" || registry.ownerOf(golem.id) !== undefined) return;
  registry.add(pid, String(golem.getDynamicProperty("owner") ?? ""), golem.id, golem.location, golem.dimension.id);
  updateCardFor(pid);
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
      adopt(golem);
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

  const players = world.getAllPlayers();

  // Bestand abgleichen und Karten aktualisieren (alle 5 s)
  if (tick % 5 === 0) {
    reconcile();
    for (const player of players) {
      if (registry.cardGiven(player.id)) refreshCard(player, registry.count(player.id), registry.limit(player.id));
    }
  }

  // Live-Anzeige, solange die Karte in der Hand ist
  for (const player of players) {
    if (isHoldingCard(player)) {
      player.onScreenDisplay.setActionBar(cardText(registry.count(player.id), registry.limit(player.id)).line);
    }
  }
}, 20); // jede Sekunde
