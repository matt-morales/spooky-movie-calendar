import { useId, useLayoutEffect, useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent } from "react";
import { CommentApiError } from "./api";
import { colonQuery, completeShortcode, insertAt, loadEmoji, searchEmoji, type Emoji, type EmojiGroup } from "./emoji";
import { EmojiTray, SmileIcon } from "./EmojiTray";

export const MAX_BODY = 2000;
export const MAX_NAME = 40;

const MAX_SUGGESTIONS = 6;

interface Props {
  label: string;
  submitLabel: string;
  showName: boolean;
  onSubmit(body: string, authorName: string): Promise<void>;
  onCancel?(): void;
}

// The ":query" being completed: where it starts and what it matches.
interface Suggesting {
  start: number;
  items: Emoji[];
  active: number;
}

export function CommentForm({ label, submitLabel, showName, onSubmit, onCancel }: Props) {
  const [body, setBody] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggesting, setSuggesting] = useState<Suggesting | null>(null);
  const [emoji, setEmoji] = useState<EmojiGroup[] | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const caretAfterRender = useRef<number | null>(null);
  const bodyId = useId();
  const nameId = useId();
  const listId = useId();

  // Put the caret back after changing the text ourselves.
  useLayoutEffect(() => {
    const box = bodyRef.current;
    if (box && caretAfterRender.current !== null) {
      box.setSelectionRange(caretAfterRender.current, caretAfterRender.current);
      caretAfterRender.current = null;
    }
  });

  const replaceBody = (text: string, caret: number) => {
    setBody(text.slice(0, MAX_BODY));
    caretAfterRender.current = Math.min(caret, MAX_BODY);
  };

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!body.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(body, name);
      setBody("");
    } catch (err) {
      setError(err instanceof CommentApiError ? err.message : "Couldn't post your comment. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function handleChange(e: ChangeEvent<HTMLTextAreaElement>) {
    const text = e.target.value;
    const caret = e.target.selectionStart;
    const done = emoji && completeShortcode(emoji, text, caret);
    if (done) {
      replaceBody(done.text, done.caret);
      setSuggesting(null);
      return;
    }
    setBody(text);
    const q = emoji && colonQuery(text, caret);
    const items = q ? searchEmoji(emoji!, q.query, MAX_SUGGESTIONS) : [];
    setSuggesting(q && items.length > 0 ? { start: q.start, items, active: 0 } : null);
  }

  function choose(item: Emoji) {
    if (!suggesting) return;
    const caret = bodyRef.current?.selectionStart ?? body.length;
    const { text, caret: after } = insertAt(body, suggesting.start, caret, item.emoji + " ");
    replaceBody(text, after);
    setSuggesting(null);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (!suggesting) return;
    const n = suggesting.items.length;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      setSuggesting({ ...suggesting, active: (suggesting.active + step + n) % n });
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      choose(suggesting.items[suggesting.active]!);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation(); // close the suggestions, not the dialog around the form
      setSuggesting(null);
    }
  }

  function insertFromTray(picked: string) {
    const box = bodyRef.current;
    const { text, caret } = insertAt(body, box?.selectionStart ?? body.length, box?.selectionEnd ?? body.length, picked);
    replaceBody(text, caret);
    box?.focus();
  }

  const optionId = (i: number) => `${listId}-${i}`;

  return (
    <form className="cmt-form" onSubmit={handleSubmit}>
      {showName && (
        <>
          <label htmlFor={nameId} className="cmt-label">
            Your name (optional)
          </label>
          <input
            id={nameId}
            className="cmt-input"
            value={name}
            maxLength={MAX_NAME}
            onChange={(e) => setName(e.target.value)}
            autoComplete="nickname"
          />
        </>
      )}
      <label htmlFor={bodyId} className="cmt-label">
        {label}
      </label>
      <div className="cmt-field">
        <textarea
          ref={bodyRef}
          id={bodyId}
          className="cmt-textarea"
          value={body}
          maxLength={MAX_BODY}
          rows={3}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => void loadEmoji().then(setEmoji)}
          onBlur={() => setSuggesting(null)}
          aria-autocomplete="list"
          aria-controls={suggesting ? listId : undefined}
          aria-activedescendant={suggesting ? optionId(suggesting.active) : undefined}
        />
        {suggesting && (
          <ul id={listId} role="listbox" aria-label="Emoji suggestions" className="cmt-suggest">
            {suggesting.items.map((item, i) => (
              <li
                key={item.emoji}
                id={optionId(i)}
                role="option"
                aria-selected={i === suggesting.active}
                className="cmt-suggest-item"
                onMouseDown={(e) => e.preventDefault()} // keep focus in the text box
                onClick={() => choose(item)}
              >
                <span className="cmt-suggest-emoji">{item.emoji}</span>
                <span className="cmt-suggest-name">:{item.slug}:</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {error && (
        <p className="cmt-error" role="alert">
          {error}
        </p>
      )}
      <div className="cmt-actions">
        <EmojiTray label="Add emoji" onPick={insertFromTray}>
          <SmileIcon />
        </EmojiTray>
        <span className="cmt-count" aria-hidden="true">
          {body.length}/{MAX_BODY}
        </span>
        {onCancel && (
          <button type="button" className="cmt-button cmt-button--quiet" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button type="submit" className="cmt-button" disabled={busy || !body.trim()}>
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
