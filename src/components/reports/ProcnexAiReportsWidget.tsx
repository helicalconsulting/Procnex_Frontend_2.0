import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  Send,
  FileText,
  Download,
  Clock,
  AlertCircle,
  RefreshCw,
  Bot,
  User,
  Trash2,
  Copy,
  Check,
  BarChart3,
  ShieldCheck,
  Zap,
  TrendingUp,
  Package,
  Receipt,
  FileCheck,
  Search,
  ArrowRight,
  ArrowDown,
  History,
  Star,
  Eye,
  X,
  ExternalLink,
  Mic,
  MicOff
} from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useBranding } from '../../context/BrandingContext';
import { downloadAiReportAsPdf } from '../../utils/pdfDownload';

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  pdfUrl?: string;
  modelUsed?: string;
  isReport?: boolean;
}

interface ReportHistoryItem {
  id: string;
  title: string;
  prompt: string;
  summaryText?: string;
  cloudinaryUrl: string;
  modelUsed?: string;
  tokensUsed?: number;
  isFavorite?: boolean;
  createdAt: string;
}

interface QuotaInfo {
  usedReports: number;
  maxReports: number;
  usedTokens: number;
  maxTokens: number;
}

interface PreBuiltAgent {
  id: string;
  title: string;
  description: string;
  category: string;
  status: string;
  icon: React.ReactNode;
  prompt: string;
  actionLabel: string;
  iconBg: string;
  statusBadge: string;
  cardBorder: string;
  actionBtn: string;
}

