import { z } from "zod";

const elementMeasurementsSchema = z.strictObject({
  bottom: z.number(),
  clientHeight: z.number(),
  clientWidth: z.number(),
  left: z.number(),
  right: z.number(),
  scrollHeight: z.number(),
  scrollWidth: z.number(),
  top: z.number(),
});

const fitRegionMeasurementsSchema = elementMeasurementsSchema.extend({
  name: z.string(),
});

export const billingDocumentMeasurementsSchema = z.strictObject({
  page: elementMeasurementsSchema.nullable(),
  regions: z.array(fitRegionMeasurementsSchema),
});

export const billingDocumentRenderProfile = {
  edgeTolerancePixels: 2,
  pageHeightPixels: 1123,
  pageWidthPixels: 794,
} as const;

export type BillingDocumentMeasurements = z.infer<typeof billingDocumentMeasurementsSchema>;

export type BillingDocumentFit = Readonly<{
  failures: readonly string[];
  page: Readonly<{
    height: number;
    scrollHeight: number;
    scrollWidth: number;
    width: number;
  }>;
  regions: BillingDocumentMeasurements["regions"];
}>;

export function evaluateBillingDocumentFit(
  measurements: BillingDocumentMeasurements,
): BillingDocumentFit {
  const { edgeTolerancePixels, pageHeightPixels, pageWidthPixels } = billingDocumentRenderProfile;
  const { page, regions } = measurements;
  if (!page || regions.length === 0) {
    return {
      failures: ["document-page"],
      page: { height: 0, scrollHeight: 0, scrollWidth: 0, width: 0 },
      regions,
    };
  }

  const pageHasExpectedSize =
    Math.abs(page.clientHeight - pageHeightPixels) <= edgeTolerancePixels &&
    Math.abs(page.clientWidth - pageWidthPixels) <= edgeTolerancePixels;
  const pageContainsItsContent =
    page.scrollHeight <= page.clientHeight + edgeTolerancePixels &&
    page.scrollWidth <= page.clientWidth + edgeTolerancePixels;
  const failedRegions = regions.flatMap((region) => {
    const failed =
      region.scrollHeight > region.clientHeight + edgeTolerancePixels ||
      region.scrollWidth > region.clientWidth + edgeTolerancePixels ||
      region.top < page.top - edgeTolerancePixels ||
      region.left < page.left - edgeTolerancePixels ||
      region.right > page.right + edgeTolerancePixels ||
      region.bottom > page.bottom + edgeTolerancePixels;
    return failed ? [region.name] : [];
  });

  return {
    failures: [
      ...(pageHasExpectedSize ? [] : ["document-page-size"]),
      ...(pageContainsItsContent ? [] : ["document-page-overflow"]),
      ...failedRegions,
    ],
    page: {
      height: page.clientHeight,
      scrollHeight: page.scrollHeight,
      scrollWidth: page.scrollWidth,
      width: page.clientWidth,
    },
    regions,
  };
}

// Electron and Playwright serialize this collector into the page. Keep its browser work self-contained.
export function collectBillingDocumentMeasurements(
  root: ParentNode = document,
): BillingDocumentMeasurements {
  const page = root.querySelector<HTMLElement>("[data-fit-page]");
  const regions = Array.from(root.querySelectorAll<HTMLElement>("[data-fit-region]")).map(
    (region) => {
      const bounds = region.getBoundingClientRect();
      return {
        bottom: bounds.bottom,
        clientHeight: region.clientHeight,
        clientWidth: region.clientWidth,
        left: bounds.left,
        name: region.dataset.fitRegion ?? "unnamed-region",
        right: bounds.right,
        scrollHeight: region.scrollHeight,
        scrollWidth: region.scrollWidth,
        top: bounds.top,
      };
    },
  );
  if (!page) return { page: null, regions };

  const pageBounds = page.getBoundingClientRect();
  return {
    page: {
      bottom: pageBounds.bottom,
      clientHeight: page.clientHeight,
      clientWidth: page.clientWidth,
      left: pageBounds.left,
      right: pageBounds.right,
      scrollHeight: page.scrollHeight,
      scrollWidth: page.scrollWidth,
      top: pageBounds.top,
    },
    regions,
  };
}
