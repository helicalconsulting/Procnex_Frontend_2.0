import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import ContractTemplateSelectModal from '../../components/contracts/ContractTemplateSelectModal';
import CustomDocumentBuilderModal from '../../components/contracts/CustomDocumentBuilderModal';
import { MessageStrip } from '../../components/shared/MessageStrip';
import { FileText, ArrowLeft, Sparkles, Plus, ShieldCheck, FileCheck2 } from 'lucide-react';
import './CreateContractPage.css';

export default function CreateContractPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const rfqId = searchParams.get('rfqId');
  const rfqNumber = searchParams.get('rfqNumber') || 'RFQ';
  const vendorName = searchParams.get('vendorName') || 'Vendor';

  const [showBuilder, setShowBuilder] = useState(false);
  const [builderTemplateType, setBuilderTemplateType] = useState('SERVICE_CONTRACT');

  if (rfqId) {
    return (
      <ContractTemplateSelectModal
        rfqId={rfqId}
        rfqNumber={rfqNumber}
        vendorName={vendorName}
        onClose={() => navigate('/contracts')}
        onGenerated={(contractId) => navigate(`/contracts/${contractId}`)}
      />
    );
  }

  return (
    <div className="ctr-create" style={{ padding: '32px 40px', maxWidth: 1100, margin: '0 auto' }}>
      <button className="ctr-create__back" onClick={() => navigate('/contracts')} style={{ marginBottom: 20 }}>
        <ArrowLeft size={16} /> Back to Contracts
      </button>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Create Contract & Custom Document</h1>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: '4px 0 0' }}>
            Build customized vendor agreements, NDAs, service contracts, or legal notices with dynamic interactive placeholders.
          </p>
        </div>
        <button
          className="company-settings__btn company-settings__btn--primary"
          onClick={() => {
            setBuilderTemplateType('CUSTOM');
            setShowBuilder(true);
          }}
          style={{ gap: 8, padding: '10px 18px', fontSize: 14 }}
        >
          <Sparkles size={16} /> Launch Interactive Builder
        </button>
      </div>

      <MessageStrip type="info">
        <strong>Notice:</strong> Contracts linked to RFQs are generated automatically from the RFQ Final Approval workflow. To create a standalone or custom contract/document, choose a quick-start builder card below.
      </MessageStrip>

      {/* Quick Launch Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 20,
          marginTop: 24,
        }}
      >
        <div
          onClick={() => {
            setBuilderTemplateType('SERVICE_CONTRACT');
            setShowBuilder(true);
          }}
          style={{
            padding: 24,
            background: 'var(--surface-elevated, #ffffff)',
            border: '1px solid var(--border, #e2e8f0)',
            borderRadius: 14,
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#0a6ed1')}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
        >
          <div style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(10, 110, 209, 0.12)', color: '#0a6ed1', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
            <FileText size={22} />
          </div>
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 6px' }}>Service Level Contract</h3>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
            Generate standard Service Agreement with SLA metrics, payment schedule, and terms.
          </p>
        </div>

        <div
          onClick={() => {
            setBuilderTemplateType('PURCHASE_CONTRACT');
            setShowBuilder(true);
          }}
          style={{
            padding: 24,
            background: 'var(--surface-elevated, #ffffff)',
            border: '1px solid var(--border, #e2e8f0)',
            borderRadius: 14,
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#10b981')}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
        >
          <div style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(16, 185, 129, 0.12)', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
            <FileCheck2 size={22} />
          </div>
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 6px' }}>Purchase Agreement</h3>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
            Commercial procurement contract with warranty, delivery terms, and penalty clauses.
          </p>
        </div>

        <div
          onClick={() => {
            setBuilderTemplateType('CUSTOM');
            setShowBuilder(true);
          }}
          style={{
            padding: 24,
            background: 'var(--surface-elevated, #ffffff)',
            border: '1px solid var(--border, #e2e8f0)',
            borderRadius: 14,
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#8b5cf6')}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
        >
          <div style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(139, 92, 246, 0.12)', color: '#8b5cf6', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
            <ShieldCheck size={22} />
          </div>
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 6px' }}>NDA / Custom Document</h3>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
            Create a custom non-disclosure agreement or legal document from scratch.
          </p>
        </div>
      </div>

      <CustomDocumentBuilderModal
        isOpen={showBuilder}
        onClose={() => setShowBuilder(false)}
        initialTemplateType={builderTemplateType}
        onSuccess={(contractId) => navigate(`/contracts/${contractId}`)}
      />
    </div>
  );
}
