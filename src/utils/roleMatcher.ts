/**
 * Role matching utility for frontend with strict functional separation.
 * Mirrors backend role-matcher.ts to ensure roles from distinct approval levels
 * (e.g. Purchase Clerk vs Analyst vs Developer) NEVER cross-match.
 */

const stripPrefix = (str: string) => str.replace(/^level\s*\d+(\s*of\s*\d+)?\s*:\s*/i, '').trim();

const cleanRole = (str: string) => stripPrefix(str).toLowerCase().trim().replace(/[\s_-]+/g, '');

const ROLE_GROUPS: Record<string, { keys: string[]; names: string[] }> = {
  PURCHASE_CLERK: {
    keys: [
      'purchaseclerk', 'purchase_clerk', 'purchaseofficer', 'purchase_officer',
      'procurementofficer', 'procurement_officer', 'procurementclerk', 'procurement_clerk',
      'buyer', 'purchaseclerk1', 'purchaseofficer1', 'procurementofficer1'
    ],
    names: [
      'Purchase Clerk', 'purchase clerk', 'Purchase_Clerk', 'purchase_clerk', 'purchaseclerk', 'PurchaseClerk', 'PURCHASE_CLERK', 'PURCHASE CLERK',
      'Purchase Officer', 'purchase officer', 'Purchase_Officer', 'purchase_officer', 'purchaseofficer', 'PURCHASE_OFFICER',
      'Procurement Officer', 'procurement officer', 'Procurement_Officer', 'procurement_officer', 'procurementofficer', 'PROCUREMENT_OFFICER',
      'Procurement Clerk', 'procurement clerk', 'Procurement_Clerk', 'procurement_clerk',
      'Buyer', 'buyer', 'BUYER'
    ]
  },
  PURCHASE_MANAGER: {
    keys: [
      'purchasemanager', 'purchase_manager', 'procurementmanager', 'procurement_manager',
      'purchasehead', 'headofprocurement', 'purchasemanager2', 'purchaseordermanager'
    ],
    names: [
      'Purchase Manager', 'purchase manager', 'Purchase_Manager', 'purchase_manager', 'purchasemanager', 'PurchaseManager', 'PURCHASE_MANAGER', 'PURCHASE MANAGER',
      'Procurement Manager', 'procurement manager', 'Procurement_Manager', 'procurement_manager', 'procurementmanager', 'PROCUREMENT_MANAGER', 'PROCUREMENT MANAGER',
      'Purchase Head', 'purchase head', 'Head of Procurement', 'head of procurement'
    ]
  },
  FINANCE_APPROVER: {
    keys: [
      'financeapprover', 'finance_approver', 'financeofficer', 'finance_officer', 'finance'
    ],
    names: [
      'Finance Approver', 'finance approver', 'Finance_Approver', 'finance_approver', 'financeapprover', 'FINANCE_APPROVER',
      'Finance Officer', 'finance officer', 'Finance_Officer', 'finance_officer',
      'Finance', 'finance', 'FINANCE'
    ]
  },
  FINANCE_MANAGER: {
    keys: [
      'financemanager', 'finance_manager'
    ],
    names: [
      'Finance Manager', 'finance manager', 'Finance_Manager', 'finance_manager', 'financemanager', 'FINANCE_MANAGER'
    ]
  },
  ACCOUNTS_PAYABLE: {
    keys: [
      'accountspayable', 'accounts_payable'
    ],
    names: [
      'Accounts Payable', 'accounts payable', 'Accounts_Payable', 'accounts_payable', 'accountspayable', 'ACCOUNTS_PAYABLE'
    ]
  },
  ANALYST: {
    keys: [
      'analyst', 'analystuser', 'analyst_user'
    ],
    names: [
      'Analyst', 'analyst', 'ANALYST', 'Analyst User', 'analyst_user'
    ]
  },
  DEVELOPER: {
    keys: [
      'developer', 'developeruser', 'developer_user', 'softwareengineer', 'software_engineer', 'dev'
    ],
    names: [
      'Developer', 'developer', 'DEVELOPER', 'developer_user', 'Software Engineer', 'software engineer', 'software_engineer', 'dev', 'DEV'
    ]
  },
  ADMIN: {
    keys: [
      'admin', 'superadmin', 'super_admin', 'systemadministrator', 'system_administrator', 'administrator',
      'founder', 'co-founder', 'cofounder', 'owner'
    ],
    names: [
      'Super Admin', 'super admin', 'Super_Admin', 'super_admin', 'superadmin', 'SuperAdmin', 'SUPER_ADMIN', 'SUPER ADMIN',
      'Admin', 'admin', 'ADMIN',
      'System Administrator', 'system administrator', 'System_Administrator', 'system_administrator', 'systemadministrator',
      'Administrator', 'administrator', 'ADMINISTRATOR',
      'Founder', 'founder', 'FOUNDER', 'Co-Founder', 'co-founder', 'Owner', 'owner'
    ]
  },
  EXECUTIVE: {
    keys: [
      'generalmanager', 'general_manager', 'managingdirector', 'managing_director', 'director', 'executive',
      'gm', 'ceo', 'cfo', 'coo', 'vp', 'vicepresident'
    ],
    names: [
      'General Manager', 'general manager', 'General_Manager', 'general_manager', 'generalmanager', 'GENERAL_MANAGER', 'GENERAL MANAGER',
      'Managing Director', 'managing director', 'Managing_Director', 'managing_director', 'managingdirector', 'MANAGING_DIRECTOR',
      'Director', 'director', 'DIRECTOR',
      'Executive', 'executive', 'EXECUTIVE',
      'CEO', 'ceo', 'CFO', 'cfo', 'COO', 'coo', 'VP', 'vp', 'Vice President'
    ]
  },
  PAYMENT_APPROVER: {
    keys: [
      'paymentapprover', 'payment_approver', 'paymentvoucherapprover', 'payment_voucher_approver',
      'paymentapprover1', 'payment_approver_1', 'paymentvoucherapprover1', 'paymentvoucherapprovers'
    ],
    names: [
      'Payment Approver', 'payment approver', 'Payment Voucher Approver', 'payment voucher approver',
      'Payment Approver 1', 'payment approver 1', 'Payment Voucher Approver 1', 'payment voucher approver 1',
      'Payment Approvers', 'payment approvers'
    ]
  },
  INVOICE_APPROVER: {
    keys: [
      'invoiceapprover', 'invoice_approver', 'purchaseinvoiceapprover', 'purchase_invoice_approver',
      'invoiceapprover1', 'invoice_approver_1', 'purchaseinvoiceapprover1', 'purchaseinvoiceapproverlevel1',
      'invoiceapprovers'
    ],
    names: [
      'Invoice Approver', 'invoice approver', 'Purchase Invoice Approver', 'purchase invoice approver',
      'Invoice Approver 1', 'invoice approver 1', 'Purchase Invoice Approver 1', 'purchase invoice approver 1',
      'Invoice Approvers', 'invoice approvers'
    ]
  },
  GENERIC_L1: {
    keys: [
      'l1user', 'l1_user', 'l1', 'approver1', 'approver_1', 'level1user', 'level_1_user',
      'level1', 'level_1', 'level1approver', 'approverlevel1', 'l1approver', 'poapprover1', 'po_approver_1'
    ],
    names: [
      'Approver 1', 'approver 1', 'Approver1', 'approver1', 'Level 1 User', 'level 1 user',
      'Level 1 Approver', 'level 1 approver', 'L1 User', 'l1 user', 'L1', 'l1', 'Level 1', 'level 1',
      'PO Approver 1', 'po approver 1', 'PO Approver', 'po approver'
    ]
  },
  GENERIC_L2: {
    keys: [
      'l2user', 'l2_user', 'l2', 'approver2', 'approver_2', 'level2user', 'level_2_user',
      'level2', 'level_2', 'level2approver', 'approverlevel2', 'l2approver', 'poapprover2', 'po_approver_2'
    ],
    names: [
      'Approver 2', 'approver 2', 'Approver2', 'approver2', 'Level 2 User', 'level 2 user',
      'Level 2 Approver', 'level 2 approver', 'L2 User', 'l2 user', 'L2', 'l2', 'Level 2', 'level 2',
      'PO Approver 2', 'po approver 2'
    ]
  },
  GENERIC_L3: {
    keys: [
      'l3user', 'l3_user', 'l3', 'approver3', 'approver_3', 'level3user', 'level_3_user',
      'level3', 'level_3', 'level3approver', 'approverlevel3', 'l3approver', 'poapprover3', 'po_approver_3'
    ],
    names: [
      'Approver 3', 'approver 3', 'Approver3', 'approver3', 'Level 3 User', 'level 3 user',
      'Level 3 Approver', 'level 3 approver', 'L3 User', 'l3 user', 'L3', 'l3', 'Level 3', 'level 3',
      'PO Approver 3', 'po approver 3'
    ]
  },
  GENERIC_L4: {
    keys: [
      'l4user', 'l4_user', 'l4', 'approver4', 'approver_4', 'level4user', 'level_4_user',
      'level4', 'level_4', 'level4approver', 'approverlevel4', 'l4approver', 'poapprover4', 'po_approver_4'
    ],
    names: [
      'Approver 4', 'approver 4', 'Approver4', 'approver4', 'Level 4 User', 'level 4 user',
      'Level 4 Approver', 'level 4 approver', 'L4 User', 'l4 user', 'L4', 'l4', 'Level 4', 'level 4',
      'PO Approver 4', 'po approver 4'
    ]
  }
};

