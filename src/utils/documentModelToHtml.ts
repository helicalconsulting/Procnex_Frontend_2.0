// ============================================================
// utils/documentModelToHtml.ts
// Converts a CanonicalDocument / layoutModel scene graph into clean,
// enterprise-grade HTML formatted specifically for TinyMCE WYSIWYG editor
// ============================================================

import type { CanonicalDocument } from '../components/contracts/FixedLayoutDocumentViewer';
import type { CanonicalElement, CanonicalPage } from '../types/documentExtraction';

function escapeHtml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function canonicalModelToHtml(model: CanonicalDocument): string {
  if (!model || !model.pages || model.pages.length === 0) {
    if (model?.plainText) {
      return model.plainText
        .split(/\n\n+/)
        .map((p) => `<p style="margin: 8px 0; line-height: 1.6; font-family: Arial, sans-serif;">${escapeHtml(p).replace(/\n/g, '<br />')}</p>`)
        .join('');
    }
    return '';
  }

  const pageHtmls: string[] = [];

  for (let pIdx = 0; pIdx < model.pages.length; pIdx++) {
    const page: CanonicalPage = model.pages[pIdx];
    const pageWidth = page.width || 595.28;
    const elements: CanonicalElement[] = [...(page.elements || [])].sort((a, b) => {
      // Sort primarily by vertical Y position, then by horizontal X position
      const diffY = a.bbox.y - b.bbox.y;
      if (Math.abs(diffY) > 8) return diffY;
      return a.bbox.x - b.bbox.x;
    });

    const lines: string[] = [];

    for (const el of elements) {
      // 1. Table Elements
      if (el.type === 'table' && el.tableData) {
        const rows = el.tableData.rows || 1;
        const cells = el.tableData.cells || [];
        let tableHtml =
          '<table style="width: 100%; border-collapse: collapse; margin: 16px 0; border: 1px solid #cbd5e1; font-family: Arial, sans-serif; font-size: 13px;"><tbody>';
        for (let r = 0; r < rows; r++) {
          tableHtml += '<tr>';
          const rowCells = cells.filter((c) => c.row === r).sort((a, b) => a.col - b.col);
          for (const cell of rowCells) {
            const tag = cell.isHeader ? 'th' : 'td';
            tableHtml += `<${tag} style="border: 1px solid #cbd5e1; padding: 6px 10px; text-align: ${cell.horizontalAlign || 'left'}; font-weight: ${cell.isHeader ? 'bold' : 'normal'}; background-color: ${cell.backgroundColor || (cell.isHeader ? '#f8fafc' : 'transparent')};" ${cell.rowspan ? `rowspan="${cell.rowspan}"` : ''} ${cell.colspan ? `colspan="${cell.colspan}"` : ''}>${cell.content || ''}</${tag}>`;
          }
          tableHtml += '</tr>';
        }
        tableHtml += '</tbody></table>';
        lines.push(tableHtml);
        continue;
      }

      // 2. Form Lines (fill-in lines)
      if (el.type === 'form_line') {
        lines.push(
          `<p style="margin: 6px 0; font-family: Arial, sans-serif; line-height: 1.5;">${el.text ? `<strong>${escapeHtml(el.text)}</strong> ` : ''}____________________________________</p>`
        );
        continue;
      }

      // 3. Checkboxes
      if (el.type === 'checkbox') {
        const isChecked = el.checked || el.checkboxState === 'checked';
        lines.push(
          `<p style="margin: 4px 0; font-family: Arial, sans-serif; line-height: 1.5;"><span style="font-size: 14px; font-weight: bold;">[${isChecked ? '✓' : ' '}]</span> ${escapeHtml(el.text || '')}</p>`
        );
        continue;
      }

      // 4. Dividers
      if (el.type === 'divider') {
        lines.push('<hr style="border: none; border-top: 1px solid #cbd5e1; margin: 16px 0;" />');
        continue;
      }

      // 5. Images / Stamps / Signatures
      if (el.type === 'image' && el.imageData?.assetUrl) {
        lines.push(
          `<p style="text-align: center; margin: 12px 0;"><img src="${el.imageData.assetUrl}" alt="Document graphic" style="max-height: 120px; object-fit: contain;" /></p>`
        );
        continue;
      }

      // 6. Text Elements
      if (el.text && el.text.trim()) {
        const text = el.text.trim();
        const isCentered =
          el.alignment === 'center' ||
          (Math.abs(el.bbox.x - (pageWidth - (el.bbox.x + el.bbox.width))) < 45 && el.bbox.width < pageWidth * 0.85);

        const isMainHeading =
          isCentered &&
          (/AGREEMENT|CONTRACT|ANNEXURE|DEED|SCHEDULE|TURNKEY/i.test(text) ||
            (text === text.toUpperCase() && text.length < 70));

        const isClauseHeading =
          /^(NOW THIS AGREEMENT|IN WITNESS WHEREOF|SIGNATURES|ARTICLE\s+[0-9IVX]+|SECTION\s+[0-9]+|\d+\.\s+[A-Z]|KNOW ALL MEN)/i.test(
            text
          );

        const isNumberedClause = /^[0-9]+(\.[0-9]+)*\s+[A-Z]/.test(text) || /^\([a-z0-9]+\)\s+/i.test(text);

        const textAlign = isCentered ? 'center' : el.alignment || 'left';
        const fontWeight = isMainHeading || isClauseHeading || el.fontWeight === 'bold' ? 'bold' : 'normal';

        let fontSize = '10.5pt';
        let marginTop = '4px';
        let marginBottom = '4px';

        if (isMainHeading) {
          fontSize = '14pt';
          marginTop = '16px';
          marginBottom = '8px';
        } else if (isClauseHeading) {
          fontSize = '12pt';
          marginTop = '14px';
          marginBottom = '6px';
        } else if (isNumberedClause) {
          fontSize = '10.5pt';
          marginTop = '6px';
          marginBottom = '4px';
        }

        // Detect if text contains signatures header
        if (/^SIGNATURES$/i.test(text)) {
          lines.push(
            `<p style="text-align: left; font-weight: bold; font-size: 12pt; margin-top: 20px; margin-bottom: 8px; font-family: Arial, sans-serif; color: #1e293b;">SIGNATURES</p>`
          );
          continue;
        }

        lines.push(
          `<p style="text-align: ${textAlign}; font-weight: ${fontWeight}; font-size: ${fontSize}; margin-top: ${marginTop}; margin-bottom: ${marginBottom}; line-height: 1.6; font-family: Arial, Helvetica, sans-serif; color: #1e293b;">${escapeHtml(text)}</p>`
        );
      }
    }

    pageHtmls.push(lines.join('\n'));
  }

  // Separate multiple pages with standard TinyMCE page break
  return pageHtmls.join(
    '\n<p><!-- pagebreak --></p>\n<div class="mce-pagebreak" data-mce-placeholder="true" style="page-break-after: always; margin: 2rem 0; border-top: 2px dashed #94a3b8; text-align: center; font-size: 11px; color: #64748b; padding-top: 4px;">--- Page Break ---</div>\n'
  );
}

export function createFallbackLayoutModel(
  fileUrl?: string | null,
  rawText?: string | null
): CanonicalDocument {
  const text = (rawText || '').trim();
  const lines = text ? text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean) : [];
  return {
    version: '1.0',
    pageCount: 1,
    plainText: text,
    pages: [
      {
        pageIndex: 0,
        width: 595.28,
        height: Math.max(841.89, 80 + lines.length * 24),
        rotation: 0,
        coordinateUnit: 'pt',
        previewImageUrl: fileUrl || null,
        processingStatus: 'COMPLETED',
        extractionMethod: 'ocr',
        elements: lines.map((line, idx) => ({
          id: `p0_el_${idx}`,
          pageIndex: 0,
          type: 'text',
          bbox: { x: 50, y: 50 + idx * 24, width: 495, height: 20 },
          readingOrder: idx + 1,
          source: 'ocr',
          text: line,
          fontSize: idx === 0 ? 13 : 10.5,
          fontWeight: idx === 0 ? 'bold' : 'normal',
          alignment: idx === 0 ? 'center' : 'left',
          fontFamily: 'Arial, sans-serif',
        })),
      },
    ],
  };
}
