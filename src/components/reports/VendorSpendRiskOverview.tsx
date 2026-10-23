import React from 'react';
import {
  Coins,
  Users,
  FileText,
  File,
  MessageSquare,
  AlertTriangle,
  Building2,
  Maximize2,
  Minimize2,
  Download,
  Link,
  Clock,
  CreditCard,
  FileCheck,
  Target,
  ArrowUp,
  Archive,
  RefreshCw,
  FileSpreadsheet,
} from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

export interface VendorSpendRiskOverviewData {
  title: string;
  subtitle: string;
  companyName: string;
  companyCode: string;
  currency: string;
  displayCurrency: string;
  date: string;
  kpiCards: Array<{
    id: string;
    label: string;
    value: string;
    numericValue: number;
    icon: string;
  }>;
  alertBanner?: {
    type: 'critical' | 'warning' | 'info';
    message: string;
  } | null;
  spendDistribution: {
    vendors: Array<{
      id?: string;
      name: string;
      spend: number;
      formattedSpend: string;
      percentage: number;
    }>;
    otherVendors?: {
      count: number;
      spend: number;
      formattedSpend: string;
      percentage: number;
    } | null;
    note?: string;
  };
  concentration: {
    topCount: number;
    topPercentage: number;
    remainingCount: number;
    remainingPercentage: number;
    centerText: string;
  };
  riskAssessment: Array<{
    id: string;
    label: string;
    score: number;
    maxScore: number;
    status: 'Critical' | 'High' | 'Medium' | 'Moderate' | 'Watch';
  }>;
  invoicePipeline?: {
    invoicesCount: number;
    paymentsCount: number;
    inPipelineCount: number;
    highlightAmount?: string;
    highlightText?: string;
  } | null;
  contractOversight?: {
    contractsCount: number;
    posCount: number;
    alertTitle?: string;
    alertDescription?: string;
  } | null;
  priorities: Array<{
    id: number;
    text: string;
    level: 'High' | 'Medium' | 'Low';
    icon: string;
  }>;
  sourceText: string;
}

interface VendorSpendRiskOverviewProps {
  data: VendorSpendRiskOverviewData;
  onExportPdf?: () => void;
  isExportingPdf?: boolean;
}

