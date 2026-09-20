import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, FileText } from 'lucide-react';
import RFQDetailModal from '../../components/rfq/RFQDetailModal';
import { MessageStrip } from '../../components/shared/MessageStrip';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { EmptyState, PageFrame, PageLead } from '../../components/ui/product';
import { rfqService } from '../../services/rfqService';
import type { RFQTableRow } from '../../types/viewModels';

export default function RFQViewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [rfq, setRfq] = useState<RFQTableRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendSuccess, setSendSuccess] = useState<string | null>(null);

  const loadRFQ = useCallback(async () => {
    if (!id) {
      setError('RFQ id is missing.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const full = await rfqService.getById(id);
      if (!full) {
        setRfq(null);
        setError('RFQ not found.');
        return;
      }
      setRfq(full);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load RFQ details');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadRFQ();
  }, [loadRFQ]);

  const handleSendRFQ = useCallback(async () => {
    if (!rfq || (rfq.status !== 'DRAFT' && rfq.status !== 'APPROVED')) return;

    setSending(true);
    setSendError(null);
    setSendSuccess(null);
    try {
      let current = rfq;
      if (!current.vendors.length) {
        const full = await rfqService.getById(current.id);
        if (full) {
          current = full;
          setRfq(full);
        }
      }

      const vendorTotal = current.vendors.length || current.vendorCount || 0;
      if (vendorTotal === 0) {
        setSendError('Add at least one vendor before sending (Create RFQ -> select vendors).');
        return;
      }

      const result = await rfqService.send(current.id);
      setRfq({ ...current, status: 'SENT' });
      if (result.emailFailures?.length) {
        setSendError(`RFQ sent, but some emails failed: ${result.emailFailures.join('; ')}`);
      } else {
        setSendSuccess(`RFQ sent to ${vendorTotal} vendor(s). Invitation emails dispatched.`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to send RFQ';
      if (msg.includes('PENDING_APPROVAL') || msg.includes('APPROVAL_REQUIRED')) {
        setSendError(`RFQ #${rfq.rfqNumber} is currently pending internal approval. Please approve it from the Approvals page before sending to vendors.`);
      } else {
        setSendError(msg);
      }
    } finally {
      setSending(false);
    }
  }, [rfq]);

  return (
    <PageFrame>
      {error && (
        <div className="mb-4">
          <MessageStrip type="error" onClose={() => setError(null)}>
            {error}
          </MessageStrip>
        </div>
      )}

      {loading ? (
        <Card className="flex min-h-[420px] items-center justify-center p-8">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <div className="size-5 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
            Loading RFQ details...
          </div>
        </Card>
      ) : rfq ? (
        <RFQDetailModal
          rfq={rfq}
          variant="page"
          loading={loading}
          sending={sending}
          sendError={sendError}
          sendSuccess={sendSuccess}
          onClose={() => navigate('/rfq')}
          onSend={handleSendRFQ}
          onDismissSendError={() => setSendError(null)}
          onDismissSendSuccess={() => setSendSuccess(null)}
        />
      ) : (
        <EmptyState
          icon={FileText}
          title="RFQ not found"
          description="The RFQ may have been deleted or you may not have access to it."
          action={<Button onClick={() => navigate('/rfq')}>Back to RFQs</Button>}
        />
      )}
    </PageFrame>
  );
}

