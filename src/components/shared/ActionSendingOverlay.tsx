import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  Send,
  CheckCircle2,
  Loader2,
  FileText,
  Users,
  ShieldCheck,
  Mail,
  Sparkles,
  Lock,
  CreditCard,
  Landmark,
  Receipt,
  PackageCheck,
  Building2,
  DollarSign,
} from 'lucide-react';
import './ActionSendingOverlay.css';

export type DocType = 'po' | 'invoice' | 'payment_voucher' | 'rfq' | 'grn';

export interface ActionSendingOverlayProps {
  isOpen: boolean;
  docType?: DocType;
  docNumber?: string;
  title?: string;
  subtitle?: string;
  vendorName?: string;
  amount?: number | string;
  currency?: string;
  mode?: 'send' | 'draft' | 'approval';
  onComplete?: () => void;
}

interface StepItem {
  id: number;
  label: string;
  icon: React.ReactNode;
  delay: number;
}

const PO_STEPS: StepItem[] = [
  {
    id: 1,
    label: 'Packaging PO line items & commercial specifications',
    icon: <FileText size={16} />,
    delay: 0,
  },
  {
    id: 2,
    label: 'Validating budget allocation & contract limits',
    icon: <ShieldCheck size={16} />,
    delay: 600,
  },
  {
    id: 3,
    label: 'Routing PO to multi-tier approval chain',
    icon: <Users size={16} />,
    delay: 1300,
  },
  {
    id: 4,
    label: 'Notifying designated approvers & sending real-time alerts',
    icon: <Mail size={16} />,
    delay: 2100,
  },
];

const INVOICE_STEPS: StepItem[] = [
  {
    id: 1,
    label: 'Extracting invoice line items & tax breakdown',
    icon: <Receipt size={16} />,
    delay: 0,
  },
  {
    id: 2,
    label: 'Executing automated 3-Way Match (PO vs GRN vs Invoice)',
    icon: <ShieldCheck size={16} />,
    delay: 600,
  },
  {
    id: 3,
    label: 'Routing invoice to Accounts Payable workflow',
    icon: <Users size={16} />,
    delay: 1300,
  },
  {
    id: 4,
    label: 'Notifying Finance Managers & updating audit trail',
    icon: <Mail size={16} />,
    delay: 2100,
  },
];

const PAYMENT_VOUCHER_STEPS: StepItem[] = [
  {
    id: 1,
    label: 'Validating bank account & beneficiary details',
    icon: <Landmark size={16} />,
    delay: 0,
  },
  {
    id: 2,
    label: 'Verifying approved invoice balance & currency rate',
    icon: <ShieldCheck size={16} />,
    delay: 600,
  },
  {
    id: 3,
    label: 'Routing payment voucher to Treasury sign-off chain',
    icon: <Users size={16} />,
    delay: 1300,
  },
  {
    id: 4,
    label: 'Generating payment queue & sending notification',
    icon: <Mail size={16} />,
    delay: 2100,
  },
];

const RFQ_STEPS: StepItem[] = [
  {
    id: 1,
    label: 'Packaging RFQ details & line items',
    icon: <FileText size={16} />,
    delay: 0,
  },
  {
    id: 2,
    label: 'Configuring evaluation matrix & terms',
    icon: <ShieldCheck size={16} />,
    delay: 600,
  },
  {
    id: 3,
    label: 'Generating secure vendor access portals',
    icon: <Users size={16} />,
    delay: 1300,
  },
  {
    id: 4,
    label: 'Dispatching real-time email invitations',
    icon: <Mail size={16} />,
    delay: 2100,
  },
];

const DRAFT_STEPS: StepItem[] = [
  {
    id: 1,
    label: 'Validating document specifications & line items',
    icon: <FileText size={16} />,
    delay: 0,
  },
  {
    id: 2,
    label: 'Saving configuration & custom fields',
    icon: <ShieldCheck size={16} />,
    delay: 500,
  },
  {
    id: 3,
    label: 'Syncing draft state to server',
    icon: <CheckCircle2 size={16} />,
    delay: 1100,
  },
];

