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
  Lock,
  CreditCard,
  Landmark,
  Receipt,
  PackageCheck,
  Building2,
  DollarSign,
  X,
  ArrowLeft,
  XCircle,
  RotateCcw,
} from 'lucide-react';
import './ActionSendingOverlay.css';

export type DocType = 'po' | 'invoice' | 'payment_voucher' | 'rfq' | 'grn' | 'quotation';

export interface ActionSendingOverlayProps {
  isOpen: boolean;
  docType?: DocType;
  docNumber?: string;
  title?: string;
  subtitle?: string;
  vendorName?: string;
  amount?: number | string;
  currency?: string;
  mode?: 'send' | 'draft' | 'approval' | 'approve' | 'reject' | 'return';
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

const PO_APPROVE_STEPS: StepItem[] = [
  {
    id: 1,
    label: 'Validating approver authorization & digital sign-off',
    icon: <ShieldCheck size={16} />,
    delay: 0,
  },
  {
    id: 2,
    label: 'Advancing multi-tier approval matrix & updating audit log',
    icon: <Users size={16} />,
    delay: 600,
  },
  {
    id: 3,
    label: 'Releasing PO / routing to next approval stage',
    icon: <Send size={16} />,
    delay: 1300,
  },
  {
    id: 4,
    label: 'Dispatching real-time notifications to creator & vendor',
    icon: <Mail size={16} />,
    delay: 2100,
  },
];

const PO_REJECT_STEPS: StepItem[] = [
  {
    id: 1,
    label: 'Validating rejection remarks & approver authorization',
    icon: <FileText size={16} />,
    delay: 0,
  },
  {
    id: 2,
    label: 'Updating workflow audit trail & closing approval chain',
    icon: <ShieldCheck size={16} />,
    delay: 600,
  },
  {
    id: 3,
    label: 'Notifying PO originator & procurement team in real time',
    icon: <Mail size={16} />,
    delay: 1400,
  },
];

const PO_RETURN_STEPS: StepItem[] = [
  {
    id: 1,
    label: 'Logging revision instructions & return notes',
    icon: <FileText size={16} />,
    delay: 0,
  },
  {
    id: 2,
    label: 'Routing Purchase Order back to originator for modifications',
    icon: <Users size={16} />,
    delay: 600,
  },
  {
    id: 3,
    label: 'Notifying creator & updating status across procurement queue',
    icon: <Mail size={16} />,
    delay: 1400,
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

const INVOICE_APPROVE_STEPS: StepItem[] = [
  {
    id: 1,
    label: 'Validating approver credentials & digital sign-off',
    icon: <ShieldCheck size={16} />,
    delay: 0,
  },
  {
    id: 2,
    label: 'Posting approved invoice to Accounts Payable ledger',
    icon: <Receipt size={16} />,
    delay: 600,
  },
  {
    id: 3,
    label: 'Enabling payment voucher creation & scheduling',
    icon: <CreditCard size={16} />,
    delay: 1300,
  },
  {
    id: 4,
    label: 'Notifying Finance team & updating audit log',
    icon: <Mail size={16} />,
    delay: 2100,
  },
];

const INVOICE_REJECT_STEPS: StepItem[] = [
  {
    id: 1,
    label: 'Validating rejection reason & approver remarks',
    icon: <FileText size={16} />,
    delay: 0,
  },
  {
    id: 2,
    label: 'Updating Accounts Payable ledger & terminating approval chain',
    icon: <ShieldCheck size={16} />,
    delay: 600,
  },
  {
    id: 3,
    label: 'Dispatching real-time rejection notification & updating audit trail',
    icon: <Mail size={16} />,
    delay: 1400,
  },
];

const INVOICE_RETURN_STEPS: StepItem[] = [
  {
    id: 1,
    label: 'Logging discrepancy notes & revision instructions',
    icon: <FileText size={16} />,
    delay: 0,
  },
  {
    id: 2,
    label: 'Returning invoice to originator / vendor for correction',
    icon: <Users size={16} />,
    delay: 600,
  },
  {
    id: 3,
    label: 'Notifying submitter & updating Accounts Payable queue',
    icon: <Mail size={16} />,
    delay: 1400,
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

const PAYMENT_VOUCHER_APPROVE_STEPS: StepItem[] = [
  {
    id: 1,
    label: 'Validating Treasury sign-off & approver authorization',
    icon: <ShieldCheck size={16} />,
    delay: 0,
  },
  {
    id: 2,
    label: 'Authorizing disbursement & updating cash ledger balance',
    icon: <Landmark size={16} />,
    delay: 600,
  },
  {
    id: 3,
    label: 'Releasing payment voucher to disbursement queue',
    icon: <CreditCard size={16} />,
    delay: 1300,
  },
  {
    id: 4,
    label: 'Generating payment advice & dispatching real-time notifications',
    icon: <Mail size={16} />,
    delay: 2100,
  },
];

const PAYMENT_VOUCHER_REJECT_STEPS: StepItem[] = [
  {
    id: 1,
    label: 'Validating rejection remarks & approver credentials',
    icon: <FileText size={16} />,
    delay: 0,
  },
  {
    id: 2,
    label: 'Cancelling payment authorization & updating Treasury records',
    icon: <ShieldCheck size={16} />,
    delay: 600,
  },
  {
    id: 3,
    label: 'Notifying initiator & recording in financial audit log',
    icon: <Mail size={16} />,
    delay: 1400,
  },
];

const PAYMENT_VOUCHER_RETURN_STEPS: StepItem[] = [
  {
    id: 1,
    label: 'Logging payment adjustments & revision notes',
    icon: <FileText size={16} />,
    delay: 0,
  },
  {
    id: 2,
    label: 'Routing voucher back to Finance creator for modifications',
    icon: <Users size={16} />,
    delay: 600,
  },
  {
    id: 3,
    label: 'Notifying initiator & updating Treasury queue',
    icon: <Mail size={16} />,
    delay: 1400,
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

const RFQ_APPROVE_STEPS: StepItem[] = [
  {
    id: 1,
    label: 'Validating approver credentials & digital sign-off',
    icon: <ShieldCheck size={16} />,
    delay: 0,
  },
  {
    id: 2,
    label: 'Updating multi-tier approval matrix & audit log',
    icon: <Users size={16} />,
    delay: 600,
  },
  {
    id: 3,
    label: 'Routing RFQ to next stage / generating vendor tokens',
    icon: <Send size={16} />,
    delay: 1300,
  },
  {
    id: 4,
    label: 'Dispatching notifications & updating real-time status',
    icon: <Mail size={16} />,
    delay: 2100,
  },
];

const RFQ_REJECT_STEPS: StepItem[] = [
  {
    id: 1,
    label: 'Validating rejection reason & approver remarks',
    icon: <FileText size={16} />,
    delay: 0,
  },
  {
    id: 2,
    label: 'Updating workflow audit trail & closing approval chain',
    icon: <ShieldCheck size={16} />,
    delay: 600,
  },
  {
    id: 3,
    label: 'Notifying RFQ originator & procurement team in real time',
    icon: <Mail size={16} />,
    delay: 1400,
  },
];

const RFQ_RETURN_STEPS: StepItem[] = [
  {
    id: 1,
    label: 'Logging revision instructions & return notes',
    icon: <FileText size={16} />,
    delay: 0,
  },
  {
    id: 2,
    label: 'Routing RFQ back to originator for modifications',
    icon: <Users size={16} />,
    delay: 600,
  },
  {
    id: 3,
    label: 'Notifying creator & updating status across portals',
    icon: <Mail size={16} />,
    delay: 1400,
  },
];

const GRN_STEPS: StepItem[] = [
  {
    id: 1,
    label: 'Validating received quantities against Purchase Order',
    icon: <PackageCheck size={16} />,
    delay: 0,
  },
  {
    id: 2,
    label: 'Verifying warehouse inventory bin allocation & inspection notes',
    icon: <Building2 size={16} />,
    delay: 600,
  },
  {
    id: 3,
    label: 'Updating stock ledger & generating verified GRN record',
    icon: <ShieldCheck size={16} />,
    delay: 1300,
  },
  {
    id: 4,
    label: 'Enabling 3-way matching for Accounts Payable & notifying team',
    icon: <CheckCircle2 size={16} />,
    delay: 2100,
  },
];

const VENDOR_INVOICE_STEPS: StepItem[] = [
  {
    id: 1,
    label: 'Packaging invoice line items, quantities & tax breakdown',
    icon: <Receipt size={16} />,
    delay: 0,
  },
  {
    id: 2,
    label: 'Verifying matching Purchase Order & GRN delivery receipt',
    icon: <ShieldCheck size={16} />,
    delay: 600,
  },
  {
    id: 3,
    label: 'Uploading verified invoice attachments & commercial terms',
    icon: <FileText size={16} />,
    delay: 1300,
  },
  {
    id: 4,
    label: 'Dispatching invoice to buyer procurement & accounts team',
    icon: <Mail size={16} />,
    delay: 2100,
  },
];

const QUOTATION_STEPS: StepItem[] = [
  {
    id: 1,
    label: 'Packaging item unit rates, quantities & delivery lead time',
    icon: <FileText size={16} />,
    delay: 0,
  },
  {
    id: 2,
    label: 'Encrypting commercial terms & validating compliance specifications',
    icon: <ShieldCheck size={16} />,
    delay: 600,
  },
  {
    id: 3,
    label: 'Submitting quotation to Procurement evaluation matrix',
    icon: <Users size={16} />,
    delay: 1300,
  },
  {
    id: 4,
    label: 'Notifying Buyer Procurement team & updating real-time RFQ status',
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

const GENERIC_REJECT_STEPS: StepItem[] = [
  {
    id: 1,
    label: 'Validating rejection remarks & approver authorization',
    icon: <FileText size={16} />,
    delay: 0,
  },
  {
    id: 2,
    label: 'Updating workflow audit trail & closing approval chain',
    icon: <ShieldCheck size={16} />,
    delay: 600,
  },
  {
    id: 3,
    label: 'Notifying document originator in real time',
    icon: <Mail size={16} />,
    delay: 1400,
  },
];

const GENERIC_RETURN_STEPS: StepItem[] = [
  {
    id: 1,
    label: 'Logging revision instructions & return notes',
    icon: <FileText size={16} />,
    delay: 0,
  },
  {
    id: 2,
    label: 'Routing document back to originator for modifications',
    icon: <Users size={16} />,
    delay: 600,
  },
  {
    id: 3,
    label: 'Notifying creator & updating status across queue',
    icon: <Mail size={16} />,
    delay: 1400,
  },
];

const GENERIC_APPROVE_STEPS: StepItem[] = [
  {
    id: 1,
    label: 'Validating approver credentials & digital sign-off',
    icon: <ShieldCheck size={16} />,
    delay: 0,
  },
  {
    id: 2,
    label: 'Advancing multi-tier approval matrix & updating audit log',
    icon: <Users size={16} />,
    delay: 600,
  },
  {
    id: 3,
    label: 'Dispatching real-time notifications to stakeholders',
    icon: <Mail size={16} />,
    delay: 1400,
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

  const steps = (() => {
    if (mode === 'draft') return DRAFT_STEPS;
    if (docType === 'quotation') return QUOTATION_STEPS;
    if (docType === 'grn') return GRN_STEPS;

    if (mode === 'reject') {
      if (docType === 'rfq') return RFQ_REJECT_STEPS;
      if (docType === 'po') return PO_REJECT_STEPS;
      if (docType === 'invoice') return INVOICE_REJECT_STEPS;
      if (docType === 'payment_voucher') return PAYMENT_VOUCHER_REJECT_STEPS;
      return GENERIC_REJECT_STEPS;
    }

    if (mode === 'return') {
      if (docType === 'rfq') return RFQ_RETURN_STEPS;
      if (docType === 'po') return PO_RETURN_STEPS;
      if (docType === 'invoice') return INVOICE_RETURN_STEPS;
      if (docType === 'payment_voucher') return PAYMENT_VOUCHER_RETURN_STEPS;
      return GENERIC_RETURN_STEPS;
    }

    if (mode === 'approve') {
      if (docType === 'rfq') return RFQ_APPROVE_STEPS;
      if (docType === 'po') return PO_APPROVE_STEPS;
      if (docType === 'invoice') return INVOICE_APPROVE_STEPS;
      if (docType === 'payment_voucher') return PAYMENT_VOUCHER_APPROVE_STEPS;
      return GENERIC_APPROVE_STEPS;
    }

    if (docType === 'invoice' && mode === 'send') return VENDOR_INVOICE_STEPS;
    if (docType === 'invoice') return INVOICE_STEPS;
    if (docType === 'payment_voucher') return PAYMENT_VOUCHER_STEPS;
    if (docType === 'rfq') return RFQ_STEPS;
    return PO_STEPS;
  })();

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

    const docFormattedNum = docNumber ? ` #${docNumber}` : '';

    if (mode === 'reject') {
      switch (docType) {
        case 'po':
          return `Rejecting Purchase Order${docFormattedNum}...`;
        case 'rfq':
          return `Rejecting RFQ${docFormattedNum}...`;
        case 'invoice':
          return `Rejecting Purchase Invoice${docFormattedNum}...`;
        case 'payment_voucher':
          return `Rejecting Payment Voucher${docFormattedNum}...`;
        default:
          return `Rejecting Document${docFormattedNum}...`;
      }
    }

    if (mode === 'return') {
      switch (docType) {
        case 'po':
          return `Returning Purchase Order${docFormattedNum} for Revision...`;
        case 'rfq':
          return `Returning RFQ${docFormattedNum} for Revision...`;
        case 'invoice':
          return `Returning Purchase Invoice${docFormattedNum} for Revision...`;
        case 'payment_voucher':
          return `Returning Payment Voucher${docFormattedNum} for Revision...`;
        case 'quotation':
          return `Resubmitting Quotation${docFormattedNum}...`;
        default:
          return `Returning Document${docFormattedNum} for Revision...`;
      }
    }

    if (mode === 'approve') {
      switch (docType) {
        case 'po':
          return `Approving Purchase Order${docFormattedNum}...`;
        case 'rfq':
          return `Approving RFQ${docFormattedNum}...`;
        case 'invoice':
          return `Approving Purchase Invoice${docFormattedNum}...`;
        case 'payment_voucher':
          return `Approving Payment Voucher${docFormattedNum}...`;
        default:
          return `Approving Document${docFormattedNum}...`;
      }
    }

    if (docType === 'rfq') {
      if (mode === 'send') return 'Sending RFQ to Vendors...';
      return 'Submitting RFQ for Approval...';
    }
    if (docType === 'quotation') {
      return `Submitting Quotation${docFormattedNum}...`;
    }
    switch (docType) {
      case 'po':
        return 'Submitting Purchase Order for Approval...';
      case 'invoice':
        return mode === 'send' ? 'Submitting Tax Invoice to Buyer...' : 'Submitting Purchase Invoice for Approval...';
      case 'payment_voucher':
        return 'Submitting Payment Voucher for Approval...';
      case 'grn':
        return mode === 'draft' ? 'Saving Goods Receipt Draft...' : 'Verifying & Posting Goods Receipt Note (GRN)...';
      default:
        return 'Submitting Document for Approval...';
    }
  };

  const getDocTypeSubtitle = () => {
    if (subtitle) return subtitle;
    if (mode === 'draft') return 'Saving your document configuration and line items securely.';

    if (mode === 'reject') {
      switch (docType) {
        case 'po':
          return 'Recording rejection reason, terminating approval workflow, and notifying the creator.';
        case 'rfq':
          return 'Recording rejection reason, terminating approval workflow, and notifying creator.';
        case 'invoice':
          return 'Recording rejection reason, updating accounts payable ledger, and notifying stakeholders.';
        case 'payment_voucher':
          return 'Recording rejection remarks, cancelling payment authorization, and notifying finance team.';
        default:
          return 'Recording rejection reason and terminating approval workflow.';
      }
    }

    if (mode === 'return') {
      switch (docType) {
        case 'po':
          return 'Recording return comments and routing the purchase order back for corrections.';
        case 'rfq':
          return 'Recording revision notes and returning RFQ to originator for necessary modifications.';
        case 'invoice':
          return 'Recording return comments and routing invoice back for discrepancy resolution.';
        case 'payment_voucher':
          return 'Recording return feedback and routing payment voucher back for adjustments.';
        case 'quotation':
          return 'Updating quotation proposal terms and resubmitting to buyer procurement matrix.';
        default:
          return 'Recording revision notes and returning document back to originator for modifications.';
      }
    }

    if (mode === 'approve') {
      switch (docType) {
        case 'po':
          return 'Validating digital sign-off, advancing approval workflow, and notifying designated stakeholders.';
        case 'rfq':
          return 'Validating digital sign-off, advancing approval workflow, and alerting designated stakeholders.';
        case 'invoice':
          return 'Verifying 3-way match, posting to accounts payable ledger, and routing for payment scheduling.';
        case 'payment_voucher':
          return 'Authorizing treasury disbursement, updating cash ledger, and scheduling payment execution.';
        default:
          return 'Validating digital sign-off and advancing approval workflow.';
      }
    }

    if (docType === 'rfq') {
      return 'Generating secure vendor access portals & notifying participants.';
    }
    if (docType === 'quotation') {
      return 'Encrypting commercial rates, attaching compliance terms, and dispatching quotation to Buyer Procurement evaluation matrix.';
    }
    switch (docType) {
      case 'po':
        return vendorName
          ? `Initiating PO approval workflow for ${vendorName}.`
          : 'Initiating multi-tier PO approval workflow and notifying designated approvers.';
      case 'invoice':
        return mode === 'send'
          ? 'Dispatching verified tax invoice to buyer procurement & accounts team.'
          : 'Executing automated 3-Way Match & routing invoice to Finance Approvers.';
      case 'payment_voucher':
        return 'Validating bank account details & routing voucher for Treasury sign-off.';
      case 'grn':
        return 'Verifying received quantities against PO, updating stock ledger, and recording inspection details.';
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
      case 'grn':
        return 'Goods Receipt Note';
      case 'quotation':
        return 'Quotation Proposal';
      default:
        return 'Document';
    }
  };

  const getHeroIcon = () => {
    if (mode === 'approve') return <CheckCircle2 size={38} className="action-sending-hero__svg" />;
    if (mode === 'reject') return <X size={38} className="action-sending-hero__svg" />;
    if (mode === 'return') return <RotateCcw size={38} className="action-sending-hero__svg" />;

    if (docType === 'quotation' || docType === 'rfq') {
      return <Send size={38} className="action-sending-hero__svg" />;
    }
    switch (docType) {
      case 'po':
        return <PackageCheck size={38} className="action-sending-hero__svg" />;
      case 'invoice':
        return <Receipt size={38} className="action-sending-hero__svg" />;
      case 'payment_voucher':
        return <Landmark size={38} className="action-sending-hero__svg" />;
      case 'grn':
        return <PackageCheck size={38} className="action-sending-hero__svg" />;
      default:
        return <Send size={38} className="action-sending-hero__svg" />;
    }
  };

  const modeModifier = mode === 'reject' || mode === 'return' || mode === 'approve' ? `action-sending-hero__icon-wrap--mode-${mode}` : '';
  const pillModeModifier = mode === 'reject' || mode === 'return' || mode === 'approve' ? `action-sending-card__pill--mode-${mode}` : '';
  const glowModeModifier = mode === 'reject' || mode === 'return' || mode === 'approve' ? `action-sending-overlay__glow--mode-${mode}` : '';

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
          <div className={`action-sending-overlay__glow action-sending-overlay__glow--1 action-sending-overlay__glow--${docType} ${glowModeModifier}`} />
          <div className={`action-sending-overlay__glow action-sending-overlay__glow--2 action-sending-overlay__glow--${docType} ${glowModeModifier}`} />

          {/* Center Card */}
          <motion.div
            className="action-sending-card"
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 15 }}
            transition={{ type: 'spring', damping: 26, stiffness: 320 }}
          >
            {/* Top document pill badge */}
            <div className={`action-sending-card__pill action-sending-card__pill--${docType} ${pillModeModifier}`}>
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

              <div className={`action-sending-hero__icon-wrap action-sending-hero__icon-wrap--${docType} ${modeModifier}`}>
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
                  {mode === 'reject'
                    ? 'Processing rejection in real-time'
                    : mode === 'return'
                    ? 'Processing revision return in real-time'
                    : mode === 'approve'
                    ? 'Processing approval in real-time'
                    : 'Workflow initiating in real-time'}
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
              <span>
                {mode === 'reject'
                  ? 'Rejection logged & audit trail updated'
                  : mode === 'return'
                  ? 'Revision return logged & audit trail updated'
                  : 'Encrypted workflow submission • Please keep this window open'}
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
};

export default ActionSendingOverlay;
