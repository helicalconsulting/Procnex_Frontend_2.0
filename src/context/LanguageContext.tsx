import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';

export type Language = 'en' | 'fr';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
  t: (key: string, defaultText?: string) => string;
  isFrench: boolean;
}

const STORAGE_KEY = 'heliflow_language';

// ─── Exact String Map for Instant O(1) Translation ───────────
const EXACT_MAP_FR: Record<string, string> = {
  // Navigation & Page Titles
  'Dashboard': 'Tableau de bord',
  'Request for Quotations': 'Demandes de prix (RFQ)',
  'Quotation Approval': 'Approbation des devis',
  'PO Creation & Orders': 'Création de BC & Commandes',
  'Purchase Orders': 'Bons de commande',
  'Purchase Order Approval': 'Approbation des bons de commande',
  'Accounts Payable': 'Comptes fournisseurs',
  'Purchase Invoice Approval': "Approbation des factures d'achat",
  'Create Purchase Invoice': "Créer une facture d'achat",
  'Payments': 'Paiements',
  'Payment Voucher Approval': 'Approbation des pièces de paiement',
  'Create Payment Voucher': 'Créer une pièce de paiement',
  'Vendors': 'Fournisseurs',
  'Contracts': 'Contrats',
  'Create Contract': 'Créer un contrat',
  'Documents': 'Documents',
  'Notifications': 'Notifications',
  'Audit Trail': "Journal d'audit",
  'User Management': 'Gestion des utilisateurs',
  'Roles & Permissions': 'Rôles & Permissions',
  'Approval Levels': "Niveaux d'approbation",
  'Company Settings': "Paramètres de l'entreprise",
  'Form Builder': 'Concepteur de formulaires',
  'Form Responses': 'Réponses aux formulaires',
  'Forms Settings': 'Paramètres des formulaires',
  'Purchase Requisitions': "Demandes d'achat",
  'Reports & Analytics': 'Rapports & Analyses',
  'Reports': 'Rapports',
  'Governance': 'Gouvernance',
  'Procurement': 'Achats & Approvisionnement',
  'Approvals': 'Approbations',
  'Orders & Payments': 'Commandes & Paiements',
  'Admin': 'Administration',
  'Account': 'Compte',
  'Main': 'Principal',

  // Vendor Portal Titles
  'Vendor Dashboard': 'Tableau de bord fournisseur',
  'My RFQs': 'Mes demandes (RFQ)',
  'My Quotations': 'Mes devis',
  'My Orders': 'Mes commandes',
  'My Invoices': 'Mes factures',
  'My Contracts': 'Mes contrats',
  'Agreements': 'Accords',
  'My Profile': 'Mon profil',

  // Tabs & Sections
  'Overview': 'Aperçu',
  'Terms & Clauses': 'Conditions & Clauses',
  'Document Preview': 'Aperçu du document',
  'SLA Entries': 'Engagements SLA',
  'Milestones': 'Jalons & Échéances',
  'Audit Log': "Journal d'audit",
  'General': 'Général',
  'Branding': 'Image de marque',
  'Departments': 'Départements',
  'Positions': 'Postes & Titres',
  'Categories': 'Catégories',
  'Units': 'Unités de mesure',
  'Payment Terms': 'Conditions de paiement',
  'Email Templates': "Modèles d'e-mail",
  'Documents & Templates': 'Documents & Modèles',

  // Common Buttons & Actions
  'Create New': 'Créer un nouveau',
  'Create RFQ': 'Créer une demande de prix',
  'Create Purchase Order': 'Créer un bon de commande',
  'Sign Contract': 'Signer le contrat',
  'Execute & Sign Contract': 'Exécuter & Signer le contrat',
  'Sign Now': 'Signer maintenant',
  'Download PDF': 'Télécharger le PDF',
  'Print': 'Imprimer',
  'Save Changes': 'Enregistrer les modifications',
  'Save': 'Enregistrer',
  'Cancel': 'Annuler',
  'Delete': 'Supprimer',
  'Edit': 'Modifier',
  'View': 'Afficher',
  'Filter': 'Filtrer',
  'Search': 'Rechercher',
  'Back': 'Retour',
  'Close': 'Fermer',
  'Submit': 'Soumettre',
  'Submitting...': 'Soumission en cours...',
  'Approve': 'Approuver',
  'Reject': 'Rejeter',
  'Export': 'Exporter',
  'Import': 'Importer',
  'Clear': 'Effacer',
  'Draw': 'Dessiner',
  'Upload': 'Télécharger',
  'Back to Contracts': 'Retour aux Contrats',
  'Awaiting Your Signature': 'En attente de votre signature',

  // Table Columns & Card Labels
  'Title': 'Titre',
  'Status': 'Statut',
  'Vendor': 'Fournisseur',
  'Contract Value': 'Valeur du contrat',
  'Award Value': 'Valeur attribuée',
  'Total Value': 'Valeur totale',
  'Effective Date': "Date d'effet",
  'Expiration Date': "Date d'expiration",
  'Expiry Date': "Date d'expiration",
  'Created Date': 'Date de création',
  'Actions': 'Actions',
  'Department': 'Département',
  'Category': 'Catégorie',
  'Priority': 'Priorité',
  'Currency': 'Devise',
  'Amount': 'Montant',
  'Delivery Terms': 'Conditions de livraison',

  // Status Badges
  'Active': 'Actif',
  'Draft': 'Brouillon',
  'Pending': 'En attente',
  'Approved': 'Approuvé',
  'Rejected': 'Rejeté',
  'Completed': 'Terminé',
  'Expired': 'Expiré',
  'Terminated': 'Résilié',
  'AWAITING_VENDOR_SIGNATURE': 'EN ATTENTE DE SIGNATURE DU FOURNISSEUR',
  'PENDING_VENDOR_SIGNATURE': 'EN ATTENTE DE SIGNATURE DU FOURNISSEUR',
  'VENDOR_SIGNED': 'SIGNÉ PAR LE FOURNISSEUR',

  // Contract Content Labels
  'CONTRACT VALUE AND PRICING': 'VALEUR DU CONTRAT ET PRIX',
  'GENERAL PROVISIONS': 'DISPOSITIONS GÉNÉRALES',
  'GOVERNING LAW': 'LOI APPLICABLE',
  'FOR THE BUYER': "POUR L'ACHETEUR",
  'FOR THE SUPPLIER': 'POUR LE FOURNISSEUR',
  'Signed By': 'Signé par',
  'Date': 'Date',
  'BUYER': 'ACHETEUR',
  'SUPPLIER': 'FOURNISSEUR',
};

