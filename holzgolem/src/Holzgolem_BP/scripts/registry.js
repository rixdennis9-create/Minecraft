// ============================================================
//  Golem-Bestand pro Spieler (reine Logik, ohne Minecraft-Import)
//
//  Gespeichert wird in World-Dynamic-Properties, ein Eintrag pro
//  Spieler:  "wg:p:<Spieler-ID>" -> JSON
//    { n: Name, lim: Limit, card: Karte schon gegeben?,
//      g: { <Entity-ID>: { x, y, z, d: Dimension, miss: Fehlversuche } } }
//
//  Schlüssel ist die dauerhafte Entity-ID des Golems. Dadurch zählt ein
//  Golem nie doppelt, auch nicht nach dem Neuladen der Welt.
// ============================================================

export const DEFAULT_LIMIT = 2;
// So oft muss ein Golem bei geladenem Gebiet fehlen, bevor er als entfernt gilt
export const MAX_MISSES = 3;
const PREFIX = "wg:p:";

export class GolemRegistry {
  /** store: { get(key), set(key, value | undefined), keys() } */
  constructor(store) {
    this.store = store;
  }

  _load(pid) {
    const raw = this.store.get(PREFIX + pid);
    if (typeof raw === "string") {
      try {
        const rec = JSON.parse(raw);
        if (rec && typeof rec === "object") {
          rec.g = rec.g && typeof rec.g === "object" ? rec.g : {};
          return rec;
        }
      } catch {
        // kaputter Eintrag -> neu anfangen, die Golems melden sich selbst wieder (adopt)
      }
    }
    return { n: "", lim: DEFAULT_LIMIT, card: false, g: {} };
  }

  _save(pid, rec) {
    this.store.set(PREFIX + pid, JSON.stringify(rec));
  }

  players() {
    return this.store
      .keys()
      .filter((k) => k.startsWith(PREFIX))
      .map((k) => k.slice(PREFIX.length));
  }

  count(pid) {
    return Object.keys(this._load(pid).g).length;
  }

  limit(pid) {
    const lim = this._load(pid).lim;
    return Number.isInteger(lim) && lim > 0 ? lim : DEFAULT_LIMIT;
  }

  canSummon(pid) {
    return this.count(pid) < this.limit(pid);
  }

  golems(pid) {
    return Object.entries(this._load(pid).g).map(([eid, info]) => ({ eid, ...info }));
  }

  /** Neuen Golem eintragen. false, wenn die Entity-ID schon bekannt ist. */
  add(pid, name, eid, loc, dim) {
    if (this.ownerOf(eid) !== undefined) return false;
    const rec = this._load(pid);
    if (name) rec.n = name;
    rec.g[eid] = { x: Math.floor(loc.x), y: Math.floor(loc.y), z: Math.floor(loc.z), d: dim, miss: 0 };
    this._save(pid, rec);
    return true;
  }

  /** Golem austragen (Tod / dauerhaft entfernt). Gibt die Spieler-ID zurück. */
  remove(eid) {
    const pid = this.ownerOf(eid);
    if (pid === undefined) return undefined;
    const rec = this._load(pid);
    delete rec.g[eid];
    this._save(pid, rec);
    return pid;
  }

  ownerOf(eid) {
    for (const pid of this.players()) {
      if (eid in this._load(pid).g) return pid;
    }
    return undefined;
  }

  /** Golem ist geladen und lebt: Position merken, Fehlversuche zurücksetzen. */
  seen(eid, loc, dim) {
    const pid = this.ownerOf(eid);
    if (pid === undefined) return;
    const rec = this._load(pid);
    const g = rec.g[eid];
    const next = { x: Math.floor(loc.x), y: Math.floor(loc.y), z: Math.floor(loc.z), d: dim, miss: 0 };
    if (g.x === next.x && g.y === next.y && g.z === next.z && g.d === next.d && g.miss === 0) return;
    rec.g[eid] = next;
    this._save(pid, rec);
  }

  /**
   * Golem fehlt, obwohl sein letzter Ort geladen ist. Nach MAX_MISSES
   * Prüfungen in Folge wird er ausgetragen. Gibt dann die Spieler-ID zurück.
   */
  missed(eid) {
    const pid = this.ownerOf(eid);
    if (pid === undefined) return undefined;
    const rec = this._load(pid);
    const g = rec.g[eid];
    g.miss = (g.miss ?? 0) + 1;
    if (g.miss >= MAX_MISSES) delete rec.g[eid];
    this._save(pid, rec);
    return g.miss >= MAX_MISSES ? pid : undefined;
  }

  cardGiven(pid) {
    return this._load(pid).card === true;
  }

  setCardGiven(pid) {
    const rec = this._load(pid);
    rec.card = true;
    this._save(pid, rec);
  }
}

/** Text der Live-Card für einen Bestand. */
export function cardText(count, limit) {
  const free = Math.max(0, limit - count);
  let status;
  if (count === 0) status = "§aBereit zum Beschwören";
  else if (free === 0) status = "§cLimit erreicht";
  else status = `§a${free} ${free === 1 ? "Platz" : "Plätze"} verfügbar`;
  return {
    name: `§6Holzgolem-Live-Card §7(${count}/${limit})`,
    lore: [`§eAktive Golems: §f${count}/${limit}`, `§eStatus: ${status}`, "§7Benutzen: Details anzeigen"],
    line: `§6Holzgolems: §f${count}/${limit} §7| ${status}`,
  };
}
