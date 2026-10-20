import { callable, toaster } from "@decky/api";
import { t } from "../i18n";

export type UpdateInfo = {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string | null;
  downloadUrl: string | null;
  htmlUrl: string | null;
  error?: string | null;
};

const checkForUpdateBackend = callable<[], UpdateInfo>("check_for_update");
const installUpdateBackend = callable<[downloadUrl: string], { ok: boolean; error?: string }>(
  "install_update",
);
const getPluginVersionBackend = callable<[], string>("get_plugin_version");

let cached: UpdateInfo | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const cb of listeners) {
    try {
      cb();
    } catch (err) {
      console.error("[RecentsFilter] update listener failed", err);
    }
  }
}

export function getCachedUpdateInfo(): UpdateInfo | null {
  return cached;
}

export function subscribeUpdateInfo(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export async function getInstalledVersion(): Promise<string> {
  try {
    return (await getPluginVersionBackend()) || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

export async function checkForUpdate(opts?: { silent?: boolean }): Promise<UpdateInfo> {
  const silent = opts?.silent !== false;
  try {
    const info = await checkForUpdateBackend();
    cached = info;
    notify();
    if (!silent && info.hasUpdate && info.latestVersion) {
      try {
        toaster.toast({
          title: t().pluginName,
          body: t().updateAvailableToast(info.latestVersion),
          critical: false,
        });
      } catch {
        /* toaster may be unavailable during early boot */
      }
    }
    return info;
  } catch (err) {
    const failed: UpdateInfo = {
      hasUpdate: false,
      currentVersion: cached?.currentVersion ?? "0.0.0",
      latestVersion: null,
      downloadUrl: null,
      htmlUrl: null,
      error: String(err),
    };
    cached = failed;
    notify();
    return failed;
  }
}

export async function installAvailableUpdate(): Promise<boolean> {
  const info = cached ?? (await checkForUpdate({ silent: true }));
  if (!info.hasUpdate || !info.downloadUrl) return false;

  try {
    toaster.toast({
      title: t().pluginName,
      body: t().updateInstalling(info.latestVersion || ""),
    });
  } catch {
    /* ignore */
  }

  try {
    const result = await installUpdateBackend(info.downloadUrl);
    if (!result?.ok) {
      try {
        toaster.toast({
          title: t().pluginName,
          body: t().updateFailed,
        });
      } catch {
        /* ignore */
      }
      return false;
    }

    try {
      toaster.toast({
        title: t().pluginName,
        body: t().updateInstalled(info.latestVersion || ""),
      });
    } catch {
      /* ignore */
    }

    // Hot-reload the plugin frontend so the new bundle is picked up.
    try {
      const loader = (globalThis as any).DeckyPluginLoader;
      await loader?.importPlugin?.("Recents Filter", info.latestVersion ?? undefined);
    } catch (err) {
      console.error("[RecentsFilter] hot-reload after update failed", err);
    }

    cached = {
      ...info,
      hasUpdate: false,
      currentVersion: info.latestVersion || info.currentVersion,
    };
    notify();
    return true;
  } catch (err) {
    console.error("[RecentsFilter] install update failed", err);
    try {
      toaster.toast({
        title: t().pluginName,
        body: t().updateFailed,
      });
    } catch {
      /* ignore */
    }
    return false;
  }
}

/** Background check a few seconds after boot so Steam networking is up. */
export function scheduleStartupUpdateCheck(): void {
  const run = () => {
    void checkForUpdate({ silent: false });
  };
  try {
    window.setTimeout(run, 12000);
  } catch {
    run();
  }
}