export const ActionSendingOverlay: React.FC<ActionSendingOverlayProps> = ({
  isOpen,
  docType = 'po',
  docNumber,
  title,
  subtitle,
  vendorName,
  amount,
  currency = 'KES',
  mode = 'approval',
  onComplete,
}) => {
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [progress, setProgress] = useState(15);

  const steps =
    mode === 'draft'
      ? DRAFT_STEPS
      : docType === 'invoice'
      ? INVOICE_STEPS
      : docType === 'payment_voucher'
      ? PAYMENT_VOUCHER_STEPS
      : docType === 'rfq'
      ? RFQ_STEPS
      : PO_STEPS;

  useEffect(() => {
    if (!isOpen) {
      setActiveStepIndex(0);
      setProgress(15);
      return;
    }

    // Progress bar animation timer
    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 94) return prev;
        const jump = Math.floor(Math.random() * 8) + 3;
        return Math.min(prev + jump, 94);
      });
    }, 450);

    // Timers for step transitions
    const stepTimers = steps.map((step, idx) => {
      if (idx === 0) return null;
      return setTimeout(() => {
        setActiveStepIndex(idx);
      }, step.delay);
    });

    // Lock body scroll while overlay is mounted
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      clearInterval(progressInterval);
      stepTimers.forEach((t) => t && clearTimeout(t));
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen, steps]);

  if (typeof document === 'undefined') return null;

  // Defaults based on docType & mode
  const getDocTypeTitle = () => {
    if (title) return title;
    if (mode === 'draft') return 'Saving Draft Document...';
    switch (docType) {
      case 'po':
        return 'Submitting Purchase Order for Approval...';
      case 'invoice':
        return 'Submitting Purchase Invoice for Approval...';
      case 'payment_voucher':
        return 'Submitting Payment Voucher for Approval...';
      case 'rfq':
        return mode === 'send' ? 'Sending RFQ to Vendors...' : 'Submitting RFQ for Approval...';
      default:
        return 'Submitting Document for Approval...';
    }
  };

  const getDocTypeSubtitle = () => {
    if (subtitle) return subtitle;
    if (mode === 'draft') return 'Saving your document configuration and line items securely.';
    switch (docType) {
      case 'po':
        return vendorName
          ? `Initiating PO approval workflow for ${vendorName}.`
          : 'Initiating multi-tier PO approval workflow and notifying designated approvers.';
      case 'invoice':
        return 'Executing automated 3-Way Match & routing invoice to Finance Approvers.';
      case 'payment_voucher':
        return 'Validating bank account details & routing voucher for Treasury sign-off.';
      case 'rfq':
        return 'Generating secure vendor access portals & notifying participants.';
      default:
        return 'Initiating approval workflow and notifying designated approvers.';
    }
  };

  const getDocBadgeLabel = () => {
    if (docNumber) return docNumber;
    switch (docType) {
      case 'po':
        return 'Purchase Order';
      case 'invoice':
        return 'Purchase Invoice';
      case 'payment_voucher':
        return 'Payment Voucher';
      case 'rfq':
        return 'RFQ Document';
      default:
        return 'Document';
    }
  };

  const getHeroIcon = () => {
    switch (docType) {
      case 'po':
        return <PackageCheck size={38} className="action-sending-hero__svg" />;
      case 'invoice':
        return <Receipt size={38} className="action-sending-hero__svg" />;
      case 'payment_voucher':
        return <Landmark size={38} className="action-sending-hero__svg" />;
      case 'rfq':
      default:
        return <Send size={38} className="action-sending-hero__svg" />;
    }
  };

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="action-sending-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.28, ease: 'easeOut' }}
          role="status"
          aria-live="polite"
        >
          {/* Ambient Background Glows */}
          <div className={`action-sending-overlay__glow action-sending-overlay__glow--1 action-sending-overlay__glow--${docType}`} />
          <div className={`action-sending-overlay__glow action-sending-overlay__glow--2 action-sending-overlay__glow--${docType}`} />

          {/* Center Card */}
          <motion.div
            className="action-sending-card"
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 15 }}
            transition={{ type: 'spring', damping: 26, stiffness: 320 }}
          >
            {/* Top document pill badge */}
            <div className={`action-sending-card__pill action-sending-card__pill--${docType}`}>
              <Sparkles size={13} className="text-amber-400" />
              <span>{getDocBadgeLabel()}</span>
              {amount !== undefined && amount !== null && (
                <span className="action-sending-card__pill-amount">
                  • {typeof amount === 'number' ? `${currency} ${amount.toLocaleString()}` : String(amount)}
                </span>
              )}
            </div>

            {/* Central Animated Hero */}
            <div className="action-sending-hero">
              <div className="action-sending-hero__radar-ring action-sending-hero__radar-ring--1" />
              <div className="action-sending-hero__radar-ring action-sending-hero__radar-ring--2" />
              <div className="action-sending-hero__radar-ring action-sending-hero__radar-ring--3" />

              <div className={`action-sending-hero__icon-wrap action-sending-hero__icon-wrap--${docType}`}>
                <motion.div
                  className="action-sending-hero__floating-icon"
                  animate={{
                    y: [-4, 4, -4],
                    rotate: [0, 4, 0, -4, 0],
                  }}
                  transition={{
                    duration: 3.2,
                    repeat: Infinity,
                    ease: 'easeInOut',
                  }}
                >
                  {getHeroIcon()}
                </motion.div>
              </div>
            </div>

            {/* Title & Subtitle */}
            <h2 className="action-sending-card__title">{getDocTypeTitle()}</h2>
            <p className="action-sending-card__subtitle">{getDocTypeSubtitle()}</p>

            {/* Live Progress Bar */}
            <div className="action-sending-progress-wrap">
              <div className="action-sending-progress-bar">
                <motion.div
                  className="action-sending-progress-fill"
                  style={{ width: `${progress}%` }}
                  transition={{ ease: 'easeOut', duration: 0.3 }}
                />
              </div>
              <div className="action-sending-progress-meta">
                <span className="action-sending-progress-status">
                  <span className="action-sending-status-dot" />
                  Workflow initiating in real-time
                </span>
                <span className="action-sending-progress-pct">{progress}%</span>
              </div>
            </div>

            {/* Dynamic Step Progression */}
            <div className="action-sending-steps">
              {steps.map((step, idx) => {
                const isDone = idx < activeStepIndex;
                const isCurrent = idx === activeStepIndex;

                return (
                  <div
                    key={step.id}
                    className={`action-sending-step ${
                      isDone
                        ? 'action-sending-step--done'
                        : isCurrent
                        ? 'action-sending-step--active'
                        : 'action-sending-step--pending'
                    }`}
                  >
                    <div className="action-sending-step__icon">
                      {isDone ? (
                        <CheckCircle2 size={16} className="text-emerald-500" />
                      ) : isCurrent ? (
                        <Loader2 size={16} className="animate-spin text-primary-500" />
                      ) : (
                        <div className="action-sending-step__pending-dot" />
                      )}
                    </div>
                    <div className="action-sending-step__content">
                      <span className="action-sending-step__label">{step.label}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Bottom Security Assurance */}
            <div className="action-sending-card__footer">
              <Lock size={12} />
              <span>Encrypted workflow submission • Please keep this window open</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
};

export default ActionSendingOverlay;
