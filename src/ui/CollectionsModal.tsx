import { useEffect, useState } from "react";
import { t } from "../i18n";
import {
  getCurrentSettings,
  setCollectionHidden,
  subscribeSettings,
  updateSettings,
} from "../settings/store";
import { listHideableCollections, type SteamCollectionInfo } from "../steam/collections";
import { EmptyListText, ListModalFrame, openListModal } from "./ListModal";
import { SafeButton, SafeToggle } from "./safeUi";

function CollectionsContent({ closeModal }: { closeModal?: () => void }) {
  const text = t();
  const [collections] = useState<SteamCollectionInfo[]>(listHideableCollections);
  const [hidden, setHidden] = useState<string[]>(() => getCurrentSettings().hiddenCollectionIds);

  useEffect(() => subscribeSettings(() => setHidden(getCurrentSettings().hiddenCollectionIds)), []);

  const hasHidden = hidden.some((id) => collections.some((c) => c.id === id));

  return (
    <ListModalFrame title={text.collectionsTitle} hint={text.collectionsHint} closeModal={closeModal}>
      {hasHidden && (
        <div style={{ marginBottom: 12 }}>
          <SafeButton onClick={() => void updateSettings({ hiddenCollectionIds: [], shownAppIds: [] })}>
            {text.collectionsShowAll}
          </SafeButton>
        </div>
      )}
      {collections.length === 0 ? (
        <EmptyListText>{text.collectionsEmpty}</EmptyListText>
      ) : (
        collections.map((collection, index) => (
          <SafeToggle
            key={collection.id}
            label={collection.name}
            description={collection.count > 0 ? text.gameCount(collection.count) : undefined}
            checked={!hidden.includes(collection.id)}
            separator={index === collections.length - 1 ? "none" : "standard"}
            onChange={(show) => void setCollectionHidden(collection.id, !show)}
          />
        ))
      )}
    </ListModalFrame>
  );
}

export function openCollectionsModal(): void {
  openListModal((close) => <CollectionsContent closeModal={close} />);
}