const KEY_TO_GROUP: Record<string, string> = {};
for (const [groupName, group] of Object.entries(ROLE_GROUPS)) {
  for (const k of group.keys) {
    const cleanKey = cleanRole(k);
    KEY_TO_GROUP[cleanKey] = groupName;
  }
}

export function isRoleMatching(
  requiredRole?: string,
  userRoles?: string | string[],
  options?: { allowAdmin?: boolean }
): boolean {
  if (!requiredRole || !userRoles) return false;

  const userRoleList = Array.isArray(userRoles) ? userRoles : [userRoles];
  if (userRoleList.length === 0) return false;

  const reqClean = cleanRole(requiredRole);
  if (!reqClean) return false;

  const reqGroup = KEY_TO_GROUP[reqClean];

  return userRoleList.some((uRole) => {
    if (!uRole) return false;
    const uClean = cleanRole(uRole);
    if (!uClean) return false;

    // Direct exact match
    if (reqClean === uClean) return true;

    // Group-based matching
    const uGroup = KEY_TO_GROUP[uClean];
    if (reqGroup && uGroup && reqGroup === uGroup) return true;

    // Admin match if allowed (defaults to false for approval step matching to prevent admin from matching every level)
    if (options?.allowAdmin && uGroup === 'ADMIN') return true;

    return false;
  });
}
