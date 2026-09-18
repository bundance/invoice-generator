import { billingDocumentFontFaces } from "../../src/documents/billing-document-fonts.ts";

export type TestDocumentFontFace = {
  family: string;
  load: () => Promise<TestDocumentFontFace>;
  status: FontFaceLoadStatus;
  style: string;
  unicodeRange: string;
  weight: string;
};

export type TestDocumentFontSet = {
  faces: TestDocumentFontFace[];
  ready: Promise<TestDocumentFontSet>;
  [Symbol.iterator]: () => Iterator<TestDocumentFontFace>;
};

type CreateTestDocumentFontsOptions = Readonly<{
  load: (face: TestDocumentFontFace) => Promise<void>;
  status: FontFaceLoadStatus;
}>;

export function createLoadedTestDocumentFonts(): TestDocumentFontSet {
  return createTestDocumentFonts({
    load: (face) => {
      face.status = "loaded";
      return Promise.resolve();
    },
    status: "loaded",
  });
}

export function createTestDocumentFonts({
  load,
  status,
}: CreateTestDocumentFontsOptions): TestDocumentFontSet {
  const faces = billingDocumentFontFaces.map((definition) => {
    const face: TestDocumentFontFace = {
      ...definition,
      load: async () => {
        await load(face);
        return face;
      },
      status,
    };
    return face;
  });
  const fonts: TestDocumentFontSet = {
    faces,
    ready: Promise.resolve(undefined).then(() => fonts),
    [Symbol.iterator]: () => faces.values(),
  };
  return fonts;
}

export function setTestDocumentFonts(fonts: TestDocumentFontSet): void {
  Object.defineProperty(document, "fonts", { configurable: true, value: fonts });
}
