"use client";

import { Loader2 } from "lucide-react";
import {
  createContext,
  startTransition,
  useActionState,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { useFormStatus } from "react-dom";
import type { FormState } from "@/server/form";
import { btnPrimary } from "./styles";

const PendingContext = createContext(false);

/**
 * A form wired to a server action that can fail with a message.
 *
 * It submits through `onSubmit` + `startTransition` instead of `<form action>`
 * on purpose: React 19 resets a form after its action finishes, which would
 * wipe everything the user typed whenever validation fails. This keeps their
 * input and shows the error at the top, focused so a screen reader announces it.
 */
export function ActionForm({
  action,
  children,
  className,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  children: ReactNode;
  className?: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (state?.error) errorRef.current?.focus();
  }, [state]);

  return (
    <PendingContext value={pending}>
      <form
        className={className}
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          startTransition(() => formAction(data));
        }}
      >
        {state?.error ? (
          <div
            ref={errorRef}
            role="alert"
            tabIndex={-1}
            className="mb-4 rounded-xl border border-over bg-over-soft p-3 text-sm font-medium text-over"
          >
            {state.error}
          </div>
        ) : null}
        {children}
      </form>
    </PendingContext>
  );
}

/** Submit button that disables itself and shows progress while its form is saving. */
export function SubmitButton({
  children,
  pendingLabel = "Saving…",
  className = btnPrimary,
  ariaLabel,
}: {
  children: ReactNode;
  /** Shown beside the spinner while saving. Leave empty for icon-only buttons. */
  pendingLabel?: string;
  className?: string;
  /** Accessible name for icon-only buttons, which have no visible text. */
  ariaLabel?: string;
}) {
  const fromActionForm = useContext(PendingContext);
  const { pending: fromPlainForm } = useFormStatus();
  const busy = fromActionForm || fromPlainForm;
  return (
    <button type="submit" disabled={busy} aria-busy={busy} aria-label={ariaLabel} className={className}>
      {busy ? (
        <>
          <Loader2 aria-hidden className="size-5 animate-spin" />
          {pendingLabel}
        </>
      ) : (
        children
      )}
    </button>
  );
}
