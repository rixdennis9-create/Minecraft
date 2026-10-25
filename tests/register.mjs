// Leitet "@minecraft/server" in den Tests auf die Attrappe um:
//   node --import ./tests/register.mjs --test tests/
import { register } from "node:module";
register("./loader.mjs", import.meta.url);
