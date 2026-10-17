// react-doctor-disable-next-line react-doctor/prefer-dynamic-import -- PDF generation belongs to the Electron main process.
import { renderToBuffer } from "@react-pdf/renderer";

import { BillingPdfDocument } from "../../documents/billing-pdf-document.tsx";
import { registerBillingPdfFonts } from "../../documents/billing-pdf-fonts.ts";
import type { BillingDocumentModel } from "../../documents/invoice-document-model.ts";
import {
  auditBillingPdfLayout,
  billingPdfLayoutSchema,
} from "../../documents/billing-pdf-layout.ts";

export type RenderedBillingPdf = Readonly<{
  bytes: Uint8Array;
  pageCount: number;
}>;

export async function renderBillingPdf(model: BillingDocumentModel): Promise<RenderedBillingPdf> {
  registerBillingPdfFonts();
  let layout: unknown;
  const buffer = await renderToBuffer(
    <BillingPdfDocument
      model={model}
      onRender={(result) => {
        // SAFETY: The exact React-PDF 4.9.0 pin is required for this private layout field.
        // An upgrade must verify the metadata schema and layout audit before changing the pin.
        const versionedResult = result as typeof result &
          Readonly<{ _INTERNAL__LAYOUT__DATA_?: unknown }>;
        layout = versionedResult._INTERNAL__LAYOUT__DATA_;
      }}
    />,
  );
  if (!layout) throw new Error("React-PDF did not return layout metadata");

  const layoutPageCount = auditBillingPdfLayout(billingPdfLayoutSchema.parse(layout), model);
  const bytes = Uint8Array.from(buffer);
  return { bytes, pageCount: layoutPageCount };
}
