import React, { useEffect, useId, useRef, useState } from "react";

export function HelpPopover({ children, className = "", label = "About this section", placement = "bottom-start" }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const contentId = useId();

  useEffect(() => {
    if (!open) return undefined;
    const closeOutside = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return <span
    className={`help-popover help-popover--${placement} ${open ? "is-open" : ""} ${className}`}
    ref={rootRef}
    onPointerEnter={() => setOpen(true)}
    onPointerLeave={() => {
      if (!rootRef.current?.contains(document.activeElement)) setOpen(false);
    }}
    onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }}
  >
    <button
      type="button"
      className="help-popover__trigger"
      aria-label={`Help: ${label}`}
      aria-expanded={open}
      aria-controls={contentId}
      onFocus={() => setOpen(true)}
      onClick={() => setOpen(true)}
    ><img src="/ui/Help.svg" alt="" aria-hidden="true" /></button>
    <span className="help-popover__content" id={contentId} role="tooltip" aria-hidden={!open}>
      <strong>{label}</strong>
      <span>{children}</span>
    </span>
  </span>;
}
