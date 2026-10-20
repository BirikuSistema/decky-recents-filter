import { Navigation } from "@decky/ui";
import { useEffect, useRef, useState } from "react";
import { t } from "../i18n";
import { getCurrentSettings, subscribeSettings, updateSettings } from "../settings/store";
import { PLAYTIME_STEPS, playtimeStepIndex, type RecentsFilterSettings } from "../settings/schema";
import { getDiagnostics, subscribeDiagnostics } from "../recents/diagnostics";
import { requestRecentsRefresh, resetCrashState } from "../recents/recentsPatch";
import { listHideableCollections, type SteamCollectionInfo } from "../steam/collections";
import {
  checkForUpdate,
  getCachedUpdateInfo,
  getInstalledVersion,
  installAvailableUpdate,
  subscribeUpdateInfo,
  type UpdateInfo,
} from "../updater/updater";
import { openCollectionsModal } from "./CollectionsModal";
import { openHiddenAppsModal } from "./HiddenAppsModal";
import { SafeActionRow, SafeButton, SafeRow, SafeSection, SafeSlider, SafeToggle } from "./safeUi";

type UpdateBtnMode = "idle" | "checking" | "none" | "available" | "installing";

export function QamPanel() {
  const text = t();
  const [settings, setSettings] = useState<RecentsFilterSettings>(getCurrentSettings);
  const [diag, setDiag] = useState(getDiagnostics);
  const [collections, setCollections] = useState<SteamCollectionInfo[]>(listHideableCollections);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(getCachedUpdateInfo);
  const [version, setVersion] = useState("…");
  const [updateMode, setUpdateMode] = useState<UpdateBtnMode>(() =>
    getCachedUpdateInfo()?.hasUpdate ? "available" : "idle",
  );
  const noneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const unsubs = [
      subscribeSettings(() => setSettings(getCurrentSettings())),
      subscribeDiagnostics(() => setDiag(getDiagnostics())),
      subscribeUpdateInfo(() => {
        const info = getCachedUpdateInfo();
        setUpdateInfo(info);
        if (info?.hasUpdate) setUpdateMode("available");
      }),
    ];
    const timer = window.setInterval(() => setCollections(listHideableCollections()), 4000);
    void getInstalledVersion().then(setVersion);
    return () => {
      unsubs.forEach((unsub) => unsub());
      window.clearInterval(timer);
      if (noneTimer.current) clearTimeout(noneTimer.current);
    };
  }, []);

  const hiddenCollections = settings.hiddenCollectionIds.filter((id) =>
    collections.some((collection) => collection.id === id),
  ).length;
  const shownCollections = Math.max(0, collections.length - hiddenCollections);
  const collectionSummary =
    collections.length === 0
      ? text.collectionsNone
      : hiddenCollections === 0
        ? text.collectionsAll
        : text.collectionsSome(shownCollections, collections.length);

  const hiddenCount = settings.hiddenAppIds.length;
  const playtimeIndex = playtimeStepIndex(settings.minPlaytimeMinutes);
  const playtimeDesc =
    settings.minPlaytimeMinutes > 0
      ? text.minPlaytimeValue(settings.minPlaytimeMinutes)
      : text.minPlaytimeOff;
  const rowTarget = diag.lastTarget || diag.lastNativeCount || 0;
  const off = !settings.enabled;
  const summary =
    hiddenCollections > 0 || hiddenCount > 0
      ? text.summaryActive(hiddenCollections, hiddenCount)
      : text.summaryIdle;

  const flashNoUpdates = () => {
    setUpdateMode("none");
    if (noneTimer.current) clearTimeout(noneTimer.current);
    noneTimer.current = setTimeout(() => {
      setUpdateMode((mode) => (mode === "none" ? "idle" : mode));
    }, 10000);
  };

  const onCheckUpdates = async () => {
    setUpdateMode("checking");
    try {
      const info = await checkForUpdate({ silent: true });
      setUpdateInfo(info);
      if (info.currentVersion) setVersion(info.currentVersion);
      if (info.hasUpdate && info.latestVersion) {
        setUpdateMode("available");
      } else {
        flashNoUpdates();
      }
    } catch {
      flashNoUpdates();
    }
  };

  const onInstallUpdate = async () => {
    setUpdateMode("installing");
    try {
      const result = await installAvailableUpdate();
      const v = await getInstalledVersion();
      setVersion(v);
      if (result.ok) {
        setUpdateInfo((prev) =>
          prev
            ? { ...prev, hasUpdate: false, currentVersion: v, latestVersion: v }
            : prev,
        );
        flashNoUpdates();
      } else {
        // Keep "Update to…" so the user can retry after reading the error toast.
        setUpdateMode("available");
      }
    } catch {
      setUpdateMode("available");
    }
  };

  const updateButtonLabel = (() => {
    switch (updateMode) {
      case "checking":
        return text.checkingUpdates;
      case "none":
        return text.noUpdates;
      case "available":
        return text.updateNow(updateInfo?.latestVersion || "");
      case "installing":
        return text.updateInstalling(updateInfo?.latestVersion || "");
      default:
        return text.checkUpdates;
    }
  })();

  const onUpdateButton = () => {
    if (updateMode === "available") void onInstallUpdate();
    else if (updateMode === "idle" || updateMode === "none") void onCheckUpdates();
  };

  return (
    <>
      <SafeSection>
        {diag.status === "crashed" && (
          <SafeRow>
            <SafeButton onClick={() => resetCrashState()}>{text.reactivate}</SafeButton>
          </SafeRow>
        )}
        <SafeRow>
          <div style={{ opacity: 0.7, fontSize: 12, marginBottom: 4 }}>{summary}</div>
        </SafeRow>
        <SafeRow>
          <SafeToggle
            label={text.enable}
            description={diag.status === "crashed" ? text.crashed : text.enableDesc}
            checked={settings.enabled}
            onChange={(checked) => void updateSettings({ enabled: checked })}
          />
        </SafeRow>
        <SafeRow>
          <SafeToggle
            label={text.hideHeader}
            description={text.hideHeaderDesc}
            checked={settings.hideRecentsHeader}
            disabled={off}
            onChange={(checked) => void updateSettings({ hideRecentsHeader: checked })}
          />
        </SafeRow>
        <SafeRow>
          <div style={{ opacity: 0.7, fontSize: 12, lineHeight: 1.4 }}>
            {text.rowSizeHint(rowTarget)}
            {diag.status === "ok" && diag.lastVisibleCount > 0
              ? ` · ${text.showingOf(diag.lastVisibleCount, diag.lastTarget || rowTarget)}`
              : ""}
          </div>
        </SafeRow>
      </SafeSection>

      <SafeSection title={text.filters}>
        <SafeRow>
          <SafeActionRow
            label={text.collections}
            description={
              hiddenCollections > 0
                ? `${collectionSummary} · ${text.collectionsHiddenCount(hiddenCollections)}`
                : collectionSummary
            }
            action={text.edit}
            disabled={off}
            onClick={() => openCollectionsModal()}
          />
        </SafeRow>
        <SafeRow>
          <SafeSlider
            label={text.minPlaytime}
            description={playtimeDesc}
            value={playtimeIndex}
            min={0}
            max={PLAYTIME_STEPS.length - 1}
            disabled={off}
            onChange={(index) => {
              const clamped = Math.max(0, Math.min(PLAYTIME_STEPS.length - 1, Math.round(index)));
              void updateSettings({ minPlaytimeMinutes: PLAYTIME_STEPS[clamped] });
            }}
          />
        </SafeRow>
        <SafeRow>
          <SafeActionRow
            label={text.hiddenByStart}
            description={hiddenCount > 0 ? text.gameCount(hiddenCount) : text.hiddenNone}
            action={text.view}
            disabled={off}
            onClick={() => openHiddenAppsModal()}
          />
        </SafeRow>
      </SafeSection>

      <SafeSection>
        <SafeRow>
          <SafeButton
            onClick={() => {
              setCollections(listHideableCollections());
              requestRecentsRefresh();
              try {
                Navigation.CloseSideMenus?.();
              } catch {
                /* ignore */
              }
            }}
          >
            {text.refresh}
          </SafeButton>
        </SafeRow>
        <SafeRow>
          <div style={{ opacity: 0.55, fontSize: 12, marginBottom: 6 }}>
            {text.versionLabel(version)}
          </div>
          <SafeButton
            disabled={updateMode === "checking" || updateMode === "installing"}
            onClick={onUpdateButton}
          >
            {updateButtonLabel}
          </SafeButton>
        </SafeRow>
      </SafeSection>
    </>
  );
}
