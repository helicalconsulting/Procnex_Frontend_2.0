import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';

export type Language = 'en' | 'fr' | 'ar';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
  t: (key: string, defaultText?: string) => string;
  isFrench: boolean;
  isArabic: boolean;
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

  // Summary Card Titles & Admin Labels
  'Total Roles': 'Total des rôles',
  'System Roles': 'Rôles système',
  'Custom Roles': 'Rôles personnalisés',
  'Total Users': 'Total des utilisateurs',
  'Active Users': 'Utilisateurs actifs',
  'Inactive Users': 'Utilisateurs inactifs',
  'Pending Approvals': 'Approbations en attente',
  'Approved Requests': 'Demandes approuvées',
  'Rejected Requests': 'Demandes rejetées',
  'Returned Requests': 'Demandes retournées',
  'Total RFQs': 'Total des RFQs',
  'Open RFQs': 'RFQs ouvertes',
  'Closed RFQs': 'RFQs fermées',
  'Total Quotations': 'Total des devis',
  'Under Review': "En cours d'examen",
  'Shortlisted': 'Sélectionné',
  'Total Orders': 'Total des commandes',
  'Pending Orders': 'Commandes en attente',
  'Approved Orders': 'Commandes approuvées',
  'Completed Orders': 'Commandes terminées',
  'Total Contracts': 'Total des contrats',
  'Active Contracts': 'Contrats actifs',
  'Pending Signatures': 'Signatures en attente',
  'Total Vendors': 'Total des fournisseurs',
  'Active Vendors': 'Fournisseurs actifs',
  'Inactive Vendors': 'Fournisseurs inactifs',
  'Top Rated': 'Mieux notés',
  'Create Role': 'Créer un rôle',
  'Add User': 'Ajouter un utilisateur',
  'Edit Permissions': 'Modifier les autorisations',
  'View Permissions': 'Afficher les autorisations',
  'Compare Quotations': 'Comparer les devis',

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

