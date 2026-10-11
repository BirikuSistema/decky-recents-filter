import { useEffect, useState } from "react";
import { t } from "../i18n";
import {
  getCurrentSettings,
  subscribeSettings,
  toggleStringInList,
  updateSettings,
} from "../settings/store";
import { listHideableCollections, type SteamCollectionInfo } from "../steam/collections";
import { EmptyListText, ListModalFrame, openListModal } from "./ListModal";
import { SafeToggle } from "./safeUi";

function CollectionsContent({ closeModal }: { closeModal?: () => void }) {
  const text = t();
  const [collections] = useState<SteamCollectionInfo[]>(listHideableCollections);
  const [hidden, setHidden] = useState<string[]>(() => getCurrentSettings().hiddenCollectionIds);

  useEffect(() => subscribeSettings(() => setHidden(getCurrentSettings().hiddenCollectionIds)), []);

  return (
    <ListModalFrame title={text.collectionsTitle} hint={text.collectionsHint} closeModal={closeModal}>
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
            onChange={(show) =>
              void updateSettings({
                hiddenCollectionIds: toggleStringInList(
                  getCurrentSettings().hiddenCollectionIds,
                  collection.id,
                  !show,
                ),
              })
            }
          />
        ))
      )}
    </ListModalFrame>
  );
}

export function openCollectionsModal(): void {
  openListModal((close) => <CollectionsContent closeModal={close} />);
}
