import { render } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";

import { completeIssuedInvoice } from "../../tests/fixtures/issued-invoice.js";
import { BillingDocument } from "./invoice-document.js";
import { createIssuedInvoiceDocumentModel } from "./invoice-document-model.js";
import {
  billingDocumentMeasurementsSchema,
  collectBillingDocumentMeasurements,
  evaluateBillingDocumentFit,
} from "./document-fit.js";

describe("billing document fit", () => {
  it("rejects a document whose fixed page has the wrong size or overflowing content", () => {
    const { container } = render(
      <BillingDocument model={createIssuedInvoiceDocumentModel(completeIssuedInvoice)} />,
    );
    setFittingMeasurements(container);
    const page = container.querySelector("[data-fit-page]");
    if (!page) throw new Error("Expected the A4 page");
    setElementSize(page, {
      clientHeight: 1110,
      clientWidth: 794,
      scrollHeight: 1120,
    });

    const measurements = billingDocumentMeasurementsSchema.parse(
      collectBillingDocumentMeasurements(container),
    );
    const result = evaluateBillingDocumentFit(measurements);

    expect(result.failures).toEqual(["document-page-size", "document-page-overflow"]);
  });

  it("reports the measured region that exceeds its fixed box", () => {
    const { container } = render(
      <BillingDocument model={createIssuedInvoiceDocumentModel(completeIssuedInvoice)} />,
    );
    setFittingMeasurements(container);
    const serviceDescription = container.querySelector('[data-fit-region="service-description"]');
    if (!serviceDescription) throw new Error("Expected the service description region");
    setElementSize(serviceDescription, { clientHeight: 100, clientWidth: 200, scrollHeight: 103 });

    const measurements = billingDocumentMeasurementsSchema.parse(
      collectBillingDocumentMeasurements(container),
    );
    const result = evaluateBillingDocumentFit(measurements);

    expect(result.page).toEqual({
      height: 1123,
      scrollHeight: 1123,
      scrollWidth: 794,
      width: 794,
    });
    expect(result.failures).toEqual(["service-description"]);
    expect(result.regions.find(({ name }) => name === "service-description")).toMatchObject({
      clientHeight: 100,
      scrollHeight: 103,
    });
    expect(result.regions.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        "bank-name",
        "client-details",
        "document-heading",
        "issue-date",
        "payment-terms",
      ]),
    );
  });
});

function setFittingMeasurements(container: HTMLElement): void {
  const page = container.querySelector("[data-fit-page]");
  if (!page) throw new Error("Expected the A4 page");
  setElementSize(page, { clientHeight: 1123, clientWidth: 794 });
  Object.defineProperty(page, "getBoundingClientRect", {
    configurable: true,
    value: () => createBounds({ bottom: 1123, right: 794 }),
  });
  for (const region of container.querySelectorAll("[data-fit-region]")) {
    setElementSize(region, { clientHeight: 100, clientWidth: 200 });
    Object.defineProperty(region, "getBoundingClientRect", {
      configurable: true,
      value: () => createBounds({ bottom: 100, right: 200 }),
    });
  }
}

type ElementSize = Readonly<{
  clientHeight: number;
  clientWidth: number;
  scrollHeight?: number;
  scrollWidth?: number;
}>;

function setElementSize(
  element: Element,
  {
    clientHeight,
    clientWidth,
    scrollHeight = clientHeight,
    scrollWidth = clientWidth,
  }: ElementSize,
): void {
  Object.defineProperties(element, {
    clientHeight: { configurable: true, value: clientHeight },
    clientWidth: { configurable: true, value: clientWidth },
    scrollHeight: { configurable: true, value: scrollHeight },
    scrollWidth: { configurable: true, value: scrollWidth },
  });
}

function createBounds({ bottom, right }: Readonly<{ bottom: number; right: number }>): DOMRect {
  return DOMRect.fromRect({ height: bottom, width: right });
}
