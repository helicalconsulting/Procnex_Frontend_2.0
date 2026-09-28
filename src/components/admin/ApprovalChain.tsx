import { motion, useReducedMotion } from 'motion/react';
import { ArrowLeft, ArrowRight, Clock, Edit3, Trash2, Banknote } from 'lucide-react';
import { Button } from '../ui/button';
import { formatCurrency } from '../shared/CurrencyMaster';
import { motionEase } from '../../lib/motion';
import { formatApprovalTime, type ApprovalLevelData, type MoveDirection } from './approvalLevelModel';

export default function ApprovalChain({ label, chain, canManage, busy, pendingId, currency, onMove, onEdit, onDelete }: {
  label: string; chain: ApprovalLevelData[]; canManage: boolean; busy: boolean; pendingId: string | null; currency: string;
  onMove: (level: ApprovalLevelData, direction: MoveDirection) => void;
  onEdit: (level: ApprovalLevelData) => void;
  onDelete: (level: ApprovalLevelData) => void;
}) {
  const reduceMotion = useReducedMotion();
  return <div className="approval-chain-scroll" tabIndex={0} role="region" aria-label={`${label} approval sequence`}>
    <ol className="approval-chain" aria-label={`${label} approval chain`} aria-busy={Boolean(pendingId && chain.some(level => level.id === pendingId))}>
      {chain.map((level, index) => <motion.li key={level.id} layout={reduceMotion ? false : 'position'}
        transition={{ layout: { duration: 0.24, ease: motionEase } }} className="approval-step">
        <article className="approval-level-card" aria-label={`Level ${level.levelNumber}: ${level.requiredRole}`}>
          <div className="approval-level-card__heading">
            <span className="approval-level-number text-xs font-semibold">{level.levelNumber}</span>
            <div><span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Level {level.levelNumber}</span><h3 className="text-sm font-semibold">{level.requiredRole}</h3></div>
          </div>
          <dl className="approval-level-card__details text-xs">
            <div><dt><Clock size={14} />Time limit</dt><dd>{formatApprovalTime(level.timeLimitHours)}</dd></div>
            <div><dt><Banknote size={14} />Value range</dt><dd>{level.minValue === null && level.maxValue === null ? 'All amounts' : <>
              {formatCurrency(level.minValue ?? 0, level.currency || currency)}{level.maxValue === null ? ' and above' : ` – ${formatCurrency(level.maxValue, level.currency || currency)}`}
            </>}</dd></div>
          </dl>
          <div className="approval-level-card__actions">
            <div className="approval-level-card__move">
              <Button variant="ghost" size="icon-sm" aria-label={`Move ${level.requiredRole} left from level ${level.levelNumber}`} title="Move left · earlier approval" disabled={index === 0 || !canManage || busy} onClick={() => onMove(level, 'left')}><ArrowLeft size={15} /></Button>
              <Button variant="ghost" size="icon-sm" aria-label={`Move ${level.requiredRole} right from level ${level.levelNumber}`} title="Move right · later approval" disabled={index === chain.length - 1 || !canManage || busy} onClick={() => onMove(level, 'right')}><ArrowRight size={15} /></Button>
            </div>
            <Button variant="ghost" size="icon-sm" aria-label={`Edit ${label} level ${level.levelNumber}`} title="Edit level" disabled={!canManage || busy} onClick={() => onEdit(level)}><Edit3 size={15} /></Button>
            <Button variant="ghost" size="icon-sm" aria-label={`Remove ${label} level ${level.levelNumber}`} title="Remove level" disabled={!canManage || busy} onClick={() => onDelete(level)}><Trash2 size={15} /></Button>
          </div>
        </article>
        {index < chain.length - 1 && <ArrowRight size={17} className="approval-chain-connector" aria-hidden="true" />}
      </motion.li>)}
    </ol>
  </div>;
}
