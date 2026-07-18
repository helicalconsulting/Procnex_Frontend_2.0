import { useNavigate, useSearchParams } from 'react-router-dom';
import ContractTemplateSelectModal from '../../components/contracts/ContractTemplateSelectModal';
import { MessageStrip } from '../../components/shared/MessageStrip';
import { FileText, ArrowLeft } from 'lucide-react';
import './CreateContractPage.css';

export default function CreateContractPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const rfqId = searchParams.get('rfqId');
  const rfqNumber = searchParams.get('rfqNumber') || 'RFQ';
  const vendorName = searchParams.get('vendorName') || 'Vendor';

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
    <div className="ctr-create" style={{ padding: 32 }}>
      <button className="ctr-create__back" onClick={() => navigate('/contracts')}>
        <ArrowLeft size={16} /> Back to Contracts
      </button>
      <MessageStrip type={'info' as const}>
        Vendor contracts are generated from RFQ final approval. After a quotation is fully approved, choose <strong>Contract</strong> and select an active template.
      </MessageStrip>
      <div style={{ marginTop: 24, textAlign: 'center', color: 'var(--text-secondary)' }}>
        <FileText size={48} style={{ opacity: 0.4 }} />
        <p style={{ marginTop: 12 }}>Manage contract templates in <strong>Company Settings → Contracts</strong>.</p>
      </div>
    </div>
  );
}
