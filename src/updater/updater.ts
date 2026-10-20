import { callable, toaster } from "@decky/api";
import { t } from "../i18n";

export type UpdateInfo = {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string | null;
  downloadUrl: string | null;
  assetApiUrl?: string | null;
  htmlUrl: string | null;
  error?: string | null;
};

export type InstallResult = {
  ok: boolean;
  error?: string;
  stage?: string;
  version?: string;
  method?: string;
};

const checkForUpdateBackend = callable<[], UpdateInfo>("check_for_update");
const installUpdateBackend = callable<
  [payload: { downloadUrl: string; assetApiUrl?: string | null }],
  InstallResult
>("install_update");
const getPluginVersionBackend = callable<[], string>("get_plugin_version");
const getUpdateDebugLogBackend = callable<[], string>("get_update_debug_log");

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

/** Prefer Decky's own installer (unloads plugin cleanly). Falls back to false. */
async function tryDeckyNativeInstall(url: string, version: string): Promise<boolean> {
  try {
    const backend = (globalThis as any).DeckyBackend;
    if (!backend?.call && !backend?.callable) return false;
    // InstallType.UPDATE = 2; hash=false skips checksum.
    await backend.call("utilities/install_plugin", url, "Recents Filter", version, false, 2);
    return true;
  } catch (err) {
    console.error("[RecentsFilter] Decky native install failed", err);
    return false;
  }
}

export async function installAvailableUpdate(): Promise<InstallResult> {
  const info = cached ?? (await checkForUpdate({ silent: true }));
  if (!info.hasUpdate || !info.downloadUrl) {
    return { ok: false, error: "no_download_url", stage: "precheck" };
  }

  try {
    toaster.toast({
      title: t().pluginName,
      body: t().updateInstalling(info.latestVersion || ""),
    });
  } catch {
    /* ignore */
  }

  try {
    if (await tryDeckyNativeInstall(info.downloadUrl, info.latestVersion || "latest")) {
      cached = {
        ...info,
        hasUpdate: false,
        currentVersion: info.latestVersion || info.currentVersion,
      };
      notify();
      return { ok: true, method: "decky_native", version: info.latestVersion || undefined };
    }

    const result = await installUpdateBackend({
      downloadUrl: info.downloadUrl,
      assetApiUrl: info.assetApiUrl ?? null,
    });

    if (!result?.ok) {
      let detail = result?.error || "unknown";
      try {
        const log = await getUpdateDebugLogBackend();
        if (log) console.log("[RecentsFilter] update debug log\n", log);
      } catch {
        /* ignore */
      }
      try {
        toaster.toast({
          title: t().pluginName,
          body: t().updateFailedDetail(detail),
        });
      } catch {
        /* ignore */
      }
      return result || { ok: false, error: detail };
    }

    try {
      toaster.toast({
        title: t().pluginName,
        body: t().updateInstalled(result.version || info.latestVersion || ""),
      });
    } catch {
      /* ignore */
    }

    try {
      const loader = (globalThis as any).DeckyPluginLoader;
      await loader?.importPlugin?.("Recents Filter", result.version || info.latestVersion || undefined);
    } catch (err) {
      console.error("[RecentsFilter] hot-reload after update failed", err);
    }

    cached = {
      ...info,
      hasUpdate: false,
      currentVersion: result.version || info.latestVersion || info.currentVersion,
    };
    notify();
    return result;
  } catch (err) {
    console.error("[RecentsFilter] install update failed", err);
    const detail = String(err);
    try {
      toaster.toast({
        title: t().pluginName,
        body: t().updateFailedDetail(detail),
      });
    } catch {
      /* ignore */
    }
    return { ok: false, error: detail, stage: "exception" };
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
