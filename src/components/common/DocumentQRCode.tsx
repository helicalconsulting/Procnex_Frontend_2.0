import React, { useMemo } from 'react';
import QRCode from 'qrcode';
import { ShieldCheck, ExternalLink } from 'lucide-react';
import './DocumentQRCode.css';

export interface DocumentQRCodeProps {
  docType: 'PO' | 'INVOICE' | 'PAYMENT_VOUCHER';
  docNumber: string;
  amount?: number | string;
  currency?: string;
  vendorName?: string;
  token?: string;
  size?: number;
  showCaption?: boolean;
  showFallbackCode?: boolean;
  className?: string;
}

export const DocumentQRCode: React.FC<DocumentQRCodeProps> = ({
  docType,
  docNumber,
  amount = 0,
  currency = 'INR',
  vendorName = '',
  companyCode = '',
  companyName = '',
  companyLogoUrl = '',
  token,
  size = 105,
  showCaption = true,
  showFallbackCode = true,
  className = '',
}) => {
  // Generate human-readable fallback verification code
  const fallbackCode = useMemo(() => {
    const raw = `${docType}|${docNumber}|${amount}|${currency}`;
    let hash = 0;
    for (let i = 0; i < raw.length; i++) {
      hash = (hash << 5) - hash + raw.charCodeAt(i);
      hash |= 0;
    }
    const hex = Math.abs(hash).toString(16).toUpperCase().padStart(8, '0');
    return `VER-${hex.substring(0, 4)}-${hex.substring(4, 8)}`;
  }, [docType, docNumber, amount, currency]);

  // Construct target verification URL
  const verifyUrl = useMemo(() => {
    const origin =
      (typeof localStorage !== 'undefined' ? localStorage.getItem('heliflow_verify_host') : null) ||
      import.meta.env.VITE_PUBLIC_APP_URL ||
      import.meta.env.VITE_APP_URL ||
      (typeof window !== 'undefined' ? window.location.origin : 'https://app.procnex.com');

    const cleanOrigin = origin.replace(/\/+$/, '');
    const cleanDocNum = encodeURIComponent((docNumber || '').trim());
    const cleanAmt = encodeURIComponent(String(amount || 0));
    const cleanCur = encodeURIComponent(String(currency || 'INR'));
    const cleanCC = encodeURIComponent((companyCode || '').trim());
    const cleanCN = encodeURIComponent((companyName || '').trim());
    // Include logo parameter if it is an HTTP/S URL or relative path (avoid bulky data URLs)
    const validLogo = companyLogoUrl && !companyLogoUrl.startsWith('data:') ? companyLogoUrl.trim() : '';
    const cleanLogo = validLogo ? encodeURIComponent(validLogo) : '';

    if (token) {
      return `${cleanOrigin}/verify?t=${encodeURIComponent(token)}`;
    }
    let url = `${cleanOrigin}/verify?type=${docType}&doc=${cleanDocNum}&amt=${cleanAmt}&cur=${cleanCur}&fb=${fallbackCode}`;
    if (cleanCC) url += `&cc=${cleanCC}`;
    if (cleanCN) url += `&cn=${cleanCN}`;
    if (cleanLogo) url += `&logo=${cleanLogo}`;
    return url;
  }, [docType, docNumber, amount, currency, companyCode, companyName, companyLogoUrl, token, fallbackCode]);

  // Synchronous, zero-delay SVG generation using industry-standard QRCode engine
  const qrSvgData = useMemo(() => {
    if (!verifyUrl) return null;
    try {
      const qr = QRCode.create(verifyUrl, { errorCorrectionLevel: 'M' });
      const numModules = qr.modules.size;
      const margin = 3; // 3-module quiet zone ensures phone cameras lock on instantly
      const total = numModules + margin * 2;
      let path = '';
      for (let r = 0; r < numModules; r++) {
        for (let c = 0; c < numModules; c++) {
          if (qr.modules.get(r, c)) {
            path += `M${c + margin},${r + margin}h1v1h-1z `;
          }
        }
      }
      return { total, path };
    } catch (e) {
      console.warn('QR code creation error:', e);
      return null;
    }
  }, [verifyUrl]);

  if (!docNumber) return null;

  return (
    <div className={`doc-qr-container ${className}`}>
      <a
        href={verifyUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="doc-qr-link"
        title="Click to test verification URL or scan with smartphone"
      >
        <div className="doc-qr-box" style={{ width: size, height: size }}>
          {qrSvgData ? (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox={`0 0 ${qrSvgData.total} ${qrSvgData.total}`}
              width={size}
              height={size}
              className="doc-qr-svg"
              shapeRendering="crispEdges"
            >
              <rect width={qrSvgData.total} height={qrSvgData.total} fill="#ffffff" />
              <path d={qrSvgData.path} fill="#000000" />
            </svg>
          ) : (
            <div className="doc-qr-fallback-box" style={{ width: size, height: size }}>
              <ShieldCheck className="w-8 h-8 text-slate-400" />
            </div>
          )}
        </div>
      </a>

      {showCaption && (
        <div className="doc-qr-caption">
          <div className="doc-qr-caption-header">
            <ShieldCheck className="doc-qr-shield-icon" />
            <span className="doc-qr-verify-text">Tamper-Proof Verify</span>
          </div>
          <div className="doc-qr-subtext">Scan to verify in ERP</div>
          {showFallbackCode && (
            <div className="doc-qr-code-pill" title="Verification Fingerprint">
              {fallbackCode}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DocumentQRCode;
