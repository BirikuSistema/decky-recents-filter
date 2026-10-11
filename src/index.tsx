import { staticClasses } from "@decky/ui";
import { definePlugin, routerHook } from "@decky/api";
import { FaFilter } from "react-icons/fa";
import { loadSettings } from "./settings/store";
import { installContextMenuPatch } from "./recents/contextMenuPatch";
import { installRecentsFilter } from "./recents/recentsPatch";
import { QamPanel } from "./ui/QamPanel";

export default definePlugin(() => {
  console.log("[RecentsFilter] initializing");

  let alive = true;
  const uninstallers: Array<() => void> = [];

  loadSettings()
    .catch((err) => {
      console.error("[RecentsFilter] failed to load settings, using defaults", err);
    })
    .finally(() => {
      if (!alive) return;
      try {
        const recents = installRecentsFilter(routerHook);
        if (recents?.uninstall) uninstallers.push(recents.uninstall);
      } catch (err) {
        console.error("[RecentsFilter] failed to install recents patch", err);
      }
      try {
        const menu = installContextMenuPatch();
        if (menu?.uninstall) uninstallers.push(menu.uninstall);
      } catch (err) {
        console.error("[RecentsFilter] failed to install context menu patch", err);
      }
    });

  const titleClass = (staticClasses as { Title?: string } | undefined)?.Title;

  return {
    name: "Recents Filter",
    titleView: <div className={titleClass}>Recents Filter</div>,
    content: <QamPanel />,
    icon: <FaFilter />,
    alwaysRender: false,
    onDismount() {
      alive = false;
      for (const uninstall of uninstallers) {
        try {
          uninstall();
        } catch (err) {
          console.error("[RecentsFilter] uninstall failed", err);
        }
      }
      console.log("[RecentsFilter] unloaded");
    },
  };
});
