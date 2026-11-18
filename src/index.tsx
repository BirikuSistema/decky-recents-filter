import { staticClasses } from "@decky/ui";
import { definePlugin, routerHook } from "@decky/api";
import { FaFilter } from "react-icons/fa";
import { getCurrentSettings, loadSettings, updateSettings } from "./settings/store";
import { installContextMenuPatch } from "./recents/contextMenuPatch";
import { installRecentsFilter, requestRecentsRefresh } from "./recents/recentsPatch";
import { installSessionTracker } from "./recents/sessionTracker";
import { scheduleStartupUpdateCheck } from "./updater/updater";
import { QamPanel } from "./ui/QamPanel";

export default definePlugin(() => {
  console.log("[RecentsFilter] initializing");

  let alive = true;
  const uninstallers: Array<() => void> = [];

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
  try {
    const tracker = installSessionTracker({
      getSettings: getCurrentSettings,
      saveHolds: (sessionHolds) => updateSettings({ sessionHolds }),
      requestRefresh: requestRecentsRefresh,
    });
    uninstallers.push(tracker.uninstall);
  } catch (err) {
    console.error("[RecentsFilter] failed to install session tracker", err);
  }

  loadSettings()
    .catch((err) => {
      console.error("[RecentsFilter] failed to load settings, using defaults", err);
    })
    .finally(() => {
      if (!alive) return;
      scheduleStartupUpdateCheck();
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