// ─── Phrase Mappings for Substring Fallback ───────────────────
const PHRASE_TRANSLATIONS_FR: [RegExp, string][] = [
  [/Request for Quotations/gi, 'Demandes de prix (RFQ)'],
  [/Quotation Approval/gi, 'Approbation des devis'],
  [/PO Creation & Orders/gi, 'Création de BC & Commandes'],
  [/Purchase Order Approval/gi, 'Approbation des bons de commande'],
  [/Purchase Invoice Approval/gi, "Approbation des factures d'achat"],
  [/Payment Voucher Approval/gi, 'Approbation des pièces de paiement'],
  [/User Management/gi, 'Gestion des utilisateurs'],
  [/Roles & Permissions/gi, 'Rôles & Permissions'],
  [/Approval Levels/gi, "Niveaux d'approbation"],
  [/Company Settings/gi, "Paramètres de l'entreprise"],
  [/Form Builder/gi, 'Concepteur de formulaires'],
  [/Form Responses/gi, 'Réponses aux formulaires'],
  [/Forms Settings/gi, 'Paramètres des formulaires'],
  [/Vendor Dashboard/gi, 'Tableau de bord fournisseur'],
  [/Purchase Requisitions/gi, "Demandes d'achat"],
  [/Accounts Payable/gi, 'Comptes fournisseurs'],
  [/Reports & Analytics/gi, 'Rapports & Analyses'],
  [/Audit Trail/gi, "Journal d'audit"],
  [/Back to Contracts/gi, 'Retour aux Contrats'],
  [/Terms & Clauses/gi, 'Conditions & Clauses'],
  [/Document Preview/gi, 'Aperçu du document'],

  [/Create Contract/gi, 'Créer un contrat'],
  [/Create New Contract/gi, 'Créer un contrat'],
  [/New Contract/gi, 'Nouveau contrat'],
  [/Create RFQ/gi, 'Créer une demande de prix'],
  [/New RFQ/gi, 'Nouvelle demande de prix'],
  [/Create Purchase Order/gi, 'Créer un bon de commande'],
  [/New Purchase Order/gi, 'Nouveau bon de commande'],
  [/Create Purchase Invoice/gi, "Créer une facture d'achat"],
  [/Create Payment Voucher/gi, 'Créer une pièce de paiement'],
  [/Digital Signature Execution/gi, 'Exécution de la signature numérique'],
  [/Signer Authorization/gi, 'Autorisation du signataire'],
  [/Signature Studio/gi, 'Studio de signature'],
  [/Sign Now/gi, 'Signer maintenant'],
  [/Download PDF/gi, 'Télécharger le PDF'],
  [/Awaiting Your Signature/gi, 'En attente de votre signature'],
  [/Execute & Sign Contract/gi, 'Exécuter & Signer le contrat'],
  [/Sign here using your mouse or touch screen/gi, "Signez ici à l'aide de votre souris ou écran tactile"],
  [/Save Changes/gi, 'Enregistrer les modifications'],

  [/CONTRACT VALUE AND PRICING/gi, 'VALEUR DU CONTRAT ET PRIX'],
  [/GENERAL PROVISIONS/gi, 'DISPOSITIONS GÉNÉRALES'],
  [/GOVERNING LAW/gi, 'LOI APPLICABLE'],
  [/FOR THE BUYER/gi, "POUR L'ACHETEUR"],
  [/FOR THE SUPPLIER/gi, 'POUR LE FOURNISSEUR'],
  [/Payment Terms/gi, 'Conditions de paiement'],
  [/Delivery Terms/gi, 'Conditions de livraison'],
  [/Effective Date/gi, "Date d'effet"],
  [/Expiration Date/gi, "Date d'expiration"],
  [/Expiry Date/gi, "Date d'expiration"],
  [/Contract Value/gi, 'Valeur du contrat'],
  [/Award Value/gi, 'Valeur attribuée'],
  [/Total Value/gi, 'Valeur totale'],
  [/Source RFQ/gi, 'RFQ Source'],
  [/Signed By/gi, 'Signé par'],

  [/Total Contracts/gi, 'Total des contrats'],
  [/Active Contracts/gi, 'Contrats actifs'],
  [/Pending Signatures/gi, 'Signatures en attente'],
  [/Total RFQs/gi, 'Total des RFQs'],
  [/Total Orders/gi, 'Total des commandes'],
  [/Total Invoices/gi, 'Total des factures'],
  [/Vendor Name/gi, 'Nom du fournisseur'],
  [/Contract Number/gi, 'N° de contrat'],
  [/RFQ Number/gi, 'N° de RFQ'],
  [/PO Number/gi, 'N° de commande'],
  [/Quotation Number/gi, 'N° de devis'],

  [/\bContracts\b/gi, 'Contrats'],
  [/\bContract\b/gi, 'Contrat'],
  [/\bQuotations\b/gi, 'Devis'],
  [/\bQuotation\b/gi, 'Devis'],
  [/\bRequisitions\b/gi, "Demandes d'achat"],
  [/\bRequisition\b/gi, "Demande d'achat"],
  [/\bOrders\b/gi, 'Commandes'],
  [/\bOrder\b/gi, 'Commande'],
  [/\bInvoices\b/gi, 'Factures'],
  [/\bInvoice\b/gi, 'Facture'],
  [/\bVendors\b/gi, 'Fournisseurs'],
  [/\bVendor\b/gi, 'Fournisseur'],
  [/\bPayments\b/gi, 'Paiements'],
  [/\bPayment\b/gi, 'Paiement'],
  [/\bApprovals\b/gi, 'Approbations'],
  [/\bApproval\b/gi, 'Approbation'],
  [/\bDocuments\b/gi, 'Documents'],
  [/\bDocument\b/gi, 'Document'],
  [/\bReports\b/gi, 'Rapports'],
  [/\bReport\b/gi, 'Rapport'],
  [/\bSettings\b/gi, 'Paramètres'],
  [/\bUsers\b/gi, 'Utilisateurs'],
  [/\bUser\b/gi, 'Utilisateur'],
  [/\bRoles\b/gi, 'Rôles'],
  [/\bPermissions\b/gi, 'Autorisations'],
  [/\bNotifications\b/gi, 'Notifications'],
  [/\bOverview\b/gi, 'Aperçu'],
  [/\bClauses\b/gi, 'Clauses'],
  [/\bItems\b/gi, 'Articles'],
  [/\bActions\b/gi, 'Actions'],
  [/\bStatus\b/gi, 'Statut'],
  [/\bTitle\b/gi, 'Titre'],
  [/\bAmount\b/gi, 'Montant'],
  [/\bCurrency\b/gi, 'Devise'],
  [/\bPriority\b/gi, 'Priorité'],
  [/\bDepartment\b/gi, 'Département'],
  [/\bCategory\b/gi, 'Catégorie'],
  [/\bFilter\b/gi, 'Filtrer'],
  [/\bSearch\b/gi, 'Rechercher'],
  [/\bSave\b/gi, 'Enregistrer'],
  [/\bCancel\b/gi, 'Annuler'],
  [/\bDelete\b/gi, 'Supprimer'],
  [/\bEdit\b/gi, 'Modifier'],
  [/\bView\b/gi, 'Afficher'],
  [/\bPrint\b/gi, 'Imprimer'],
  [/\bExport\b/gi, 'Exporter'],
  [/\bImport\b/gi, 'Importer'],
  [/\bClear\b/gi, 'Effacer'],
  [/\bDraw\b/gi, 'Dessiner'],
  [/\bUpload\b/gi, 'Télécharger'],
  [/\bActive\b/gi, 'Actif'],
  [/\bDraft\b/gi, 'Brouillon'],
  [/\bPending\b/gi, 'En attente'],
  [/\bApproved\b/gi, 'Approuvé'],
  [/\bRejected\b/gi, 'Rejeté'],
  [/\bCompleted\b/gi, 'Terminé'],
  [/\bExpired\b/gi, 'Expiré'],
  [/\bTerminated\b/gi, 'Résilié'],
  [/\bBlack Ink\b/gi, 'Encre noire'],
  [/\bNavy Blue\b/gi, 'Bleu marine'],
  [/\bRoyal Blue\b/gi, 'Bleu royal'],
  [/\bRed Ink\b/gi, 'Encre rouge'],
];

