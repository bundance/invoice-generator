export function describePdfJsError(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : "PDF.js returned an unknown error";
  return message
    ? `Could not display the PDF preview: ${message}`
    : "Could not display the PDF preview.";
}
