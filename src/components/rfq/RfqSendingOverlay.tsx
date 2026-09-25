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
} from 'lucide-react';
import './RfqSendingOverlay.css';

export interface RfqSendingOverlayProps {
  isOpen: boolean;
  title?: string;
  subtitle?: string;
  rfqNumber?: string;
  vendorCount?: number;
  mode?: 'send' | 'draft' | 'approval';
}

interface StepItem {
  id: number;
  label: string;
  icon: React.ReactNode;
  delay: number;
}

const DEFAULT_SEND_STEPS: StepItem[] = [
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
    label: 'Validating RFQ draft specifications',
    icon: <FileText size={16} />,
    delay: 0,
  },
  {
    id: 2,
    label: 'Saving line items & custom fields',
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

export const RfqSendingOverlay: React.FC<RfqSendingOverlayProps> = ({
  isOpen,
  title,
  subtitle,
  rfqNumber,
  vendorCount,
  mode = 'send',
}) => {
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [progress, setProgress] = useState(15);

  const steps = mode === 'draft' ? DRAFT_STEPS : DEFAULT_SEND_STEPS;

  useEffect(() => {
    if (!isOpen) {
      setActiveStepIndex(0);
      setProgress(15);
      return;
    }

    // Progress bar animation timer
    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 92) return prev;
        const jump = Math.floor(Math.random() * 8) + 3;
        return Math.min(prev + jump, 92);
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

  const defaultTitle =
    mode === 'draft'
      ? 'Saving RFQ Draft...'
      : mode === 'approval'
      ? 'Submitting RFQ for Approval...'
      : 'Sending RFQ to Vendors...';

  const defaultSubtitle =
    mode === 'draft'
      ? 'Securely saving your RFQ draft and configuration.'
      : vendorCount && vendorCount > 0
      ? `Dispatching invitations and access tokens to ${vendorCount} selected vendor(s).`
      : 'Generating secure access links and notifying participants.';

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="rfq-sending-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.28, ease: 'easeOut' }}
          role="status"
          aria-live="polite"
        >
          {/* Ambient Background Glows */}
          <div className="rfq-sending-overlay__glow rfq-sending-overlay__glow--1" />
          <div className="rfq-sending-overlay__glow rfq-sending-overlay__glow--2" />

          {/* Center Card */}
          <motion.div
            className="rfq-sending-card"
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 15 }}
            transition={{ type: 'spring', damping: 26, stiffness: 320 }}
          >
            {/* Top RFQ badge if present */}
            {rfqNumber && (
              <div className="rfq-sending-card__rfq-pill">
                <Sparkles size={13} className="text-amber-400" />
                <span>RFQ #{rfqNumber}</span>
              </div>
            )}

            {/* Central Animated Flight Hero */}
            <div className="rfq-sending-hero">
              <div className="rfq-sending-hero__radar-ring rfq-sending-hero__radar-ring--1" />
              <div className="rfq-sending-hero__radar-ring rfq-sending-hero__radar-ring--2" />
              <div className="rfq-sending-hero__radar-ring rfq-sending-hero__radar-ring--3" />

              <div className="rfq-sending-hero__icon-wrap">
                <motion.div
                  className="rfq-sending-hero__plane"
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
                  <Send size={38} className="rfq-sending-hero__send-svg" />
                </motion.div>
              </div>
            </div>

            {/* Title & Subtitle */}
            <h2 className="rfq-sending-card__title">{title || defaultTitle}</h2>
            <p className="rfq-sending-card__subtitle">{subtitle || defaultSubtitle}</p>

            {/* Live Progress Bar */}
            <div className="rfq-sending-progress-wrap">
              <div className="rfq-sending-progress-bar">
                <motion.div
                  className="rfq-sending-progress-fill"
                  style={{ width: `${progress}%` }}
                  transition={{ ease: 'easeOut', duration: 0.3 }}
                />
              </div>
              <div className="rfq-sending-progress-meta">
                <span className="rfq-sending-progress-status">
                  <span className="rfq-sending-status-dot" />
                  Processing in real-time
                </span>
                <span className="rfq-sending-progress-pct">{progress}%</span>
              </div>
            </div>

            {/* Dynamic Step Progression */}
            <div className="rfq-sending-steps">
              {steps.map((step, idx) => {
                const isDone = idx < activeStepIndex;
                const isCurrent = idx === activeStepIndex;
                const isPending = idx > activeStepIndex;

                return (
                  <div
                    key={step.id}
                    className={`rfq-sending-step ${
                      isDone
                        ? 'rfq-sending-step--done'
                        : isCurrent
                        ? 'rfq-sending-step--active'
                        : 'rfq-sending-step--pending'
                    }`}
                  >
                    <div className="rfq-sending-step__icon">
                      {isDone ? (
                        <CheckCircle2 size={16} className="text-emerald-500" />
                      ) : isCurrent ? (
                        <Loader2 size={16} className="animate-spin text-primary-500" />
                      ) : (
                        <div className="rfq-sending-step__pending-dot" />
                      )}
                    </div>
                    <div className="rfq-sending-step__content">
                      <span className="rfq-sending-step__label">{step.label}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Bottom Security Assurance */}
            <div className="rfq-sending-card__footer">
              <Lock size={12} />
              <span>Encrypted transmission • Please keep this window open</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
};

export default RfqSendingOverlay;
