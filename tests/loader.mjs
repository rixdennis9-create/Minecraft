export async function resolve(specifier, context, next) {
  if (specifier === "@minecraft/server") {
    return { url: new URL("./fake-server.mjs", import.meta.url).href, shortCircuit: true };
  }
  return next(specifier, context);
}
