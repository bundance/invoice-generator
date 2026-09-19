import type { InvoiceServiceLinePreview } from "../../../domain/invoices/invoice-service-line.ts";

type InvoiceItemSummaryProps = Readonly<{
  index: number;
  preview: InvoiceServiceLinePreview;
}>;

export function InvoiceItemSummary({ index, preview }: InvoiceItemSummaryProps) {
  const period =
    preview.periodStart && preview.periodEnd
      ? `${preview.periodStart} to ${preview.periodEnd}`
      : "Service period not entered";
  const calculation =
    preview.billableDays && preview.formattedDayRate
      ? `${preview.billableDays} × ${preview.formattedDayRate}`
      : "Quantity and rate not entered";

  return (
    <>
      <span className="invoice-item-number">{index + 1}</span>
      <span className="invoice-item-main">
        <strong>{preview.serviceDescription ?? "Untitled item"}</strong>
        <small>{period}</small>
      </span>
      <span className="invoice-item-money">
        <strong>{preview.formattedTotals?.net ?? "Unavailable"}</strong>
        <small>{calculation}</small>
      </span>
    </>
  );
}
