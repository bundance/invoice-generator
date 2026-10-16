export const unusedPdfPreviewMethods = {
  preview: () => Promise.reject(new Error("PDF preview is not used in this test")),
} as const;
