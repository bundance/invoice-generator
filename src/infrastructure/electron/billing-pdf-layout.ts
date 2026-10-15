import { z } from "zod";

import type { BillingDocumentModel } from "../../documents/invoice-document-model.ts";

type LayoutBox = Readonly<{
  height: number;
  left: number;
  top: number;
  width: number;
}>;

type LayoutNode = Readonly<{
  box?: LayoutBox | undefined;
  children?: readonly LayoutNode[] | undefined;
  lines?: readonly Readonly<{ box: Readonly<{ height: number }>; xAdvance: number }>[] | undefined;
  props?: Readonly<{ id?: string | undefined }> | undefined;
  type: string;
}>;

const layoutBoxSchema: z.ZodType<LayoutBox> = z.object({
  height: z.number().finite().nonnegative(),
  left: z.number().finite(),
  top: z.number().finite(),
  width: z.number().finite().nonnegative(),
});

const layoutNodeSchema: z.ZodType<LayoutNode> = z.lazy(() =>
  z.object({
    box: layoutBoxSchema.optional(),
    children: z.array(layoutNodeSchema).optional(),
    lines: z
      .array(
        z.object({
          box: z.looseObject({ height: z.number().finite().nonnegative() }),
          xAdvance: z.number().finite().nonnegative(),
        }),
      )
      .optional(),
    props: z.looseObject({ id: z.string().optional() }).optional(),
    type: z.string(),
  }),
);

export const billingPdfLayoutSchema = z.object({ children: z.array(layoutNodeSchema) });
export type BillingPdfLayout = z.infer<typeof billingPdfLayoutSchema>;

const a4WidthPoints = 595.28;
const a4HeightPoints = 841.89;
const geometryTolerancePoints = 0.75;

export function auditBillingPdfLayout(
  layoutData: BillingPdfLayout,
  model: BillingDocumentModel,
): number {
  const { children: pages } = layoutData;
  if (pages.length === 0) throw new Error("React-PDF returned no pages");

  const pageNodes = pages.map((page) => {
    auditPage(page);
    return collectLayoutNodes(page, 0, 0);
  });
  const allNodes = pageNodes.flat();
  const rowIds = allNodes
    .map(({ node }) => node.props?.id)
    .filter((id): id is string => id?.startsWith("service-row-") ?? false);
  const expectedRowIds = model.serviceLines.map((_line, index) => `service-row-${index}`);
  if (rowIds.join("|") !== expectedRowIds.join("|")) {
    throw new Error("React-PDF changed the service-row order or count");
  }

  requireIdCount(allNodes, "document-totals", 1);
  for (const nodesOnPage of pageNodes) {
    requireIdCount(nodesOnPage, "document-page-number", 1);
    requireIdCount(nodesOnPage, "document-continuation", 1);
    auditFooterClearance(nodesOnPage);
  }
  for (const positionedNode of allNodes) auditTextGeometry(positionedNode);
  return pages.length;
}

function auditPage(page: LayoutNode): void {
  if (
    !page.box ||
    page.type !== "PAGE" ||
    Math.abs(page.box.width - a4WidthPoints) > geometryTolerancePoints ||
    Math.abs(page.box.height - a4HeightPoints) > geometryTolerancePoints
  ) {
    throw new Error("React-PDF returned a non-A4 page");
  }
}

type PositionedLayoutNode = Readonly<{
  box: LayoutBox;
  left: number;
  node: LayoutNode;
  top: number;
}>;

function collectLayoutNodes(
  node: LayoutNode,
  parentLeft: number,
  parentTop: number,
): readonly PositionedLayoutNode[] {
  if (!node.box) return [];
  const left = parentLeft + node.box.left;
  const top = parentTop + node.box.top;
  const current = [{ box: node.box, left, node, top }];
  return [
    ...current,
    ...(node.children ?? []).flatMap((child) => collectLayoutNodes(child, left, top)),
  ];
}

function auditFooterClearance(nodes: readonly PositionedLayoutNode[]): void {
  const footer = nodes.find(({ node }) => node.props?.id === "document-footer");
  if (!footer) throw new Error("React-PDF layout omitted the fixed footer");
  for (const positioned of nodes) {
    const id = positioned.node.props?.id;
    if (!requiresFooterClearance(positioned.node)) continue;
    if (positioned.top + positioned.box.height > footer.top - geometryTolerancePoints) {
      throw new Error(`React-PDF placed ${id} into the fixed footer`);
    }
  }
}

function requiresFooterClearance(node: LayoutNode): boolean {
  const id = node.props?.id;
  if (id === "document-footer" || id === "document-page-number") return false;
  return (
    node.type === "TEXT" || (id?.startsWith("service-row-") ?? false) || id === "document-totals"
  );
}

function auditTextGeometry(positioned: PositionedLayoutNode): void {
  const { box, node } = positioned;
  const id = node.props?.id;
  if (node.type !== "TEXT") return;
  const label = id ?? "unlabelled";
  const lines = node.lines ?? [];
  if (lines.some((line) => line.xAdvance > box.width + geometryTolerancePoints)) {
    throw new Error(`React-PDF placed ${label} text outside its layout box`);
  }
  const lineHeight = lines.reduce((height, line) => height + line.box.height, 0);
  if (lineHeight > box.height + geometryTolerancePoints) {
    throw new Error(`React-PDF clipped ${label} text inside its layout box`);
  }
  if (isOutsidePage(positioned)) {
    throw new Error(`React-PDF placed ${label} outside the A4 page`);
  }
}

function isOutsidePage({ box, left, top }: PositionedLayoutNode): boolean {
  return (
    left < -geometryTolerancePoints ||
    top < -geometryTolerancePoints ||
    left + box.width > a4WidthPoints + geometryTolerancePoints ||
    top + box.height > a4HeightPoints + geometryTolerancePoints
  );
}

function requireIdCount(
  nodes: readonly PositionedLayoutNode[],
  id: string,
  expectedCount: number,
): void {
  const actualCount = nodes.filter(({ node }) => node.props?.id === id).length;
  if (actualCount !== expectedCount) {
    throw new Error(
      `React-PDF layout expected ${id} ${expectedCount} time but found ${actualCount}`,
    );
  }
}
