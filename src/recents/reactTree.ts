import { subscribeRecentsRefresh } from "./refreshBus";

type FilterFn = (element: unknown) => boolean;

export function findInTree(
  parent: unknown,
  filter: FilterFn,
  walkable: string[] = ["props", "children", "child", "sibling"],
): any | null {
  if (!parent || typeof parent !== "object") return null;

  try {
    if (filter(parent)) return parent;
  } catch {
    return null;
  }

  if (Array.isArray(parent)) {
    for (const item of parent) {
      const found = findInTree(item, filter, walkable);
      if (found) return found;
    }
    return null;
  }

  const rec = parent as Record<string, unknown>;
  for (const key of walkable) {
    if (!(key in rec)) continue;
    const found = findInTree(rec[key], filter, walkable);
    if (found) return found;
  }
  return null;
}

export function findInReactTree(node: unknown, filter: FilterFn): any | null {
  return findInTree(node, filter);
}

// Bump the wrapper key whenever the patch contract changes so a hot-reloaded
// plugin replaces the previous wrapper instead of reusing a stale slot.
const WRAPPER = "__recentsFilterWrapperV4";

type HandlerSlot = { handler: ((ret: any) => any) | null };
const slots = new Set<HandlerSlot>();

/** Makes every wrapper installed by this plugin instance inert. */
export function releaseAllPatches(): void {
  for (const slot of slots) slot.handler = null;
  slots.clear();
}

function getReact(): any | null {
  try {
    return (globalThis as any).SP_REACT ?? (globalThis as any).React ?? null;
  } catch {
    return null;
  }
}

function isClassComponent(fn: unknown): fn is { prototype: { render: Function } } {
  return (
    typeof fn === "function" &&
    !!(fn as any).prototype &&
    (typeof (fn as any).prototype.render === "function" ||
      !!(fn as any).prototype.isReactComponent)
  );
}

function callOriginal(original: Function, props: unknown, refOrRest?: unknown): any {
  try {
    if (refOrRest !== undefined) return original(props, refOrRest);
    return original(props);
  } catch {
    try {
      return original(props);
    } catch {
      return null;
    }
  }
}

/**
 * Wraps a Steam render function so it re-runs whenever settings/refresh fire.
 * An internal useState subscription bypasses React.memo on the parent fiber.
 */
function wrapFn(original: Function, handler: (ret: any) => any): Function {
  const existing = (original as any)[WRAPPER];
  if (existing?.__slot) {
    existing.__slot.handler = handler;
    slots.add(existing.__slot);
    return existing;
  }

  const slot: HandlerSlot = { handler };
  slots.add(slot);
  const React = getReact();

  const wrapped = function PatchedRecentsType(this: unknown, props?: unknown, ref?: unknown) {
    // Class-style / unbound call path (no hooks).
    if (!React?.useState || !React?.useEffect || this != null) {
      const ret = original.apply(this, arguments as unknown as unknown[]);
      const current = slot.handler;
      if (!current) return ret;
      try {
        return current(ret) ?? ret;
      } catch {
        return ret;
      }
    }

    const [, setTick] = React.useState(0);
    React.useEffect(() => subscribeRecentsRefresh(() => setTick((n: number) => n + 1)), []);

    const ret = callOriginal(original, props, ref);
    const current = slot.handler;
    if (!current) return ret;
    try {
      return current(ret) ?? ret;
    } catch {
      return ret;
    }
  };

  try {
    Object.defineProperty(wrapped, "name", {
      value: `RF(${(original as any).displayName || original.name || "Component"})`,
      configurable: true,
    });
  } catch {
    /* ignore */
  }
  (wrapped as any).displayName = `RF(${(original as any).displayName || original.name || "Component"})`;
  (wrapped as any).__slot = slot;
  (original as any)[WRAPPER] = wrapped;
  (wrapped as any)[WRAPPER] = wrapped;
  return wrapped;
}

function wrapRender(proto: { render: Function & Record<string, any> }, handler: (ret: any) => any): void {
  const existing = proto.render?.[WRAPPER];
  if (existing?.__slot) {
    existing.__slot.handler = handler;
    slots.add(existing.__slot);
    return;
  }
  proto.render = wrapFn(proto.render, handler) as typeof proto.render;
}

/** Peel React.memo / forwardRef / observer layers until we reach a render function. */
function unwrapRenderFn(type: unknown): Function | null {
  let current: any = type;
  for (let i = 0; i < 5 && current; i++) {
    if (typeof current === "function") {
      if (isClassComponent(current)) return null;
      return current;
    }
    if (typeof current === "object") {
      if (typeof current.render === "function") return current.render;
      if (current.type != null) {
        current = current.type;
        continue;
      }
    }
    break;
  }
  return null;
}

function unwrapClass(type: unknown): { prototype: { render: Function } } | null {
  let current: any = type;
  for (let i = 0; i < 5 && current; i++) {
    if (isClassComponent(current)) return current as { prototype: { render: Function } };
    if (typeof current === "object" && current.type != null) {
      current = current.type;
      continue;
    }
    break;
  }
  return null;
}

export function patchElementType(node: any, handler: (ret: any) => any): boolean {
  if (!node || node.type == null) return false;

  const original = node.type;

  if (isClassComponent(original)) {
    wrapRender(original.prototype as { render: Function & Record<string, any> }, handler);
    return true;
  }

  if (typeof original === "function") {
    node.type = wrapFn(original, handler);
    return true;
  }

  // React.memo / forwardRef / observer wrappers — replace the whole object with a
  // plain function so our useState subscription is never skipped by memo.
  if (typeof original === "object") {
    const klass = unwrapClass(original);
    if (klass) {
      wrapRender(klass.prototype as { render: Function & Record<string, any> }, handler);
      return true;
    }

    const inner = unwrapRenderFn(original);
    if (typeof inner === "function") {
      const existing = (original as any)[WRAPPER];
      if (existing?.__slot) {
        existing.__slot.handler = handler;
        slots.add(existing.__slot);
        node.type = existing;
        return true;
      }
      const wrapped = wrapFn(inner, handler);
      (original as any)[WRAPPER] = wrapped;
      node.type = wrapped;
      return true;
    }
  }

  return false;
}
