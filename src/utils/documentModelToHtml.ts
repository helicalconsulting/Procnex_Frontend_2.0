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
        const isSigTable =
          Boolean((el.tableData as any).isSignatureTable) ||
          cells.some((c) =>
            /(?:For\s+\[|For\s+&|For\s+the\b|Position:|Name:|Authorized Signat|Contractor with seal|Canara Bank)/i.test(
              c.content || ''
            )
          );

        if (isSigTable) {
          // Render as 2-column signature block table matching source PDF box
          let tableHtml =
            '<table border="1" style="width: 100%; border-collapse: collapse; border: 1.5px solid #475569; margin: 24px 0; background-color: #ffffff; table-layout: fixed;"><tbody><tr>';

          const row0Cells = cells.filter((c) => c.row === 0).sort((a, b) => a.col - b.col);
          const colWidth = row0Cells.length > 0 ? `${Math.floor(100 / row0Cells.length)}%` : '50%';

          for (const cell of row0Cells) {
            const linesInCell = (cell.content || '').split('\n');
            const formattedContent = linesInCell
              .map((rawL) => {
                const l = rawL.trim();
                if (!l) return '<div style="height: 10px;"></div>';
                if (/^For\s+/i.test(l)) {
                  return `<strong style="font-size: 13.5px; display: block; margin-bottom: 12px; color: #0f172a;">${escapeHtml(l)}</strong>`;
                }
                const fieldMatch = l.match(/^([A-Za-z\s]+:)\s*(.*)/);
                if (fieldMatch) {
                  return `<div style="margin: 8px 0; font-size: 13px; color: #1e293b;"><strong style="display: inline-block; min-width: 65px; color: #0f172a;">${escapeHtml(fieldMatch[1])}</strong> ${escapeHtml(fieldMatch[2])}</div>`;
                }
                return `<div style="margin: 4px 0; font-size: 13px; color: #1e293b;">${escapeHtml(l)}</div>`;
              })
              .join('');

            tableHtml += `<td style="width: ${colWidth}; border: 1.5px solid #475569; padding: 16px 20px; vertical-align: top; line-height: 1.8; color: #1e293b; background-color: #ffffff;">${formattedContent}</td>`;
          }
          tableHtml += '</tr></tbody></table>';
          lines.push(tableHtml);
          continue;
        }

        // Standard structured data table
        let tableHtml =
          '<table border="1" style="width: 100%; border-collapse: collapse; margin: 16px 0; border: 1px solid #64748b; font-family: Arial, sans-serif; font-size: 13px;"><tbody>';
        for (let r = 0; r < rows; r++) {
          tableHtml += '<tr>';
          const rowCells = cells.filter((c) => c.row === r).sort((a, b) => a.col - b.col);
          for (const cell of rowCells) {
            const tag = cell.isHeader ? 'th' : 'td';
            const cellVal = escapeHtml(cell.content || '').replace(/\n/g, '<br />');
            tableHtml += `<${tag} style="border: 1px solid ${cell.isHeader ? '#64748b' : '#cbd5e1'}; padding: 8px 12px; text-align: ${cell.horizontalAlign || 'left'}; font-weight: ${cell.isHeader ? 'bold' : 'normal'}; background-color: ${cell.backgroundColor || (cell.isHeader ? '#f1f5f9' : (r % 2 === 0 ? '#ffffff' : '#f8fafc'))};" ${cell.rowspan ? `rowspan="${cell.rowspan}"` : ''} ${cell.colspan ? `colspan="${cell.colspan}"` : ''}>${cellVal}</${tag}>`;
          }
          tableHtml += '</tr>';
        }
        tableHtml += '</tbody></table>';
        lines.push(tableHtml);
        continue;
      }

      // 2. Form Lines (fill-in lines or horizontal dividing rules)
      if (el.type === 'form_line') {
        if ((el.bbox?.width || 0) > 360 && !el.text) {
          lines.push('<hr style="border: none; border-top: 1px solid #cbd5e1; margin: 16px 0;" />');
        } else if (el.text) {
          lines.push(
            `<p style="margin: 6px 0; font-family: Arial, sans-serif; line-height: 1.5;"><strong>${escapeHtml(el.text)}</strong> ____________________________________</p>`
          );
        }
        continue;
      }

      // 3. Checkboxes
      if (el.type === 'checkbox') {
        const isChecked = el.checked || el.checkboxState === 'checked';
        lines.push(
          `<p style="margin: 6px 0; font-family: Arial, sans-serif; line-height: 1.6; text-align: left;"><span contenteditable="false" style="display: inline-block; width: 14px; height: 14px; border: 1.5px solid #334155; border-radius: 2px; vertical-align: -2px; margin-right: 8px; background-color: #ffffff; text-align: center; line-height: 12px; font-size: 11px; font-weight: bold; color: #0f172a; user-select: none;">${isChecked ? '✓' : '&nbsp;'}</span>${escapeHtml(el.text || '')}</p>`
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
        const lower = text.toLowerCase();

        // 6A. Preamble Conjunctions: "between", "and"
        if (lower === 'between' || lower === 'and') {
          lines.push(
            `<p style="text-align: center; font-size: 11pt; font-weight: 700; text-transform: lowercase; color: #475569; margin: 4px 0; line-height: 1.4; font-family: Arial, sans-serif;">${escapeHtml(text)}</p>`
          );
          continue;
        }

        // 6B. Named Parties under BETWEEN / AND
        const isParty = /^(?:NGO\s*\/UN\s+agency|Company\/agent|Director|Managing\s+Director|Secretary|Collector|represented\s+by|--+\s*Successful\s+bidder|M\/s\b|The\s+Client\b|The\s+Contractor\b)/i.test(
          text
        );
        if (isParty) {
          lines.push(
            `<p style="text-align: center; font-weight: 600; font-size: 11pt; margin: 4px 0; line-height: 1.4; color: #1e293b; font-family: Arial, sans-serif;">${escapeHtml(text)}</p>`
          );
          continue;
        }

        // 6C. Page Footer: "Page X of Y"
        if (/^Page\s+\d+\s+of\s+\d+$/i.test(text)) {
          lines.push(
            `<p style="text-align: center; font-size: 9.5pt; color: #64748b; margin-top: 20px; margin-bottom: 6px; font-family: Arial, sans-serif;">${escapeHtml(text)}</p>`
          );
          continue;
        }

        // Checkbox inside text (e.g. "[ ] On the date..." or "☐ Option")
        if (/^(?:\[(?:\s*|[✓xX])\]|☐|☑)\s*/.test(text)) {
          const isChecked = /^(?:\[[✓xX]\]|☑)/.test(text);
          const clean = text.replace(/^(?:\[(?:\s*|[✓xX])\]|☐|☑)\s*/, '');
          lines.push(
            `<p style="margin: 6px 0; font-family: Arial, sans-serif; line-height: 1.6; text-align: left;"><span contenteditable="false" style="display: inline-block; width: 14px; height: 14px; border: 1.5px solid #334155; border-radius: 2px; vertical-align: -2px; margin-right: 8px; background-color: #ffffff; text-align: center; line-height: 12px; font-size: 11px; font-weight: bold; color: #0f172a; user-select: none;">${isChecked ? '✓' : '&nbsp;'}</span>${escapeHtml(clean)}</p>`
          );
          continue;
        }

        const isMainHeading =
          text.length < 55 &&
          /^(?:[A-Z0-9\s.,–—:-]+)$/.test(text) &&
          (/AGREEMENT|CONTRACT|ANNEXURE|DEED|SCHEDULE|TURNKEY/i.test(text) ||
            el.alignment === 'center' ||
            (Math.abs(el.bbox.x - (pageWidth - (el.bbox.x + el.bbox.width))) < 35 && el.bbox.width < pageWidth * 0.65));

        const isCentered = isMainHeading;

        const isClauseHeading =
          /^(NOW THIS AGREEMENT|IN WITNESS WHEREOF|SIGNATURES|ARTICLE\s+[0-9IVX]+|SECTION\s+[0-9]+|\d+\.\s+[A-Z]|KNOW ALL MEN)/i.test(
            text
          );

        const isNumberedClause = /^[0-9]+(\.[0-9]+)*\s+[A-Z]/.test(text) || /^\([a-z0-9]+\)\s+/i.test(text);

        const textAlign = isCentered ? 'center' : 'left';
        const fontWeight = isMainHeading || isClauseHeading || el.fontWeight === 'bold' ? 'bold' : 'normal';

        let fontSize = '10.5pt';
        let marginTop = '4px';
        let marginBottom = '4px';

        if (isMainHeading) {
          fontSize = '14pt';
          marginTop = '14px';
          marginBottom = '6px';
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


interface ContractRenderRun {
  text: string;
  x: number;
  y: number;
  fontSize: number;
  fontFamily: string;
  fontWeight: string;
  fontStyle: string;
  color: string;
  opacity: number;
  angle: number;
}

interface ContractGraphic {
  d: string;
  fill?: string;
  stroke?: string;
  fillOpacity?: number;
  strokeOpacity?: number;
  strokeWidth?: number;
  fillRule?: string;
}

/** Imports the extracted page as positioned, editable TinyMCE text. */
export function contractModelToHtml(model: CanonicalDocument): string {
  const num = (value: number, fallback = 0) => Number.isFinite(value) ? value : fallback;
  const hex = (value?: string) => value && /^(?:none|#[0-9a-f]{3,8})$/i.test(value) ? value : 'none';
  const face = (value?: string) => (value || 'Arial').replace(/[^a-zA-Z0-9 _-]/g, '') || 'Arial';

  return model.pages.map((page) => {
    const width = num(page.width, 595) || 595;
    const height = num(page.height, 842) || 842;
    const graphics = (page as typeof page & { graphics?: ContractGraphic[] }).graphics || [];
    const paths = graphics.filter(({ d }) => typeof d === 'string' && /^[MLCZ0-9. -]+$/i.test(d)).map((path) =>
      `<path d="${path.d}" fill="${hex(path.fill)}" stroke="${hex(path.stroke)}" stroke-width="${num(path.strokeWidth ?? 0)}" fill-opacity="${num(path.fillOpacity ?? 1, 1)}" stroke-opacity="${num(path.strokeOpacity ?? 1, 1)}" fill-rule="${path.fillRule === 'evenodd' ? 'evenodd' : 'nonzero'}"/>`
    );
    const positions: string[] = [];
    if (paths.length) {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">${paths.join('')}</svg>`;
      const uri = encodeURIComponent(svg).replace(/'/g, '%27');
      positions.push(`<div contenteditable="false" style="position:absolute;inset:0;pointer-events:none;background-image:url('data:image/svg+xml,${uri}');background-size:100% 100%;">&nbsp;</div>`);
    }

    function renderRuns(runs: ContractRenderRun[] = [], x = 0, y = 0) {
      return runs.map((run) => {
        const size = Math.max(1, num(run.fontSize, 11));
        const angle = num(run.angle);
        const style = `position:absolute;left:${num(run.x) - x}pt;top:${num(run.y) - y - size * 0.86}pt;margin:0;white-space:pre;line-height:1;font-size:${size}pt;font-family:${face(run.fontFamily)},Arial,sans-serif;font-weight:${run.fontWeight === 'bold' ? 'bold' : 'normal'};font-style:${run.fontStyle === 'italic' ? 'italic' : 'normal'};color:${hex(run.color) === 'none' ? '#111111' : hex(run.color)};opacity:${num(run.opacity, 1)};transform:rotate(${angle}deg);transform-origin:0 86%;`;
        return `<p style="${style}">${escapeHtml(run.text) || '&nbsp;'}</p>`;
      }).join('');
    }

    for (const node of page.elements || []) {
      const box = node.bbox;
      if (!box) continue;
      const at = `position:absolute;left:${num(box.x)}pt;top:${num(box.y)}pt;margin:0;`;
      if (node.type === 'table') {
        const table = node.tableData;
        const cells = (table?.cells || []).filter((cell) => cell.bbox && cell.bbox.width > 0 && cell.bbox.height > 0);
        if (!cells.length || !table?.rows || !table.cols) continue;
        const x = Math.min(...cells.map((cell) => num(cell.bbox.x)));
        const y = Math.min(...cells.map((cell) => num(cell.bbox.y)));
        const right = Math.max(...cells.map((cell) => num(cell.bbox.x) + num(cell.bbox.width)));
        const bottom = Math.max(...cells.map((cell) => num(cell.bbox.y) + num(cell.bbox.height)));
        const columnEdges = Array.from({ length: table.cols + 1 }, (_, i) => {
          const starts = cells.filter((cell) => cell.col === i).map((cell) => num(cell.bbox.x));
          return starts.length ? Math.min(...starts) : x + (right - x) * i / table.cols;
        });
        const rowEdges = Array.from({ length: table.rows + 1 }, (_, i) => {
          const starts = cells.filter((cell) => cell.row === i).map((cell) => num(cell.bbox.y));
          return starts.length ? Math.min(...starts) : y + (bottom - y) * i / table.rows;
        });
        const columns = columnEdges.slice(0, -1).map((left, col) =>
          `<col style="width:${Math.max(1, columnEdges[col + 1] - left)}pt;">`
        ).join('');
        const byPosition = new Map(cells.map((cell) => [`${cell.row},${cell.col}`, cell]));
        const covered = new Set<string>();
        const rows = rowEdges.slice(0, -1).map((top, row) => {
          const content: string[] = [];
          for (let col = 0; col < table.cols; col++) {
            const key = `${row},${col}`;
            if (covered.has(key)) continue;
            const cell = byPosition.get(key);
            const rowspan = Math.max(1, Math.min(table.rows - row, cell?.rowspan || 1));
            const colspan = Math.max(1, Math.min(table.cols - col, cell?.colspan || 1));
            for (let r = row; r < row + rowspan; r++) {
              for (let c = col; c < col + colspan; c++) {
                if (r !== row || c !== col) covered.add(`${r},${c}`);
              }
            }
            const runs = cell ? renderRuns((cell as typeof cell & { renderRuns?: ContractRenderRun[] }).renderRuns, columnEdges[col], top) : '';
            const border = paths.length ? 'none' : '0.5pt solid #94a3b8';
            const fill = hex(cell?.backgroundColor) === 'none' ? 'transparent' : hex(cell?.backgroundColor);
            const tag = cell?.isHeader ? 'th' : 'td';
            const text = `<p style="margin:0;padding:2pt 3pt;white-space:pre-wrap;font-size:9pt;line-height:1.1;">${escapeHtml(cell?.content || '') || '&nbsp;'}</p>`;
            const inner = runs ? `<div style="position:relative;height:${Math.max(1, rowEdges[row + rowspan] - top)}pt;">${runs}</div>` : text;
            content.push(`<${tag} rowspan="${rowspan}" colspan="${colspan}" style="padding:0;border:${border};background-color:${fill};font-weight:normal;text-align:left;vertical-align:top;">${inner}</${tag}>`);
          }
          return `<tr style="height:${Math.max(1, rowEdges[row + 1] - top)}pt;">${content.join('')}</tr>`;
        }).join('');
        positions.push(`<table class="contract-ocr-table" style="position:absolute;left:${x}pt;top:${y}pt;width:${right - x}pt;margin:0;table-layout:fixed;border-collapse:collapse;"><colgroup>${columns}</colgroup><tbody>${rows}</tbody></table>`);
      } else if (node.type === 'text') {
        const runs = renderRuns((node as typeof node & { renderRuns?: ContractRenderRun[] }).renderRuns);
        if (runs) positions.push(runs);
        else {
          const size = num(node.fontSize ?? 11, 11);
          positions.push(`<p style="${at}width:${num(box.width)}pt;white-space:pre-wrap;line-height:1;font-size:${size}pt;font-family:${face(node.fontFamily)},Arial,sans-serif;color:${hex(node.color) === 'none' ? '#111111' : hex(node.color)};">${escapeHtml(node.text || '') || '&nbsp;'}</p>`);
        }
      } else if (!paths.length && (node.type === 'form_line' || node.type === 'checkbox')) {
        const border = node.type === 'checkbox' ? 'border:0.6pt solid #555;' : 'border-top:0.6pt solid #555;';
        positions.push(`<div contenteditable="false" style="${at}width:${num(box.width)}pt;height:${num(box.height)}pt;${border}pointer-events:none;">${node.type === 'checkbox' && node.checked ? '&#10003;' : '&nbsp;'}</div>`);
      }
    }

    return `<div class="contract-ocr-page" style="position:relative;width:${width}pt;min-height:${height}pt;margin:0 auto 12pt;background-color:#fff;color:#111111;page-break-after:always;">${positions.join('') || '<p>&nbsp;</p>'}</div>`;
  }).join('');
}
