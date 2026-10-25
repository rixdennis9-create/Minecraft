// Kleine Attrappe von @minecraft/server – nur so viel, wie die Holzgolem-
// Scripts benutzen. Ersetzt KEIN echtes Minecraft: Spawnen, Rendern und
// Physik werden nicht simuliert, nur die Script-Logik.

export const ItemLockMode = { inventory: "inventory", none: "none", slot: "slot" };

export class ItemStack {
  constructor(typeId, amount = 1) {
    this.typeId = typeId;
    this.amount = amount;
    this.nameTag = undefined;
    this.keepOnDeath = false;
    this.lockMode = ItemLockMode.none;
    this._lore = [];
  }
  getLore() {
    return [...this._lore];
  }
  setLore(lore) {
    this._lore = [...(lore ?? [])];
  }
  clone() {
    const c = new ItemStack(this.typeId, this.amount);
    Object.assign(c, this, { _lore: [...this._lore] });
    return c;
  }
}

class Container {
  constructor(size = 36) {
    this.slots = new Array(size).fill(undefined);
  }
  get size() {
    return this.slots.length;
  }
  getItem(i) {
    return this.slots[i]?.clone();
  }
  setItem(i, item) {
    this.slots[i] = item ? item.clone() : undefined;
  }
  addItem(item) {
    const i = this.slots.findIndex((s) => s === undefined);
    if (i < 0) return item;
    this.slots[i] = item.clone();
    return undefined;
  }
}

class Signal {
  constructor() {
    this.subs = [];
  }
  subscribe(cb, options) {
    this.subs.push({ cb, options });
    return cb;
  }
  fire(ev, entity) {
    for (const { cb, options } of this.subs) {
      if (options?.entityTypes && !options.entityTypes.includes(entity?.typeId)) continue;
      cb(ev);
    }
  }
}

const key = (x, y, z) => `${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`;

class Block {
  constructor(dim, loc) {
    this.dimension = dim;
    this.location = { x: Math.floor(loc.x), y: Math.floor(loc.y), z: Math.floor(loc.z) };
  }
  get typeId() {
    return this.dimension.blocks.get(key(this.location.x, this.location.y, this.location.z)) ?? "minecraft:air";
  }
  get isAir() {
    return this.typeId === "minecraft:air";
  }
  get isLiquid() {
    return this.typeId === "minecraft:water" || this.typeId === "minecraft:lava";
  }
  setType(id) {
    const k = key(this.location.x, this.location.y, this.location.z);
    if (id === "minecraft:air") this.dimension.blocks.delete(k);
    else this.dimension.blocks.set(k, id);
  }
}

let nextId = 1;

export class Entity {
  constructor(typeId, dim, loc) {
    this.id = String(-(nextId++ * 4294967296 + 7)); // ähnlich wie echte IDs
    this.typeId = typeId;
    this.dimension = dim;
    this.location = { ...loc };
    this.props = new Map();
    this.alive = true;
    this.removed = false;
    this.health = { currentValue: 60, effectiveMax: 60, setCurrentValue: (v) => (this.health.currentValue = v) };
  }
  get isValid() {
    return this.alive && !this.removed && this.dimension.isLoaded(this.location.x, this.location.z);
  }
  getDynamicProperty(k) {
    return this.props.get(k);
  }
  setDynamicProperty(k, v) {
    if (v === undefined) this.props.delete(k);
    else this.props.set(k, v);
  }
  getComponent(name) {
    return name === "minecraft:health" ? this.health : undefined;
  }
  teleport(loc, opts) {
    if (opts?.dimension) this.dimension = opts.dimension;
    this.location = { ...loc };
  }
  /** Test-Helfer: sterben lassen (feuert entityDie) */
  kill() {
    this.alive = false;
    world.afterEvents.entityDie.fire({ deadEntity: this }, this);
  }
  /** Test-Helfer: ohne Tod entfernen (z. B. /tp ins Nichts mit despawn) */
  remove() {
    this.removed = true;
  }
}

export class Player extends Entity {
  constructor(name, dim, loc) {
    super("minecraft:player", dim, loc);
    this.name = name;
    this.inventory = new Container(36);
    this.selectedSlotIndex = 0;
    this.messages = [];
    this.actionbar = [];
    this.onScreenDisplay = { setActionBar: (t) => this.actionbar.push(t) };
  }
  sendMessage(m) {
    this.messages.push(m);
  }
  getComponent(name) {
    if (name === "minecraft:inventory") return { container: this.inventory };
    return super.getComponent(name);
  }
}

