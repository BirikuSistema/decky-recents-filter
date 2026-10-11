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

// The wrapper lives on Steam's own component functions, so it survives a plugin reload.
// Handlers are therefore stored in a swappable slot: a newer plugin instance takes the slot
// over, and an unloaded one leaves it empty (the wrapper then does nothing).
const WRAPPER = "__recentsFilterWrapperV3";

type HandlerSlot = { handler: ((ret: any) => any) | null };
const slots = new Set<HandlerSlot>();

/** Makes every wrapper installed by this plugin instance inert. */
export function releaseAllPatches(): void {
  for (const slot of slots) slot.handler = null;
  slots.clear();
}

function isClassComponent(fn: unknown): fn is { prototype: { render: Function } } {
  return (
    typeof fn === "function" &&
    !!(fn as any).prototype &&
    (typeof (fn as any).prototype.render === "function" ||
      !!(fn as any).prototype.isReactComponent)
  );
}

function wrapFn(original: Function, handler: (ret: any) => any): Function {
  const existing = (original as any)[WRAPPER];
  if (existing?.__slot) {
    existing.__slot.handler = handler;
    slots.add(existing.__slot);
    return existing;
  }
  const slot: HandlerSlot = { handler };
  slots.add(slot);
  const wrapped = function patchedType(this: unknown, ...args: unknown[]) {
    const ret = original.apply(this, args);
    const current = slot.handler;
    if (!current) return ret;
    try {
      return current(ret) ?? ret;
    } catch {
      return ret;
    }
  };
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

  if (typeof original === "object" && original.type) {
    if (isClassComponent(original.type)) {
      wrapRender(original.type.prototype as { render: Function & Record<string, any> }, handler);
      return true;
    }
    if (typeof original.type === "function") {
      const wrappedType = wrapFn(original.type, handler);
      if (!original[WRAPPER]) {
        original[WRAPPER] = { ...original, type: wrappedType };
      }
      node.type = original[WRAPPER];
      return true;
    }
  }

  return false;
}