// ─── Dictionary ─────────────────────────────────────────────
const TRANSLATIONS: Record<Language, Record<string, string>> = {
  en: {
    'nav.dashboard': 'Dashboard',
    'nav.requisitions': 'Purchase Requisitions',
    'nav.rfqs': 'RFQs & Tenders',
    'nav.quotations': 'Quotations',
    'nav.contracts': 'Contracts',
    'nav.orders': 'Purchase Orders',
    'nav.ap': 'Accounts Payable',
    'nav.payments': 'Payments',
    'nav.vendors': 'Vendors',
    'nav.reports': 'Reports & Analytics',
    'nav.settings': 'Company Settings',
    'nav.users': 'Users & Access',
    'nav.roles': 'Roles & Permissions',
    'nav.approvals': 'Approvals',
    'nav.documents': 'Documents',
    'nav.audit': 'Audit Trail',
    'nav.notifications': 'Notifications',

    'settings.title': 'Company Settings',
    'settings.language_title': 'Language & Localization',
    'settings.system_language': 'System Language',
    'settings.language_desc': 'Select your preferred interface language across the entire Heliflow portal.',
    'settings.english': 'English 🇺🇸',
    'settings.french': 'Français 🇫🇷',
    'settings.saved_msg': 'System language preference saved successfully.',

    'action.save': 'Save Changes',
    'action.cancel': 'Cancel',
    'action.delete': 'Delete',
    'action.edit': 'Edit',
    'action.view': 'View',
    'action.sign_now': 'Sign Now',
    'action.download_pdf': 'Download PDF',
    'action.print': 'Print',
    'action.search': 'Search',
    'action.filter': 'Filter',
    'action.create': 'Create New',
    'action.back': 'Back',
    'action.close': 'Close',
    'action.loading': 'Loading...',
    'action.submitting': 'Submitting...',

    'status.active': 'Active',
    'status.draft': 'Draft',
    'status.pending': 'Pending',
    'status.approved': 'Approved',
    'status.completed': 'Completed',
    'status.expired': 'Expired',
    'status.awaiting_signature': 'Awaiting Signature',
  },
  fr: {
    'nav.dashboard': 'Tableau de bord',
    'nav.requisitions': "Demandes d'achat",
    'nav.rfqs': 'Demandes de prix (RFQ)',
    'nav.quotations': 'Devis & Offres',
    'nav.contracts': 'Contrats',
    'nav.orders': 'Bons de commande',
    'nav.ap': 'Comptes fournisseurs',
    'nav.payments': 'Paiements',
    'nav.vendors': 'Gestion des Fournisseurs',
    'nav.reports': 'Rapports & Analyses',
    'nav.settings': "Paramètres de l'entreprise",
    'nav.users': 'Utilisateurs & Accès',
    'nav.roles': 'Rôles & Permissions',
    'nav.approvals': 'Approbations',
    'nav.documents': 'Gestion documentaire',
    'nav.audit': "Journal d'audit",
    'nav.notifications': 'Notifications',

    'settings.title': "Paramètres de l'entreprise",
    'settings.language_title': 'Langue & Localisation',
    'settings.system_language': 'Langue du système',
    'settings.language_desc': "Choisissez votre langue d'interface préférée sur l'ensemble du portail Heliflow.",
    'settings.english': 'English 🇺🇸',
    'settings.french': 'Français 🇫🇷',
    'settings.saved_msg': 'Préférence de langue enregistrée avec succès.',

    'action.save': 'Enregistrer les modifications',
    'action.cancel': 'Annuler',
    'action.delete': 'Supprimer',
    'action.edit': 'Modifier',
    'action.view': 'Afficher',
    'action.sign_now': 'Signer maintenant',
    'action.download_pdf': 'Télécharger le PDF',
    'action.print': 'Imprimer',
    'action.search': 'Rechercher',
    'action.filter': 'Filtrer',
    'action.create': 'Créer un nouveau',
    'action.back': 'Retour',
    'action.close': 'Fermer',
    'action.loading': 'Chargement...',
    'action.submitting': 'Soumission en cours...',

    'status.active': 'Actif',
    'status.draft': 'Brouillon',
    'status.pending': 'En attente',
    'status.approved': 'Approuvé',
    'status.completed': 'Terminé',
    'status.expired': 'Expiré',
    'status.awaiting_signature': 'En attente de signature',
  },
};

