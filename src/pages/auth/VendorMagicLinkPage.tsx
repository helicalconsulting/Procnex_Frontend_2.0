import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { API_BASE } from '../../api/client';
import { authService } from '../../services/authService';
import { useBranding } from '../../context/BrandingContext';
import { PORTAL_NAMES } from '../../config/portalNames';
import heliflowLogo from '../../assets/heliflow.png';
import './LoginPage.css';

export default function VendorMagicLinkPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { companyName, logoUrl } = useBranding();
  const [error, setError] = useState('');

  useEffect(() => {
    const token = searchParams.get('token')?.trim();
    const rfqId = searchParams.get('rfq');

    if (!token) {
      setError('Invalid link. Open the RFQ email again or sign in manually.');
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`${API_BASE}/vendors/auth/magic`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json.error || json.message || 'Link expired');
        }
        const data = json.data ?? json;
        authService.saveSession(
          {
            token: data.token,
            user: {
              id: data.vendor.id,
              username: data.vendor.email,
              email: data.vendor.email,
              fullName: data.vendor.name,
              companyCode: 'VENDOR',
              isActive: true,
              createdAt: new Date().toISOString(),
            },
            roles: ['Vendor'],
          },
          { vendorPortal: true }
        );
        if (cancelled) return;
        const targetRfq = rfqId || data.rfqId;
        navigate(targetRfq ? `/vendor/rfqs?rfq=${targetRfq}` : '/vendor/rfqs', { replace: true });
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not sign in from email link');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [searchParams, navigate]);

  return (
    <div className="sap-login">
      <div className="sap-login__form-panel" style={{ flex: 1 }}>
        <div className="sap-login__form-container">
          <div className="sap-login__mobile-logo">
            <img src={logoUrl || heliflowLogo} alt={companyName} className="sap-login__mobile-logo-icon" />
            <span className="sap-login__mobile-title">{companyName}</span>
          </div>
          <h2 className="sap-login__form-title">Opening your RFQ…</h2>
          <p className="sap-login__form-subtitle">Signing you in securely from your invitation email.</p>
          {error ? (
            <div className="sap-login__error" role="alert">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          ) : (
            <div className="sap-login__form-subtitle">
              <span className="sap-login__spinner" style={{ display: 'inline-block', marginRight: 8 }} />
              Please wait…
            </div>
          )}
          {error && (
            <p style={{ marginTop: 16, textAlign: 'center' }}>
              <a href="/login" style={{ color: 'var(--primary-500)' }}>Go to login</a>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
