import { type ReactNode, useEffect, useState } from "react";

import type {
  BillingDocumentFontFace,
  BillingDocumentFonts,
} from "../../documents/billing-document-fonts.ts";
import type { PreviewFontReadiness } from "./live-a4-preview-frame.tsx";

type BillingDocumentFontGateProps = Readonly<{
  active: boolean;
  children: (readiness: PreviewFontReadiness) => ReactNode;
  fonts: BillingDocumentFonts;
}>;

export function BillingDocumentFontGate({ active, children, fonts }: BillingDocumentFontGateProps) {
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<PreviewFontReadiness["status"]>("loading");

  useEffect(() => {
    if (!active) return;
    let current = true;
    void loadDocumentFonts(document.fonts, fonts.faces).then(
      () => {
        if (current) setStatus("ready");
      },
      () => {
        if (current) setStatus("failed");
      },
    );
    return () => {
      current = false;
    };
  }, [active, attempt, fonts]);

  function restart(): void {
    setStatus("loading");
    setAttempt((currentAttempt) => currentAttempt + 1);
  }

  return (
    <>
      <style data-billing-document-fonts key={attempt}>
        {fonts.css}
      </style>
      {children({ restart, status })}
    </>
  );
}

type LoadableFontFace = Pick<
  FontFace,
  "family" | "load" | "status" | "style" | "unicodeRange" | "weight"
>;

type DocumentFontSet = Readonly<{
  ready: PromiseLike<unknown>;
  [Symbol.iterator]: () => Iterator<LoadableFontFace>;
}>;

async function loadDocumentFonts(
  fonts: DocumentFontSet,
  expectedFaces: readonly BillingDocumentFontFace[],
): Promise<void> {
  const arimoFaces = findArimoFaces(fonts);
  requireExpectedFaces(arimoFaces, expectedFaces);

  await Promise.all(arimoFaces.map((face) => face.load()));
  await fonts.ready;

  const loadedArimoFaces = findArimoFaces(fonts);
  requireExpectedFaces(loadedArimoFaces, expectedFaces);
  if (!loadedArimoFaces.every(({ status }) => status === "loaded")) {
    throw new Error("Every billing document font face must be loaded");
  }
}

function findArimoFaces(fonts: DocumentFontSet): readonly LoadableFontFace[] {
  return Array.from(fonts).filter(({ family }) => family.replaceAll('"', "") === "Arimo");
}

function requireExpectedFaces(
  faces: readonly LoadableFontFace[],
  expectedFaces: readonly BillingDocumentFontFace[],
): void {
  const actualFaceKeys = faces.map(fontFaceKey).sort();
  const expectedFaceKeys = expectedFaces.map(fontFaceKey).sort();
  if (
    actualFaceKeys.length !== expectedFaceKeys.length ||
    actualFaceKeys.some((face, index) => face !== expectedFaceKeys[index])
  ) {
    throw new Error("The complete bundled Arimo font set is required");
  }
}

function fontFaceKey(face: BillingDocumentFontFace | LoadableFontFace): string {
  return [
    face.family.replaceAll('"', "").toLowerCase(),
    face.style.toLowerCase(),
    face.weight,
    normalizeUnicodeRange(face.unicodeRange),
  ].join("|");
}

function normalizeUnicodeRange(value: string): string {
  return value
    .split(",")
    .map((range) => {
      const [startText, endText] = range.trim().slice(2).split("-");
      if (!startText) throw new Error(`Invalid document-font Unicode range: ${range}`);
      const start = Number.parseInt(startText, 16).toString(16).toUpperCase();
      if (!endText) return `U+${start}`;
      const end = Number.parseInt(endText, 16).toString(16).toUpperCase();
      return `U+${start}-${end}`;
    })
    .join(",");
}
