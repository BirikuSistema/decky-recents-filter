import { DialogBody, DialogBodyText, DialogHeader, Focusable, ModalRoot, showModal } from "@decky/ui";
import { useEffect, type ReactNode } from "react";
import { holdRecentsRefresh } from "../recents/recentsPatch";
import { isRenderable } from "./safeUi";

export function ListModalFrame({
  title,
  hint,
  closeModal,
  children,
}: {
  title: string;
  hint: string;
  closeModal?: () => void;
  children: ReactNode;
}) {
  useEffect(() => holdRecentsRefresh(), []);

  const header = isRenderable(DialogHeader) ? (
    <DialogHeader>{title}</DialogHeader>
  ) : (
    <div style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>{title}</div>
  );
  const hintNode = isRenderable(DialogBodyText) ? (
    <DialogBodyText>{hint}</DialogBodyText>
  ) : (
    <div style={{ opacity: 0.7, fontSize: 14, marginBottom: 12 }}>{hint}</div>
  );
  const list = isRenderable(Focusable) ? <Focusable>{children}</Focusable> : children;
  const body = isRenderable(DialogBody) ? (
    <DialogBody>
      {hintNode}
      {list}
    </DialogBody>
  ) : (
    <div>
      {hintNode}
      {list}
    </div>
  );

  if (!isRenderable(ModalRoot)) return <div>{header}{body}</div>;
  return (
    <ModalRoot closeModal={closeModal}>
      {header}
      {body}
    </ModalRoot>
  );
}

export function EmptyListText({ children }: { children: ReactNode }) {
  return <div style={{ opacity: 0.6, fontSize: 14, padding: "12px 0" }}>{children}</div>;
}

export function openListModal(render: (close: () => void) => ReactNode): void {
  if (typeof showModal !== "function") {
    console.error("[RecentsFilter] showModal unavailable");
    return;
  }
  let instance: { Close?: () => void } | undefined;
  const close = () => instance?.Close?.();
  instance = showModal(render(close));
}