class Dimension {
  constructor(id) {
    this.id = id;
    this.blocks = new Map();
    this.unloaded = []; // Liste von {x1,z1,x2,z2}
    this.drops = [];
  }
  isLoaded(x, z) {
    return !this.unloaded.some((r) => x >= r.x1 && x <= r.x2 && z >= r.z1 && z <= r.z2);
  }
  getBlock(loc) {
    if (!this.isLoaded(loc.x, loc.z)) throw new Error("LocationInUnloadedChunkError");
    if (loc.y < -64 || loc.y > 319) return undefined;
    return new Block(this, loc);
  }
  spawnEntity(typeId, loc) {
    if (world.failNextSpawn) {
      world.failNextSpawn = false;
      throw new Error("Spawn fehlgeschlagen");
    }
    const e = new Entity(typeId, this, loc);
    world.entities.push(e);
    return e;
  }
  spawnItem(item, loc) {
    this.drops.push({ item: item.clone(), loc });
  }
  getEntities(opts) {
    return world.entities.filter((e) => e.dimension === this && e.isValid && (!opts?.type || e.typeId === opts.type));
  }
  spawnParticle() {}
  playSound() {}
}

const dims = {
  "minecraft:overworld": new Dimension("minecraft:overworld"),
  "minecraft:nether": new Dimension("minecraft:nether"),
  "minecraft:the_end": new Dimension("minecraft:the_end"),
};

export const world = {
  afterEvents: {
    playerPlaceBlock: new Signal(),
    entityDie: new Signal(),
    playerSpawn: new Signal(),
    itemUse: new Signal(),
  },
  props: new Map(),
  entities: [],
  players: [],
  failNextSpawn: false,
  getDynamicProperty(k) {
    return this.props.get(k);
  },
  setDynamicProperty(k, v) {
    if (v === undefined) this.props.delete(k);
    else this.props.set(k, v);
  },
  getDynamicPropertyIds() {
    return [...this.props.keys()];
  },
  getDimension(id) {
    const d = dims[id.includes(":") ? id : "minecraft:" + id];
    if (!d) throw new Error("unknown dimension " + id);
    return d;
  },
  getEntity(id) {
    return this.entities.find((e) => e.id === id && e.isValid);
  },
  getAllPlayers() {
    return [...this.players];
  },
  getTimeOfDay() {
    return 6000;
  },
};

// ---------- system: Ticks werden von den Tests vorgespult ----------
const queue = [];
const intervals = [];
let now = 0;

export const system = {
  run(cb) {
    queue.push({ at: now, cb });
  },
  runTimeout(cb, ticks = 1) {
    queue.push({ at: now + ticks, cb });
  },
  runInterval(cb, ticks = 1) {
    intervals.push({ cb, every: ticks, next: now + ticks });
  },
};

/** Test-Helfer: n Ticks vergehen lassen */
export function advance(ticks = 1) {
  for (let t = 0; t < ticks; t++) {
    now++;
    for (const job of queue.filter((j) => j.at <= now)) {
      queue.splice(queue.indexOf(job), 1);
      job.cb();
    }
    for (const iv of intervals) {
      if (now >= iv.next) {
        iv.next = now + iv.every;
        iv.cb();
      }
    }
  }
}

/** Test-Helfer: Welt leeren (Registrierungen der Scripts bleiben) */
export function resetWorld() {
  for (const d of Object.values(dims)) {
    d.blocks.clear();
    d.unloaded = [];
    d.drops = [];
  }
  world.props.clear();
  world.entities = [];
  world.players = [];
  world.failNextSpawn = false;
  queue.length = 0;
}

/** Test-Helfer: Spieler setzt einen Block (wie ein Tipp auf dem Handy) */
export function placeBlock(player, dim, loc, typeId) {
  const block = dim.getBlock(loc);
  block.setType(typeId);
  world.afterEvents.playerPlaceBlock.fire({ block, player, dimension: dim });
  advance(1);
}

export function addPlayer(name, dimId = "overworld") {
  const p = new Player(name, world.getDimension(dimId), { x: 0, y: 64, z: 0 });
  world.players.push(p);
  return p;
}
