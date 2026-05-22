export async function extractText(
  buffer: Buffer,
  fileType: string
): Promise<string> {
  const type = fileType.toUpperCase();

  if (type === "PDF") {
    const pdfParse = (await import("pdf-parse")).default;
    const result = await pdfParse(buffer, { max: 100 });
    return result.text;
  }

  if (type === "DOCX") {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  if (type === "XLSX" || type === "XLS") {
    const XLSX = await import("xlsx");
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const texts: string[] = [];
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const csv = XLSX.utils.sheet_to_csv(sheet);
      texts.push(`--- Feuille: ${sheetName} ---\n${csv}`);
    }
    return texts.join("\n\n");
  }

  if (type === "TXT" || type === "MD") {
    return buffer.toString("utf-8");
  }

  throw new Error(`Type de fichier non supporté: ${fileType}`);
}
