import type { RefObject, MouseEvent } from "react";

import type {
  InvoiceDraftError,
  InvoiceDraftReview,
} from "../../../domain/invoices/invoice-draft.ts";

type InvoiceDraftFeedbackProps = Readonly<{
  draftIsReady: boolean;
  issueAttempted: boolean;
  onErrorFollow: (event: MouseEvent<HTMLAnchorElement>, error: InvoiceDraftError) => void;
  review: InvoiceDraftReview;
  summary: RefObject<HTMLDivElement | null>;
}>;

export function InvoiceDraftFeedback({
  draftIsReady,
  issueAttempted,
  onErrorFollow,
  review,
  summary,
}: InvoiceDraftFeedbackProps) {
  return (
    <>
      {issueAttempted && review.errors.length > 0 ? (
        <div className="validation-summary" ref={summary} role="alert" tabIndex={-1}>
          <strong>
            Fix {review.errors.length} {review.errors.length === 1 ? "detail" : "details"} before
            issuing
          </strong>
          <ul>
            {review.errors.map((error) => (
              <li key={error.fieldName}>
                <a
                  href={`#draft-${error.fieldName}`}
                  onClick={(event) => onErrorFollow(event, error)}
                >
                  {error.message}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {issueAttempted
        ? review.warnings.map((warning) => (
            <p className="validation-warning" key={warning.kind}>
              {warning.message}
            </p>
          ))
        : null}
      {draftIsReady ? (
        <output className="validation-ok">
          Draft is valid and ready for final issue review. No number has been consumed.
        </output>
      ) : null}
    </>
  );
}
