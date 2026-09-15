import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Check, Moon, Sun } from 'lucide-react';
import heliflowLogo from '../../assets/heliflow.png';
import { motionTransition } from '../../lib/motion';

interface AuthLayoutProps {
  companyName: string;
  logoUrl?: string | null;
  tagline: string;
  features: string[];
  supportEmail?: string | null;
  portalLabel: string;
  title: string;
  description: string;
  switchLabel?: string;
  switchText?: string;
  switchTo?: string;
  isDark: boolean;
  onThemeToggle: (origin?: { x: number; y: number }) => void;
  children: ReactNode;
}

export function AuthLayout({
  companyName,
  logoUrl,
  tagline,
  features,
  supportEmail,
  portalLabel,
  title,
  description,
  switchLabel,
  switchText,
  switchTo,
  isDark,
  onThemeToggle,
  children,
}: AuthLayoutProps) {
  return (
    <main className="grid min-h-svh bg-background text-foreground lg:grid-cols-[minmax(360px,0.88fr)_minmax(520px,1.12fr)]">
      <section className="relative hidden min-h-svh overflow-hidden [background:var(--shell-bg)] px-10 py-10 text-white lg:flex lg:flex-col xl:px-14 xl:py-12">
        <div aria-hidden="true" className="absolute -right-28 -top-24 size-96 rounded-full border border-white/[0.06]" />
        <div aria-hidden="true" className="absolute -bottom-48 -left-36 size-[34rem] rounded-full border border-white/[0.05]" />
        <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_78%_18%,rgba(74,144,226,0.16),transparent_32%),radial-gradient(circle_at_18%_88%,rgba(45,212,191,0.08),transparent_30%)]" />

        <div className="relative z-10 flex items-center gap-3.5">
          <img src={logoUrl || heliflowLogo} alt="" className="size-12 rounded-xl object-contain ring-1 ring-white/15" />
          <span className="text-2xl font-bold tracking-[-0.035em] text-white">{companyName}</span>
        </div>

        <div className="relative z-10 my-auto max-w-lg py-16">
          <h2 className="max-w-md text-4xl font-semibold leading-[1.08] tracking-[-0.045em] text-white xl:text-[42px]">
            Make every procurement decision clearer.
          </h2>
          <p className="mt-5 max-w-md text-[15px] leading-7 text-white/58">{tagline}</p>

          <ul className="mt-10 grid gap-4" aria-label="Platform capabilities">
            {features.map((feature) => (
              <li key={feature} className="flex items-center gap-3 text-sm text-white/72">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-blue-400/15 text-blue-300 ring-1 ring-blue-300/15">
                  <Check size={14} strokeWidth={2.5} />
                </span>
                {feature}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative z-10 text-[11px] text-white/30">
          © {new Date().getFullYear()} {supportEmail ? `${companyName} · ${supportEmail}` : companyName}
        </p>
      </section>

      <section className="relative flex min-h-svh items-center justify-center overflow-hidden px-4 py-20 sm:px-8 lg:px-12">
        <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_82%_8%,rgba(37,99,235,0.09),transparent_30%),radial-gradient(circle_at_16%_92%,rgba(14,165,233,0.06),transparent_34%)]" />
        <button
          type="button"
          onClick={(event) => onThemeToggle({ x: event.clientX, y: event.clientY })}
          title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          className="absolute right-4 top-4 z-10 inline-flex size-11 items-center justify-center rounded-xl border border-border/80 bg-card/75 text-muted-foreground shadow-sm backdrop-blur-xl outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring sm:right-6 sm:top-6"
        >
          <AnimatePresence initial={false} mode="wait">
            <motion.span
              key={isDark ? 'sun' : 'moon'}
              className="grid place-items-center"
              initial={{ opacity: 0, rotate: -24, scale: 0.75 }}
              animate={{ opacity: 1, rotate: 0, scale: 1 }}
              exit={{ opacity: 0, rotate: 24, scale: 0.75 }}
              transition={motionTransition.fast}
            >
              {isDark ? <Sun size={18} /> : <Moon size={18} />}
            </motion.span>
          </AnimatePresence>
        </button>

        <div className="relative z-[1] w-full max-w-[440px]">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <img src={logoUrl || heliflowLogo} alt="" className="size-11 rounded-xl object-contain ring-1 ring-border" />
            <span className="text-2xl font-bold tracking-[-0.035em] text-foreground">{companyName}</span>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={motionTransition.softSpring}
            className="rounded-3xl border border-border/80 bg-card/95 p-5 shadow-2xl shadow-slate-950/[0.08] supports-[backdrop-filter:blur(1px)]:bg-card/82 supports-[backdrop-filter:blur(1px)]:backdrop-blur-xl sm:p-8"
          >
            <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-primary">{portalLabel}</span>
            <h1 className="mt-3 text-2xl font-semibold leading-[1.15] tracking-[-0.035em] text-foreground">{title}</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>

            <div className="mt-7">{children}</div>

            {switchText && switchLabel && switchTo ? (
              <div className="mt-7 flex flex-wrap items-center gap-1.5 border-t border-border pt-5 text-sm text-muted-foreground">
                <span>{switchText}</span>
                <Link className="font-semibold text-primary underline-offset-4 outline-none hover:underline focus-visible:rounded focus-visible:ring-2 focus-visible:ring-ring" to={switchTo}>
                  {switchLabel}
                </Link>
              </div>
            ) : null}
          </motion.div>

          <p className="mt-6 text-center text-[11px] text-muted-foreground/70 lg:hidden">
            © {new Date().getFullYear()} {companyName}
          </p>
        </div>
      </section>
    </main>
  );
}
