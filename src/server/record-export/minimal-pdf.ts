import "server-only";

function pdfEscapeText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function toPdfAscii(s: string, maxLen: number): string {
  const trimmed = s.length > maxLen ? `${s.slice(0, maxLen - 1)}…` : s;
  return trimmed.replace(/[^\x09\x0a\x0d\x20-\x7e]/g, "?").replace(/\r?\n/g, " ");
}

/**
 * Minimal PDF 1.4 (Helvetica) — approval packet snapshot for exports.
 */
export function buildApprovalPacketPdf(params: {
  title: string;
  sections: { heading: string; body: string }[];
  watermark: boolean;
}): Buffer {
  const title = toPdfAscii(params.title, 200);
  const rawLines: string[] = [];
  for (const sec of params.sections) {
    rawLines.push(`${sec.heading}: ${toPdfAscii(sec.body, 480)}`);
  }

  const fontSize = 10;
  const lineHeight = 14;
  const streamParts: string[] = [];

  if (params.watermark) {
    streamParts.push(
      "q 0.35 g BT /F1 36 Tf 1 0 0 1 140 400 Tm (CONFIDENTIAL) Tj ET Q"
    );
  }

  streamParts.push(`BT /F1 16 Tf 50 750 Td (${pdfEscapeText(title)}) Tj ET`);

  let y = 720;
  for (const line of rawLines) {
    streamParts.push(
      `BT /F1 ${fontSize} Tf 50 ${y} Td (${pdfEscapeText(toPdfAscii(line, 500))}) Tj ET`
    );
    y -= lineHeight;
    if (y < 50) break;
  }

  const streamBody = `${streamParts.join("\n")}\n`;
  const streamBytes = Buffer.byteLength(streamBody, "utf8");

  const obj4 = `4 0 obj<< /Length ${streamBytes} >>stream\n${streamBody}endstream\nendobj\n`;

  const objects = [
    "1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n",
    "2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n",
    "3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>endobj\n",
    obj4,
    "5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\n",
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, "binary"));
    pdf += obj;
  }

  const xrefStart = Buffer.byteLength(pdf, "binary");
  pdf += "xref\n";
  pdf += `0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i <= objects.length; i++) {
    pdf += `${String(offsets[i]!).padStart(10, "0")} 00000 n \n`;
  }
  pdf += "trailer\n";
  pdf += `<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  pdf += "startxref\n";
  pdf += `${xrefStart}\n`;
  pdf += "%%EOF";

  return Buffer.from(pdf, "binary");
}
