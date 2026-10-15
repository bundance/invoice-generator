// react-doctor-disable-next-line react-doctor/prefer-dynamic-import -- This module runs only in the Electron main process.
import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
  type DocumentProps,
} from "@react-pdf/renderer";

import { billingPdfFontFamilies } from "./billing-pdf-fonts.ts";
import { coderneticWordmarkDataUrl } from "./codernetic-wordmark.ts";
import type { BillingDocumentModel } from "./invoice-document-model.ts";

type BillingPdfDocumentProps = Readonly<{
  model: BillingDocumentModel;
  onRender?: DocumentProps["onRender"];
}>;

const colors = {
  border: "#B9C6BD",
  ink: "#111111",
  muted: "#5C5852",
  panel: "#F4F7F4",
};

const styles = StyleSheet.create({
  page: {
    backgroundColor: "#FFFFFF",
    color: colors.ink,
    fontFamily: billingPdfFontFamilies,
    fontSize: 9,
    paddingBottom: 58,
    paddingHorizontal: 72,
    paddingTop: 62,
  },
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 24 },
  logo: { height: 31, width: 144 },
  issuer: { maxWidth: 200, textAlign: "right" },
  bold: { fontFamily: billingPdfFontFamilies, fontWeight: 700 },
  italic: { fontFamily: billingPdfFontFamilies, fontStyle: "italic" },
  muted: { color: colors.muted },
  meta: { flexDirection: "row", justifyContent: "space-between", marginBottom: 24 },
  metaCopy: { maxWidth: 220 },
  title: { alignItems: "flex-end", maxWidth: 230, textAlign: "right" },
  titleText: {
    fontFamily: billingPdfFontFamilies,
    fontSize: 13,
    fontWeight: 700,
    marginBottom: 5,
  },
  creditLink: {
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderWidth: 1,
    marginBottom: 12,
    padding: 8,
  },
  table: { marginBottom: 14 },
  tableHeader: {
    backgroundColor: colors.panel,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    paddingHorizontal: 5,
    paddingVertical: 6,
  },
  row: {
    borderBottomColor: colors.border,
    borderBottomWidth: 0.7,
    flexDirection: "row",
    paddingHorizontal: 5,
    paddingVertical: 7,
  },
  description: { paddingRight: 8, width: "46%" },
  quantity: { textAlign: "right", width: "11%" },
  rate: { textAlign: "right", width: "15%" },
  net: { textAlign: "right", width: "15%" },
  vat: { textAlign: "right", width: "13%" },
  period: {
    color: colors.muted,
    fontFamily: billingPdfFontFamilies,
    fontSize: 7.5,
    fontStyle: "italic",
    marginTop: 3,
  },
  totals: { alignItems: "flex-end", marginLeft: "auto", width: "43%" },
  totalLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 3,
    width: "100%",
  },
  grandTotal: {
    borderTopColor: colors.ink,
    borderTopWidth: 1,
    flexDirection: "row",
    fontFamily: billingPdfFontFamilies,
    fontWeight: 700,
    justifyContent: "space-between",
    marginTop: 3,
    paddingTop: 6,
    width: "100%",
  },
  section: { marginTop: 12 },
  sectionHeading: {
    color: colors.muted,
    fontFamily: billingPdfFontFamilies,
    fontSize: 8,
    fontWeight: 700,
    marginBottom: 4,
  },
  vatBucket: { flexDirection: "row", justifyContent: "space-between", width: 230 },
  notes: { marginTop: 12 },
  note: { marginBottom: 4 },
  footer: {
    bottom: 25,
    color: colors.muted,
    fontSize: 7.5,
    left: 72,
    position: "absolute",
    right: 72,
    textAlign: "center",
  },
  pageNumber: { bottom: 12, fontSize: 7, position: "absolute", right: 30 },
  continuation: {
    color: colors.muted,
    fontSize: 7.5,
    left: 72,
    position: "absolute",
    right: 72,
    textAlign: "right",
    top: 36,
  },
});

