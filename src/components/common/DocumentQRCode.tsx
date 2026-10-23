import React, { useMemo } from 'react';
import { generateQRCode } from '../../utils/qrCodeGenerator';
import { ShieldCheck } from 'lucide-react';
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
  token,
  size = 86,
  showCaption = true,
  showFallbackCode = true,
  className = '',
}) => {
  // Generate a fallback verification code for human eye comparison if camera fails
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
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://app.procnex.com';
    const cleanDocNum = encodeURIComponent((docNumber || '').trim());
    const cleanAmt = encodeURIComponent(String(amount || 0));
    const cleanCur = encodeURIComponent(String(currency || 'INR'));

    if (token) {
      return `${origin}/verify?t=${encodeURIComponent(token)}`;
    }
    return `${origin}/verify?type=${docType}&doc=${cleanDocNum}&amt=${cleanAmt}&cur=${cleanCur}&fb=${fallbackCode}`;
  }, [docType, docNumber, amount, currency, token, fallbackCode]);

  // Generate QR Code SVG matrix
  const qrSvg = useMemo(() => {
    try {
      const qr = generateQRCode(verifyUrl);
      return qr.toSvg({ size, foreground: '#0f172a', background: '#ffffff', margin: 1 });
    } catch (e) {
      console.warn('QR code generation error:', e);
      return null;
    }
  }, [verifyUrl, size]);

  if (!docNumber) return null;

  return (
    <div className={`doc-qr-container ${className}`}>
      <div className="doc-qr-box">
        {qrSvg ? (
          <div
            className="doc-qr-svg-wrapper"
            style={{ width: size, height: size }}
            dangerouslySetInnerHTML={{ __html: qrSvg }}
          />
        ) : (
          <div className="doc-qr-fallback-box" style={{ width: size, height: size }}>
            <ShieldCheck className="w-8 h-8 text-slate-400" />
          </div>
        )}
      </div>

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
