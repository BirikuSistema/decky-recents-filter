import { Navigation } from "@decky/ui";
import { useEffect, useState } from "react";
import { t } from "../i18n";
import { getCurrentSettings, subscribeSettings, updateSettings } from "../settings/store";
import {
  MAX_VISIBLE,
  MIN_VISIBLE,
  PLAYTIME_STEPS,
  playtimeStepIndex,
  type RecentsFilterSettings,
} from "../settings/schema";
import { getDiagnostics, subscribeDiagnostics } from "../recents/diagnostics";
import {
  holdRecentsRefresh,
  requestRecentsRefresh,
  resetCrashState,
} from "../recents/recentsPatch";
import { listHideableCollections, type SteamCollectionInfo } from "../steam/collections";
import { openCollectionsModal } from "./CollectionsModal";
import { openHiddenAppsModal } from "./HiddenAppsModal";
import { SafeActionRow, SafeButton, SafeRow, SafeSection, SafeSlider, SafeToggle } from "./safeUi";

export function QamPanel() {
  const text = t();
  const [settings, setSettings] = useState<RecentsFilterSettings>(getCurrentSettings);
  const [diag, setDiag] = useState(getDiagnostics);
  const [collections, setCollections] = useState<SteamCollectionInfo[]>(listHideableCollections);

  useEffect(() => {
    const unsubs = [
      holdRecentsRefresh(),
      subscribeSettings(() => setSettings(getCurrentSettings())),
      subscribeDiagnostics(() => setDiag(getDiagnostics())),
    ];
    const timer = window.setInterval(() => setCollections(listHideableCollections()), 4000);
    return () => {
      unsubs.forEach((unsub) => unsub());
      window.clearInterval(timer);
    };
  }, []);

  const shownCollections = collections.filter(
    (collection) => !settings.hiddenCollectionIds.includes(collection.id),
  ).length;
  const collectionSummary =
    collections.length === 0
      ? text.collectionsNone
      : shownCollections === collections.length
        ? text.collectionsAll
        : text.collectionsSome(shownCollections, collections.length);

  const hiddenCount = settings.hiddenAppIds.length;
  const playtimeIndex = playtimeStepIndex(settings.minPlaytimeMinutes);
  const playtimeDesc =
    settings.minPlaytimeMinutes > 0
      ? text.minPlaytimeValue(settings.minPlaytimeMinutes)
      : text.minPlaytimeOff;
  const visibleDesc =
    diag.status === "ok" && diag.lastVisibleCount > 0
      ? text.showingOf(diag.lastVisibleCount, settings.maxVisible)
      : undefined;
  const off = !settings.enabled;

  return (
    <>
      <SafeSection>
        {diag.status === "crashed" && (
          <SafeRow>
            <SafeButton onClick={() => resetCrashState()}>{text.reactivate}</SafeButton>
          </SafeRow>
        )}
        <SafeRow>
          <SafeToggle
            label={text.enable}
            description={diag.status === "crashed" ? text.crashed : text.enableDesc}
            checked={settings.enabled}
            onChange={(checked) => updateSettings({ enabled: checked })}
          />
        </SafeRow>
        <SafeRow>
          <SafeSlider
            label={text.visibleGames}
            description={visibleDesc}
            value={settings.maxVisible}
            min={MIN_VISIBLE}
            max={MAX_VISIBLE}
            showValue
            disabled={off}
            onChange={(value) => updateSettings({ maxVisible: value })}
          />
        </SafeRow>
      </SafeSection>

      <SafeSection title={text.filters}>
        <SafeRow>
          <SafeActionRow
            label={text.collections}
            description={collectionSummary}
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
              updateSettings({ minPlaytimeMinutes: PLAYTIME_STEPS[clamped] });
            }}
          />
        </SafeRow>
        <SafeRow>
          <SafeActionRow
            label={text.hiddenByStart}
            description={hiddenCount > 0 ? text.gameCount(hiddenCount) : text.hiddenNone}
            action={text.view}
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
              // Closing the panel brings the home to the front; it remounts once more on close.
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
      </SafeSection>
    </>
  );
}