export function ProcnexAiReportsWidget() {
  const { isDark } = useTheme();
  const { logoUrl, companyName } = useBranding();
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [userName, setUserName] = useState('User');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [liveStreamText, setLiveStreamText] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [reportsHistory, setReportsHistory] = useState<ReportHistoryItem[]>([]);
  const [quota, setQuota] = useState<QuotaInfo | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [downloadingPdfId, setDownloadingPdfId] = useState<string | null>(null);
  const [isHistoryDrawerOpen, setIsHistoryDrawerOpen] = useState(false);
  const [historySearchQuery, setHistorySearchQuery] = useState('');
  const [historyTab, setHistoryTab] = useState<'all' | 'favorites'>('all');
  const [viewingReport, setViewingReport] = useState<ReportHistoryItem | null>(null);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  const filteredHistoryList = reportsHistory.filter(rpt => {
    if (historyTab === 'favorites' && !rpt.isFavorite) return false;
    if (!historySearchQuery.trim()) return true;
    const q = historySearchQuery.toLowerCase();
    return (
      (rpt.title && rpt.title.toLowerCase().includes(q)) ||
      (rpt.modelUsed && rpt.modelUsed.toLowerCase().includes(q)) ||
      (rpt.prompt && rpt.prompt.toLowerCase().includes(q))
    );
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const latestUserMsgRef = useRef<HTMLDivElement>(null);
  const isAutoScrollEnabledRef = useRef(true);
  const [showScrollBottomBtn, setShowScrollBottomBtn] = useState(false);

  useEffect(() => {
    fetchHistoryAndQuota();
    try {
      const userRaw = localStorage.getItem('heliflow_user');
      if (userRaw) {
        const u = JSON.parse(userRaw);
        setUserName(u.fullName || u.name || u.username || 'User');
      }
    } catch (e) {
      // Ignore parse error
    }

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {}
      }
    };
  }, []);

  const promptRef = useRef(prompt);
  useEffect(() => {
    promptRef.current = prompt;
  }, [prompt]);

  const toggleListening = () => {
    if (isListening) {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {}
      }
      setIsListening(false);
      return;
    }

    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition ||
      (window as any).mozSpeechRecognition ||
      (window as any).msSpeechRecognition;

    if (!SpeechRecognition) {
      setErrorMessage('Audio to text / Speech recognition is not supported in this browser. Please use Chrome, Edge, or Safari.');
      return;
    }

    try {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (e) {}
      }

      const recognition = new SpeechRecognition();
      recognitionRef.current = recognition;
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = navigator.language || 'en-US';

      // Capture initial text snapshot before recognition starts
      const initialPrompt = (promptRef.current || '').trim();

      recognition.onstart = () => {
        setIsListening(true);
        setErrorMessage(null);
      };

      recognition.onresult = (event: any) => {
        let fullTranscript = '';
        for (let i = 0; i < event.results.length; i++) {
          const item = event.results[i];
          if (item && item[0] && item[0].transcript) {
            fullTranscript += item[0].transcript;
          }
        }
        const spoken = fullTranscript.trim();
        if (spoken) {
          // If the spoken text already starts with the initial text, do not duplicate
          if (initialPrompt && spoken.toLowerCase().startsWith(initialPrompt.toLowerCase())) {
            setPrompt(spoken);
          } else if (initialPrompt) {
            setPrompt(`${initialPrompt} ${spoken}`);
          } else {
            setPrompt(spoken);
          }
        }
      };

      recognition.onerror = (event: any) => {
        console.warn('Speech recognition error:', event.error);
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          setErrorMessage('Microphone access was denied. Please allow microphone permissions in your browser.');
        }
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.start();
    } catch (err: any) {
      console.error('Error starting speech recognition:', err);
      setErrorMessage('Could not activate microphone. Please check your browser audio permissions.');
      setIsListening(false);
    }
  };

  // ChatGPT-style User Scroll Tracking:
  // If the user scrolls up to read, disable aggressive autoscrolling and show floating "Scroll to bottom" button
  useEffect(() => {
    const handleScroll = () => {
      const scrollPosition = window.innerHeight + window.scrollY;
      const distanceFromBottom = document.documentElement.scrollHeight - scrollPosition;
      const isNearBottom = distanceFromBottom <= 180;

      if (!isNearBottom) {
        isAutoScrollEnabledRef.current = false;
        if (messages.length > 0 || isGenerating) {
          setShowScrollBottomBtn(true);
        }
      } else {
        isAutoScrollEnabledRef.current = true;
        setShowScrollBottomBtn(false);
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [messages.length, isGenerating]);

  // ChatGPT-style gentle follow during live streaming
  useEffect(() => {
    if (!isGenerating) return;
    if (!isAutoScrollEnabledRef.current) return;

    const rafId = requestAnimationFrame(() => {
      const scrollPosition = window.innerHeight + window.scrollY;
      const distanceFromBottom = document.documentElement.scrollHeight - scrollPosition;

      // Only follow if the user hasn't scrolled up away from bottom
      if (distanceFromBottom < 320) {
        window.scrollTo({
          top: document.documentElement.scrollHeight,
          behavior: 'smooth'
        });
      }
    });

    return () => cancelAnimationFrame(rafId);
  }, [liveStreamText, isGenerating]);

  const scrollToBottom = (smooth = true) => {
    isAutoScrollEnabledRef.current = true;
    setShowScrollBottomBtn(false);
    window.scrollTo({
      top: document.documentElement.scrollHeight,
      behavior: smooth ? 'smooth' : 'auto'
    });
  };

  const getApiUrl = (path: string): string => {
    const rawBase = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    if (rawBase.endsWith('/api') && cleanPath.startsWith('/api/')) {
      return `${rawBase}${cleanPath.slice(4)}`;
    }
    return `${rawBase}${cleanPath}`;
  };

  const getAuthToken = (): string => {
    return (
      localStorage.getItem('heliflow_token') ||
      localStorage.getItem('token') ||
      localStorage.getItem('auth_token') ||
      localStorage.getItem('heliflow_vendor_token') ||
      ''
    );
  };

  const fetchHistoryAndQuota = async () => {
    try {
      const token = getAuthToken();
      const headers = { Authorization: `Bearer ${token}` };

      const [histRes, quotaRes] = await Promise.all([
        fetch(getApiUrl('/api/ai-reports-generator/history'), { headers }),
        fetch(getApiUrl('/api/ai-reports-generator/quota'), { headers })
      ]);

      if (histRes.ok) {
        const histData = await histRes.json();
        if (histData.success && Array.isArray(histData.data)) {
          setReportsHistory(histData.data);
        }
      }

      if (quotaRes.ok) {
        const qData = await quotaRes.json();
        if (qData.success && qData.data?.quota) {
          setQuota(qData.data.quota);
        }
      }
    } catch (e) {
      console.warn('Could not fetch AI report history/quota:', e);
    }
  };

  const handleSendMessage = async (queryText: string) => {
    if (!queryText.trim() || isGenerating) return;

    if (isListening && recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {}
      setIsListening(false);
    }

    const userMsg: ChatMessage = {
      id: `usr_${Date.now()}`,
      sender: 'user',
      text: queryText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, userMsg]);
    setPrompt('');
    setIsGenerating(true);
    setErrorMessage(null);
    setStatusMessage('Connecting to Procnex Intelligence Engine...');
    setLiveStreamText('');
    isAutoScrollEnabledRef.current = true;
    setShowScrollBottomBtn(false);

    // Smoothly bring the newly submitted user prompt into view so the user can comfortably watch the answer generate from line 1
    setTimeout(() => {
      if (latestUserMsgRef.current) {
        latestUserMsgRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 80);

    try {
      const token = getAuthToken();
      
      // Multi-Turn Memory: Include last 5 conversation messages for contextual continuity
      const historyWindow = messages.slice(-5).map(m => ({
        role: m.sender === 'user' ? 'user' : 'model',
        text: m.text.length > 800 ? m.text.slice(0, 800) + '...' : m.text,
      }));

      const response = await fetch(getApiUrl('/api/ai-reports-generator/stream'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          query: queryText,
          history: historyWindow
        })
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || 'Failed to complete request');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) throw new Error('Unreadable response body');

      let buffer = '';
      let fullText = '';
      let generatedPdfUrl: string | undefined = undefined;
      let modelUsed: string | undefined = undefined;
      let isReportMsg: boolean | undefined = undefined;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.replace(/^data: /, '').trim();
            if (!dataStr) continue;

            try {
              const payload = JSON.parse(dataStr);

              if (payload.isLocalResponse) {
                fullText = payload.summaryText || payload.text || fullText;
                setLiveStreamText(fullText);
                setStatusMessage('');
                isReportMsg = false;
              } else if (payload.type === 'status') {
                setStatusMessage(payload.message);
              } else if (payload.type === 'delta') {
                fullText += payload.text;
                setLiveStreamText(fullText);
              } else if (payload.type === 'pdf_ready' || payload.type === 'complete') {
                generatedPdfUrl = payload.url || payload.pdfUrl;
                modelUsed = payload.modelUsed;
                if (payload.isReport !== undefined) {
                  isReportMsg = payload.isReport;
                }
                setStatusMessage('');
                fetchHistoryAndQuota();
              } else if (payload.type === 'error') {
                throw new Error(payload.message || 'Error occurred');
              }
            } catch (pErr) {
              // Ignore partial JSON chunks
            }
          }
        }
      }

      const assistantMsg: ChatMessage = {
        id: `ast_${Date.now()}`,
        sender: 'assistant',
        text: fullText || 'Report processing completed.',
        pdfUrl: generatedPdfUrl,
        modelUsed: modelUsed || 'Hybrid Engine (80% Gemini / 20% DeepSeek)',
        isReport: isReportMsg !== undefined ? isReportMsg : true,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      setMessages(prev => [...prev, assistantMsg]);
      setLiveStreamText('');
    } catch (err: any) {
      setErrorMessage(err.message || 'Request failed');
      setStatusMessage('');
    } finally {
      setIsGenerating(false);
    }
  };

  const isMessageReport = (msg: ChatMessage): boolean => {
    if (msg.sender !== 'assistant') return false;
    if (msg.isReport === false) return false;

    const text = msg.text.trim();
    if (text.length < 60) return false;

    // Small-talk / greetings / non-report canned answers
    if (
      text.startsWith('Hello! Main aapka') ||
      text.startsWith('Main bilkul badiya') ||
      text.startsWith('Aapka swagat hai') ||
      text.startsWith('Goodbye!') ||
      text.includes('⚠️ **Security Notice:**') ||
      text.includes('Maine aapka message')
    ) {
      return false;
    }

    const hasMarkdownTable = text.includes('|') && text.split('\n').some(line => line.trim().startsWith('|'));
    const hasReportHeaders = /^#+\s+/m.test(text);

    return hasMarkdownTable || hasReportHeaders;
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const clearChat = () => {
    setMessages([]);
    setLiveStreamText('');
    setShowScrollBottomBtn(false);
    isAutoScrollEnabledRef.current = true;
  };

  const handleDeleteReport = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      const token = getAuthToken();
      const res = await fetch(getApiUrl(`/api/ai-reports-generator/${id}`), {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setReportsHistory(prev => prev.filter(r => r.id !== id));
        fetchHistoryAndQuota();
      }
    } catch (err) {
      console.error('Failed to delete report:', err);
    }
  };

  const handleToggleFavorite = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      // Optimistic state update
      setReportsHistory(prev =>
        prev.map(r => (r.id === id ? { ...r, isFavorite: !r.isFavorite } : r))
      );

      const token = getAuthToken();
      const res = await fetch(getApiUrl(`/api/ai-reports-generator/${id}/favorite`), {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) {
        fetchHistoryAndQuota();
      }
    } catch (err) {
      console.error('Failed to toggle favorite status:', err);
      fetchHistoryAndQuota();
    }
  };

  const handleDownloadPdf = async (
    reportText: string,
    reportId: string,
    fallbackTitle = 'Procnex_Report',
    promptText?: string,
    modelUsed?: string
  ) => {
    try {
      setDownloadingPdfId(reportId);
      const titleMatch = reportText.match(/^#\s+(.+)$/m);
      const cleanTitle = titleMatch ? titleMatch[1].replace(/[*#]/g, '').trim() : fallbackTitle;
      const safeFileName = cleanTitle.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50) || 'Procnex_Report';
      const activeCompanyName = companyName || 'Helical Consulting';

      // If downloading from a live chat message (not an existing DB saved report), save & archive it to backend to count in quota & history
      if (reportId.startsWith('ast_') || reportId.startsWith('usr_')) {
        const token = getAuthToken();
        try {
          await fetch(getApiUrl('/api/ai-reports-generator/save-pdf'), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({
              title: cleanTitle,
              prompt: promptText || cleanTitle,
              summaryText: reportText,
              modelUsed: modelUsed || 'Hybrid Engine (80% Gemini / 20% DeepSeek)'
            })
          });
        } catch (saveErr) {
          console.warn('Failed to archive PDF report to server:', saveErr);
        }
      }

      await downloadAiReportAsPdf(reportText, safeFileName, activeCompanyName);
      await fetchHistoryAndQuota();
    } catch (err: any) {
      console.error('Failed to download report PDF:', err);
      setErrorMessage('Could not download PDF. Please try again.');
    } finally {
      setDownloadingPdfId(null);
    }
  };

  const preBuiltAgents: PreBuiltAgent[] = [
    {
      id: 'multi-module-status',
      title: 'Multi-Module Status Matrix',
      description: 'Audit closed/open RFQs, active quotations, approved, rejected, and returned records across all modules.',
      category: 'status',
      status: 'Cross-Module',
      icon: <BarChart3 className="w-5 h-5 text-violet-400" />,
      prompt: 'Closed RFQs, opened RFQs, active quotations, approved, rejected, returned status breakdown har module ka batao in full table format',
      actionLabel: 'Audit All Modules',
      iconBg: isDark ? 'bg-violet-500/15 border-violet-500/30' : 'bg-violet-50 border-violet-200',
      statusBadge: isDark ? 'bg-violet-500/10 text-violet-300 border-violet-500/30' : 'bg-violet-50 text-violet-700 border-violet-200',
      cardBorder: isDark ? 'hover:border-violet-500/50 hover:shadow-violet-950/40' : 'hover:border-violet-400 hover:shadow-violet-100',
      actionBtn: isDark ? 'bg-violet-500/15 hover:bg-violet-600 text-violet-300 hover:text-white border-violet-500/30' : 'bg-violet-50 hover:bg-violet-600 text-violet-700 hover:text-white border-violet-200'
    },
    {
      id: 'rfq-lifecycle',
      title: 'RFQs & Quotations Lifecycle',
      description: 'Audit Closed vs Opened RFQs, Active Quotations, Awarded bids, and Return/Revision requests.',
      category: 'sourcing',
      status: 'Lifecycle',
      icon: <FileCheck className="w-5 h-5 text-amber-400" />,
      prompt: 'Closed RFQs, opened RFQs, active quotations, approved, rejected, and returned quotations breakdown in full table format',
      actionLabel: 'Review RFQs',
      iconBg: isDark ? 'bg-amber-500/15 border-amber-500/30' : 'bg-amber-50 border-amber-200',
      statusBadge: isDark ? 'bg-amber-500/10 text-amber-300 border-amber-500/30' : 'bg-amber-50 text-amber-700 border-amber-200',
      cardBorder: isDark ? 'hover:border-amber-500/50 hover:shadow-amber-950/40' : 'hover:border-amber-400 hover:shadow-amber-100',
      actionBtn: isDark ? 'bg-amber-500/15 hover:bg-amber-600 text-amber-300 hover:text-white border-amber-500/30' : 'bg-amber-50 hover:bg-amber-600 text-amber-700 hover:text-white border-amber-200'
    },
    {
      id: 'po-approvals',
      title: 'PO Approvals & Returns Audit',
      description: 'Track Approved, Rejected, Returned, and Open Purchase Orders with complete vendor and value audit.',
      category: 'orders',
      status: 'Approvals',
      icon: <Package className="w-5 h-5 text-blue-400" />,
      prompt: 'Approved, rejected, returned, open and closed purchase orders status breakdown in full table format',
      actionLabel: 'Audit PO Status',
      iconBg: isDark ? 'bg-blue-500/15 border-blue-500/30' : 'bg-blue-50 border-blue-200',
      statusBadge: isDark ? 'bg-blue-500/10 text-blue-300 border-blue-500/30' : 'bg-blue-50 text-blue-700 border-blue-200',
      cardBorder: isDark ? 'hover:border-blue-500/50 hover:shadow-blue-950/40' : 'hover:border-blue-400 hover:shadow-blue-100',
      actionBtn: isDark ? 'bg-blue-500/15 hover:bg-blue-600 text-blue-300 hover:text-white border-blue-500/30' : 'bg-blue-50 hover:bg-blue-600 text-blue-700 hover:text-white border-blue-200'
    },
    {
      id: 'invoice-voucher-reconcile',
      title: 'Invoices & Payment Vouchers',
      description: 'Audit Approved, Paid, Unpaid, Rejected, and Returned Invoices alongside Payment Vouchers.',
      category: 'finance',
      status: 'Reconciliation',
      icon: <Receipt className="w-5 h-5 text-emerald-400" />,
      prompt: 'Approved, unpaid, paid, rejected and returned purchase invoices and payment vouchers audit report in full table format',
      actionLabel: 'Audit Invoices & Pay',
      iconBg: isDark ? 'bg-emerald-500/15 border-emerald-500/30' : 'bg-emerald-50 border-emerald-200',
      statusBadge: isDark ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' : 'bg-emerald-50 text-emerald-700 border-emerald-200',
      cardBorder: isDark ? 'hover:border-emerald-500/50 hover:shadow-emerald-950/40' : 'hover:border-emerald-400 hover:shadow-emerald-100',
      actionBtn: isDark ? 'bg-emerald-500/15 hover:bg-emerald-600 text-emerald-300 hover:text-white border-emerald-500/30' : 'bg-emerald-50 hover:bg-emerald-600 text-emerald-700 hover:text-white border-emerald-200'
    },
    {
      id: 'vendor-spend',
      title: 'Vendor Spend & Risk Analysis',
      description: 'Comprehensive spend analysis by supplier with rating metrics and order volume.',
      category: 'procurement',
      status: 'In Progress',
      icon: <TrendingUp className="w-5 h-5 text-sky-400" />,
      prompt: 'Top 5 vendor spend summary with rating & PO count breakdown report in full table format',
      actionLabel: 'Analyze Spend',
      iconBg: isDark ? 'bg-sky-500/15 border-sky-500/30' : 'bg-sky-50 border-sky-200',
      statusBadge: isDark ? 'bg-sky-500/10 text-sky-300 border-sky-500/30' : 'bg-sky-50 text-sky-700 border-sky-200',
      cardBorder: isDark ? 'hover:border-sky-500/50 hover:shadow-sky-950/40' : 'hover:border-sky-400 hover:shadow-sky-100',
      actionBtn: isDark ? 'bg-sky-500/15 hover:bg-sky-600 text-sky-300 hover:text-white border-sky-500/30' : 'bg-sky-50 hover:bg-sky-600 text-sky-700 hover:text-white border-sky-200'
    },
    {
      id: 'spend-compare',
      title: 'Quarterly Spend Comparison',
      description: 'Deep-dive variance analytics comparing Q1 vs Q2 procurement expenditures.',
      category: 'procurement',
      status: 'Variance',
      icon: <BarChart3 className="w-5 h-5 text-indigo-400" />,
      prompt: 'Q1 vs Q2 vendor spend comparison variance analysis report in full table format',
      actionLabel: 'Compare Data',
      iconBg: isDark ? 'bg-indigo-500/15 border-indigo-500/30' : 'bg-indigo-50 border-indigo-200',
      statusBadge: isDark ? 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30' : 'bg-indigo-50 text-indigo-700 border-indigo-200',
      cardBorder: isDark ? 'hover:border-indigo-500/50 hover:shadow-indigo-950/40' : 'hover:border-indigo-400 hover:shadow-indigo-100',
      actionBtn: isDark ? 'bg-indigo-500/15 hover:bg-indigo-600 text-indigo-300 hover:text-white border-indigo-500/30' : 'bg-indigo-50 hover:bg-indigo-600 text-indigo-700 hover:text-white border-indigo-200'
    }
  ];

  const filteredAgents = preBuiltAgents.filter(a => {
    const matchesCategory = selectedCategory === 'all' || a.category === selectedCategory;
    const matchesSearch = searchQuery === '' ||
      a.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const parseInlineMarkdown = (rawText: string, isUser = false): React.ReactNode => {
    if (!rawText) return null;
    // Tokenize by bold (**text**), italic (*text*), and inline code (`text`)
    const tokens = rawText.split(/(\*\*[^*]+?\*\*|\*[^*]+?\*|`[^`]+?`)/g);

    return tokens.map((token, i) => {
      if (!token) return null;
      if (token.startsWith('**') && token.endsWith('**') && token.length >= 4) {
        const inner = token.slice(2, -2);
        return (
          <strong
            key={i}
            className={`font-semibold ${
              isUser ? 'text-white font-semibold' : isDark ? 'text-slate-100 font-semibold' : 'text-slate-900 font-semibold'
            }`}
          >
            {inner}
          </strong>
        );
      }
      if (token.startsWith('*') && token.endsWith('*') && token.length >= 2) {
        const inner = token.slice(1, -1);
        return (
          <em
            key={i}
            className={`italic ${
              isUser ? 'text-white/90' : isDark ? 'text-slate-300' : 'text-slate-600'
            }`}
          >
            {inner}
          </em>
        );
      }
      if (token.startsWith('`') && token.endsWith('`') && token.length >= 2) {
        const inner = token.slice(1, -1);
        return (
          <code
            key={i}
            className={`px-1.5 py-0.5 rounded text-[12px] font-mono ${
              isDark ? 'bg-slate-800 text-sky-300 border border-slate-700' : 'bg-slate-100 text-sky-700 border border-slate-200'
            }`}
          >
            {inner}
          </code>
        );
      }
      // If any lone stray asterisks remain, strip them cleanly
      const cleaned = token.replace(/\*\*/g, '').replace(/(?<!\w)\*(?!\w)/g, '');
      return cleaned;
    });
  };

  const renderFormattedMarkdown = (md: string, isUserMessage = false) => {
    const lines = md.split('\n');
    let inTable = false;
    let tableHeaders: string[] = [];
    let tableRows: string[][] = [];
    const elements: React.ReactNode[] = [];

    const flushTable = (key: number) => {
      if (tableHeaders.length > 0 || tableRows.length > 0) {
        elements.push(
          <div
            key={`tbl-${key}`}
            className={`my-4 overflow-x-auto rounded-xl border shadow-sm ${
              isDark
                ? 'border-slate-800 bg-slate-950/70'
                : 'border-slate-200 bg-white'
            }`}
          >
            <table className="w-full text-left border-collapse font-sans">
              {tableHeaders.length > 0 && (
                <thead>
                  <tr className={isDark ? 'bg-slate-900/90 text-slate-200 border-b border-slate-800' : 'bg-slate-50 text-slate-800 border-b border-slate-200'}>
                    {tableHeaders.map((h, i) => (
                      <th key={i} className="px-3.5 py-2.5 font-semibold text-xs tracking-normal">
                        {parseInlineMarkdown(h, isUserMessage)}
                      </th>
                    ))}
                  </tr>
                </thead>
              )}
              <tbody className={`divide-y text-xs sm:text-[13px] ${isDark ? 'divide-slate-800/80' : 'divide-slate-100'}`}>
                {tableRows.map((row, rIdx) => (
                  <tr key={rIdx} className={`transition-colors ${isDark ? 'hover:bg-slate-800/40' : 'hover:bg-slate-50'}`}>
                    {row.map((cell, cIdx) => (
                      <td key={cIdx} className={`px-3.5 py-2.5 font-sans leading-normal font-normal ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                        {parseInlineMarkdown(cell, isUserMessage)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      tableHeaders = [];
      tableRows = [];
      inTable = false;
    };

    lines.forEach((line, idx) => {
      const trimmed = line.trim();

      // Divider line
      if (trimmed === '---' || trimmed === '***' || trimmed === '___') {
        if (inTable) flushTable(idx);
        elements.push(
          <div
            key={`hr-${idx}`}
            className={`my-3 border-t ${isDark ? 'border-slate-800/80' : 'border-slate-200'}`}
          />
        );
        return;
      }

      if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
        if (trimmed.includes('---')) return;
        const cells = trimmed.split('|').slice(1, -1).map(c => c.trim());
        if (!inTable) {
          inTable = true;
          tableHeaders = cells;
        } else {
          tableRows.push(cells);
        }
      } else {
        if (inTable) {
          flushTable(idx);
        }
        if (trimmed.startsWith('### ')) {
          elements.push(
            <h4
              key={idx}
              className={`text-xs sm:text-[13px] font-semibold tracking-normal mt-3.5 mb-1.5 ${
                isUserMessage ? 'text-white' : isDark ? 'text-sky-400' : 'text-sky-700'
              }`}
            >
              {parseInlineMarkdown(trimmed.slice(4), isUserMessage)}
            </h4>
          );
        } else if (trimmed.startsWith('## ')) {
          elements.push(
            <h3
              key={idx}
              className={`text-sm sm:text-base font-semibold mt-4 mb-2 border-b pb-1.5 ${
                isUserMessage
                  ? 'text-white border-white/20'
                  : isDark
                    ? 'text-slate-100 border-slate-800'
                    : 'text-slate-900 border-slate-200'
              }`}
            >
              {parseInlineMarkdown(trimmed.slice(3), isUserMessage)}
            </h3>
          );
        } else if (trimmed.startsWith('# ')) {
          elements.push(
            <h2
              key={idx}
              className={`text-base sm:text-lg font-bold mt-5 mb-2.5 ${
                isUserMessage ? 'text-white' : isDark ? 'text-white' : 'text-slate-900'
              }`}
            >
              {parseInlineMarkdown(trimmed.slice(2), isUserMessage)}
            </h2>
          );
        } else if (
          trimmed.startsWith('- ') ||
          trimmed.startsWith('* ') ||
          trimmed.startsWith('• ') ||
          trimmed.startsWith('+ ')
        ) {
          const bulletContent = trimmed.replace(/^[-*•+]\s*/, '');
          elements.push(
            <li
              key={idx}
              className={`ml-5 list-disc my-1 text-[13.5px] sm:text-[14px] leading-relaxed font-sans ${
                isUserMessage ? 'text-white' : isDark ? 'text-slate-200' : 'text-slate-700'
              }`}
            >
              {parseInlineMarkdown(bulletContent, isUserMessage)}
            </li>
          );
        } else if (trimmed.length > 0) {
          elements.push(
            <p
              key={idx}
              className={`my-1.5 text-[13.5px] sm:text-[14px] leading-relaxed font-sans font-normal ${
                isUserMessage ? 'text-white font-normal' : isDark ? 'text-slate-200' : 'text-slate-700'
              }`}
            >
              {parseInlineMarkdown(trimmed, isUserMessage)}
            </p>
          );
        }
      }
    });

    if (inTable) {
      flushTable(9999);
    }

    return elements;
  };

  return (
    <div className={`w-full space-y-8 font-sans pb-16 transition-colors duration-200 ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>
      {/* ═══════════════════════════════════════════════════════════════
          TOP BAR: PREVIOUSLY GENERATED REPORTS BUTTON
          ═══════════════════════════════════════════════════════════════ */}
      <div className="flex items-center justify-end pt-1 pb-1">
        {/* Top Right: Previously Generated Reports Button */}
        <button
          onClick={() => setIsHistoryDrawerOpen(true)}
          className={`group flex items-center gap-2.5 px-4 py-2.5 rounded-2xl text-xs font-semibold border shadow-md transition-all cursor-pointer ${
            isDark
              ? 'bg-slate-900/90 border-slate-700/80 text-slate-200 hover:border-sky-500/60 hover:bg-slate-800 hover:text-white hover:shadow-sky-900/20'
              : 'bg-white border-slate-200 text-slate-700 hover:border-sky-400 hover:bg-sky-50/60 hover:text-sky-700 hover:shadow-sky-100'
          }`}
          title="View all previously generated reports"
        >
          <Clock className="w-4 h-4 text-sky-400 group-hover:rotate-12 transition-transform" />
          <span>Previously Generated Reports</span>
          {reportsHistory.length > 0 && (
            <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
              isDark
                ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                : 'bg-sky-100 text-sky-700 border border-sky-200'
            }`}>
              {reportsHistory.length}
            </span>
          )}
          {reportsHistory.some(r => r.isFavorite) && (
            <span className="flex items-center gap-1 text-[11px] font-bold text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded-full border border-amber-500/30">
              <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
              <span>{reportsHistory.filter(r => r.isFavorite).length}</span>
            </span>
          )}
        </button>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          EXECUTIVE SAP-GRADE INTELLIGENCE COMMAND HUB
          ═══════════════════════════════════════════════════════════════ */}
      <div className="flex flex-col items-center justify-center text-center pt-2 pb-2 space-y-4 w-full max-w-4xl mx-auto">
        {/* Official Procnex Logo & Enterprise Status */}
        <div className="flex flex-col items-center gap-3">
          <div className="relative flex items-center justify-center">
            {/* Ambient Glow Aura */}
            <div className="absolute -inset-2 rounded-full bg-gradient-to-tr from-sky-500 via-blue-600 to-indigo-600 opacity-50 blur-lg" />
            
            {/* Logo Badge Container */}
            <div
              className={`relative w-14 h-14 sm:w-16 sm:h-16 rounded-2xl p-2.5 flex items-center justify-center border shadow-xl backdrop-blur-xl transition-all duration-200 ${
                isDark
                  ? 'bg-slate-900/90 border-sky-500/40 shadow-sky-950/60 ring-1 ring-sky-500/30'
                  : 'bg-white border-sky-200 shadow-sky-200/50 ring-1 ring-sky-100'
              }`}
            >
              <img
                src={logoUrl || '/Procnex-logo.jpeg'}
                alt="Procnex Official Logo"
                className="w-full h-full object-contain rounded-xl"
                onError={e => {
                  const target = e.currentTarget;
                  if (!target.src.endsWith('/Procnex-logo.jpeg')) {
                    target.src = '/Procnex-logo.jpeg';
                  }
                }}
              />
            </div>
          </div>
        </div>

        {/* Executive Title */}
        <div className="space-y-1.5">
          <h1 className={`text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
            Procurement & Sourcing <span className="bg-gradient-to-r from-sky-400 via-blue-400 to-indigo-400 bg-clip-text text-transparent">Intelligence Hub</span>
          </h1>
          <p className={`text-xs sm:text-sm max-w-2xl mx-auto font-normal leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
            Autonomous multi-engine audit, supplier spend analytics, and automated compliance reporting across purchase orders, invoices, and RFQs.
          </p>
        </div>

        {/* ═══════════════════════════════════════════════════════════════
            NORMAL ON-SCREEN CHAT STREAM (Rendered Above Query Box)
            ═══════════════════════════════════════════════════════════════ */}
        {(messages.length > 0 || isGenerating) && (
          <div className="w-full space-y-6 pt-3 pb-3 text-left">
            {/* Session Toolbar */}
            <div className="flex items-center justify-between px-2 text-xs">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className={`font-semibold tracking-wide ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                  Live AI Intelligence Stream
                </span>
              </div>
              <button
                onClick={clearChat}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                  isDark
                    ? 'text-slate-400 hover:text-rose-400 hover:bg-slate-800/80 border border-slate-800'
                    : 'text-slate-500 hover:text-rose-600 hover:bg-slate-100 border border-slate-200'
                }`}
                title="Clear current chat conversation"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear Chat</span>
              </button>
            </div>

            {/* Conversation Messages */}
            <div className="space-y-6">
              {messages.map((msg, idx) => {
                const lastUserMsgIdx = messages.map(m => m.sender).lastIndexOf('user');
                return (
                  <div
                    key={msg.id}
                    ref={idx === lastUserMsgIdx ? latestUserMsgRef : null}
                    className={`flex gap-3.5 ${msg.sender === 'user' ? 'justify-end scroll-mt-28' : 'justify-start'}`}
                  >
                  {msg.sender === 'assistant' && (
                    <div className={`w-9 h-9 rounded-2xl flex items-center justify-center flex-shrink-0 mt-1 shadow-md border overflow-hidden p-1.5 ${
                      isDark ? 'bg-slate-900 border-sky-500/40 shadow-sky-950/40' : 'bg-white border-sky-200 shadow-sky-100'
                    }`}>
                      <img
                        src={logoUrl || '/Procnex-logo.jpeg'}
                        alt="Procnex"
                        className="w-full h-full object-contain rounded-lg"
                        onError={e => {
                          const target = e.currentTarget;
                          if (!target.src.endsWith('/Procnex-logo.jpeg')) {
                            target.src = '/Procnex-logo.jpeg';
                          }
                        }}
                      />
                    </div>
                  )}

                  <div
                    className={`group relative rounded-2xl transition-all shadow-md ${
                      msg.sender === 'user'
                        ? 'max-w-[80%] bg-gradient-to-r from-sky-600 to-blue-600 text-white rounded-br-none shadow-sky-600/20 px-4 py-2.5 text-sm'
                        : isDark
                          ? 'max-w-[92%] sm:max-w-[88%] bg-slate-900/90 border border-slate-800 text-slate-200 rounded-bl-none shadow-slate-950/40 p-4 text-sm'
                          : 'max-w-[92%] sm:max-w-[88%] bg-white border border-slate-200 text-slate-800 rounded-bl-none shadow-slate-100 p-4 text-sm'
                    }`}
                  >
                    {msg.sender === 'assistant' ? (
                      <div className={`flex items-center justify-between gap-4 mb-2.5 border-b pb-1.5 text-[11px] ${
                        isDark ? 'border-slate-800 text-slate-400' : 'border-slate-100 text-slate-500'
                      }`}>
                        <span className="font-semibold text-sky-400">Procnex AI</span>
                        <div className="flex items-center gap-2">
                          <span>{msg.timestamp}</span>
                          <button
                            onClick={() => handleCopy(msg.text, msg.id)}
                            className="hover:text-sky-400 transition-colors cursor-pointer"
                            title="Copy"
                          >
                            {copiedId === msg.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-end gap-2 mb-1.5 text-[10px] text-white/80">
                        <span>{msg.timestamp}</span>
                        <button
                          onClick={() => handleCopy(msg.text, msg.id)}
                          className="hover:text-white transition-colors cursor-pointer"
                          title="Copy"
                        >
                          {copiedId === msg.id ? <Check className="w-3 h-3 text-emerald-300" /> : <Copy className="w-3 h-3" />}
                        </button>
                      </div>
                    )}

                    <div className="space-y-1 overflow-x-auto">
                      {renderFormattedMarkdown(msg.text, msg.sender === 'user')}
                    </div>

                    {isMessageReport(msg) && (
                      <div className={`mt-4 pt-3 border-t flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl p-3 transition-all ${
                        isDark ? 'bg-slate-950/50 border-slate-800/80 shadow-inner' : 'bg-slate-50/80 border-slate-200/80 shadow-sm'
                      }`}>
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className={`p-2 rounded-xl border flex-shrink-0 ${
                            isDark ? 'bg-sky-950/60 border-sky-500/30 text-sky-400' : 'bg-sky-50 border-sky-200 text-sky-600'
                          }`}>
                            <FileText className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <span className={`block text-xs font-semibold truncate ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                              Want this report in official PDF format?
                            </span>
                            <span className={`block text-[11px] truncate ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                              SAP-grade document • Executive layout with Data Table
                            </span>
                          </div>
                        </div>

                        <button
                          onClick={() =>
                            handleDownloadPdf(
                              msg.text,
                              msg.id,
                              'Procurement_Report',
                              idx > 0 && messages[idx - 1]?.sender === 'user' ? messages[idx - 1]?.text : undefined,
                              msg.modelUsed
                            )
                          }
                          disabled={downloadingPdfId === msg.id}
                          className={`flex-shrink-0 inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all shadow-sm border cursor-pointer ${
                            isDark
                              ? 'bg-sky-600/20 hover:bg-sky-600 text-sky-300 hover:text-white border-sky-500/40 shadow-sky-900/20 hover:shadow-sky-900/40'
                              : 'bg-white hover:bg-sky-600 text-sky-700 hover:text-white border-sky-200 hover:border-sky-600 shadow-sky-100'
                          }`}
                        >
                          {downloadingPdfId === msg.id ? (
                            <>
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              <span>Generating...</span>
                            </>
                          ) : (
                            <>
                              <Download className="w-3.5 h-3.5" />
                              <span>Generate & Download PDF</span>
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>

                  {msg.sender === 'user' && (
                    <div className={`w-9 h-9 rounded-2xl flex items-center justify-center flex-shrink-0 mt-1 border ${
                      isDark ? 'bg-slate-800 border-slate-700 text-slate-300' : 'bg-slate-200 border-slate-300 text-slate-700'
                    }`}>
                      <User className="w-5 h-5" />
                    </div>
                  )}
                </div>
              );
            })}

              {/* Live Streaming State */}
              {isGenerating && (
                <div className="flex gap-3.5 justify-start">
                  <div className={`w-9 h-9 rounded-2xl flex items-center justify-center flex-shrink-0 mt-1 shadow-md border overflow-hidden p-1.5 animate-pulse ${
                    isDark ? 'bg-slate-900 border-sky-500/60 shadow-sky-950/40 ring-1 ring-sky-500/30' : 'bg-white border-sky-300 shadow-sky-100 ring-1 ring-sky-200'
                  }`}>
                    <img
                      src={logoUrl || '/Procnex-logo.jpeg'}
                      alt="Procnex"
                      className="w-full h-full object-contain rounded-lg"
                      onError={e => {
                        const target = e.currentTarget;
                        if (!target.src.endsWith('/Procnex-logo.jpeg')) {
                          target.src = '/Procnex-logo.jpeg';
                        }
                      }}
                    />
                  </div>
                  <div
                    className={`max-w-[92%] sm:max-w-[88%] rounded-2xl rounded-bl-none p-4.5 text-sm space-y-2 shadow-md border ${
                      isDark ? 'bg-slate-900/90 border-slate-800 text-slate-200' : 'bg-white border-slate-200 text-slate-800'
                    }`}
                  >
                    {statusMessage && (
                      <div className={`flex items-center gap-2 text-xs font-mono ${isDark ? 'text-sky-400' : 'text-sky-600'}`}>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>{statusMessage}</span>
                      </div>
                    )}
                    {liveStreamText && (
                      <div className="space-y-1 overflow-x-auto">
                        {renderFormattedMarkdown(liveStreamText)}
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </div>
        )}

        {/* Floating ChatGPT-style Scroll to Bottom Button */}
        {showScrollBottomBtn && (
          <div className="sticky bottom-20 z-30 flex justify-center w-full pointer-events-none -mb-3">
            <button
              type="button"
              onClick={() => scrollToBottom(true)}
              className={`pointer-events-auto flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold shadow-xl backdrop-blur-md border transition-all duration-200 transform hover:scale-105 active:scale-95 cursor-pointer ${
                isDark
                  ? 'bg-slate-900/95 text-sky-400 border-sky-500/40 shadow-sky-950/80 hover:bg-slate-800 hover:text-white hover:border-sky-400'
                  : 'bg-white/95 text-sky-700 border-sky-200 shadow-sky-200/60 hover:bg-sky-50 hover:text-sky-800 hover:border-sky-300'
              }`}
              title="Scroll to latest response"
            >
              <ArrowDown className="w-3.5 h-3.5" />
              <span>Scroll to bottom</span>
              {isGenerating && (
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-sky-500"></span>
                </span>
              )}
            </button>
          </div>
        )}

        {/* Executive Command Search Bar */}
        <div className="w-full pt-1">
          <div
            className={`relative flex items-center rounded-full p-1 pl-4 pr-1 shadow-md transition-all ${
              isListening
                ? 'ring-2 ring-rose-500/70 border-rose-500 bg-rose-950/20 dark:bg-rose-950/30'
                : isDark
                  ? 'bg-slate-900/90 border border-slate-700/80 hover:border-sky-500/50 focus-within:border-sky-500 focus-within:ring-2 focus-within:ring-sky-500/20'
                  : 'bg-white border border-slate-300 hover:border-sky-400 focus-within:border-sky-600 focus-within:ring-2 focus-within:ring-sky-500/20'
            }`}
          >
            <input
              type="text"
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !isGenerating) {
                  handleSendMessage(prompt);
                }
              }}
              placeholder={
                isListening
                  ? '🎙️ Listening... Speak now (click mic to stop)'
                  : "Query procurement database or request structured audit reports (e.g. 'Top 5 vendor spend summary')..."
              }
              disabled={isGenerating}
              className={`w-full bg-transparent py-1.5 text-xs sm:text-sm focus:outline-none ${
                isDark ? 'text-slate-100 placeholder:text-slate-500' : 'text-slate-900 placeholder:text-slate-400'
              }`}
            />

            {/* Audio-to-Text Voice Input Microphone Button */}
            <button
              type="button"
              onClick={toggleListening}
              disabled={isGenerating}
              className={`flex-shrink-0 p-2 mr-1 rounded-full transition-all cursor-pointer flex items-center justify-center ${
                isListening
                  ? 'bg-rose-500 text-white animate-pulse shadow-md shadow-rose-500/50 ring-2 ring-rose-400/60'
                  : isDark
                    ? 'text-slate-400 hover:text-sky-400 hover:bg-slate-800'
                    : 'text-slate-500 hover:text-sky-600 hover:bg-slate-100'
              }`}
              title={isListening ? 'Listening... Click to stop recording' : 'Voice Input / Audio to Text (Click and speak)'}
            >
              {isListening ? (
                <MicOff className="w-4 h-4" />
              ) : (
                <Mic className="w-4 h-4" />
              )}
            </button>

            <button
              onClick={() => handleSendMessage(prompt)}
              disabled={isGenerating || !prompt.trim()}
              className="flex-shrink-0 bg-gradient-to-r from-sky-500 via-blue-600 to-indigo-600 hover:from-sky-400 hover:to-blue-500 disabled:opacity-40 text-white font-medium text-xs px-4 py-1.5 rounded-full flex items-center gap-1.5 shadow-md shadow-sky-600/20 transition-all cursor-pointer"
            >
              {isGenerating ? (
                <RefreshCw className="w-3 h-3 animate-spin" />
              ) : (
                <Sparkles className="w-3 h-3 fill-white" />
              )}
              <span>{isGenerating ? 'Processing...' : 'Run Query'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Error Alert */}
      {errorMessage && (
        <div className="bg-rose-50 border border-rose-200 dark:bg-rose-950/60 dark:border-rose-800/80 text-rose-700 dark:text-rose-300 p-4 rounded-2xl text-xs flex items-center gap-2.5 shadow-lg">
          <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-500" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          PRE-BUILT AGENTS SECTION (Full Width Grid)
          ═══════════════════════════════════════════════════════════════ */}
      <div className="space-y-5">
        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <h2 className={`text-xl font-bold tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
                Procnex's Pre-Built AI Reports
              </h2>
            </div>
            <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
              Get started quickly with our expertly crafted procurement analytics engines.
            </p>
          </div>

          {/* Quota Indicator Pill */}
          {quota && (
            <div
              className={`border px-4 py-2 rounded-2xl text-xs flex items-center gap-4 shadow-md ${
                isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200'
              }`}
            >
              <div className="flex items-center gap-2">
                <BarChart3 className={`w-4 h-4 ${isDark ? 'text-sky-400' : 'text-sky-600'}`} />
                <div>
                  <span className={`block text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Monthly Quota</span>
                  <span className={`font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                    {quota.usedReports} / {quota.maxReports} Reports
                  </span>
                </div>
              </div>
              <div className={`w-px h-6 ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`} />
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                <div>
                  <span className={`block text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Tokens Used</span>
                  <span className="font-semibold text-emerald-500">
                    {(quota.usedTokens / 1000).toFixed(1)}k / {(quota.maxTokens / 1000).toFixed(0)}k
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Filter Toolbar (Search + Category Chips) */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
          {/* Search Box */}
          <div className="relative flex-1 max-w-md">
            <Search className={`w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search pre-built reports..."
              className={`w-full border rounded-full pl-10 pr-4 py-2 text-xs focus:outline-none focus:border-sky-500 ${
                isDark
                  ? 'bg-slate-900/80 border-slate-800 text-slate-200 placeholder:text-slate-500'
                  : 'bg-white border-slate-200 text-slate-800 placeholder:text-slate-400'
              }`}
            />
          </div>

          {/* Category Filter Pills */}
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`text-xs px-3.5 py-1.5 rounded-full font-medium transition-all ${
                selectedCategory === 'all'
                  ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-md shadow-sky-600/30'
                  : isDark
                    ? 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
                    : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-900'
              }`}
            >
              All Categories
            </button>
            <button
              onClick={() => setSelectedCategory('status')}
              className={`text-xs px-3.5 py-1.5 rounded-full font-medium transition-all ${
                selectedCategory === 'status'
                  ? 'bg-violet-600 text-white shadow-md shadow-violet-600/30'
                  : isDark
                    ? 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-violet-300'
                    : 'bg-white border border-slate-200 text-slate-600 hover:text-violet-700'
              }`}
            >
              Status Matrix
            </button>
            <button
              onClick={() => setSelectedCategory('sourcing')}
              className={`text-xs px-3.5 py-1.5 rounded-full font-medium transition-all ${
                selectedCategory === 'sourcing'
                  ? 'bg-amber-600 text-white shadow-md shadow-amber-600/30'
                  : isDark
                    ? 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-amber-300'
                    : 'bg-white border border-slate-200 text-slate-600 hover:text-amber-700'
              }`}
            >
              RFQs & Sourcing
            </button>
            <button
              onClick={() => setSelectedCategory('orders')}
              className={`text-xs px-3.5 py-1.5 rounded-full font-medium transition-all ${
                selectedCategory === 'orders'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                  : isDark
                    ? 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-blue-300'
                    : 'bg-white border border-slate-200 text-slate-600 hover:text-blue-700'
              }`}
            >
              POs & Orders
            </button>
            <button
              onClick={() => setSelectedCategory('finance')}
              className={`text-xs px-3.5 py-1.5 rounded-full font-medium transition-all ${
                selectedCategory === 'finance'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                  : isDark
                    ? 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-emerald-300'
                    : 'bg-white border border-slate-200 text-slate-600 hover:text-emerald-700'
              }`}
            >
              Invoices & Cashflow
            </button>
            <button
              onClick={() => setSelectedCategory('procurement')}
              className={`text-xs px-3.5 py-1.5 rounded-full font-medium transition-all ${
                selectedCategory === 'procurement'
                  ? 'bg-sky-600 text-white shadow-md shadow-sky-600/30'
                  : isDark
                    ? 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-sky-300'
                    : 'bg-white border border-slate-200 text-slate-600 hover:text-sky-700'
              }`}
            >
              Vendor Analytics
            </button>
          </div>
        </div>

        {/* Pre-built Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5 gap-4">
          {filteredAgents.map(agent => (
            <div
              key={agent.id}
              className={`group relative rounded-2xl p-5 shadow-xl transition-all duration-300 flex flex-col justify-between space-y-4 hover:-translate-y-1 border ${
                isDark
                  ? `bg-slate-900/70 hover:bg-slate-900 border-slate-800 ${agent.cardBorder}`
                  : `bg-white hover:bg-slate-50 border-slate-200 ${agent.cardBorder} shadow-sm hover:shadow-md`
              }`}
            >
              {/* Card Top: Icon & Tags */}
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shadow-md border ${agent.iconBg}`}>
                    {agent.icon}
                  </div>
                  <span className={`text-[10px] font-semibold border px-2 py-0.5 rounded-md ${agent.statusBadge}`}>
                    {agent.status}
                  </span>
                </div>

                <div>
                  <h3 className={`font-bold text-sm transition-colors ${
                    isDark ? 'text-white group-hover:text-sky-300' : 'text-slate-900 group-hover:text-sky-700'
                  }`}>
                    {agent.title}
                  </h3>
                  <p className={`text-xs mt-1 line-clamp-2 leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                    {agent.description}
                  </p>
                </div>
              </div>

              {/* Card Bottom: Metadata & Action Button */}
              <div className={`pt-2 border-t flex items-center justify-between ${isDark ? 'border-slate-800/80' : 'border-slate-100'}`}>
                <span className={`text-[10px] uppercase tracking-wider font-semibold ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                  {agent.category}
                </span>

                <button
                  onClick={() => handleSendMessage(agent.prompt)}
                  disabled={isGenerating}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-all shadow-sm cursor-pointer border ${agent.actionBtn}`}
                >
                  <span>{agent.actionLabel}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          PREVIOUSLY GENERATED REPORTS MODAL / SLIDE-OVER
          ═══════════════════════════════════════════════════════════════ */}
      {isHistoryDrawerOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-sm"
          onClick={() => setIsHistoryDrawerOpen(false)}
        >
          <div
            className={`w-full max-w-2xl rounded-3xl border shadow-2xl overflow-hidden flex flex-col max-h-[85vh] transition-all transform duration-200 ${
              isDark ? 'bg-slate-900 border-slate-700/80 text-slate-100 shadow-sky-950/30' : 'bg-white border-slate-200 text-slate-900'
            }`}
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className={`p-5 border-b flex items-center justify-between ${isDark ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-2xl border ${isDark ? 'bg-sky-600/20 border-sky-500/40 text-sky-400' : 'bg-sky-100 border-sky-300 text-sky-700'}`}>
                  <History className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base">Previously Generated Reports</h3>
                  <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    Instant PDF downloads • Auto-purged after 30 days • ⭐ Starred reports never expire
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsHistoryDrawerOpen(false)}
                className={`p-2 rounded-xl transition-colors cursor-pointer ${
                  isDark ? 'hover:bg-slate-800 text-slate-400 hover:text-white' : 'hover:bg-slate-200 text-slate-500 hover:text-slate-900'
                }`}
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search Filter & Favorite Tabs Bar */}
            <div className={`p-4 border-b space-y-3 ${isDark ? 'border-slate-800 bg-slate-900/60' : 'border-slate-100 bg-slate-50/50'}`}>
              <div className={`relative flex items-center rounded-xl border px-3 py-2 ${
                isDark ? 'bg-slate-950 border-slate-800' : 'bg-white border-slate-200'
              }`}>
                <Search className={`w-4 h-4 mr-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`} />
                <input
                  type="text"
                  placeholder="Search previously generated reports..."
                  value={historySearchQuery}
                  onChange={e => setHistorySearchQuery(e.target.value)}
                  className={`w-full bg-transparent text-xs focus:outline-none ${
                    isDark ? 'text-white placeholder:text-slate-500' : 'text-slate-900 placeholder:text-slate-400'
                  }`}
                />
                {historySearchQuery && (
                  <button onClick={() => setHistorySearchQuery('')} className="text-slate-400 hover:text-white">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* All vs Starred Tabs */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setHistoryTab('all')}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                    historyTab === 'all'
                      ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-sm'
                      : isDark
                        ? 'bg-slate-800 text-slate-400 hover:text-white border border-slate-700/60'
                        : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200'
                  }`}
                >
                  All Reports ({reportsHistory.length})
                </button>
                <button
                  type="button"
                  onClick={() => setHistoryTab('favorites')}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                    historyTab === 'favorites'
                      ? 'bg-amber-500 text-white shadow-sm shadow-amber-500/20'
                      : isDark
                        ? 'bg-slate-800 text-amber-400 hover:bg-slate-700/80 border border-amber-500/30'
                        : 'bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100'
                  }`}
                >
                  <Star className="w-3.5 h-3.5 fill-current" />
                  <span>Starred / Favorites ({reportsHistory.filter(r => r.isFavorite).length})</span>
                </button>
              </div>
            </div>

            {/* List Content */}
            <div className="p-4 overflow-y-auto space-y-2.5 flex-1 max-h-[420px]">
              {filteredHistoryList.length === 0 ? (
                <div className={`text-center py-12 text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                  {reportsHistory.length === 0
                    ? 'No reports generated yet. Generate your first report using the chat or cards above!'
                    : historyTab === 'favorites'
                      ? 'No starred reports yet. Click the star icon on any report to save it permanently!'
                      : 'No matching reports found.'}
                </div>
              ) : (
                filteredHistoryList.map(rpt => (
                  <div
                    key={rpt.id}
                    className={`p-3.5 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                      rpt.isFavorite
                        ? isDark
                          ? 'bg-slate-950/90 border-amber-500/40 shadow-sm shadow-amber-950/20 hover:border-amber-500/60'
                          : 'bg-amber-50/40 border-amber-200/80 shadow-sm hover:border-amber-300'
                        : isDark
                          ? 'bg-slate-950/60 border-slate-800 hover:border-sky-500/40 hover:bg-slate-950'
                          : 'bg-slate-50/70 border-slate-200 hover:border-sky-300 hover:bg-white'
                    }`}
                  >
                    <div className="flex items-start gap-3 min-w-0 cursor-pointer" onClick={() => setViewingReport(rpt)}>
                      <div className={`p-2.5 rounded-xl border flex-shrink-0 mt-0.5 transition-transform hover:scale-105 ${
                        rpt.isFavorite
                          ? isDark
                            ? 'bg-amber-500/20 border-amber-500/40 text-amber-400'
                            : 'bg-amber-100 border-amber-300 text-amber-600'
                          : isDark
                            ? 'bg-sky-950/60 border-sky-500/30 text-sky-400'
                            : 'bg-sky-50 border-sky-200 text-sky-600'
                      }`}>
                        <FileText className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className={`font-semibold text-xs truncate hover:underline ${
                            isDark ? 'text-slate-200 hover:text-sky-300' : 'text-slate-800 hover:text-sky-600'
                          }`}>
                            {rpt.title}
                          </h4>
                          {rpt.isFavorite && (
                            <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md ${
                              isDark ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'bg-amber-100 text-amber-800 border border-amber-200'
                            }`}>
                              <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
                              <span>Favorite • Never Expires</span>
                            </span>
                          )}
                        </div>
                        <div className={`flex items-center gap-2 mt-1 text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                          <span>{new Date(rpt.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                          <span>•</span>
                          <span>{new Date(rpt.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      {/* View Report Button */}
                      <button
                        onClick={() => setViewingReport(rpt)}
                        title="View Full Report"
                        className={`inline-flex items-center gap-1.5 font-semibold text-xs px-3 py-2 rounded-xl transition-all shadow-sm border cursor-pointer ${
                          isDark
                            ? 'bg-sky-950/60 hover:bg-sky-600 text-sky-300 hover:text-white border-sky-500/40 hover:border-sky-500'
                            : 'bg-white hover:bg-sky-600 text-sky-700 hover:text-white border-sky-200 hover:border-sky-600'
                        }`}
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>View</span>
                      </button>

                      {/* Star / Favorite Button */}
                      <button
                        onClick={(e) => handleToggleFavorite(rpt.id, e)}
                        title={rpt.isFavorite ? 'Starred (Never expires • Click to un-favorite)' : 'Star Report (Keep in database forever • Protected from 30-day auto-purge)'}
                        className={`p-2 rounded-xl border transition-all cursor-pointer ${
                          rpt.isFavorite
                            ? isDark
                              ? 'bg-amber-500/20 text-amber-400 border-amber-500/50 shadow-sm shadow-amber-950/40 hover:bg-amber-500/30'
                              : 'bg-amber-100 text-amber-700 border-amber-300 shadow-sm hover:bg-amber-200'
                            : isDark
                              ? 'bg-slate-800/80 text-slate-400 hover:text-amber-400 hover:bg-slate-800 border-slate-700/80'
                              : 'bg-white text-slate-400 hover:text-amber-500 hover:bg-amber-50 border-slate-200'
                        }`}
                      >
                        <Star className={`w-3.5 h-3.5 ${rpt.isFavorite ? 'fill-amber-400 text-amber-400' : ''}`} />
                      </button>

                      {/* Download PDF Button */}
                      <button
                        onClick={() => handleDownloadPdf(rpt.summaryText || rpt.title, rpt.id, rpt.title)}
                        disabled={downloadingPdfId === rpt.id}
                        className={`inline-flex items-center gap-1.5 font-semibold text-xs px-3.5 py-2 rounded-xl transition-all shadow-sm border cursor-pointer ${
                          isDark
                            ? 'bg-sky-600/20 hover:bg-sky-600 text-sky-300 hover:text-white border-sky-500/40 shadow-sky-900/20'
                            : 'bg-sky-50 hover:bg-sky-600 text-sky-700 hover:text-white border-sky-200 shadow-sky-100'
                        }`}
                      >
                        {downloadingPdfId === rpt.id ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            <span>Generating...</span>
                          </>
                        ) : (
                          <>
                            <Download className="w-3.5 h-3.5" />
                            <span>Download PDF</span>
                          </>
                        )}
                      </button>

                      {/* Delete Button */}
                      <button
                        onClick={(e) => handleDeleteReport(rpt.id, e)}
                        title="Delete report from history"
                        className={`p-2 rounded-xl border transition-all cursor-pointer ${
                          isDark
                            ? 'bg-rose-950/40 hover:bg-rose-900/60 text-rose-400 border-rose-800/40'
                            : 'bg-rose-50 hover:bg-rose-100 text-rose-600 border-rose-200'
                        }`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Modal Footer */}
            <div className={`p-4 border-t flex items-center justify-between text-xs ${isDark ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
              <span className={`text-[11px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                Showing {filteredHistoryList.length} of {reportsHistory.length} reports
              </span>
              <button
                onClick={() => setIsHistoryDrawerOpen(false)}
                className={`px-4 py-2 rounded-xl font-semibold transition-all cursor-pointer ${
                  isDark
                    ? 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                    : 'bg-slate-200 hover:bg-slate-300 text-slate-700'
                }`}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          INTERACTIVE FULL REPORT VIEWER MODAL
          ═══════════════════════════════════════════════════════════════ */}
      {viewingReport && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/75 backdrop-blur-md"
          onClick={() => setViewingReport(null)}
        >
          <div
            className={`w-full max-w-4xl rounded-3xl border shadow-2xl overflow-hidden flex flex-col max-h-[90vh] transition-all transform duration-200 ${
              isDark ? 'bg-slate-900 border-slate-700 text-slate-100 shadow-sky-950/50' : 'bg-white border-slate-200 text-slate-900'
            }`}
            onClick={e => e.stopPropagation()}
          >
            {/* Viewer Header */}
            <div className={`p-5 border-b flex items-start justify-between gap-4 ${
              isDark ? 'bg-slate-950/90 border-slate-800' : 'bg-slate-50 border-slate-200'
            }`}>
              <div className="flex items-start gap-3 min-w-0">
                <div className={`p-2.5 rounded-2xl border flex-shrink-0 mt-0.5 ${
                  viewingReport.isFavorite
                    ? isDark
                      ? 'bg-amber-500/20 border-amber-500/40 text-amber-400'
                      : 'bg-amber-100 border-amber-300 text-amber-600'
                    : isDark
                      ? 'bg-sky-600/20 border-sky-500/40 text-sky-400'
                      : 'bg-sky-100 border-sky-300 text-sky-700'
                }`}>
                  <FileText className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-base sm:text-lg truncate">
                      {viewingReport.title}
                    </h3>
                    {viewingReport.isFavorite && (
                      <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md ${
                        isDark ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'bg-amber-100 text-amber-800 border border-amber-200'
                      }`}>
                        <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                        <span>Favorite • Never Expires</span>
                      </span>
                    )}
                  </div>
                  <div className={`flex items-center gap-2 mt-1 text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    <span>Generated on {new Date(viewingReport.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })} at {new Date(viewingReport.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </div>
              </div>

              {/* Header Quick Actions */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={(e) => handleToggleFavorite(viewingReport.id, e)}
                  title={viewingReport.isFavorite ? 'Starred (Never expires • Click to un-favorite)' : 'Star Report (Keep in database forever • Protected from 30-day auto-purge)'}
                  className={`p-2 rounded-xl border transition-all cursor-pointer ${
                    viewingReport.isFavorite
                      ? isDark
                        ? 'bg-amber-500/20 text-amber-400 border-amber-500/50 hover:bg-amber-500/30'
                        : 'bg-amber-100 text-amber-700 border-amber-300 hover:bg-amber-200'
                      : isDark
                        ? 'bg-slate-800 text-slate-400 hover:text-amber-400 hover:bg-slate-700 border-slate-700'
                        : 'bg-white text-slate-500 hover:text-amber-600 hover:bg-slate-100 border-slate-200'
                  }`}
                >
                  <Star className={`w-4 h-4 ${viewingReport.isFavorite ? 'fill-amber-400 text-amber-400' : ''}`} />
                </button>

                <button
                  onClick={() => handleCopy(viewingReport.summaryText || viewingReport.title, viewingReport.id)}
                  title="Copy formatted markdown"
                  className={`p-2 rounded-xl border transition-all cursor-pointer ${
                    isDark
                      ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border-slate-700'
                      : 'bg-white hover:bg-slate-100 text-slate-600 hover:text-slate-900 border-slate-200'
                  }`}
                >
                  {copiedId === viewingReport.id ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </button>

                <button
                  onClick={() =>
                    handleDownloadPdf(
                      viewingReport.summaryText || viewingReport.title,
                      viewingReport.id,
                      viewingReport.title
                    )
                  }
                  disabled={downloadingPdfId === viewingReport.id}
                  className={`inline-flex items-center gap-1.5 font-semibold text-xs px-3.5 py-2 rounded-xl transition-all shadow-sm border cursor-pointer ${
                    isDark
                      ? 'bg-sky-600 hover:bg-sky-500 text-white border-sky-500 shadow-sky-900/40'
                      : 'bg-sky-600 hover:bg-sky-700 text-white border-sky-600 shadow-sky-100'
                  }`}
                >
                  {downloadingPdfId === viewingReport.id ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Generating...</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-3.5 h-3.5" />
                      <span>Download PDF</span>
                    </>
                  )}
                </button>

                <button
                  onClick={() => setViewingReport(null)}
                  className={`p-2 rounded-xl transition-colors cursor-pointer ${
                    isDark ? 'hover:bg-slate-800 text-slate-400 hover:text-white' : 'hover:bg-slate-200 text-slate-500 hover:text-slate-900'
                  }`}
                  title="Close Viewer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Viewer Content Body */}
            <div className="p-6 overflow-y-auto space-y-4 flex-1 text-sm leading-relaxed max-h-[60vh]">
              {renderFormattedMarkdown(viewingReport.summaryText || viewingReport.title)}
            </div>

            {/* Viewer Footer */}
            <div className={`p-4 border-t flex items-center justify-between text-xs ${
              isDark ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-50 border-slate-200'
            }`}>
              <div className="flex items-center gap-2">
                <span className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  {viewingReport.isFavorite
                    ? '⭐ This report is Starred and will NEVER be auto-deleted.'
                    : '⏳ Auto-purged after 30 days from creation date.'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setViewingReport(null)}
                  className={`px-4 py-2 rounded-xl font-semibold transition-all cursor-pointer ${
                    isDark
                      ? 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                      : 'bg-slate-200 hover:bg-slate-300 text-slate-700'
                  }`}
                >
                  Back to List
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
