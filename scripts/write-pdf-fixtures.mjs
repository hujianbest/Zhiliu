import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function pdf(objects) {
  const chunks = ['%PDF-1.4\n'];
  const offsets = [0];
  for (let i = 0; i < objects.length; i += 1) {
    offsets.push(chunks.join('').length);
    chunks.push(`${i + 1} 0 obj\n${objects[i]}\nendobj\n`);
  }
  const xrefAt = chunks.join('').length;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i += 1) {
    xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  chunks.push(xref);
  chunks.push(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`);
  return Buffer.from(chunks.join(''), 'latin1');
}

const selectable = pdf([
  '<< /Type /Catalog /Pages 2 0 R /Outlines 8 0 R >>',
  '<< /Type /Pages /Kids [3 0 R 6 0 R] /Count 2 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 7 0 R >> >> >>',
  '<< /Length 68 >>\nstream\nBT /F1 18 Tf 72 720 Td (Bramblepoint page one sentence.) Tj ET\nendstream',
  '<< /Length 66 >>\nstream\nBT /F1 18 Tf 72 720 Td (Willowgate page two sentence.) Tj ET\nendstream',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 5 0 R /Resources << /Font << /F1 7 0 R >> >> >>',
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  '<< /Type /Outlines /First 9 0 R /Last 10 0 R /Count 2 >>',
  '<< /Title (Page One) /Parent 8 0 R /Next 10 0 R /Dest [3 0 R /XYZ 0 792 0] >>',
  '<< /Title (Page Two) /Parent 8 0 R /Prev 9 0 R /Dest [6 0 R /XYZ 0 792 0] >>',
]);

const imageOnly = pdf([
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>',
  '<< /Length 44 >>\nstream\n0.85 0.85 0.85 rg 72 72 468 648 re f\nendstream',
]);

const fixtures = path.join(root, 'e2e/fixtures');
await writeFile(path.join(fixtures, 'selectable-notes.pdf'), selectable);
await writeFile(path.join(fixtures, 'image-only.pdf'), imageOnly);
console.log('wrote pdf fixtures', selectable.length, imageOnly.length);
