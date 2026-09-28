import { FileText } from 'lucide-react';

export interface PaymentMilestone { title: string; percentage: number }

/** Render the submitted schedule, never a subsequently edited payment-plan template. */
export default function QuotationPaymentTerms({ terms, milestones, totalPrice, currency, formatAmount }: {
  terms?: string | null;
  milestones?: PaymentMilestone[] | null;
  totalPrice: number;
  currency: string;
  formatAmount: (amount: number, currency: string) => string;
}) {
  const schedule = milestones || [];
  const hasTerms = !!terms?.trim() && terms.trim() !== '—';
  const validPercent = (n: number) => Number.isFinite(n) && n > 0 && n <= 100;
  const validSchedule = schedule.length > 0 && schedule.every(m => validPercent(m.percentage));
  const total = schedule.reduce((sum, m) => sum + (Number.isFinite(m.percentage) ? m.percentage : 0), 0);
  const complete = validSchedule && Math.abs(total - 100) < 0.005;
  return <section className="quotation-payment" aria-label="Payment terms and schedule">
    <div className="quotation-payment__summary">
      <div className="quotation-payment__identity">
        <div className="quotation-detail-icon"><FileText size={20} /></div>
        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Quoted payment terms</div>
          <div className="text-sm font-semibold text-foreground mt-1">{hasTerms ? terms : 'Not provided'}</div>
          <p className="text-xs text-muted-foreground mt-2">{schedule.length ? `${schedule.length} payment milestones · Submitted with this quotation` : 'Recorded with this quotation'}</p>
        </div>
      </div>
      <div className="quotation-payment__value">
        <div className="text-xs font-medium text-muted-foreground">Quotation value</div>
        <div className="text-sm font-semibold text-foreground mt-1">{formatAmount(totalPrice, currency)}</div>
      </div>
    </div>
    {schedule.length > 0 ? <>
      <div className="quotation-detail-table">
        <table className="w-full text-left text-xs">
          <thead className="bg-muted/40 text-muted-foreground font-semibold"><tr>
            <th scope="col" className="py-2.5 px-4">Milestone</th>
            <th scope="col" className="py-2.5 px-4 text-right">Allocation</th>
            <th scope="col" className="py-2.5 px-4 text-right">Amount</th>
          </tr></thead>
          <tbody className="divide-y divide-border/60 text-sm">{schedule.map((m, idx) => <tr key={idx}>
            <td className="py-3 px-4 text-foreground">{m.title?.trim() || `Milestone ${idx + 1}`}</td>
            <td className="py-3 px-4 text-right font-semibold text-foreground">{validPercent(m.percentage) ? `${m.percentage}%` : 'Not recorded'}</td>
            <td className="py-3 px-4 text-right text-foreground">{validPercent(m.percentage) ? formatAmount(totalPrice * m.percentage / 100, currency) : '—'}</td>
          </tr>)}</tbody>
          <tfoot className="bg-muted/30 border-t border-border/60 text-sm font-semibold"><tr>
            <th scope="row" className="py-3 px-4">Total allocation</th>
            <td className={`py-3 px-4 text-right ${complete ? 'quotation-allocation--complete' : 'quotation-allocation--incomplete'}`}>{validSchedule ? `${Number(total.toFixed(2))}%` : 'Incomplete'}</td>
            <td className="py-3 px-4 text-right">{validSchedule ? formatAmount(totalPrice * total / 100, currency) : '—'}</td>
          </tr></tfoot>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">Amounts are calculated from the submitted quotation value and may be rounded for display.</p>
      {!complete && <p className="text-xs quotation-allocation--incomplete" role="status">This submitted schedule does not contain a complete 100% allocation.</p>}
    </> : <div className="quotation-payment__note">
      <div className="text-sm font-semibold text-foreground">{hasTerms ? 'No milestone breakdown' : 'Payment terms not recorded'}</div>
      <p className="text-xs text-muted-foreground mt-1">{hasTerms ? 'No milestone percentages were included in this submission. Refer to the quoted terms and supporting documents for payment conditions.' : 'This quotation does not include payment terms or a payment schedule.'}</p>
    </div>}
  </section>;
}