// ─── Exact String Map for Arabic Translation ───────────────────
const EXACT_MAP_AR: Record<string, string> = {
  // Navigation & Page Titles
  'Dashboard': 'لوحة التحكم',
  'Request for Quotations': 'طلبات عروض الأسعار (RFQ)',
  'RFQ Management': 'إدارة طلبات الأسعار (RFQ)',
  'Quotations': 'عروض الأسعار',
  'Quotation Approval': 'الموافقة على عروض الأسعار',
  'PO Creation & Orders': 'إنشاء أوامر الشراء والطلبات',
  'PO Creation': 'إنشاء أمر شراء',
  'Purchase Orders': 'أوامر الشراء',
  'Purchase Order Approval': 'الموافقة على أمر الشراء',
  'PO Approval': 'الموافقة على أمر الشراء',
  'Accounts Payable': 'حسابات الموردين',
  'Purchase Invoice Approval': 'الموافقة على فواتير الشراء',
  'Create Purchase Invoice': 'إنشاء فاتورة شراء',
  'Payments': 'المدفوعات',
  'Payment Voucher Approval': 'الموافقة على سندات الصرف',
  'Create Payment Voucher': 'إنشاء سند صرف',
  'Vendors': 'الموردون',
  'Contracts': 'العقود',
  'Create Contract': 'إنشاء عقد',
  'Documents': 'المستندات',
  'Notifications': 'الإشعارات',
  'Audit Trail': 'سجل التدقيق',
  'User Management': 'إدارة المستخدمين',
  'Roles & Permissions': 'الأدوار والصلاحيات',
  'Approval Levels': 'مستويات الموافقة',
  'Company Settings': 'إعدادات الشركة',
  'Form Builder': 'منشئ النماذج',
  'Custom Form Builder': 'منشئ النماذج المخصصة',
  'Form Responses': 'ردود النماذج',
  'Forms Settings': 'إعدادات النماذج',
  'Purchase Requisitions': 'طلبات الشراء',
  'Reports & Analytics': 'التقارير والتحليلات',
  'Reports': 'التقارير',
  'Governance': 'الحوكمة',
  'Procurement': 'المشتريات والتوريد',
  'Approvals': 'الموافقات',
  'Orders & Payments': 'الطلبات والمدفوعات',
  'Admin': 'الإدارة',
  'Administration': 'الإدارة',
  'Account': 'الحساب',
  'Main': 'الرئيسية',
  'Budget Management': 'إدارة الميزانية',
  'Goods Receipt Note (GRN)': 'إشعار استلام البضائع (GRN)',
  'GRN Entry & Management': 'إدخال وإدارة إشعار استلام البضائع',

  // Vendor Portal Titles
  'Vendor Dashboard': 'لوحة تحكم المورد',
  'My RFQs': 'طلبات الأسعار الخاصة بي',
  'My Quotations': 'عروض الأسعار الخاصة بي',
  'My Orders': 'طلباتي',
  'My Invoices': 'فواتيري',
  'My Invoices & Dispatches': 'فواتيري وشحناتي',
  'My Payments': 'مدفوعاتي',
  'My Contracts': 'عقودي',
  'Agreements': 'الاتفاقيات',
  'My Profile': 'ملفي الشخصي',
  'My Signature': 'توقيعي',
  'Signature': 'التوقيع الرقمي',
  'New Onboarding': 'تسجيل جديد',
  'Vendor Onboarding': 'تأهيل الموردين',
  'Onboarding Queue': 'قائمة الانتظار للتأهيل',

  // Tabs & Sections
  'Overview': 'نظرة عامة',
  'Terms & Clauses': 'الشروط والأحكام',
  'Document Preview': 'معاينة المستند',
  'SLA Entries': 'بنود اتفاقية مستوى الخدمة',
  'Milestones': 'المراحل والمعالم',
  'Audit Log': 'سجل التدقيق',
  'General': 'عام',
  'Branding': 'الهوية البصرية',
  'Departments': 'الأقسام',
  'Warehouses': 'المستودعات',
  'Required Documents': 'المستندات المطلوبة',
  'Positions': 'المناصب والمسميات',
  'Categories': 'الفئات',
  'Units': 'وحدات القياس',
  'Payment Terms': 'شروط الدفع',
  'Email Templates': 'قوالب البريد الإلكتروني',
  'Documents & Templates': 'المستندات والقوالب',
  'Documents & Contracts': 'المستندات والعقود',
  'Document Serialization': 'الترقيم التسلسلي للمستندات',

  // Common Buttons & Actions
  'Create New': 'إنشاء جديد',
  'Create RFQ': 'إنشاء طلب سعر',
  'Create Purchase Order': 'إنشاء أمر شراء',
  'Sign Contract': 'توقيع العقد',
  'Execute & Sign Contract': 'تنفيذ وتوقيع العقد',
  'Sign Now': 'توقيع الآن',
  'Download PDF': 'تحميل PDF',
  'Print': 'طباعة',
  'Save Changes': 'حفظ التغييرات',
  'Save': 'حفظ',
  'Cancel': 'إلغاء',
  'Delete': 'حذف',
  'Edit': 'تعديل',
  'View': 'عرض',
  'Filter': 'تصفية',
  'Search': 'بحث',
  'Back': 'رجوع',
  'Close': 'إغلاق',
  'Submit': 'إرسال',
  'Submitting...': 'جاري الإرسال...',
  'Approve': 'موافقة',
  'Reject': 'رفض',
  'Export': 'تصدير',
  'Import': 'استيراد',
  'Clear': 'مسح',
  'Draw': 'رسم',
  'Upload': 'رفع',
  'Back to Contracts': 'الرجوع إلى العقود',
  'Awaiting Your Signature': 'في انتظار توقيعك',
  'Lock Now': 'قفل الآن',
  'Change Passcode': 'تغيير رمز المرور',
  'Disable Passcode': 'تعطيل رمز المرور',

  // Table Columns & Card Labels
  'Title': 'العنوان',
  'Status': 'الحالة',
  'Vendor': 'المورد',
  'Contract Value': 'قيمة العقد',
  'Award Value': 'القيمة الممنوحة',
  'Total Value': 'القيمة الإجمالية',
  'Effective Date': 'تاريخ السريان',
  'Expiration Date': 'تاريخ الانتهاء',
  'Expiry Date': 'تاريخ الانتهاء',
  'Created Date': 'تاريخ الإنشاء',
  'Actions': 'الإجراءات',
  'Department': 'القسم',
  'Category': 'الفئة',
  'Priority': 'الأولوية',
  'Currency': 'العملة',
  'Amount': 'المبلغ',
  'Delivery Terms': 'شروط التسليم',
  'Default Currency': 'العملة الافتراضية',
  'Language & Localization': 'اللغة والتعريب',
  'Portal Name': 'اسم البوابة',
  'Company Active Users Quota': 'حصة المستخدمين النشطين للشركة',
  'Current User Seat Limit': 'حد مقاعد المستخدمين الحالي',

  // Summary Card Titles & Admin Labels
  'Total Roles': 'إجمالي الأدوار',
  'System Roles': 'أدوار النظام',
  'Custom Roles': 'أدوار مخصصة',
  'Total Users': 'إجمالي المستخدمين',
  'Active Users': 'المستخدمون النشطون',
  'Inactive Users': 'المستخدمون غير النشطين',
  'Pending Approvals': 'موافقات قيد الانتظار',
  'Approved Requests': 'الطلبات المعتمدة',
  'Rejected Requests': 'الطلبات المرفوضة',
  'Returned Requests': 'الطلبات المعادة',
  'Total RFQs': 'إجمالي طلبات الأسعار',
  'Open RFQs': 'طلبات الأسعار المفتوحة',
  'Closed RFQs': 'طلبات الأسعار المغلقة',
  'Total Quotations': 'إجمالي عروض الأسعار',
  'Under Review': 'قيد المراجعة',
  'Shortlisted': 'القائمة المختصرة',
  'Total Orders': 'إجمالي الطلبات',
  'Pending Orders': 'طلبات قيد الانتظار',
  'Approved Orders': 'طلبات معتمدة',
  'Completed Orders': 'طلبات مكتملة',
  'Total Contracts': 'إجمالي العقود',
  'Active Contracts': 'عقود نشطة',
  'Pending Signatures': 'توقيعات قيد الانتظار',
  'Total Vendors': 'إجمالي الموردين',
  'Active Vendors': 'موردون نشطون',
  'Inactive Vendors': 'موردون غير نشطين',
  'Top Rated': 'الأعلى تقييماً',
  'Create Role': 'إنشاء دور',
  'Add User': 'إضافة مستخدم',
  'Edit Permissions': 'تعديل الصلاحيات',
  'View Permissions': 'عرض الصلاحيات',
  'Compare Quotations': 'مقارنة عروض الأسعار',

  // Status Badges
  'Active': 'نشط',
  'Draft': 'مسودة',
  'Pending': 'قيد الانتظار',
  'Approved': 'معتمد',
  'Rejected': 'مرفوض',
  'Completed': 'مكتمل',
  'Expired': 'منتهي',
  'Terminated': 'ملغى',
  'AWAITING_VENDOR_SIGNATURE': 'بانتظار توقيع المورد',
  'PENDING_VENDOR_SIGNATURE': 'بانتظار توقيع المورد',
  'VENDOR_SIGNED': 'تم توقيع المورد',

  // Contract Content Labels
  'CONTRACT VALUE AND PRICING': 'قيمة العقد والأسعار',
  'GENERAL PROVISIONS': 'أحكام عامة',
  'GOVERNING LAW': 'القانون المعمول به',
  'FOR THE BUYER': 'عن المشتري',
  'FOR THE SUPPLIER': 'عن المورد',
  'Signed By': 'تم التوقيع بواسطة',
  'Date': 'التاريخ',
  'BUYER': 'المشتري',
  'SUPPLIER': 'المورد',
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

  [/Total Roles/gi, 'Total des rôles'],
  [/System Roles/gi, 'Rôles système'],
  [/Custom Roles/gi, 'Rôles personnalisés'],
  [/Total Users/gi, 'Total des utilisateurs'],
  [/Active Users/gi, 'Utilisateurs actifs'],
  [/Inactive Users/gi, 'Utilisateurs inactifs'],
  [/Pending Approvals/gi, 'Approbations en attente'],
  [/Approved Requests/gi, 'Demandes approuvées'],
  [/Rejected Requests/gi, 'Demandes rejetées'],
  [/Returned Requests/gi, 'Demandes retournées'],
  [/Open RFQs/gi, 'RFQs ouvertes'],
  [/Closed RFQs/gi, 'RFQs fermées'],
  [/Total Quotations/gi, 'Total des devis'],
  [/Under Review/gi, "En cours d'examen"],
  [/Shortlisted/gi, 'Sélectionné'],
  [/Total Vendors/gi, 'Total des fournisseurs'],
  [/Active Vendors/gi, 'Fournisseurs actifs'],
  [/Inactive Vendors/gi, 'Fournisseurs inactifs'],
  [/Top Rated/gi, 'Mieux notés'],
  [/Create Role/gi, 'Créer un rôle'],
  [/Add User/gi, 'Ajouter un utilisateur'],
  [/Edit Permissions/gi, 'Modifier les autorisations'],
  [/View Permissions/gi, 'Afficher les autorisations'],
  [/Compare Quotations/gi, 'Comparer les devis'],

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

// ─── Arabic Phrase Mappings for Substring Fallback ───────────
const PHRASE_TRANSLATIONS_AR: [RegExp, string][] = [
  [/Request for Quotations/gi, 'طلبات عروض الأسعار (RFQ)'],
  [/Quotation Approval/gi, 'الموافقة على عروض الأسعار'],
  [/PO Creation & Orders/gi, 'إنشاء أوامر الشراء والطلبات'],
  [/Purchase Order Approval/gi, 'الموافقة على أمر الشراء'],
  [/Purchase Invoice Approval/gi, 'الموافقة على فواتير الشراء'],
  [/Payment Voucher Approval/gi, 'الموافقة على سندات الصرف'],
  [/User Management/gi, 'إدارة المستخدمين'],
  [/Roles & Permissions/gi, 'الأدوار والصلاحيات'],
  [/Approval Levels/gi, 'مستويات الموافقة'],
  [/Company Settings/gi, 'إعدادات الشركة'],
  [/Form Builder/gi, 'منشئ النماذج'],
  [/Form Responses/gi, 'ردود النماذج'],
  [/Forms Settings/gi, 'إعدادات النماذج'],
  [/Vendor Dashboard/gi, 'لوحة تحكم المورد'],
  [/Purchase Requisitions/gi, 'طلبات الشراء'],
  [/Accounts Payable/gi, 'حسابات الموردين'],
  [/Reports & Analytics/gi, 'التقارير والتحليلات'],
  [/Audit Trail/gi, 'سجل التدقيق'],
  [/Back to Contracts/gi, 'الرجوع إلى العقود'],
  [/Terms & Clauses/gi, 'الشروط والأحكام'],
  [/Document Preview/gi, 'معاينة المستند'],

  [/Create Contract/gi, 'إنشاء عقد'],
  [/Create New Contract/gi, 'إنشاء عقد جديد'],
  [/New Contract/gi, 'عقد جديد'],
  [/Create RFQ/gi, 'إنشاء طلب سعر'],
  [/New RFQ/gi, 'طلب سعر جديد'],
  [/Create Purchase Order/gi, 'إنشاء أمر شراء'],
  [/New Purchase Order/gi, 'أمر شراء جديد'],
  [/Create Purchase Invoice/gi, 'إنشاء فاتورة شراء'],
  [/Create Payment Voucher/gi, 'إنشاء سند صرف'],
  [/Digital Signature Execution/gi, 'تنفيذ التوقيع الرقمي'],
  [/Signer Authorization/gi, 'تفويض الموقع'],
  [/Signature Studio/gi, 'أستوديو التوقيع'],
  [/Sign Now/gi, 'توقيع الآن'],
  [/Download PDF/gi, 'تحميل PDF'],
  [/Awaiting Your Signature/gi, 'في انتظار توقيعك'],
  [/Execute & Sign Contract/gi, 'تنفيذ وتوقيع العقد'],
  [/Sign here using your mouse or touch screen/gi, 'وقع هنا باستخدام الفأرة أو شاشة اللمس'],
  [/Save Changes/gi, 'حفظ التغييرات'],

  [/CONTRACT VALUE AND PRICING/gi, 'قيمة العقد والأسعار'],
  [/GENERAL PROVISIONS/gi, 'أحكام عامة'],
  [/GOVERNING LAW/gi, 'القانون المعمول به'],
  [/FOR THE BUYER/gi, 'عن المشتري'],
  [/FOR THE SUPPLIER/gi, 'عن المورد'],
  [/Payment Terms/gi, 'شروط الدفع'],
  [/Delivery Terms/gi, 'شروط التسليم'],
  [/Effective Date/gi, 'تاريخ السريان'],
  [/Expiration Date/gi, 'تاريخ الانتهاء'],
  [/Expiry Date/gi, 'تاريخ الانتهاء'],
  [/Contract Value/gi, 'قيمة العقد'],
  [/Award Value/gi, 'القيمة الممنوحة'],
  [/Total Value/gi, 'القيمة الإجمالية'],
  [/Source RFQ/gi, 'طلب السعر المصدر'],
  [/Signed By/gi, 'تم التوقيع بواسطة'],

  [/Total Roles/gi, 'إجمالي الأدوار'],
  [/System Roles/gi, 'أدوار النظام'],
  [/Custom Roles/gi, 'أدوار مخصصة'],
  [/Total Users/gi, 'إجمالي المستخدمين'],
  [/Active Users/gi, 'المستخدمون النشطون'],
  [/Inactive Users/gi, 'المستخدمون غير النشطين'],
  [/Pending Approvals/gi, 'موافقات قيد الانتظار'],
  [/Approved Requests/gi, 'الطلبات المعتمدة'],
  [/Rejected Requests/gi, 'الطلبات المرفوضة'],
  [/Returned Requests/gi, 'الطلبات المعادة'],
  [/Open RFQs/gi, 'طلبات الأسعار المفتوحة'],
  [/Closed RFQs/gi, 'طلبات الأسعار المغلقة'],
  [/Total Quotations/gi, 'إجمالي عروض الأسعار'],
  [/Under Review/gi, 'قيد المراجعة'],
  [/Shortlisted/gi, 'القائمة المختصرة'],
  [/Total Vendors/gi, 'إجمالي الموردين'],
  [/Active Vendors/gi, 'موردون نشطون'],
  [/Inactive Vendors/gi, 'موردون غير نشطين'],
  [/Top Rated/gi, 'الأعلى تقييماً'],
  [/Create Role/gi, 'إنشاء دور'],
  [/Add User/gi, 'إضافة مستخدم'],
  [/Edit Permissions/gi, 'تعديل الصلاحيات'],
  [/View Permissions/gi, 'عرض الصلاحيات'],
  [/Compare Quotations/gi, 'مقارنة عروض الأسعار'],

  [/Total Contracts/gi, 'إجمالي العقود'],
  [/Active Contracts/gi, 'عقود نشطة'],
  [/Pending Signatures/gi, 'توقيعات قيد الانتظار'],
  [/Total RFQs/gi, 'إجمالي طلبات الأسعار'],
  [/Total Orders/gi, 'إجمالي الطلبات'],
  [/Total Invoices/gi, 'إجمالي الفواتير'],
  [/Vendor Name/gi, 'اسم المورد'],
  [/Contract Number/gi, 'رقم العقد'],
  [/RFQ Number/gi, 'رقم طلب السعر'],
  [/PO Number/gi, 'رقم أمر الشراء'],
  [/Quotation Number/gi, 'رقم عرض السعر'],

  [/\bContracts\b/gi, 'العقود'],
  [/\bContract\b/gi, 'عقد'],
  [/\bQuotations\b/gi, 'عروض الأسعار'],
  [/\bQuotation\b/gi, 'عرض سعر'],
  [/\bRequisitions\b/gi, 'طلبات الشراء'],
  [/\bRequisition\b/gi, 'طلب شراء'],
  [/\bOrders\b/gi, 'الطلبات'],
  [/\bOrder\b/gi, 'طلب'],
  [/\bInvoices\b/gi, 'الفواتير'],
  [/\bInvoice\b/gi, 'فاتورة'],
  [/\bVendors\b/gi, 'الموردون'],
  [/\bVendor\b/gi, 'مورد'],
  [/\bPayments\b/gi, 'المدفوعات'],
  [/\bPayment\b/gi, 'دفعة'],
  [/\bApprovals\b/gi, 'الموافقات'],
  [/\bApproval\b/gi, 'موافقة'],
  [/\bDocuments\b/gi, 'المستندات'],
  [/\bDocument\b/gi, 'مستند'],
  [/\bReports\b/gi, 'التقارير'],
  [/\bReport\b/gi, 'تقرير'],
  [/\bSettings\b/gi, 'الإعدادات'],
  [/\bUsers\b/gi, 'المستخدمون'],
  [/\bUser\b/gi, 'مستخدم'],
  [/\bRoles\b/gi, 'الأدوار'],
  [/\bPermissions\b/gi, 'الصلاحيات'],
  [/\bNotifications\b/gi, 'الإشعارات'],
  [/\bOverview\b/gi, 'نظرة عامة'],
  [/\bClauses\b/gi, 'البنود'],
  [/\bItems\b/gi, 'الأصناف'],
  [/\bActions\b/gi, 'الإجراءات'],
  [/\bStatus\b/gi, 'الحالة'],
  [/\bTitle\b/gi, 'العنوان'],
  [/\bAmount\b/gi, 'المبلغ'],
  [/\bCurrency\b/gi, 'العملة'],
  [/\bPriority\b/gi, 'الأولوية'],
  [/\bDepartment\b/gi, 'القسم'],
  [/\bCategory\b/gi, 'الفئة'],
  [/\bFilter\b/gi, 'تصفية'],
  [/\bSearch\b/gi, 'بحث'],
  [/\bSave\b/gi, 'حفظ'],
  [/\bCancel\b/gi, 'إلغاء'],
  [/\bDelete\b/gi, 'حذف'],
  [/\bEdit\b/gi, 'تعديل'],
  [/\bView\b/gi, 'عرض'],
  [/\bPrint\b/gi, 'طباعة'],
  [/\bExport\b/gi, 'تصدير'],
  [/\bImport\b/gi, 'استيراد'],
  [/\bClear\b/gi, 'مسح'],
  [/\bDraw\b/gi, 'رسم'],
  [/\bUpload\b/gi, 'رفع'],
  [/\bActive\b/gi, 'نشط'],
  [/\bDraft\b/gi, 'مسودة'],
  [/\bPending\b/gi, 'قيد الانتظار'],
  [/\bApproved\b/gi, 'معتمد'],
  [/\bRejected\b/gi, 'مرفوض'],
  [/\bCompleted\b/gi, 'مكتمل'],
  [/\bExpired\b/gi, 'منتهي'],
  [/\bTerminated\b/gi, 'ملغى'],
  [/\bBlack Ink\b/gi, 'حبر أسود'],
  [/\bNavy Blue\b/gi, 'أزرق داكن'],
  [/\bRoyal Blue\b/gi, 'أزرق ملكي'],
  [/\bRed Ink\b/gi, 'حبر أحمر'],
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
    'settings.language_desc': 'Select your preferred interface language across the entire Procnex portal.',
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
    'settings.language_desc': "Choisissez votre langue d'interface préférée sur l'ensemble du portail Procnex.",
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
  ar: {
    'nav.dashboard': 'لوحة التحكم',
    'nav.requisitions': 'طلبات الشراء',
    'nav.rfqs': 'طلبات عروض الأسعار (RFQ)',
    'nav.quotations': 'عروض الأسعار',
    'nav.contracts': 'العقود',
    'nav.orders': 'أوامر الشراء',
    'nav.ap': 'حسابات الموردين',
    'nav.payments': 'المدفوعات',
    'nav.vendors': 'الموردون',
    'nav.reports': 'التقارير والتحليلات',
    'nav.settings': 'إعدادات الشركة',
    'nav.users': 'المستخدمون والوصول',
    'nav.roles': 'الأدوار والصلاحيات',
    'nav.approvals': 'الموافقات',
    'nav.documents': 'المستندات',
    'nav.audit': 'سجل التدقيق',
    'nav.notifications': 'الإشعارات',

    'settings.title': 'إعدادات الشركة',
    'settings.language_title': 'اللغة والتعريب',
    'settings.system_language': 'لغة النظام',
    'settings.language_desc': 'حدد لغة الواجهة المفضلة لديك عبر كامل بوابة Procnex.',
    'settings.english': 'English 🇺🇸',
    'settings.french': 'Français 🇫🇷',
    'settings.arabic': 'العربية 🇦🇪',
    'settings.saved_msg': 'تم حفظ تفضيلات لغة النظام بنجاح.',

    'action.save': 'حفظ التغييرات',
    'action.cancel': 'إلغاء',
    'action.delete': 'حذف',
    'action.edit': 'تعديل',
    'action.view': 'عرض',
    'action.sign_now': 'توقيع الآن',
    'action.download_pdf': 'تحميل PDF',
    'action.print': 'طباعة',
    'action.search': 'بحث',
    'action.filter': 'تصفية',
    'action.create': 'إنشاء جديد',
    'action.back': 'رجوع',
    'action.close': 'إغلاق',
    'action.loading': 'جاري التحميل...',
    'action.submitting': 'جاري الإرسال...',

    'status.active': 'نشط',
    'status.draft': 'مسودة',
    'status.pending': 'قيد الانتظار',
    'status.approved': 'معتمد',
    'status.completed': 'مكتمل',
    'status.expired': 'منتهي',
    'status.awaiting_signature': 'في انتظار التوقيع',
  },
};

function getStoredLanguage(): Language {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'en' || stored === 'fr' || stored === 'ar') return stored;
  } catch {
    // localStorage unavailable
  }
  return 'en';
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => getStoredLanguage());

  // Global DOM Auto-Translator Effect for French & Arabic
  useEffect(() => {
    document.documentElement.setAttribute('lang', language);

    if (language === 'en') {
      if (document.documentElement.getAttribute('data-lang-applied')) {
        document.documentElement.removeAttribute('data-lang-applied');
        window.location.reload();
      }
      return;
    }

    const currentApplied = document.documentElement.getAttribute('data-lang-applied');
    if (currentApplied && currentApplied !== language) {
      document.documentElement.removeAttribute('data-lang-applied');
      window.location.reload();
      return;
    }

    document.documentElement.setAttribute('data-lang-applied', language);

    const exactMap = language === 'fr' ? EXACT_MAP_FR : EXACT_MAP_AR;
    const phraseMap = language === 'fr' ? PHRASE_TRANSLATIONS_FR : PHRASE_TRANSLATIONS_AR;

    const translateElement = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE && node.nodeValue) {
        const raw = node.nodeValue;
        const trimmed = raw.trim();

        // 1. Exact string match
        if (trimmed && exactMap[trimmed]) {
          const leading = raw.match(/^\s*/)?.[0] || '';
          const trailing = raw.match(/\s*$/)?.[0] || '';
          node.nodeValue = leading + exactMap[trimmed] + trailing;
          return;
        }

        // 2. Regex phrase replacements (with lastIndex reset on each iteration)
        let text = raw;
        let modified = false;
        for (const [regex, replacement] of phraseMap) {
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
              if (exactMap[pTrim]) {
                elem.placeholder = exactMap[pTrim];
              } else {
                let pText = elem.placeholder;
                for (const [regex, replacement] of phraseMap) {
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
          if (exactMap[tTrim]) {
            elem.setAttribute('title', exactMap[tTrim]);
          } else {
            for (const [regex, replacement] of phraseMap) {
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
    setLanguage(language === 'en' ? 'fr' : language === 'fr' ? 'ar' : 'en');
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
        isArabic: language === 'ar',
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
