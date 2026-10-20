import { ConfirmModal, showModal } from "@decky/ui";
import { t } from "../i18n";

/** Blocks an action that would leave the Recently Played row completely empty. */
export function showCannotEmptyRecentsAlert(): void {
  const text = t();
  try {
    if (typeof showModal !== "function") {
      console.warn("[RecentsFilter]", text.cannotHideAllBody);
      return;
    }
    showModal(
      <ConfirmModal
        strTitle={text.cannotHideAllTitle}
        strDescription={text.cannotHideAllBody}
        onOK={() => undefined}
      />,
    );
  } catch (err) {
    console.error("[RecentsFilter] cannot-empty alert failed", err);
  }
}
