"use client";

import { RotateCcw } from "lucide-react";
import { btnPrimary, card } from "./_components/styles";

/** Last-resort error screen. Details stay in the server log; the user gets a calm message and a retry. */
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className={`${card} mt-6 text-center`} role="alert">
      <h1 className="text-xl font-bold">Something went wrong</h1>
      <p className="mt-1 text-sm text-muted">
        Your data is safe. If this keeps happening, check that the database is running and try again.
      </p>
      <button type="button" onClick={reset} className={`${btnPrimary} mt-4`}>
        <RotateCcw aria-hidden className="size-5" />
        Try again
      </button>
    </div>
  );
}