export function BillingPdfDocument({ model, onRender }: BillingPdfDocumentProps) {
  const heading = documentHeading(model);
  const documentProps: DocumentProps = onRender
    ? { author: model.issuer.legalName, onRender, title: heading }
    : { author: model.issuer.legalName, title: heading };
  return (
    <Document {...documentProps}>
      <Page size="A4" style={styles.page} wrap>
        <Text
          fixed
          id="document-continuation"
          render={({ pageNumber }) => (pageNumber > 1 ? `${heading} · Continued` : "")}
          style={styles.continuation}
        />
        <View fixed style={styles.header}>
          <Image src={coderneticWordmarkDataUrl} style={styles.logo} />
          <Text id="document-issuer" style={styles.issuer}>
            <Text style={styles.bold}>{model.issuer.legalName}</Text>
            {`\n${model.issuer.registeredAddress}`}
          </Text>
        </View>

        <View style={styles.meta}>
          <Text id="document-billing-parties" style={styles.metaCopy}>
            <Text style={styles.italic}>Bacs details:</Text>
            {`\n${model.issuer.bankName}\nAccount Number: ${model.issuer.accountNumber}\nSort Code: ${formatSortCode(model.issuer.sortCode)}\n\n`}
            <Text style={styles.bold}>
              {model.kind === "credit-note" ? "Credit note to:" : "Invoice to:"}
            </Text>
            {`\n${model.clientLegalName}\n${model.clientPostalAddress}`}
          </Text>
          <View style={styles.title}>
            <Text id="document-document-title" style={styles.titleText}>
              {heading}
            </Text>
            <Text style={styles.bold}>{model.issueDate}</Text>
            {model.kind === "draft-invoice" ? (
              <Text style={styles.muted}>No number has been assigned</Text>
            ) : null}
            {model.kind === "credit-note" ? (
              <Text style={styles.muted}>Full credit of {model.originalInvoiceId}</Text>
            ) : null}
          </View>
        </View>

        {model.kind === "credit-note" ? (
          <View style={styles.creditLink} wrap={false}>
            <Text>Credit for {model.clientLegalName}</Text>
            <Text style={styles.bold}>
              References invoice {model.originalInvoiceId}, issued {model.originalIssueDate}
            </Text>
          </View>
        ) : null}

        <View style={styles.table}>
          <View fixed style={styles.tableHeader}>
            <Text style={styles.description}>Description</Text>
            <Text style={styles.quantity}>Qty</Text>
            <Text style={styles.rate}>Rate</Text>
            <Text style={styles.net}>Net Cost</Text>
            <Text style={styles.vat}>VAT</Text>
          </View>
          {model.serviceLines.map((line, index) => (
            <View id={`service-row-${index}`} key={line.renderKey} style={styles.row} wrap={false}>
              <Text id={`service-description-${index}`} style={styles.description}>
                {line.serviceDescription}
                <Text style={styles.period}>
                  {`\nInvoice period: ${line.periodStart} - ${line.periodEnd}`}
                </Text>
              </Text>
              <Text id={`service-quantity-${index}`} style={styles.quantity}>
                {line.billableDays}
              </Text>
              <Text id={`service-rate-${index}`} style={styles.rate}>
                {line.dayRate}
              </Text>
              <Text id={`service-net-${index}`} style={styles.net}>
                {line.net}
              </Text>
              <Text id={`service-vat-${index}`} style={styles.vat}>
                {line.vat}
                {line.vatRate ? `\n${line.vatRate}%` : ""}
              </Text>
            </View>
          ))}
        </View>

        <View id="document-totals" style={styles.totals} wrap={false}>
          <View style={styles.totalLine}>
            <Text>Net</Text>
            <Text id="document-total-net">{model.net}</Text>
          </View>
          <View style={styles.totalLine}>
            <Text>VAT</Text>
            <Text id="document-total-vat">{model.vat}</Text>
          </View>
          <View style={styles.grandTotal}>
            <Text>TOTAL</Text>
            <Text id="document-total-gross">
              {model.gross} {model.currencyCode}
            </Text>
          </View>
        </View>

        {model.kind === "credit-note" ? (
          <View style={styles.section}>
            <Text style={styles.sectionHeading}>Correction reason</Text>
            <Text id="document-credit-reason">{model.reason}</Text>
          </View>
        ) : null}

        {model.sterlingVatSummary ? (
          <View style={styles.section}>
            <Text style={styles.sectionHeading}>VAT amounts in sterling</Text>
            {model.sterlingVatSummary.totalsByRate.map((bucket) => (
              <View key={bucket.vatRate} style={styles.vatBucket}>
                <Text>{bucket.vatRate}% VAT</Text>
                <Text>
                  {bucket.net} + {bucket.vat}
                </Text>
              </View>
            ))}
            <View style={styles.vatBucket}>
              <Text>Sterling net</Text>
              <Text id="document-sterling-total-net">{model.sterlingVatSummary.net}</Text>
            </View>
            <View style={styles.vatBucket}>
              <Text>Sterling VAT</Text>
              <Text id="document-sterling-total-vat">{model.sterlingVatSummary.vat}</Text>
            </View>
            <View style={styles.vatBucket}>
              <Text>Sterling total</Text>
              <Text id="document-sterling-total-gross">{model.sterlingVatSummary.gross}</Text>
            </View>
            <Text id="document-sterling-rate">
              Exchange rate: {model.sterlingVatSummary.rateStatement} · Effective date:{" "}
              {model.sterlingVatSummary.effectiveDate} · {model.sterlingVatSummary.method}
            </Text>
            <Text id="document-sterling-evidence">
              Evidence: {model.sterlingVatSummary.evidenceReference}
            </Text>
          </View>
        ) : null}

        <View style={styles.notes}>
          {model.notes.map((note, index) => (
            <Text id={`document-note-${index}`} key={note} style={styles.note}>
              {note}
            </Text>
          ))}
          <Text id="document-vat-wording">
            {model.taxPoint ? `Tax point: ${model.taxPoint} · ` : ""}
            {model.vatWording}
          </Text>
        </View>

        <Text fixed id="document-footer" style={styles.footer}>
          {model.paymentTerms}
          {`\nVAT Registration Number ${formatVatNumber(model.issuer.vatRegistrationNumber)} · Company Reg. No. ${model.issuer.companyNumber}`}
        </Text>
        <Text
          fixed
          id="document-page-number"
          render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
          style={styles.pageNumber}
        />
      </Page>
    </Document>
  );
}

function documentHeading(model: BillingDocumentModel): string {
  switch (model.kind) {
    case "draft-invoice":
      return "DRAFT INVOICE";
    case "issued-invoice":
      return `INVOICE ${model.id}`;
    case "credit-note":
      return `CREDIT NOTE ${model.id}`;
  }
}

function formatSortCode(sortCode: string): string {
  return `${sortCode.slice(0, 2)}-${sortCode.slice(2, 4)}-${sortCode.slice(4)}`;
}

function formatVatNumber(vatNumber: string): string {
  return `${vatNumber.slice(0, 3)} ${vatNumber.slice(3, 7)} ${vatNumber.slice(7)}`;
}
