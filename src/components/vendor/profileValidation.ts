import type { VendorProfileData } from '../../services/vendorPortalService';

/** Match the vendor password API without trimming or altering password characters. */
export function passwordValidation(current: string, next: string, confirmation: string) {
  return {
    current: current.length === 0 ? 'Enter your current password.' : '',
    next: next.length < 8 ? 'Use at least 8 characters.' : next.length > 128 ? 'Use no more than 128 characters.' : '',
    confirmation: !confirmation ? 'Confirm your new password.' : next !== confirmation ? 'New passwords do not match.' : '',
  };
}

export function bankingFormValues(banking: VendorProfileData['banking']) {
  return {
    bankName: banking.bankName ?? '',
    bankBranch: banking.bankBranch ?? '',
    bankAccountNumber: banking.bankAccountNumber ?? '',
    bankIfscCode: banking.bankIfscCode ?? '',
  };
}
