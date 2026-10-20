import { useEffect, useState } from "react";
import { t } from "../i18n";
import { getCurrentSettings, setAppHiddenFromRecents, subscribeSettings } from "../settings/store";
import { getAppName } from "../steam/appOverview";
import { EmptyListText, ListModalFrame, openListModal } from "./ListModal";
import { SafeToggle } from "./safeUi";

function HiddenAppsContent({ closeModal }: { closeModal?: () => void }) {
  const text = t();
  const [appIds] = useState<number[]>(() => [...getCurrentSettings().hiddenAppIds]);
  const [hidden, setHidden] = useState<number[]>(() => getCurrentSettings().hiddenAppIds);

  useEffect(() => subscribeSettings(() => setHidden(getCurrentSettings().hiddenAppIds)), []);

  const sorted = [...appIds].sort((a, b) =>
    getAppName(a).localeCompare(getAppName(b), undefined, { sensitivity: "base" }),
  );

  return (
    <ListModalFrame title={text.hiddenTitle} hint={text.hiddenHint} closeModal={closeModal}>
      {sorted.length === 0 ? (
        <EmptyListText>{text.hiddenEmpty}</EmptyListText>
      ) : (
        sorted.map((appId, index) => (
          <SafeToggle
            key={appId}
            label={getAppName(appId)}
            description={text.hiddenManual}
            checked={!hidden.includes(appId)}
            separator={index === sorted.length - 1 ? "none" : "standard"}
            onChange={(show) => void setAppHiddenFromRecents(appId, !show)}
          />
        ))
      )}
    </ListModalFrame>
  );
}

export function openHiddenAppsModal(): void {
  openListModal((close) => <HiddenAppsContent closeModal={close} />);
}
