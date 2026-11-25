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

function cleanTokenSpacing(text: string): string {
  if (!text) return '';
  let s = text
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]{2,})([A-Z][a-z])/g, '$1 $2')
    .replace(/\bwitha\b/gi, 'with a')
    .replace(/\bfora\b/gi, 'for a')
    .replace(/\bina\b/gi, 'in a')
    .replace(/\bofa\b/gi, 'of a')
    .replace(/\basa\b/gi, 'as a')
    .replace(/\bisby\b/gi, 'is by')
    .replace(/\bmadeon\b/gi, 'made on')
    .replace(/\beachreferred\b/gi, 'each referred')
    .replace(/\btoasa\b/gi, 'to as a')
    .replace(/\bPartyand\b/gi, 'Party and')
    .replace(/\bvaluableconsideration\b/gi, 'valuable consideration')
    .replace(/\bhiresthe\b/gi, 'hires the')
    .replace(/\bunderthe\b/gi, 'under the')
    .replace(/\btermsand\b/gi, 'terms and')
    .replace(/\buponbythe\b/gi, 'upon by the')
    .replace(/\bforother\b/gi, 'for other')
    .replace(/\bgoodand\b/gi, 'good and')
    .replace(/\bcheckall\b/gi, 'check all')
    .replace(/\bcheckone\b/gi, 'check one')
    .replace(/\bthatapply\b/gi, 'that apply')
    .replace(/\bCONTRACTAGREEMENT\b/gi, 'CONTRACT AGREEMENT')
    .replace(/\bKNOWALLMENBYTHESEPRESENTS\b/gi, 'KNOW ALL MEN BY THESE PRESENTS')
    .replace(/\bCORRUGATEDBOXESFORTHEDOCUMENTPROCESSING\b/gi, 'CORRUGATED BOXES FOR THE DOCUMENT PROCESSING')
    .replace(/\bDIVISIONANDOTHEROFFICESOFBIR\b/gi, 'DIVISION AND OTHER OFFICES OF BIR')
    .replace(/\bSTO\.TOMAS,BATANGAS\b/gi, 'STO. TOMAS, BATANGAS')
    .replace(/\bBUREAUOFINTERNALREVENUE\b/gi, 'BUREAU OF INTERNAL REVENUE')
    .replace(/\bSTANLEYBRADLEYTRADINGINC\b/gi, 'STANLEY BRADLEY TRADING INC')
    .replace(/\bNOWTHISAGREEMENTWITNESSETHASFOLLOWS\b/gi, 'NOW THIS AGREEMENT WITNESSETH AS FOLLOWS')
    .replace(/\bPAYMENTAMOUNT\b/gi, 'PAYMENT AMOUNT')
    .replace(/\bPOLICYINFORMATION\b/gi, 'POLICY INFORMATION')
    .replace(/\bENDORSEMENTNO\b/gi, 'ENDORSEMENT NO.')
    .replace(/\bISSUEDATE\b/gi, 'ISSUE DATE')
    .replace(/\bNAMEDINSURED\b/gi, 'NAMED INSURED')
    .replace(/\bTYPEOFINSURANCE\b/gi, 'TYPE OF INSURANCE')
    .replace(/\bOTHERPROVISIONS\b/gi, 'OTHER PROVISIONS')
    .replace(/\bEachOccurrence\b/gi, 'Each Occurrence')
    .replace(/\bPerClaim\b/gi, 'Per Claim')
    .replace(/\bInsuranceCompany\b/gi, 'Insurance Company')
    .replace(/\bPolicyNo\b/gi, 'Policy No.')
    .replace(/\bPolicyPeriod\b/gi, 'Policy Period')
    .replace(/\bCOMMERCIALGENERALLIABILITY\b/gi, 'COMMERCIAL GENERAL LIABILITY')
    .replace(/\bCOMPREHENSIVEGENERALLIABILITY\b/gi, 'COMPREHENSIVE GENERAL LIABILITY')
    .replace(/\bOWNERS&CONTRACTORSPROTECTIVE\b/gi, 'OWNERS & CONTRACTORS PROTECTIVE')
    .replace(/\bGENERALLIABILITY\b/gi, 'GENERAL LIABILITY')
    .replace(/\bSPECIALENDORSEMENT\b/gi, 'SPECIAL ENDORSEMENT')
    .replace(/\bPRODUCTS-COMPLETEDOPERATIONS\b/gi, 'PRODUCTS-COMPLETED OPERATIONS')
    .replace(/\bPERSONAL&ADVERTISINGINJURY\b/gi, 'PERSONAL & ADVERTISING INJURY')
    .replace(/\bFIRELEGALLIABILITY\b/gi, 'FIRE LEGAL LIABILITY')
    .replace(/\bCONTRACTUALLIABILITY\b/gi, 'CONTRACTUAL LIABILITY')
    .replace(/\bSANDIEGOCOUNTYWATERAUTHORITY\b/gi, 'SAN DIEGO COUNTY WATER AUTHORITY')
    .replace(/\bAUTHORIZEDREPRESENTATIVE\b/gi, 'AUTHORIZED REPRESENTATIVE')
    .replace(/\bENDORSEMENTHOLDER\b/gi, 'ENDORSEMENT HOLDER')
    .replace(/\bADDITIONALINSURED\b/gi, 'ADDITIONAL INSURED')
    .replace(/\bSELFINSUREDRETENTION\b/gi, 'SELF-INSURED RETENTION')
    .replace(/\bAgreements\s+Hall\b/gi, 'Agreement shall')
    .replace(/\(\s*"\s*([^"]+?)\s*"\s*\)/g, '("$1")');
  return s;
}

