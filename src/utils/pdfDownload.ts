/**
 * PDF Download Utility
 * Converts contract HTML content to a professional PDF document
 * using jsPDF + html-to-image inside an isolated, hidden iframe
 * to guarantee zero CSS pollution on the main web application.
 */
import { toCanvas } from 'html-to-image';
import { jsPDF } from 'jspdf';
import defaultHeliflowLogo from '../assets/heliflow.png';

import { cleanDuplicateSignatures } from './cleanSignatures';

const PDF_MARGIN = 15; // mm
const PAGE_WIDTH = 210; // A4 width in mm
const PAGE_HEIGHT = 297; // A4 height in mm
const CONTENT_WIDTH = PAGE_WIDTH - PDF_MARGIN * 2;

/**
 * Convert HTML content to a properly formatted PDF and trigger download.
 * Uses an isolated hidden iframe so contract template CSS styles never leak into the main UI.
 * @param contentHtml - The contract HTML content snapshot
 * @param fileName - Output filename (without extension)
 * @param docTitle - Optional title to display at the top of the PDF
 */
export async function downloadContractAsPdf(
  rawContentHtml: string | null | undefined,
  fileName: string,
  docTitle?: string,
): Promise<void> {
  const contentHtml = rawContentHtml ? cleanDuplicateSignatures(rawContentHtml) : rawContentHtml;
  if (!contentHtml) {
    // Fallback: create a simple PDF with a message
    const pdf = new jsPDF('p', 'mm', 'a4');
    pdf.setFontSize(16);
    pdf.text('No document content available', PDF_MARGIN, 50);
    pdf.save(`${fileName}.pdf`);
    return;
  }

  // Create an isolated hidden iframe
  const iframe = document.createElement('iframe');
  iframe.style.cssText = `
    position: fixed;
    left: -9999px;
    top: 0;
    width: 794px;
    height: 1123px;
    border: none;
    opacity: 0;
    pointer-events: none;
    z-index: -9999;
  `;
  document.body.appendChild(iframe);

  try {
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) throw new Error('Could not access iframe document');

    // Build the isolated HTML document inside iframe
    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <style>
            body {
              margin: 0;
              padding: 40px 48px;
              background: #ffffff !important;
              color: #1a1a2e !important;
              font-family: '72', '72full', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
              font-size: 14px;
              line-height: 1.6;
              width: 794px;
              box-sizing: border-box;
            }
            h1, h2, h3, h4 { color: #0a2342; margin-top: 20px; margin-bottom: 8px; font-weight: 700; }
            h1 { font-size: 21px; border-bottom: 2px solid #0a6ed1; padding-bottom: 6px; }
            h2 { font-size: 17px; }
            h3 { font-size: 15px; }
            p { margin: 0 0 8px 0; }
            table { width: 100%; border-collapse: collapse; margin: 12px 0; }
            th, td { border: 1px solid #d0d5dd; padding: 8px 12px; text-align: left; font-size: 13px; }
            th { background: #f0f4ff; font-weight: 700; color: #0a2342; }
            tr:nth-child(even) td { background: #fafbfc; }
            strong, b { color: #0a2342; }
            hr { border: none; border-top: 1px solid #e2e8f0; margin: 16px 0; }
            ul, ol { padding-left: 20px; margin: 8px 0; }
            li { margin-bottom: 4px; }
            img { max-width: 100%; height: auto; }
          </style>
        </head>
        <body>
          ${docTitle ? `<div style="text-align:center;margin-bottom:24px;padding-bottom:12px;border-bottom:2px solid #0a6ed1;"><h1 style="margin:0;font-size:19px;border:none;">${docTitle}</h1></div>` : ''}
          ${contentHtml}
        </body>
      </html>
    `);
    doc.close();

    // Wait for fonts and images inside iframe to settle
    await new Promise(resolve => setTimeout(resolve, 300));

    const iframeBody = doc.body;

    // Capture the iframe body to high-resolution canvas
    const canvas = await toCanvas(iframeBody, {
      quality: 1,
      pixelRatio: 2,
      backgroundColor: '#ffffff',
    });

    const pdf = new jsPDF('p', 'mm', 'a4');
    const imgData = canvas.toDataURL('image/png');
    const margin = 10; // mm
    const contentWidth = PAGE_WIDTH - margin * 2;
    const imgWidth = contentWidth;
    let calculatedImgHeight = (canvas.height * imgWidth) / canvas.width;
    const usablePageHeight = PAGE_HEIGHT - margin * 2;

    // If document height is slightly over single page usable height (up to 20%), scale height down to fit on 1 single page
    if (calculatedImgHeight > usablePageHeight && calculatedImgHeight <= usablePageHeight * 1.20) {
      calculatedImgHeight = usablePageHeight;
    }

    let remainingHeight = calculatedImgHeight;
    let currentPage = 0;

    // 8mm threshold prevents accidental blank 2nd page caused by tiny margin/footer pixel overflow
    while (remainingHeight > 8) {
      if (currentPage > 0) {
        pdf.addPage();
      }

      const yOffset = margin - currentPage * usablePageHeight;

      pdf.addImage(
        imgData,
        'PNG',
        margin,
        yOffset,
        imgWidth,
        calculatedImgHeight,
        undefined,
        'FAST',
      );

      remainingHeight -= usablePageHeight;
      currentPage++;
    }

    pdf.save(`${fileName}.pdf`);
  } catch (err) {
    console.error('PDF download error:', err);
    throw err;
  } finally {
    if (document.body.contains(iframe)) {
      document.body.removeChild(iframe);
    }
  }
}

/**
 * Convert Purchase Order data into a clean, professional PDF document matching the User-side PurchaseOrderDocument template.
 */
export async function downloadPurchaseOrderAsPdf(
  order: any,
  formatAmount: (amount: number, currency?: string) => string,
  displayCurrency: string,
): Promise<void> {
  const formatDate = (d: string) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const val = (v: any, fallback = '—') => (v !== undefined && v !== null && v !== '' ? String(v) : fallback);

  const companyName = order.companyName || order.buyerCompany || 'Procnex Consulting';
  const companyLogoUrl = order.logoUrl || order.companyLogoUrl || defaultHeliflowLogo;
  const companyAddress = val(order.companyAddress, 'Industrial Zone, Building 4');
  const companyPhone = val(order.companyPhone, '+91 800-PROCNEX');
  const companyEmail = val(order.companyEmail, 'procurement@procnex.com');
  const companyWebsite = val(order.companyWebsite, 'www.procnex.com');

  const vendorName = val(order.vendorName || order.buyerCompany, 'Supplier');
  const vendorContact = val(order.vendorContactPerson, '—');
  const vendorAddress = val(order.vendorAddress, '—');
  const vendorPhone = val(order.vendorPhone, '—');
  const vendorEmail = val(order.vendorEmail, '—');
  const vendorGstVat = val(order.vendorGstVat, '—');

  const shipToCompany = val(order.shipToCompany || companyName, companyName);
  const shipToWarehouse = val(order.shipToWarehouse, 'Central Warehouse');
  const shipToAddress = val(order.shipToAddress || order.shippingAddress, '—');
  const shipToContact = val(order.shipToContact, '—');
  const shipToPhone = val(order.shipToPhone, '—');

  const requisitioner = val(order.requisitioner || order.buyerName, 'Procurement Officer');
  const shipVia = val(order.shipVia, 'Surface');
  const fob = val(order.fob, 'Destination');
  const paymentTerms = val(order.paymentTerms, 'Net 30');
  const deliveryDate = formatDate(order.expectedDelivery || order.deliveryDate);
  const shippingTerms = val(order.shippingTerms, 'FOB Destination');

  const items = order.items || [];
  const itemsHtml = items
    .map((item: any, idx: number) => {
      const nameStr = item.name || item.itemName || '';
      const descStr = item.description || '';
      const fullDesc = nameStr && descStr && nameStr !== descStr
        ? `<div style="font-weight: 700; color: #0a2342;">${nameStr}</div><div style="font-size: 11px; color: #64748b; margin-top: 2px;">${descStr}</div>`
        : `<div style="font-weight: 600; color: #0a2342;">${nameStr || descStr || 'Item'}</div>`;
      
      const codeBadge = item.itemCode
        ? `<span style="display: inline-block; padding: 2px 6px; background: #e2e8f0; border-radius: 4px; font-size: 10px; font-weight: 700; color: #475569; margin-bottom: 4px;">${item.itemCode}</span><br/>`
        : '';

      const qty = item.quantity || 1;
      const unit = val(item.unit, 'pcs');
      const uPrice = item.unitPrice || 0;
      const taxP = item.taxPercent !== undefined ? `${item.taxPercent}%` : '18%';
      const discP = item.discount && item.discount > 0 ? `${item.discount}%` : '—';
      const tot = item.total || qty * uPrice;

      return `
        <tr style="border-bottom: 1px solid #e5e7eb; background: ${idx % 2 === 0 ? '#ffffff' : '#f9fafb'};">
          <td style="padding: 11px 14px; text-align: center; color: #6b7280; font-weight: 600; vertical-align: top;">${idx + 1}</td>
          <td style="padding: 11px 14px; text-align: left; vertical-align: top;">
            ${codeBadge}${fullDesc}
          </td>
          <td style="padding: 11px 14px; text-align: center; color: #111827; font-weight: 600; vertical-align: top;">${qty}</td>
          <td style="padding: 11px 14px; text-align: center; color: #6b7280; vertical-align: top;">${unit}</td>
          <td style="padding: 11px 14px; text-align: right; color: #111827; font-weight: 600; vertical-align: top;">${formatAmount(uPrice, displayCurrency)}</td>
          <td style="padding: 11px 14px; text-align: center; color: #6b7280; vertical-align: top;">${taxP}</td>
          <td style="padding: 11px 14px; text-align: center; color: #6b7280; vertical-align: top;">${discP}</td>
          <td style="padding: 11px 14px; text-align: right; color: #0a2342; font-weight: 700; vertical-align: top;">${formatAmount(tot, displayCurrency)}</td>
        </tr>
      `;
    })
    .join('');

  const subtotal = order.subtotal || order.totalAmount || 0;
  const discountTotal = order.discountTotal || 0;
  const taxTotal = order.taxTotal || 0;
  const shippingCharges = order.shippingCharges || 0;
  const otherCharges = order.otherCharges || 0;
  const grandTotal = order.grandTotal || order.totalAmount || 0;

  const poHtml = `
    <div style="background: #ffffff; color: #1a1a2e; font-family: 'Inter', system-ui, -apple-system, sans-serif; font-size: 13px; line-height: 1.6; padding: 20px; max-width: 794px; margin: 0 auto;">
      <!-- Header -->
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px;">
        <div style="display: flex; gap: 16px; align-items: flex-start;">
          <img src="${companyLogoUrl}" alt="${companyName}" style="width: 56px; height: 56px; object-fit: contain; border-radius: 6px; flex-shrink: 0;" />
          <div>
            <h1 style="font-size: 19px; font-weight: 700; color: #0a2342; margin: 0 0 4px 0; border: none; padding: 0;">${companyName}</h1>
            <p style="font-size: 12px; color: #475569; margin: 1px 0;">${companyAddress}</p>
            <p style="font-size: 12px; color: #475569; margin: 1px 0;">Phone: ${companyPhone} &nbsp;|&nbsp; Email: ${companyEmail}</p>
            <p style="font-size: 12px; color: #475569; margin: 1px 0;">${companyWebsite}</p>
          </div>
        </div>
        <div style="text-align: right; flex-shrink: 0;">
          <div style="margin-bottom: 10px;">
            <span style="display: block; font-size: 21px; font-weight: 800; color: #0a2342; letter-spacing: 2px; margin-bottom: 2px;">PURCHASE ORDER</span>
            <span style="display: block; font-size: 14px; font-weight: 600; color: #059669; letter-spacing: 0.5px;">${order.poNumber}</span>
          </div>
          <table style="border-collapse: collapse; margin-left: auto;">
            <tbody>
              <tr><td style="padding: 2px 0 2px 16px; font-size: 12px; font-weight: 600; color: #64748b; text-align: right;">PO Date</td><td style="padding: 2px 0 2px 8px; font-size: 12px; font-weight: 600; color: #1a1a2e; text-align: left;">${formatDate(order.orderDate)}</td></tr>
              <tr><td style="padding: 2px 0 2px 16px; font-size: 12px; font-weight: 600; color: #64748b; text-align: right;">PO Number</td><td style="padding: 2px 0 2px 8px; font-size: 12px; font-weight: 600; color: #1a1a2e; text-align: left;">${order.poNumber}</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Divider -->
      <div style="height: 2px; background: linear-gradient(90deg, #059669 0%, #d1d5db 100%); margin: 16px 0;"></div>

      <!-- Vendor & Ship To -->
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 18px;">
        <div style="padding: 14px 16px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px;">
          <h3 style="font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #059669; margin: 0 0 8px 0; padding-bottom: 6px; border-bottom: 1px solid #e2e8f0;">VENDOR</h3>
          <p style="font-size: 15px; font-weight: 700; color: #0a2342; margin: 0 0 4px 0;">${vendorName} ${order.supplierCode ? `<span style="font-size:12px; color:#64748b; font-weight:normal;">(${order.supplierCode})</span>` : ''}</p>
          ${order.supplierType ? `<p style="font-size: 12px; color: #475569; margin: 1px 0;">Type: ${order.supplierType}</p>` : ''}
          <p style="font-size: 12px; color: #475569; margin: 1px 0;">Contact: ${vendorContact}</p>
          <p style="font-size: 12px; color: #475569; margin: 1px 0;">Address: ${vendorAddress}</p>
          <p style="font-size: 12px; color: #475569; margin: 1px 0;">Phone: ${vendorPhone}</p>
          <p style="font-size: 12px; color: #475569; margin: 1px 0;">Email: ${vendorEmail}</p>
          <p style="font-size: 12px; color: #475569; margin: 1px 0;">GST/VAT: ${vendorGstVat}</p>
        </div>
        <div style="padding: 14px 16px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px;">
          <h3 style="font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #059669; margin: 0 0 8px 0; padding-bottom: 6px; border-bottom: 1px solid #e2e8f0;">SHIP TO</h3>
          <p style="font-size: 15px; font-weight: 700; color: #0a2342; margin: 0 0 4px 0;">${shipToCompany}</p>
          <p style="font-size: 12px; color: #475569; margin: 1px 0;">Warehouse: ${shipToWarehouse}</p>
          <p style="font-size: 12px; color: #475569; margin: 1px 0;">Address: ${shipToAddress}</p>
          <p style="font-size: 12px; color: #475569; margin: 1px 0;">Contact: ${shipToContact}</p>
          <p style="font-size: 12px; color: #475569; margin: 1px 0;">Phone: ${shipToPhone}</p>
        </div>
      </div>

      <!-- PO Info Grid -->
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 18px; padding: 12px 14px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px;">
        <div>
          <span style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: #64748b; display: block;">Requisitioner</span>
          <span style="font-size: 13px; font-weight: 600; color: #1a1a2e;">${requisitioner}</span>
        </div>
        <div>
          <span style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: #64748b; display: block;">Ship Via</span>
          <span style="font-size: 13px; font-weight: 600; color: #1a1a2e;">${shipVia}</span>
        </div>
        <div>
          <span style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: #64748b; display: block;">FOB</span>
          <span style="font-size: 13px; font-weight: 600; color: #1a1a2e;">${fob}</span>
        </div>
        <div>
          <span style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: #64748b; display: block;">Payment Terms</span>
          <span style="font-size: 13px; font-weight: 600; color: #1a1a2e;">${paymentTerms}</span>
        </div>
        <div>
          <span style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: #64748b; display: block;">Delivery Date</span>
          <span style="font-size: 13px; font-weight: 600; color: #1a1a2e;">${deliveryDate}</span>
        </div>
        <div>
          <span style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: #64748b; display: block;">Shipping Terms</span>
          <span style="font-size: 13px; font-weight: 600; color: #1a1a2e;">${shippingTerms}</span>
        </div>
      </div>

      <!-- Items Table -->
      <div style="margin-bottom: 20px; border: 1px solid #d1d5db;">
        <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
          <thead>
            <tr style="background: #0a2342; color: #ffffff;">
              <th style="padding: 11px 14px; text-align: center; font-size: 10px; font-weight: 700; text-transform: uppercase; width: 5%;">#</th>
              <th style="padding: 11px 14px; text-align: left; font-size: 10px; font-weight: 700; text-transform: uppercase; width: 35%;">Description</th>
              <th style="padding: 11px 14px; text-align: center; font-size: 10px; font-weight: 700; text-transform: uppercase; width: 10%;">Quantity</th>
              <th style="padding: 11px 14px; text-align: center; font-size: 10px; font-weight: 700; text-transform: uppercase; width: 10%;">Unit</th>
              <th style="padding: 11px 14px; text-align: right; font-size: 10px; font-weight: 700; text-transform: uppercase; width: 15%;">Unit Price</th>
              <th style="padding: 11px 14px; text-align: center; font-size: 10px; font-weight: 700; text-transform: uppercase; width: 8%;">Tax %</th>
              <th style="padding: 11px 14px; text-align: center; font-size: 10px; font-weight: 700; text-transform: uppercase; width: 7%;">Disc %</th>
              <th style="padding: 11px 14px; text-align: right; font-size: 10px; font-weight: 700; text-transform: uppercase; width: 10%;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>
      </div>

      <!-- Totals -->
      <div style="display: flex; justify-content: flex-end; margin-bottom: 18px;">
        <div style="width: 340px; border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden;">
          <div style="display: flex; justify-content: space-between; padding: 8px 16px; font-size: 12px;">
            <span style="font-weight: 600; color: #475569;">Subtotal</span>
            <span style="font-weight: 700; color: #1a1a2e;">${formatAmount(subtotal, displayCurrency)}</span>
          </div>
          <div style="display: flex; justify-content: space-between; padding: 8px 16px; font-size: 12px; background: #f8fafc;">
            <span style="font-weight: 600; color: #475569;">Discount</span>
            <span style="font-weight: 700; color: ${discountTotal > 0 ? '#dc2626' : '#1a1a2e'};">${discountTotal > 0 ? `-${formatAmount(discountTotal, displayCurrency)}` : formatAmount(0, displayCurrency)}</span>
          </div>
          <div style="display: flex; justify-content: space-between; padding: 8px 16px; font-size: 12px;">
            <span style="font-weight: 600; color: #475569;">Tax</span>
            <span style="font-weight: 700; color: #1a1a2e;">${formatAmount(taxTotal, displayCurrency)}</span>
          </div>
          <div style="display: flex; justify-content: space-between; padding: 8px 16px; font-size: 12px; background: #f8fafc;">
            <span style="font-weight: 600; color: #475569;">Shipping Charges</span>
            <span style="font-weight: 700; color: #1a1a2e;">${formatAmount(shippingCharges, displayCurrency)}</span>
          </div>
          <div style="display: flex; justify-content: space-between; padding: 8px 16px; font-size: 12px;">
            <span style="font-weight: 600; color: #475569;">Other Charges</span>
            <span style="font-weight: 700; color: #1a1a2e;">${formatAmount(otherCharges, displayCurrency)}</span>
          </div>
          <div style="height: 1px; background: #e2e8f0; margin: 0 16px;"></div>
          <div style="display: flex; justify-content: space-between; padding: 12px 16px; background: #0a2342; color: #ffffff;">
            <span style="font-size: 14px; font-weight: 700;">Grand Total</span>
            <span style="font-size: 17px; font-weight: 800;">${formatAmount(grandTotal, displayCurrency)}</span>
          </div>
        </div>
      </div>

      <!-- Notes -->
      <div style="height: 1px; background: #e2e8f0; margin: 16px 0;"></div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 18px;">
        <div style="padding: 12px 14px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px;">
          <h4 style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #059669; margin: 0 0 6px 0;">Internal Notes</h4>
          <p style="font-size: 12px; color: #475569; margin: 0;">${val(order.internalNotes, 'No internal notes')}</p>
        </div>
        <div style="padding: 12px 14px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px;">
          <h4 style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #059669; margin: 0 0 6px 0;">Special Instructions</h4>
          <p style="font-size: 12px; color: #475569; margin: 0;">${val(order.specialInstructions, 'No special instructions')}</p>
        </div>
      </div>

      <!-- Footer -->
      <div style="margin-top: 24px; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 10px;">
        <p style="font-size: 11px; color: #64748b; margin: 0;">${companyName} &nbsp;|&nbsp; Phone: ${companyPhone} &nbsp;|&nbsp; Email: ${companyEmail}</p>
      </div>
    </div>
  `;

  await downloadContractAsPdf(poHtml, `${order.poNumber}_Purchase_Order`);
}
