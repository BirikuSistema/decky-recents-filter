import {
  afterPatch,
  fakeRenderComponent,
  findInReactTree,
  findInTree,
  findModuleByExport,
  MenuItem,
} from "@decky/ui";
import type { FC } from "react";
import { FaEye, FaEyeSlash } from "react-icons/fa";
import { decideAppVisibility } from "../filters/engine";
import { t } from "../i18n";
import { getCurrentSettings, setAppHiddenFromRecents } from "../settings/store";

type PatchHandle = { uninstall: () => void };

function isRenderable(component: unknown): boolean {
  return typeof component === "function" || (typeof component === "object" && component !== null);
}

function isOpeningAppContextMenu(items: any[]): boolean {
  if (!items?.length) return false;
  return !!findInReactTree(
    items,
    (x: any) => x?.props?.onSelected && x.props.onSelected.toString().includes("launchSource"),
  );
}

function resolveAppId(fallback: number, items: any[]): number {
  try {
    const owner = items.find((x: any) => x?._owner?.pendingProps?.overview?.appid);
    if (owner?._owner?.pendingProps?.overview?.appid) {
      return Number(owner._owner.pendingProps.overview.appid);
    }
    const foundApp = findInTree(items, (x: any) => x?.app?.appid, {
      walkable: ["props", "children"],
    });
    if (foundApp?.app?.appid) return Number(foundApp.app.appid);
  } catch {
    /* ignore */
  }
  return fallback;
}

function isHiddenInRecents(appId: number): boolean {
  return !decideAppVisibility(appId, getCurrentSettings()).show;
}

function spliceRecentsItem(children: any[], appId: number): void {
  if (!Array.isArray(children) || !isRenderable(MenuItem) || !appId) return;
  if (!getCurrentSettings().enabled) {
    const existingOff = children.findIndex((item) => item?.key === "recents-filter-toggle");
    if (existingOff !== -1) children.splice(existingOff, 1);
    return;
  }

  const existing = children.findIndex((item) => item?.key === "recents-filter-toggle");
  if (existing !== -1) children.splice(existing, 1);

  const hiddenNow = isHiddenInRecents(appId);
  const Icon = hiddenNow ? FaEye : FaEyeSlash;
  const item = (
    <MenuItem
      key="recents-filter-toggle"
      onSelected={() => {
        const hide = !isHiddenInRecents(appId);
        void setAppHiddenFromRecents(appId, hide);
      }}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
        <Icon style={{ opacity: 0.85 }} />
        {hiddenNow ? t().menuShow : t().menuHide}
      </span>
    </MenuItem>
  );

  const propertiesIdx = children.findIndex((child) =>
    findInReactTree(
      child,
      (x: any) => x?.onSelected && x.onSelected.toString().includes("AppProperties"),
    ),
  );
  children.splice(propertiesIdx >= 0 ? propertiesIdx : children.length, 0, item);
}

function findLibraryContextMenu(): any | null {
  try {
    const mod = findModuleByExport(
      (e: any) => typeof e?.toString === "function" && e.toString().includes("().LibraryContextMenu"),
    );
    if (!mod) return null;
    const sibling = Object.values(mod).find((entry: any) => {
      const text = entry?.toString?.() ?? "";
      return text.includes("navigator:") || text.includes("overview");
    }) as FC | undefined;
    if (!sibling) return null;
    const rendered = fakeRenderComponent(sibling);
    return rendered?.type ?? null;
  } catch (err) {
    console.error("[RecentsFilter] LibraryContextMenu not found", err);
    return null;
  }
}

export function installContextMenuPatch(): PatchHandle | null {
  if (!isRenderable(MenuItem) || !afterPatch) {
    console.log("[RecentsFilter] context menu APIs unavailable");
    return null;
  }

  const LibraryContextMenu = findLibraryContextMenu();
  if (!LibraryContextMenu?.prototype?.render) {
    console.log("[RecentsFilter] context menu prototype unavailable");
    return null;
  }

  const patches: { outer?: { unpatch: () => void }; inner?: { unpatch: () => void } } = {};
  const extraPatches: Array<{ unpatch: () => void }> = [];
  const patchedPrototypes = new WeakSet<object>();
  // The prototype patches below are installed once, so they must read the app of the
  // context menu being opened right now, not the one captured when they were installed.
  let currentAppId = 0;

  try {
    patches.outer = afterPatch(
      LibraryContextMenu.prototype,
      "render",
      (_args: unknown[], component: any) => {
        try {
          let appid = 0;
          if (component?._owner?.pendingProps?.overview?.appid) {
            appid = Number(component._owner.pendingProps.overview.appid);
          } else {
            const foundApp = findInTree(component?.props?.children, (x: any) => x?.app?.appid, {
              walkable: ["props", "children"],
            });
            if (foundApp?.app?.appid) appid = Number(foundApp.app.appid);
          }
          if (appid) currentAppId = appid;

          if (!patches.inner && component?.type) {
            patches.inner = afterPatch(component, "type", (_a: unknown, ret: any) => {
              try {
                const proto = ret?.type?.prototype;
                if (proto && patchedPrototypes.has(proto)) return ret;
                if (proto) patchedPrototypes.add(proto);
                if (ret?.type?.prototype?.render) {
                  extraPatches.push(
                    afterPatch(ret.type.prototype, "render", (_b: unknown, ret2: any) => {
                      const menuItems = ret2?.props?.children?.[0];
                      if (!isOpeningAppContextMenu(menuItems)) return ret2;
                      const resolved = resolveAppId(currentAppId, menuItems);
                      spliceRecentsItem(menuItems, resolved);
                      return ret2;
                    }),
                  );
                }
                if (ret?.type?.prototype?.shouldComponentUpdate) {
                  extraPatches.push(
                    afterPatch(
                      ret.type.prototype,
                      "shouldComponentUpdate",
                      ([nextProps]: any[], shouldUpdate: any) => {
                        const menuItems = nextProps?.children;
                        if (Array.isArray(menuItems) && isOpeningAppContextMenu(menuItems)) {
                          spliceRecentsItem(menuItems, resolveAppId(currentAppId, menuItems));
                        }
                        return shouldUpdate;
                      },
                    ),
                  );
                }
              } catch (err) {
                console.error("[RecentsFilter] inner context menu patch failed", err);
              }
              return ret;
            });
          } else if (Array.isArray(component?.props?.children) && appid) {
            spliceRecentsItem(component.props.children, appid);
          }
        } catch (err) {
          console.error("[RecentsFilter] outer context menu patch failed", err);
        }
        return component;
      },
    );
  } catch (err) {
    console.error("[RecentsFilter] failed to patch context menu", err);
    return null;
  }

  console.log("[RecentsFilter] context menu patch installed");
  return {
    uninstall() {
      for (const patch of [...extraPatches, patches.inner, patches.outer]) {
        try {
          patch?.unpatch();
        } catch {
          /* ignore */
        }
      }
    },
  };
}