function replaceCheckboxesInText(text: string): string {
  if (!text) return '';
  // Convert standard checkbox glyphs and representations to interactive elements
  let res = text.replace(
    /(?:\[\s*\]|\[_\]|☐|[\u25A1\u25A2\u25FD\u25FE\u2610])/g,
    '<span class="contract-checkbox" data-checked="false" contenteditable="false" style="display: inline-flex; align-items: center; justify-content: center; width: 15px; height: 15px; min-width: 15px; min-height: 15px; border: 1.5px solid #2563eb; border-radius: 3px; vertical-align: middle; margin: 0 5px 0 2px; background-color: #ffffff; font-size: 10px; font-weight: bold; color: transparent; cursor: pointer; user-select: none;">&nbsp;</span>'
  );
  res = res.replace(
    /(?:\[[xXvV✓\u2713\u2714]\]|☑|[\u2611\u2612])/g,
    '<span class="contract-checkbox" data-checked="true" contenteditable="false" style="display: inline-flex; align-items: center; justify-content: center; width: 15px; height: 15px; min-width: 15px; min-height: 15px; border: 1.5px solid #2563eb; border-radius: 3px; vertical-align: middle; margin: 0 5px 0 2px; background-color: #2563eb; font-size: 10px; font-weight: bold; color: #ffffff; cursor: pointer; user-select: none;">&#10003;</span>'
  );
  // Convert blank underscore fill lines (____) into clean editable inline spans
  res = res.replace(
    /_{3,25}/g,
    '<span class="contract-fill-field" style="display: inline-block; min-width: 85px; border-bottom: 1.5px solid #64748b; padding: 0 4px; margin: 0 2px;">&nbsp;</span>'
  );
  return res;
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
    const rawElements: CanonicalElement[] = (page.elements || []).filter((e: any) => !e?.isRunningHeaderFooter);

    const blockElements: { y: number; html: string }[] = [];

    // 1. Table Elements
    for (const el of rawElements) {
      if (el.type === 'table' && el.tableData) {
        const rows = el.tableData.rows || 1;
        const cells = el.tableData.cells || [];
        const isSigTable =
          Boolean((el.tableData as any).isSignatureTable) ||
          cells.some((c) =>
            /(?:For\s+\[|For\s+&|For\s+the\b|Position:|Name:|Authorized Signat|AUTHORIZED REPRESENTATIVE|ENDORSEMENT\s+HOLDER|Contractor with seal|Canara Bank)/i.test(
              c.content || ''
            )
          );

        if (isSigTable) {
          let tableHtml =
            '<table border="1" style="width: 100%; border-collapse: collapse; border: 1.5px solid #475569; margin: 20px 0; background-color: #ffffff; table-layout: fixed;"><tbody>';
          const maxCols = Math.max(1, ...(cells.map((c) => c.col + (c.colspan || 1))));
          const defaultColWidth = `${Math.floor(100 / maxCols)}%`;

          for (let r = 0; r < rows; r++) {
            const rCells = cells.filter((c) => c.row === r).sort((a, b) => a.col - b.col);
            if (rCells.length === 0) continue;
            tableHtml += '<tr>';
            for (const cell of rCells) {
              const linesInCell = (cell.content || '').split('\n');
              const formattedContent = linesInCell
                .map((rawL) => {
                  const l = rawL.trim();
                  if (!l) return '<div style="height: 8px;"></div>';
                  if (/^(?:For\s+|AUTHORIZED\s+REPRESENTATIVE|ENDORSEMENT\s+HOLDER)/i.test(l)) {
                    return `<strong style="font-size: 13px; display: block; margin-bottom: 8px; color: #0f172a;">${escapeHtml(l)}</strong>`;
                  }
                  const fieldMatch = l.match(/^([A-Za-z\s]+:)\s*(.*)/);
                  if (fieldMatch) {
                    return `<div style="margin: 6px 0; font-size: 12.5px; color: #1e293b;"><strong style="display: inline-block; min-width: 65px; color: #0f172a;">${escapeHtml(fieldMatch[1])}</strong> ${escapeHtml(fieldMatch[2])}</div>`;
                  }
                  return `<div style="margin: 4px 0; font-size: 12.5px; color: #1e293b;">${escapeHtml(l)}</div>`;
                })
                .join('');
              const w = cell.colspan > 1 ? `${Math.floor((100 * cell.colspan) / maxCols)}%` : defaultColWidth;
              tableHtml += `<td style="width: ${w}; border: 1.5px solid #475569; padding: 10px 14px; vertical-align: top; line-height: 1.6; color: #1e293b; background-color: #ffffff;" ${cell.rowspan > 1 ? `rowspan="${cell.rowspan}"` : ''} ${cell.colspan > 1 ? `colspan="${cell.colspan}"` : ''}>${formattedContent || '&nbsp;'}</td>`;
            }
            tableHtml += '</tr>';
          }
          tableHtml += '</tbody></table>';
          blockElements.push({ y: el.bbox?.y ?? 0, html: tableHtml });
          continue;
        }

        // Row-Local Table Grid & Asymmetric Sub-Table Reconstruction
        const rowGroups: Array<{ rowIdx: number; rowCells: typeof cells }> = [];
        for (let r = 0; r < rows; r++) {
          const rowCells = cells.filter((c) => c.row === r).sort((a, b) => a.col - b.col);
          if (rowCells.length > 0) rowGroups.push({ rowIdx: r, rowCells });
        }
        const uniqueColCounts = new Set(rowGroups.map((rg) => rg.rowCells.length));
        const hasAsymmetricRows = uniqueColCounts.size > 1 && rowGroups.length > 1;
        const maxCols = Math.max(1, el.tableData.cols || 1, ...rowGroups.map((rg) => rg.rowCells.length));

        const computeRowWidths = (rowCells: typeof cells): number[] => {
          const rawW = rowCells.map((cell) => {
            const explicit = (cell as any).widthPercent;
            if (typeof explicit === 'number' && explicit > 0) return explicit;
            if (cell.bbox && el.bbox?.width) return Math.max(8, (cell.bbox.width / el.bbox.width) * 100);
            return 100 / Math.max(1, rowCells.length);
          });
          const sum = rawW.reduce((a, b) => a + b, 0) || 100;
          return rawW.map((w) => Math.max(6, Math.round((w / sum) * 100)));
        };

        let tableHtml = '';
        if (hasAsymmetricRows) {
          tableHtml = '<div style="margin: 16px 0;">';
          rowGroups.forEach(({ rowIdx: r, rowCells }, idx) => {
            const widths = computeRowWidths(rowCells);
            const colgroup = `<colgroup>${widths.map((w) => `<col style="width: ${w}%;" />`).join('')}</colgroup>`;
            const mt = idx === 0 ? '0' : '-1px';
            tableHtml += `<table border="1" style="width: 100%; border-collapse: collapse; margin: ${mt} 0 0 0; border: 1px solid #64748b; font-family: Arial, Helvetica, sans-serif; font-size: 12px; background-color: #ffffff; table-layout: fixed;">${colgroup}<tbody><tr>`;
            rowCells.forEach((cell) => {
              const isHeader = cell.isHeader || (r === 0 && rows > 1);
              const tag = isHeader ? 'th' : 'td';
              let cellVal = cleanTokenSpacing(escapeHtml(cell.content || '')).replace(/\n/g, '<br />');
              cellVal = replaceCheckboxesInText(cellVal);
              tableHtml += `<${tag} style="border: 1px solid ${isHeader ? '#64748b' : '#cbd5e1'}; padding: 6px 10px; vertical-align: top; text-align: ${cell.horizontalAlign || 'left'}; font-weight: ${isHeader ? 'bold' : 'normal'}; background-color: ${cell.backgroundColor || (isHeader ? '#f1f5f9' : (r % 2 === 0 ? '#ffffff' : '#f8fafc'))}; word-break: normal; overflow-wrap: break-word; line-height: 1.45;">${cellVal || '&nbsp;'}</${tag}>`;
            });
            tableHtml += '</tr></tbody></table>';
          });
          tableHtml += '</div>';
        } else {
          tableHtml =
            '<table border="1" style="width: 100%; border-collapse: collapse; margin: 16px 0; border: 1.5px solid #64748b; font-family: Arial, Helvetica, sans-serif; font-size: 12px; background-color: #ffffff; table-layout: auto;"><tbody>';
          for (const { rowIdx: r, rowCells } of rowGroups) {
            const widths = computeRowWidths(rowCells);
            tableHtml += '<tr>';
            rowCells.forEach((cell, cIdx) => {
              const isHeader = cell.isHeader || (r === 0 && rows > 1);
              const tag = isHeader ? 'th' : 'td';
              let cellVal = cleanTokenSpacing(escapeHtml(cell.content || '')).replace(/\n/g, '<br />');
              cellVal = replaceCheckboxesInText(cellVal);
              const widthPct = widths[cIdx];
              const wStyle = `width: ${widthPct}%; `;
              let colspan = cell.colspan || 1;
              if (rowCells.length === 1 && maxCols > 1) {
                colspan = maxCols;
              } else if (cell.bbox && el.bbox?.width && maxCols > 1 && colspan === 1) {
                const estimatedCols = Math.round((cell.bbox.width / el.bbox.width) * maxCols);
                if (estimatedCols > 1) colspan = Math.min(maxCols, estimatedCols);
              }
              const rowspan = cell.rowspan || 1;
              tableHtml += `<${tag} style="${wStyle}border: 1px solid ${isHeader ? '#64748b' : '#cbd5e1'}; padding: 6px 10px; vertical-align: top; text-align: ${cell.horizontalAlign || 'left'}; font-weight: ${isHeader ? 'bold' : 'normal'}; background-color: ${cell.backgroundColor || (isHeader ? '#f1f5f9' : (r % 2 === 0 ? '#ffffff' : '#f8fafc'))}; word-break: normal; overflow-wrap: break-word; line-height: 1.45;" ${rowspan > 1 ? `rowspan="${rowspan}"` : ''} ${colspan > 1 ? `colspan="${colspan}"` : ''}>${cellVal || '&nbsp;'}</${tag}>`;
            });
            tableHtml += '</tr>';
          }
          tableHtml += '</tbody></table>';
        }
        blockElements.push({ y: el.bbox?.y ?? 0, html: tableHtml });
        continue;
      }

      if (el.type === 'form_line') {
        const w = el.bbox?.width || 0;
        const h = el.bbox?.height || 0;
        const elY = el.bbox?.y ?? 0;
        if (h >= 18 && w >= 120 && !el.text) {
          // Preserve bordered input / services box cleanly
          blockElements.push({
            y: elY,
            html: `<div style="border: 1.5px solid #64748b; border-radius: 4px; min-height: ${Math.min(110, Math.max(32, Math.round(h)))}px; margin: 8px 0; background-color: #ffffff; padding: 8px;">&nbsp;</div>`
          });
          continue;
        } else if (w > 200 && !el.text) {
          // Only emit <hr> if there is no text line at the same vertical position (avoid cutting across inline fill lines)
          const hasTextOnSameRow = rawElements.some(
            (te) => te.type === 'text' && te.bbox && Math.abs(te.bbox.y - elY) <= 12
          );
          if (!hasTextOnSameRow) {
            blockElements.push({
              y: elY,
              html: '<hr style="border: none; border-top: 1px solid #cbd5e1; margin: 8px 0;" />'
            });
          }
          continue;
        }
      }
      if (el.type === 'divider') {
        blockElements.push({
          y: el.bbox?.y ?? 0,
          html: '<hr style="border: none; border-top: 1px solid #cbd5e1; margin: 8px 0;" />'
        });
        continue;
      }
      if (el.type === 'image' && el.imageData?.assetUrl) {
        blockElements.push({
          y: el.bbox?.y ?? 0,
          html: `<p style="text-align: center; margin: 12px 0;"><img src="${el.imageData.assetUrl}" alt="Document graphic" style="max-height: 120px; object-fit: contain;" /></p>`
        });
        continue;
      }
    }

    // 2. Text and Checkbox Elements: Horizontal Visual Line Clustering
    const textAndCbElements = rawElements.filter(
      (e) => (e.type === 'text' || e.type === 'checkbox' || (e.type === 'form_line' && e.text)) && (e.text || e.type === 'checkbox')
    );

    const visualLines: { y: number; elements: CanonicalElement[] }[] = [];
    const sortedTokens = [...textAndCbElements].sort((a, b) => a.bbox.y - b.bbox.y);

    for (const tok of sortedTokens) {
      let placed = false;
      for (const line of visualLines) {
        if (Math.abs(tok.bbox.y - line.y) <= 6) {
          line.elements.push(tok);
          placed = true;
          break;
        }
      }
      if (!placed) {
        visualLines.push({ y: tok.bbox.y, elements: [tok] });
      }
    }

    visualLines.sort((a, b) => a.y - b.y);

    interface FormattedLine {
      y: number;
      text: string;
      isCheckbox: boolean;
      isChecked: boolean;
      isHeading: boolean;
      isClause: boolean;
      alignment: 'center' | 'left';
      fontSize: string;
      fontWeight: 'bold' | 'normal';
    }

    const formattedLines: FormattedLine[] = [];

    for (const line of visualLines) {
      line.elements.sort((a, b) => a.bbox.x - b.bbox.x);

      const firstTok = line.elements[0];
      const hasCheckbox = firstTok.type === 'checkbox' || /^(?:\[(?:\s*|[✓xXvV\u2713\u2714])\]|☐|☑|[\u25A1\u25A2\u25FD\u25FE\u2610\u2611\u2612]|1\s*[-–—]|[-–—•\*])\s*/.test(firstTok.text || '');
      const isChecked = firstTok.checked || /^(?:\[[✓xXvV\u2713\u2714]\]|☑|[\u2611\u2612])/.test(firstTok.text || '');

      const parts: string[] = [];
      let prevTok: CanonicalElement | null = null;
      for (const tok of line.elements) {
        let t = tok.text || '';
        if (prevTok) {
          const gap = tok.bbox.x - (prevTok.bbox.x + prevTok.bbox.width);
          if (gap >= 32) {
            parts.push(' ____________________ ');
          } else {
            parts.push(' ');
          }
        }
        if (tok === firstTok && hasCheckbox) {
          t = t.replace(/^(?:\[(?:\s*|[✓xXvV\u2713\u2714])\]|☐|☑|[\u25A1\u25A2\u25FD\u25FE\u2610\u2611\u2612]|1\s*[-–—]|[-–—•\*])\s*/, '');
        }
        parts.push(t);
        prevTok = tok;
      }

      const fullText = cleanTokenSpacing(parts.join('').replace(/\s+/g, ' ').trim());
      if (!fullText && !hasCheckbox) continue;

      const firstBox = line.elements[0].bbox;
      const totalWidth = line.elements[line.elements.length - 1].bbox.x + line.elements[line.elements.length - 1].bbox.width - firstBox.x;

      const isMainHeading =
        fullText.length < 65 &&
        /^(?:[A-Z0-9\s.,–—:-]+)$/.test(fullText) &&
        (/AGREEMENT|CONTRACT|ANNEXURE|DEED|SCHEDULE|TURNKEY|ENDORSEMENT/i.test(fullText) ||
          Math.abs(firstBox.x - (pageWidth - (firstBox.x + totalWidth))) < 35);

      const isClauseHeading =
        /^(NOW THIS AGREEMENT|IN WITNESS WHEREOF|SIGNATURES|ARTICLE\s+[0-9IVX]+|SECTION\s+[0-9]+|\d+\.\s+[A-Z]|KNOW ALL MEN)/i.test(fullText);

      const isSubClause = /^\([a-z0-9]+\)\s+/i.test(fullText) || /^[0-9]+(\.[0-9]+)+\s+/i.test(fullText);

      formattedLines.push({
        y: line.y,
        text: fullText,
        isCheckbox: hasCheckbox,
        isChecked,
        isHeading: isMainHeading || isClauseHeading,
        isClause: isSubClause,
        alignment: isMainHeading ? 'center' : 'left',
        fontSize: isMainHeading ? '13.5pt' : (isClauseHeading ? '12pt' : '10.5pt'),
        fontWeight: isMainHeading || isClauseHeading ? 'bold' : 'normal',
      });
    }

    const textHtmlBlocks: { y: number; html: string }[] = [];
    let currentPara: FormattedLine[] = [];

    const flushPara = () => {
      if (currentPara.length === 0) return;
      const first = currentPara[0];
      const joinedText = currentPara.map((l) => l.text).join(' ');
      const escaped = replaceCheckboxesInText(escapeHtml(joinedText));

      let innerContent = escaped;
      if (first.isCheckbox) {
        innerContent = `<span class="contract-checkbox" data-checked="${first.isChecked ? 'true' : 'false'}" contenteditable="false" style="display: inline-flex; align-items: center; justify-content: center; width: 15px; height: 15px; min-width: 15px; min-height: 15px; border: 1.5px solid #2563eb; border-radius: 3px; vertical-align: middle; margin-right: 8px; background-color: ${first.isChecked ? '#2563eb' : '#ffffff'}; font-size: 10px; font-weight: bold; color: ${first.isChecked ? '#ffffff' : 'transparent'}; cursor: pointer; user-select: none;">${first.isChecked ? '&#10003;' : '&nbsp;'}</span>${escaped}`;
      }

      const marginTop = first.isHeading ? '14px' : (first.isClause ? '8px' : '4px');
      const marginBottom = first.isHeading ? '6px' : '4px';

      textHtmlBlocks.push({
        y: first.y,
        html: `<p style="text-align: ${first.alignment}; font-weight: ${first.fontWeight}; font-size: ${first.fontSize}; margin-top: ${marginTop}; margin-bottom: ${marginBottom}; line-height: 1.6; font-family: Arial, Helvetica, sans-serif; color: #1e293b;">${innerContent}</p>`
      });
      currentPara = [];
    };

    for (let i = 0; i < formattedLines.length; i++) {
      const line = formattedLines[i];
      const isDistinctFormRow = /^(?:On the date|Upon completion|Other\s*:|Per\s+Hour|Per\s+Job|Photographer\s*:|Client\s*:|The address where)/i.test(line.text);

      if (line.isHeading || line.isCheckbox || line.isClause || isDistinctFormRow) {
        flushPara();
        currentPara.push(line);
        if (line.isHeading || line.isCheckbox || isDistinctFormRow) {
          flushPara();
        }
        continue;
      }

      if (currentPara.length === 0) {
        currentPara.push(line);
      } else {
        const prev = currentPara[currentPara.length - 1];
        const gapY = line.y - prev.y;
        if (gapY <= 20 && !prev.text.endsWith(':')) {
          currentPara.push(line);
        } else {
          flushPara();
          currentPara.push(line);
        }
      }
    }
    flushPara();

    const allPageBlocks = [...blockElements, ...textHtmlBlocks].sort((a, b) => a.y - b.y);
    pageHtmls.push(allPageBlocks.map((b) => b.html).join('\n'));
  }

  // Separate multiple pages with standard TinyMCE page break
  return pageHtmls.join(
    '\n<div class="mce-pagebreak" data-mce-placeholder="true" style="page-break-after: always; margin: 1.25rem 0; border: none; border-top: 1.5px dashed #94a3b8; text-align: center; font-size: 11px; color: #64748b; height: 18px; line-height: 18px;">--- Page Break ---</div>\n'
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
