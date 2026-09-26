// Small line icons used on buttons. They inherit the text colour.

const line = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

export function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...line}>
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
      <path d="m15 5 4 4" />
    </svg>
  );
}

export function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...line}>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...line} strokeWidth={2.2}>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  );
}

export function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...line} strokeWidth={2}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

/** The blood drop used for ratings. */
export function DropIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 9 14" className={className} aria-hidden="true">
      <path d="M4.49781 1L6.97406 4.51576C7.46377 5.2106 7.79735 6.09603 7.93258 7.06007C8.06781 8.0241 7.99864 9.02342 7.7338 9.93163C7.46896 10.8398 7.02036 11.6161 6.44473 12.1623C5.86911 12.7085 5.19233 13 4.5 13C3.80767 13 3.13089 12.7085 2.55527 12.1623C1.97965 11.6161 1.53104 10.8398 1.2662 9.93163C1.00136 9.02342 0.932187 8.0241 1.06742 7.06007C1.20266 6.09603 1.53623 5.2106 2.02594 4.51576L4.49781 1Z" />
    </svg>
  );
}
