import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { loadEmoji, searchEmoji, type Emoji, type EmojiGroup } from "./emoji";

// The emoji tray: a button that opens every emoji, searchable and grouped.
// It uses the browser's native popover (top layer, light dismiss, Escape,
// focus return); browsers without it get the same tray from React state.

export const nativePopover = typeof HTMLElement !== "undefined" && "showPopover" in HTMLElement.prototype;

const TRAY_WIDTH = 320;
const TRAY_HEIGHT = 360;
const GAP = 6;

interface Props {
  /** The button's accessible name, e.g. "Add emoji". */
  label: string;
  /** The button's content (usually an icon). */
  children: ReactNode;
  className?: string;
  onPick(emoji: string): void;
}

export function EmojiTray({ label, children, className = "cmt-icon-button", onPick }: Props) {
  const [open, setOpen] = useState(false);
  const trayId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const trayRef = useRef<HTMLDivElement>(null);

  // With a native popover the browser opens and closes the tray; follow it.
  useEffect(() => {
    const tray = trayRef.current;
    if (!tray || !nativePopover) return;
    const beforeToggle = (e: Event) => {
      if ((e as ToggleEvent).newState === "open" && buttonRef.current) place(tray, buttonRef.current);
    };
    const toggle = (e: Event) => setOpen((e as ToggleEvent).newState === "open");
    tray.addEventListener("beforetoggle", beforeToggle);
    tray.addEventListener("toggle", toggle);
    return () => {
      tray.removeEventListener("beforetoggle", beforeToggle);
      tray.removeEventListener("toggle", toggle);
    };
  }, []);

  const close = () => {
    if (nativePopover) trayRef.current?.hidePopover();
    else setOpen(false);
  };

  // Escape closes just the tray, not a dialog the tray sits in.
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== "Escape") return;
    e.stopPropagation();
    close();
    buttonRef.current?.focus();
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={className}
        aria-label={label}
        title={label}
        aria-expanded={open}
        aria-controls={trayId}
        {...(nativePopover ? { popoverTarget: trayId } : { onClick: () => setOpen((o) => !o) })}
      >
        {children}
      </button>
      <div
        ref={trayRef}
        id={trayId}
        popover={nativePopover ? "auto" : undefined}
        role="dialog"
        aria-label="Pick an emoji"
        className="cmt-emoji-tray"
        hidden={!nativePopover && !open}
        onKeyDown={onKeyDown}
      >
        {open && (
          <EmojiPicker
            onPick={(emoji) => {
              close();
              onPick(emoji);
            }}
          />
        )}
      </div>
    </>
  );
}

// Opens below the button, or above it when there's no room; kept on screen.
function place(tray: HTMLElement, anchor: HTMLElement) {
  const r = anchor.getBoundingClientRect();
  const width = Math.min(TRAY_WIDTH, innerWidth - 2 * GAP);
  const height = Math.min(TRAY_HEIGHT, innerHeight - 2 * GAP);
  const left = Math.min(Math.max(GAP, r.left), innerWidth - width - GAP);
  const top = innerHeight - r.bottom >= height + GAP ? r.bottom + GAP : Math.max(GAP, r.top - height - GAP);
  Object.assign(tray.style, { left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px` });
}

function EmojiPicker({ onPick }: { onPick(emoji: string): void }) {
  const [groups, setGroups] = useState<EmojiGroup[] | null>(null);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Focus the search box, except on touch screens: there that would pop up
  // the keyboard over the tray, so focus the tray and let them tap Search.
  useEffect(() => {
    const touch = window.matchMedia?.("(pointer: coarse)").matches;
    (touch ? rootRef : searchRef).current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    let live = true;
    loadEmoji().then((g) => live && setGroups(g));
    return () => {
      live = false;
    };
  }, []);

  const results = groups && query.trim() ? searchEmoji(groups, query, 80) : null;

  return (
    <div ref={rootRef} className="cmt-emoji-picker" tabIndex={-1}>
      <input
        ref={searchRef}
        type="search"
        className="cmt-input cmt-emoji-search"
        placeholder="Search emoji"
        aria-label="Search emoji"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {groups && !results && (
        <nav className="cmt-emoji-tabs" aria-label="Emoji groups">
          {groups.map((g, i) => (
            <button
              key={g.name}
              type="button"
              className="cmt-emoji-tab"
              aria-label={g.name}
              title={g.name}
              onClick={() =>
                scrollRef.current?.querySelectorAll("section")[i]?.scrollIntoView({ block: "start" })
              }
            >
              {g.emojis[0]?.emoji}
            </button>
          ))}
        </nav>
      )}

      <div ref={scrollRef} className="cmt-emoji-scroll">
        {!groups && <p className="cmt-muted cmt-emoji-note">Loading emoji…</p>}
        {results && results.length === 0 && <p className="cmt-muted cmt-emoji-note">No emoji found</p>}
        {results && results.length > 0 && <EmojiGrid emojis={results} onPick={onPick} />}
        {groups &&
          !results &&
          groups.map((g) => (
            <section key={g.name} className="cmt-emoji-group" aria-label={g.name}>
              <h3 className="cmt-emoji-heading">{g.name}</h3>
              <EmojiGrid emojis={g.emojis} onPick={onPick} />
            </section>
          ))}
      </div>
    </div>
  );
}

function EmojiGrid({ emojis, onPick }: { emojis: Emoji[]; onPick(emoji: string): void }) {
  return (
    <div className="cmt-emoji-grid">
      {emojis.map((e) => (
        <button
          key={e.emoji}
          type="button"
          className="cmt-emoji"
          aria-label={e.name}
          title={`:${e.slug}:`}
          onClick={() => onPick(e.emoji)}
        >
          {e.emoji}
        </button>
      ))}
    </div>
  );
}

export function SmileIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 14.5s1.3 1.8 3.5 1.8 3.5-1.8 3.5-1.8" />
      <path d="M9 9.5h.01M15 9.5h.01" strokeWidth={2.4} />
    </svg>
  );
}
