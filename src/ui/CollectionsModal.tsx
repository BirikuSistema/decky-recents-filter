import { useEffect, useState } from "react";
import { t } from "../i18n";
import {
  getCurrentSettings,
  setCollectionHidden,
  subscribeSettings,
  updateSettings,
} from "../settings/store";
import {
  FILTER_DEMOS,
  FILTER_NOT_INSTALLED,
  listAllHideableFilters,
  type SteamCollectionInfo,
} from "../steam/collections";
import { EmptyListText, ListModalFrame, openListModal } from "./ListModal";
import { SafeButton, SafeToggle } from "./safeUi";

function localizeFilterName(collection: SteamCollectionInfo, text: ReturnType<typeof t>): string {
  switch (collection.id) {
    case FILTER_NOT_INSTALLED:
      return text.filterNotInstalled;
    case FILTER_DEMOS:
      return text.filterDemos;
    case "type-music":
      return collection.name || text.filterMusic;
    case "type-videos":
      return collection.name || text.filterVideos;
    case "uncategorized":
      return collection.name || text.filterUncategorized;
    case "hidden":
      return collection.name || text.filterHidden;
    default:
      return collection.name;
  }
}

function FilterToggle({
  collection,
  hidden,
  separator,
}: {
  collection: SteamCollectionInfo;
  hidden: string[];
  separator: "standard" | "none";
}) {
  const text = t();
  return (
    <SafeToggle
      label={localizeFilterName(collection, text)}
      description={text.itemCount(collection.count)}
      checked={!hidden.includes(collection.id)}
      separator={separator}
      onChange={(show) => void setCollectionHidden(collection.id, !show)}
    />
  );
}

function CollectionsContent({ closeModal }: { closeModal?: () => void }) {
  const text = t();
  const [filters, setFilters] = useState<SteamCollectionInfo[]>(listAllHideableFilters);
  const [hidden, setHidden] = useState<string[]>(() => getCurrentSettings().hiddenCollectionIds);

  useEffect(() => {
    const unsub = subscribeSettings(() => setHidden(getCurrentSettings().hiddenCollectionIds));
    const timer = window.setInterval(() => setFilters(listAllHideableFilters()), 4000);
    return () => {
      unsub();
      window.clearInterval(timer);
    };
  }, []);

  const system = filters.filter((f) => f.kind === "system");
  const user = filters.filter((f) => f.kind === "user");
  const hasHidden = hidden.some((id) => filters.some((f) => f.id === id));

  return (
    <ListModalFrame title={text.collectionsTitle} hint={text.collectionsHint} closeModal={closeModal}>
      {hasHidden && (
        <div style={{ marginBottom: 12 }}>
          <SafeButton onClick={() => void updateSettings({ hiddenCollectionIds: [], shownAppIds: [] })}>
            {text.collectionsShowAll}
          </SafeButton>
        </div>
      )}

      <div style={{ opacity: 0.65, fontSize: 12, marginBottom: 8 }}>{text.filtersLibrary}</div>
      {system.map((collection, index) => (
        <FilterToggle
          key={collection.id}
          collection={collection}
          hidden={hidden}
          separator={index === system.length - 1 && user.length === 0 ? "none" : "standard"}
        />
      ))}

      <div style={{ opacity: 0.65, fontSize: 12, margin: "16px 0 8px" }}>{text.filtersYours}</div>
      {user.length === 0 ? (
        <EmptyListText>{text.collectionsEmpty}</EmptyListText>
      ) : (
        user.map((collection, index) => (
          <FilterToggle
            key={collection.id}
            collection={collection}
            hidden={hidden}
            separator={index === user.length - 1 ? "none" : "standard"}
          />
        ))
      )}
    </ListModalFrame>
  );
}

export function openCollectionsModal(): void {
  openListModal((close) => <CollectionsContent closeModal={close} />);
}