export const VendorSpendRiskOverview: React.FC<VendorSpendRiskOverviewProps> = ({
  data,
  onExportPdf,
  isExportingPdf = false,
}) => {
  const { isDark } = useTheme();

  // Helper for KPI card icons
  const renderKpiIcon = (iconName: string) => {
    switch (iconName.toLowerCase()) {
      case 'coins':
      case 'spend':
      case 'amount':
        return <Coins className="w-5 h-5 text-blue-600 dark:text-blue-400" />;
      case 'users':
      case 'vendors':
      case 'suppliers':
        return <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />;
      case 'filetext':
      case 'pos':
      case 'orders':
        return <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400" />;
      case 'file':
      case 'invoices':
      case 'bills':
        return <File className="w-5 h-5 text-blue-600 dark:text-blue-400" />;
      case 'messagesquare':
      case 'rfqs':
      case 'rfq':
        return <MessageSquare className="w-5 h-5 text-blue-600 dark:text-blue-400" />;
      default:
        return <FileSpreadsheet className="w-5 h-5 text-blue-600 dark:text-blue-400" />;
    }
  };

  // Helper for risk item icons
  const renderRiskIcon = (id: string) => {
    switch (id) {
      case 'concentration-risk':
        return <AlertTriangle className="w-4 h-4 text-rose-500 flex-shrink-0" />;
      case 'single-source':
        return <Link className="w-4 h-4 text-orange-500 flex-shrink-0" />;
      case 'vendor-dormancy':
        return <Clock className="w-4 h-4 text-amber-500 flex-shrink-0" />;
      case 'payment-discipline':
        return <CreditCard className="w-4 h-4 text-teal-500 flex-shrink-0" />;
      case 'contract-coverage':
        return <FileCheck className="w-4 h-4 text-blue-500 flex-shrink-0" />;
      default:
        return <AlertTriangle className="w-4 h-4 text-slate-400 flex-shrink-0" />;
    }
  };

  // Helper for risk status badges & progress bars
  const getRiskStyles = (status: string) => {
    switch (status) {
      case 'Critical':
        return {
          bar: 'bg-rose-500',
          badge: 'bg-rose-100 text-rose-700 dark:bg-rose-950/70 dark:text-rose-400 border border-rose-200 dark:border-rose-900',
        };
      case 'High':
        return {
          bar: 'bg-orange-500',
          badge: 'bg-orange-100 text-orange-700 dark:bg-orange-950/70 dark:text-orange-400 border border-orange-200 dark:border-orange-900',
        };
      case 'Medium':
        return {
          bar: 'bg-amber-400',
          badge: 'bg-amber-100 text-amber-700 dark:bg-amber-950/70 dark:text-amber-400 border border-amber-200 dark:border-amber-900',
        };
      case 'Moderate':
        return {
          bar: 'bg-teal-500',
          badge: 'bg-teal-100 text-teal-700 dark:bg-teal-950/70 dark:text-teal-400 border border-teal-200 dark:border-teal-900',
        };
      case 'Watch':
      default:
        return {
          bar: 'bg-blue-500',
          badge: 'bg-blue-100 text-blue-700 dark:bg-blue-950/70 dark:text-blue-400 border border-blue-200 dark:border-blue-900',
        };
    }
  };

  // Helper for priority icons
  const renderPriorityIcon = (iconName: string) => {
    switch (iconName.toLowerCase()) {
      case 'users':
        return <Users className="w-4 h-4 text-slate-600 dark:text-slate-300 flex-shrink-0" />;
      case 'archive':
        return <Archive className="w-4 h-4 text-slate-600 dark:text-slate-300 flex-shrink-0" />;
      case 'filecheck':
        return <FileCheck className="w-4 h-4 text-slate-600 dark:text-slate-300 flex-shrink-0" />;
      case 'arrowup':
        return <ArrowUp className="w-4 h-4 text-slate-600 dark:text-slate-300 flex-shrink-0" />;
      default:
        return <Target className="w-4 h-4 text-slate-600 dark:text-slate-300 flex-shrink-0" />;
    }
  };

  // Helper for priority severity badges
  const getPriorityBadgeStyle = (level: string) => {
    switch (level) {
      case 'High':
        return 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200 dark:border-rose-900';
      case 'Medium':
        return 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-900';
      case 'Low':
      default:
        return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900';
    }
  };

  // Dynamic grid classes for adaptive KPI cards (1, 2, 3, 4, or 5 cards)
  const kpiCount = data.kpiCards?.length || 0;
  const getKpiGridClass = () => {
    if (kpiCount === 1) return 'grid-cols-1';
    if (kpiCount === 2) return 'grid-cols-1 sm:grid-cols-2';
    if (kpiCount === 3) return 'grid-cols-1 sm:grid-cols-3';
    if (kpiCount === 4) return 'grid-cols-2 lg:grid-cols-4';
    return 'grid-cols-2 sm:grid-cols-3 xl:grid-cols-5';
  };

  // Vendor spend bar colors matching the screenshot hierarchy
  const barColors = [
    'bg-blue-600',
    'bg-blue-500',
    'bg-blue-400',
    'bg-sky-400',
    'bg-sky-300',
  ];

  // SVG Donut calculation
  const topPct = Math.min(100, Math.max(0, data.concentration?.topPercentage || 0));
  const radius = 58;
  const strokeWidth = 16;
  const circumference = 2 * Math.PI * radius;
  const topDash = (topPct / 100) * circumference;
  const remainingDash = circumference - topDash;

  // Format currency cleanly without raw decimal noise
  const formatCleanCurrency = (val: number | string, prefix = data.displayCurrency || 'KSh') => {
    if (typeof val === 'number') {
      return `${prefix} ${Math.round(val).toLocaleString()}`;
    }
    const cleanNum = parseFloat(String(val).replace(/[^0-9.]/g, ''));
    if (!isNaN(cleanNum)) {
      return `${prefix} ${Math.round(cleanNum).toLocaleString()}`;
    }
    return String(val);
  };

  const [isFullscreen, setIsFullscreen] = React.useState(false);

  // Esc key and fullscreenchange listener
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [isFullscreen]);

  const toggleFullscreen = () => {
    setIsFullscreen((prev) => {
      const nextState = !prev;
      if (nextState) {
        try {
          if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen().catch(() => {});
          }
        } catch (_) {}
      } else {
        try {
          if (document.fullscreenElement && document.exitFullscreen) {
            document.exitFullscreen().catch(() => {});
          }
        } catch (_) {}
      }
      return nextState;
    });
  };

  return (
    <div
      className={
        isFullscreen
          ? `fixed inset-0 z-[9999] overflow-y-auto bg-slate-100/98 dark:bg-slate-950/98 backdrop-blur-2xl p-4 sm:p-8 lg:p-12 transition-all ${
              isDark ? 'text-slate-100' : 'text-slate-900'
            }`
          : `w-full space-y-6 transition-colors duration-200 ${isDark ? 'text-slate-100' : 'text-slate-900'}`
      }
    >
      <div className={isFullscreen ? 'max-w-[1640px] mx-auto space-y-6' : 'w-full space-y-6'}>
        {/* ═══════════════════════════════════════════════════════════════
            HEADER: TITLE, SUBTITLE & EXPORT ACTION
            ═══════════════════════════════════════════════════════════════ */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              {data.title || 'Vendor Spend & Risk Overview'}
            </h1>
            <p className="text-sm sm:text-base font-medium text-slate-500 dark:text-slate-400 mt-1">
              {data.subtitle || `Procurement intelligence • ${data.date}`}
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
            {/* Company Badge (dropdown chevron removed per user instruction) */}
            <div
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl border text-sm font-semibold shadow-xs ${
                isDark
                  ? 'bg-slate-800/90 border-slate-700 text-slate-200'
                  : 'bg-white border-slate-200 text-slate-700 shadow-xs'
              }`}
            >
              <Building2 className="w-4 h-4 text-slate-500" />
              <span className="truncate max-w-[200px]">{data.companyName || 'HCL PVT. LTD.'}</span>
            </div>

            {/* Fullscreen Toggle Button */}
            <button
              type="button"
              onClick={toggleFullscreen}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-bold border transition-all active:scale-98 shadow-sm cursor-pointer ${
                isFullscreen
                  ? 'bg-blue-600 text-white border-blue-600 shadow-blue-500/20'
                  : isDark
                    ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                    : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
              }`}
              title={isFullscreen ? 'Exit full screen (Esc)' : 'Expand to full screen'}
            >
              {isFullscreen ? (
                <>
                  <Minimize2 className="w-4 h-4" />
                  <span>Exit full screen</span>
                </>
              ) : (
                <>
                  <Maximize2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <span>Full screen</span>
                </>
              )}
            </button>

            {/* Export Report Button */}
            <button
              type="button"
              onClick={onExportPdf}
              disabled={isExportingPdf}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 active:scale-98 transition-all shadow-sm cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isExportingPdf ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Exporting...</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  <span>Export report</span>
                </>
              )}
            </button>
          </div>
        </div>

      {/* ═══════════════════════════════════════════════════════════════
          ROW 1: DYNAMIC & ADAPTIVE KPI CARDS
          (Scales cleanly according to available data: 2, 3, 4, or 5 cards)
          ═══════════════════════════════════════════════════════════════ */}
      {data.kpiCards && data.kpiCards.length > 0 && (
        <div className={`grid gap-3.5 ${getKpiGridClass()}`}>
          {data.kpiCards.map((card) => (
            <div
              key={card.id}
              className={`p-4 sm:p-5 rounded-2xl border transition-all shadow-xs flex items-center gap-3.5 ${
                isDark
                  ? 'bg-slate-900 border-slate-800 hover:border-slate-700'
                  : 'bg-white border-slate-200/90 hover:border-slate-300 shadow-slate-100'
              }`}
            >
              <div
                className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 border ${
                  isDark
                    ? 'bg-blue-950/50 border-blue-900/60'
                    : 'bg-blue-50 border-blue-100 shadow-xs'
                }`}
              >
                {renderKpiIcon(card.icon)}
              </div>
              <div className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-slate-500 dark:text-slate-400 truncate">
                  {card.label}
                </span>
                <span className="block text-lg sm:text-xl xl:text-2xl font-black text-slate-900 dark:text-white tabular-nums tracking-tight mt-0.5 whitespace-nowrap">
                  {typeof card.numericValue === 'number' && card.id === 'total-spend'
                    ? formatCleanCurrency(card.numericValue)
                    : card.value}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          ROW 2: RISK ALERT BANNER (Conditional)
          ═══════════════════════════════════════════════════════════════ */}
      {data.alertBanner && data.alertBanner.message && (
        <div className="flex items-center gap-3 px-4 py-3.5 rounded-xl bg-rose-50/90 dark:bg-rose-950/30 border border-rose-200/80 dark:border-rose-900/60 text-rose-800 dark:text-rose-300 shadow-xs">
          <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400 flex-shrink-0" />
          <p className="text-sm sm:text-base font-semibold leading-relaxed">
            {data.alertBanner.message}
          </p>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          ROW 3: MIDDLE 3-COLUMN CARDS GRID
          - Spend distribution
          - Top concentration Donut Chart
          - Risk assessment Scores
          ═══════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-12 gap-4">
        {/* Card 1: Spend Distribution (xl:col-span-5) */}
        <div
          className={`xl:col-span-5 md:col-span-2 col-span-1 p-5 rounded-2xl border shadow-xs flex flex-col justify-between ${
            isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200/90 shadow-slate-100'
          }`}
        >
          <div>
            <h3 className="text-lg font-extrabold text-slate-900 dark:text-white mb-4">
              Spend distribution
            </h3>

            <div className="space-y-4">
              {data.spendDistribution?.vendors?.map((vendor, idx) => (
                <div key={vendor.id || idx} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-semibold text-slate-800 dark:text-slate-200 truncate flex-1 min-w-0">
                      {vendor.name}
                    </span>
                    <div className="flex items-center gap-3 flex-shrink-0 font-medium">
                      <span className="font-bold text-slate-700 dark:text-slate-300 tabular-nums">
                        {formatCleanCurrency(vendor.spend)}
                      </span>
                      <span className="text-slate-500 dark:text-slate-400 w-9 text-right font-bold tabular-nums">
                        {vendor.percentage}%
                      </span>
                    </div>
                  </div>
                  {/* Progress Bar */}
                  <div className="w-full h-2 rounded-full bg-slate-200/80 dark:bg-slate-800 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        barColors[idx % barColors.length]
                      }`}
                      style={{ width: `${Math.min(100, Math.max(3, vendor.percentage))}%` }}
                    />
                  </div>
                </div>
              ))}

              {/* Other Vendors row if available */}
              {data.spendDistribution?.otherVendors && data.spendDistribution.otherVendors.count > 0 && (
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-semibold text-slate-600 dark:text-slate-400 truncate flex-1 min-w-0">
                      Other {data.spendDistribution.otherVendors.count} vendors
                    </span>
                    <div className="flex items-center gap-3 flex-shrink-0 font-medium">
                      <span className="font-bold text-slate-700 dark:text-slate-300 tabular-nums">
                        {formatCleanCurrency(data.spendDistribution.otherVendors.spend)}
                      </span>
                      <span className="text-slate-500 dark:text-slate-400 w-9 text-right font-bold tabular-nums">
                        {data.spendDistribution.otherVendors.percentage}%
                      </span>
                    </div>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-200/80 dark:bg-slate-800 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-slate-400 dark:bg-slate-600 transition-all duration-500"
                      style={{
                        width: `${Math.min(100, Math.max(3, data.spendDistribution.otherVendors.percentage))}%`,
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          <p className="text-xs sm:text-sm text-slate-400 dark:text-slate-500 mt-4 pt-2">
            {data.spendDistribution?.note || 'Shares rounded.'}
          </p>
        </div>

        {/* Card 2: Top Concentration Donut (xl:col-span-3) */}
        <div
          className={`xl:col-span-3 md:col-span-1 col-span-1 p-5 rounded-2xl border shadow-xs flex flex-col items-center justify-between text-center ${
            isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200/90 shadow-slate-100'
          }`}
        >
          <h3 className="w-full text-left text-lg font-extrabold text-slate-900 dark:text-white mb-2 whitespace-nowrap">
            Top {data.concentration?.topCount || 5} concentration
          </h3>

          {/* Donut Graphic */}
          <div className="relative my-3 flex items-center justify-center">
            <svg
              className="w-36 h-36 transform -rotate-90"
              viewBox="0 0 150 150"
            >
              {/* Background circle (Remaining Share) */}
              <circle
                cx="75"
                cy="75"
                r={radius}
                className="stroke-slate-200 dark:stroke-slate-800"
                strokeWidth={strokeWidth}
                fill="transparent"
              />
              {/* Foreground circle (Top Spend Share) */}
              <circle
                cx="75"
                cy="75"
                r={radius}
                className="stroke-rose-500"
                strokeWidth={strokeWidth}
                strokeDasharray={`${topDash} ${remainingDash}`}
                strokeDashoffset="0"
                strokeLinecap="round"
                fill="transparent"
              />
            </svg>

            {/* Inner Center Content */}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
                ~{data.concentration?.topPercentage || 0}%
              </span>
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                of spend
              </span>
            </div>
          </div>

          {/* Legend */}
          <div className="w-full space-y-2 text-sm text-left pt-2 border-t border-slate-200/80 dark:border-slate-800/80">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 flex-shrink-0" />
                <span className="text-slate-700 dark:text-slate-300 font-semibold truncate">
                  Top {data.concentration?.topCount || 5} vendors
                </span>
              </div>
              <span className="font-bold text-slate-900 dark:text-white tabular-nums">
                ~{data.concentration?.topPercentage || 0}%
              </span>
            </div>

            {data.concentration?.remainingCount > 0 && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-300 dark:bg-slate-700 flex-shrink-0" />
                  <span className="text-slate-600 dark:text-slate-400 font-medium truncate">
                    Remaining {data.concentration?.remainingCount} vendors
                  </span>
                </div>
                <span className="font-bold text-slate-700 dark:text-slate-300 tabular-nums">
                  ~{data.concentration?.remainingPercentage || 0}%
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Card 3: Risk Assessment (xl:col-span-4) */}
        <div
          className={`xl:col-span-4 md:col-span-1 col-span-1 p-5 rounded-2xl border shadow-xs flex flex-col justify-between ${
            isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200/90 shadow-slate-100'
          }`}
        >
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-extrabold text-slate-900 dark:text-white">
                Risk assessment
              </h3>
              <span className="text-xs text-slate-400 dark:text-slate-500 font-medium whitespace-nowrap">
                Report risk scores.
              </span>
            </div>

            <div className="space-y-4">
              {data.riskAssessment?.map((risk) => {
                const styles = getRiskStyles(risk.status);
                return (
                  <div key={risk.id} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
                        {renderRiskIcon(risk.id)}
                        <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                          {risk.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-slate-600 dark:text-slate-400 font-bold tabular-nums">
                          {risk.score}/100
                        </span>
                        <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider ${styles.badge}`}>
                          {risk.status}
                        </span>
                      </div>
                    </div>

                    {/* Score Bar */}
                    <div className="w-full h-2 rounded-full bg-slate-200/80 dark:bg-slate-800 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${styles.bar}`}
                        style={{ width: `${Math.min(100, Math.max(3, risk.score))}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          ROW 4: BOTTOM 3-COLUMN CARDS GRID
          - Invoice pipeline
          - Contract oversight
          - Priorities
          ═══════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {/* Card 4: Invoice Pipeline */}
        {data.invoicePipeline && (
          <div
            className={`p-5 rounded-2xl border shadow-xs flex flex-col justify-between ${
              isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200/90 shadow-slate-100'
            }`}
          >
            <div>
              <div className="flex items-center gap-2 mb-3">
                <FileText className="w-4.5 h-4.5 text-blue-600 dark:text-blue-400" />
                <h3 className="text-lg font-extrabold text-slate-900 dark:text-white">
                  Invoice pipeline
                </h3>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center py-2">
                <div>
                  <span className="block text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tabular-nums">
                    {data.invoicePipeline.invoicesCount}
                  </span>
                  <span className="text-sm text-slate-500 dark:text-slate-400 font-semibold">
                    invoices
                  </span>
                </div>
                <div>
                  <span className="block text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tabular-nums">
                    {data.invoicePipeline.paymentsCount}
                  </span>
                  <span className="text-sm text-slate-500 dark:text-slate-400 font-semibold">
                    payments
                  </span>
                </div>
                <div>
                  <span className="block text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tabular-nums">
                    ~{data.invoicePipeline.inPipelineCount}
                  </span>
                  <span className="text-sm text-slate-500 dark:text-slate-400 font-semibold">
                    in pipeline
                  </span>
                </div>
              </div>
            </div>

            {data.invoicePipeline.highlightAmount && (
              <div
                className={`mt-4 p-3.5 rounded-xl border flex items-center gap-3 ${
                  isDark
                    ? 'bg-blue-950/40 border-blue-900/60 text-blue-300'
                    : 'bg-blue-50/90 border-blue-100 text-blue-900'
                }`}
              >
                <Coins className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                <div className="text-sm">
                  <span className="font-extrabold block text-base">
                    {data.invoicePipeline.highlightAmount}
                  </span>
                  <span className="text-slate-600 dark:text-slate-400 text-xs sm:text-sm">
                    {data.invoicePipeline.highlightText || 'approved invoice awaiting settlement.'}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Card 5: Contract Oversight */}
        {data.contractOversight && (
          <div
            className={`p-5 rounded-2xl border shadow-xs flex flex-col justify-between ${
              isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200/90 shadow-slate-100'
            }`}
          >
            <div>
              <div className="flex items-center gap-2 mb-3">
                <FileCheck className="w-4.5 h-4.5 text-blue-600 dark:text-blue-400" />
                <h3 className="text-lg font-extrabold text-slate-900 dark:text-white">
                  Contract oversight
                </h3>
              </div>

              <div className="grid grid-cols-2 gap-4 text-center py-2">
                <div>
                  <span className="block text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tabular-nums">
                    {data.contractOversight.contractsCount}
                  </span>
                  <span className="text-sm text-slate-500 dark:text-slate-400 font-semibold">
                    contracts
                  </span>
                </div>
                <div>
                  <span className="block text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tabular-nums">
                    {data.contractOversight.posCount}
                  </span>
                  <span className="text-sm text-slate-500 dark:text-slate-400 font-semibold">
                    POs
                  </span>
                </div>
              </div>
            </div>

            <div
              className={`mt-4 p-3.5 rounded-xl border flex items-start gap-2.5 ${
                isDark
                  ? 'bg-amber-950/30 border-amber-900/50 text-amber-300'
                  : 'bg-amber-50/90 border-amber-200/90 text-amber-900'
              }`}
            >
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <span className="font-bold block text-slate-900 dark:text-slate-100 text-sm">
                  {data.contractOversight.alertTitle || 'Formal coverage needs review.'}
                </span>
                <span className="text-slate-600 dark:text-slate-400 text-xs sm:text-sm leading-relaxed block mt-0.5">
                  {data.contractOversight.alertDescription ||
                    'Contracts and purchase orders are not matched for coverage calculation.'}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Card 6: Priorities */}
        {data.priorities && data.priorities.length > 0 && (
          <div
            className={`p-5 rounded-2xl border shadow-xs flex flex-col justify-between ${
              isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200/90 shadow-slate-100'
            }`}
          >
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Target className="w-4.5 h-4.5 text-blue-600 dark:text-blue-400" />
                <h3 className="text-lg font-extrabold text-slate-900 dark:text-white">
                  Priorities
                </h3>
              </div>

              <div className="space-y-3">
                {data.priorities.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1 mr-2">
                      <span
                        className={`w-5.5 h-5.5 rounded-md flex items-center justify-center font-bold text-xs flex-shrink-0 ${
                          isDark ? 'bg-slate-800 text-blue-400' : 'bg-blue-100/70 text-blue-800'
                        }`}
                      >
                        {item.id}
                      </span>
                      {renderPriorityIcon(item.icon)}
                      <span className="truncate text-slate-800 dark:text-slate-200 font-semibold">
                        {item.text}
                      </span>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-bold flex-shrink-0 ${getPriorityBadgeStyle(
                        item.level
                      )}`}
                    >
                      {item.level}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          FOOTER: CONFIDENTIALITY & PROCNEX BRANDING
          ═══════════════════════════════════════════════════════════════ */}
      <div className="flex items-center justify-between text-xs sm:text-sm text-slate-400 dark:text-slate-500 pt-3 border-t border-slate-200 dark:border-slate-800">
        <span>{data.sourceText || 'Source: Vendor Spend & Risk Analysis • Confidential.'}</span>
        <span className="font-bold text-slate-500 dark:text-slate-400">
          Procnex AI | {data.companyName || 'HCL PVT. LTD.'}
        </span>
      </div>
    </div>
  </div>
  );
};
