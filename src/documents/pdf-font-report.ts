const approvedPdfFontName = /^(?:[A-Z]{6}\+)?Arimo(?:[-,]|$)/u;

export function verifyEmbeddedArimoFonts(report: string): void {
  const lines = report.split("\n");
  const separatorIndex = lines.findIndex((line) => /^-+\s+-+/u.test(line));
  const fontRows = separatorIndex < 0 ? [] : lines.slice(separatorIndex + 1).filter(Boolean);
  const allRowsUseEmbeddedArimo =
    fontRows.length > 0 &&
    fontRows.every((row) => {
      const columns = row.trim().split(/\s+/u);
      const name = columns[0] ?? "";
      const embedded = columns.at(-5);
      const unicode = columns.at(-3);
      return approvedPdfFontName.test(name) && embedded === "yes" && unicode === "yes";
    });

  if (!allRowsUseEmbeddedArimo) {
    throw new Error("The retained PDF must use only embedded Unicode Arimo fonts");
  }
}
