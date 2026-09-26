import { useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useDialogFocus, useScrollLock } from "../lib/dialog";
import "./Modal.css";

interface Props {
  labelledBy: string;
  onClose(): void;
  className?: string;
  children: ReactNode;
}

/** A centred dialog over a dimmed page. Escape or a click outside closes it. */
export default function Modal({ labelledBy, onClose, className = "", children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const onKeyDown = useDialogFocus(ref, onClose);
  useScrollLock();

  return createPortal(
    <div className="modal-scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        className={`modal ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
