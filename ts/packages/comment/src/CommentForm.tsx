import { useId, useState, type FormEvent } from "react";
import { CommentApiError } from "./api";

export const MAX_BODY = 2000;
export const MAX_NAME = 40;

interface Props {
  label: string;
  submitLabel: string;
  showName: boolean;
  onSubmit(body: string, authorName: string): Promise<void>;
  onCancel?(): void;
}

export function CommentForm({ label, submitLabel, showName, onSubmit, onCancel }: Props) {
  const [body, setBody] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bodyId = useId();
  const nameId = useId();

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
      <textarea
        id={bodyId}
        className="cmt-textarea"
        value={body}
        maxLength={MAX_BODY}
        rows={3}
        onChange={(e) => setBody(e.target.value)}
      />
      {error && (
        <p className="cmt-error" role="alert">
          {error}
        </p>
      )}
      <div className="cmt-actions">
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