function getStoredLanguage(): Language {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'en' || stored === 'fr') return stored;
  } catch {
    // localStorage unavailable
  }
  return 'en';
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => getStoredLanguage());

  // Global DOM Auto-Translator Effect for French
  useEffect(() => {
    document.documentElement.setAttribute('lang', language);

    if (language !== 'fr') {
      if (document.documentElement.getAttribute('data-lang-applied') === 'fr') {
        document.documentElement.removeAttribute('data-lang-applied');
        window.location.reload();
      }
      return;
    }

    document.documentElement.setAttribute('data-lang-applied', 'fr');

    const translateElement = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE && node.nodeValue) {
        const raw = node.nodeValue;
        const trimmed = raw.trim();

        // 1. Exact string match
        if (trimmed && EXACT_MAP_FR[trimmed]) {
          const leading = raw.match(/^\s*/)?.[0] || '';
          const trailing = raw.match(/\s*$/)?.[0] || '';
          node.nodeValue = leading + EXACT_MAP_FR[trimmed] + trailing;
          return;
        }

        // 2. Regex phrase replacements (with lastIndex reset on each iteration)
        let text = raw;
        let modified = false;
        for (const [regex, replacement] of PHRASE_TRANSLATIONS_FR) {
          regex.lastIndex = 0;
          if (regex.test(text)) {
            regex.lastIndex = 0;
            text = text.replace(regex, replacement);
            modified = true;
          }
        }
        if (modified) {
          node.nodeValue = text;
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const elem = node as HTMLElement;
        if (['SCRIPT', 'STYLE', 'CANVAS', 'INPUT', 'TEXTAREA'].includes(elem.tagName)) {
          if (elem instanceof HTMLInputElement || elem instanceof HTMLTextAreaElement) {
            if (elem.placeholder) {
              const pTrim = elem.placeholder.trim();
              if (EXACT_MAP_FR[pTrim]) {
                elem.placeholder = EXACT_MAP_FR[pTrim];
              } else {
                let pText = elem.placeholder;
                for (const [regex, replacement] of PHRASE_TRANSLATIONS_FR) {
                  regex.lastIndex = 0;
                  if (regex.test(pText)) {
                    regex.lastIndex = 0;
                    pText = pText.replace(regex, replacement);
                  }
                }
                elem.placeholder = pText;
              }
            }
          }
          return;
        }

        // Translate title attribute
        if (elem.hasAttribute('title')) {
          let tVal = elem.getAttribute('title') || '';
          const tTrim = tVal.trim();
          if (EXACT_MAP_FR[tTrim]) {
            elem.setAttribute('title', EXACT_MAP_FR[tTrim]);
          } else {
            for (const [regex, replacement] of PHRASE_TRANSLATIONS_FR) {
              regex.lastIndex = 0;
              if (regex.test(tVal)) {
                regex.lastIndex = 0;
                tVal = tVal.replace(regex, replacement);
              }
            }
            elem.setAttribute('title', tVal);
          }
        }

        for (let i = 0; i < elem.childNodes.length; i++) {
          translateElement(elem.childNodes[i]);
        }
      }
    };

    const runTranslation = () => {
      translateElement(document.body);
    };

    // Initial scans and periodic sweep
    const timer1 = setTimeout(runTranslation, 50);
    const timer2 = setTimeout(runTranslation, 250);
    const timer3 = setTimeout(runTranslation, 600);
    const interval = setInterval(runTranslation, 1000);

    // Watch for dynamic DOM changes
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((m) => {
        m.addedNodes.forEach((node) => translateElement(node));
      });
    });

    observer.observe(document.body, { childList: true, subtree: true, characterData: true });

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
      clearInterval(interval);
      observer.disconnect();
    };
  }, [language]);

  const setLanguage = useCallback((newLang: Language) => {
    setLanguageState(newLang);
    try {
      localStorage.setItem(STORAGE_KEY, newLang);
    } catch {
      // ignore
    }
  }, []);

  const toggleLanguage = useCallback(() => {
    setLanguage(language === 'fr' ? 'en' : 'fr');
  }, [language, setLanguage]);

  const t = useCallback(
    (key: string, defaultText?: string): string => {
      const translation = TRANSLATIONS[language]?.[key];
      if (translation) return translation;
      return defaultText || key;
    },
    [language]
  );

  return (
    <LanguageContext.Provider
      value={{
        language,
        setLanguage,
        toggleLanguage,
        t,
        isFrench: language === 'fr',
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextType {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
