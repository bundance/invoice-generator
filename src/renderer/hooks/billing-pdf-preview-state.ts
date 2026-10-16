import type { PdfPreview } from "../../application/workspace.ts";

export type BillingPdfPreviewState =
  | Readonly<{ kind: "loading" }>
  | Readonly<{ kind: "rendering" | "displayed"; preview: PdfPreview }>
  | Readonly<{ kind: "failed"; message: string }>;

export type PreviewAttempt = Readonly<{
  generation: number;
  requestKey: string | null;
  state: BillingPdfPreviewState;
}>;

type PreviewEvent =
  | Readonly<{ kind: "request-changed"; requestKey: string | null }>
  | Readonly<{ kind: "retry" }>
  | Readonly<{ kind: "loaded"; generation: number; state: BillingPdfPreviewState }>
  | Readonly<{ kind: "displayed"; generation: number }>
  | Readonly<{ kind: "display-failed"; generation: number; message: string }>;

export function transition(attempt: PreviewAttempt, event: PreviewEvent): PreviewAttempt {
  if (event.kind === "request-changed") {
    return event.requestKey === attempt.requestKey
      ? attempt
      : {
          generation: attempt.generation + 1,
          requestKey: event.requestKey,
          state: { kind: "loading" },
        };
  }
  if (event.kind === "retry") {
    return attempt.requestKey === null
      ? attempt
      : { ...attempt, generation: attempt.generation + 1, state: { kind: "loading" } };
  }
  if (event.generation !== attempt.generation) return attempt;

  switch (event.kind) {
    case "loaded":
      return { ...attempt, state: event.state };
    case "displayed":
      return attempt.state.kind === "rendering"
        ? { ...attempt, state: { kind: "displayed", preview: attempt.state.preview } }
        : attempt;
    case "display-failed":
      return attempt.state.kind === "rendering" || attempt.state.kind === "displayed"
        ? { ...attempt, state: { kind: "failed", message: event.message } }
        : attempt;
  }
}
