import { describe, it, expect } from 'vitest';
import { getNotificationTargetUrl, getVendorNotificationTargetUrl } from '../notificationRouter';

describe('notificationRouter', () => {
  describe('Form notification routing (getNotificationTargetUrl)', () => {
    it('should route "🔔 New Form Assigned" to /forms?tab=pending', () => {
      const url = getNotificationTargetUrl(
        '🔔 New Form Assigned',
        'You have received a new form: "Vendor Evaluation Form".'
      );
      expect(url).toBe('/forms?tab=pending');
    });

    it('should route "🔔 Form Approval Required" to /forms?tab=approval_pending', () => {
      const url = getNotificationTargetUrl(
        '🔔 Form Approval Required (Level 1)',
        'Form "Annual Vendor Assessment" submitted by John requires Level 1 approval (Purchase Manager).'
      );
      expect(url).toBe('/forms?tab=approval_pending');
    });

    it('should route Level 1 approval for form to /forms?tab=approval_pending', () => {
      const url = getNotificationTargetUrl(
        '🔔 Level 1 Approval Required (Purchase Manager)',
        'New form "Safety Audit" published by Admin requires your Level 1 (Purchase Manager) review and approval.'
      );
      expect(url).toBe('/forms?tab=approval_pending');
    });

    it('should route "🔔 Form Submitted for Approval" to /forms?tab=submitted', () => {
      const url = getNotificationTargetUrl(
        '🔔 Form Submitted for Approval',
        'Your submission for "Safety Audit" has been received and sent for Level 1 approval.'
      );
      expect(url).toBe('/forms?tab=submitted');
    });

    it('should route "🔔 Form Progress Update" to /forms?tab=submitted', () => {
      const url = getNotificationTargetUrl(
        '🔔 Form Progress Update',
        'Your submission for "Safety Audit" passed Level 1 and advanced to Level 2 (Finance).'
      );
      expect(url).toBe('/forms?tab=submitted');
    });

    it('should route "🎉 Form Fully Approved" to /forms?tab=completed', () => {
      const url = getNotificationTargetUrl(
        '🎉 Form Fully Approved',
        'Your submission for "Safety Audit" has been fully approved by all levels!'
      );
      expect(url).toBe('/forms?tab=completed');
    });

    it('should route "⚠️ Form Returned for Revision" to /forms?tab=returned', () => {
      const url = getNotificationTargetUrl(
        '⚠️ Form Returned for Revision',
        'Your submission for "Safety Audit" was returned by Jane. Reason: Missing tax ID.'
      );
      expect(url).toBe('/forms?tab=returned');
    });

    it('should route "⚠️ Form Returned for Level 1 Re-review" to /forms?tab=returned', () => {
      const url = getNotificationTargetUrl(
        '⚠️ Form Returned for Level 1 Re-review',
        'Form "Vendor Registration Form" was returned at Level 2 and requires Level 1 re-review.'
      );
      expect(url).toBe('/forms?tab=returned');
    });

    it('should route "📝 Form Response Submitted" to /admin/form-responses', () => {
      const url = getNotificationTargetUrl(
        '📝 Form Response Submitted',
        'User Alice has submitted a response for form "Vendor Feedback".'
      );
      expect(url).toBe('/admin/form-responses');
    });

    it('should route general form notifications to /forms', () => {
      const url = getNotificationTargetUrl(
        'Custom Form Update',
        'Details about the custom form template.'
      );
      expect(url).toBe('/forms');
    });
  });

  describe('Contract and other notification routing', () => {
    it('should NOT route "New Form Assigned" to /contracts despite containing "assigned"', () => {
      const url = getNotificationTargetUrl('New Form Assigned', 'Task assigned to you');
      expect(url).not.toBe('/contracts');
      expect(url).toBe('/forms?tab=pending');
    });

    it('should route contract notifications to /contracts', () => {
      const url = getNotificationTargetUrl('Contract Signed', 'Vendor has signed the digital contract CNT-00123');
      expect(url).toBe('/contracts?search=CNT-00123');
    });

    it('should route e-signature notifications to /contracts', () => {
      const url = getNotificationTargetUrl('E-Signature Completed', 'Digital agreement CTR-456 has been completed');
      expect(url).toBe('/contracts?search=CTR-456');
    });

    it('should route PO notifications to /procurement/purchase-orders or /approvals', () => {
      expect(getNotificationTargetUrl('PO Created', 'Purchase Order PO-987 is ready')).toBe(
        '/procurement/purchase-orders?search=PO-987'
      );
      expect(getNotificationTargetUrl('Purchase Order Approval Required', 'PO-987 requires review')).toBe(
        '/approvals?search=PO-987'
      );
    });

    it('should route RFQ notifications to /rfq', () => {
      expect(getNotificationTargetUrl('New RFQ', 'RFQ-2024 has been published')).toBe(
        '/rfq?search=RFQ-2024'
      );
    });

    it('should route Quotation notifications to /quotations', () => {
      expect(getNotificationTargetUrl('Winning Quotation Selected', 'QTN-555 won RFQ-100')).toBe(
        '/quotations?rfq=RFQ-100'
      );
    });

    it('should route Payment Voucher notifications to /procurement/create-payment-voucher or /payments', () => {
      expect(
        getNotificationTargetUrl(
          'Payment Voucher Created',
          'Draft Payment Voucher #PAY-20260408-1234 has been automatically created for approved Invoice #PI-2026-0001 (Acme Corp, KES 50,000).'
        )
      ).toBe('/procurement/create-payment-voucher?search=PAY-20260408-1234');

      expect(
        getNotificationTargetUrl(
          'Payment Voucher Created',
          'Draft Payment Voucher #PAY-20261009-9876 has been automatically created for approved Invoice #INV-2026-0095 (Apex Cloud Technologies, KES 50,000). Please review/edit and submit for approval.'
        )
      ).toBe('/procurement/create-payment-voucher?search=PAY-20261009-9876');

      expect(
        getNotificationTargetUrl(
          'Payment Voucher Approval Required',
          'Payment Voucher PAY-20260408-1234 requires your Level 1 review.'
        )
      ).toBe('/payments?search=PAY-20260408-1234');

      expect(
        getNotificationTargetUrl(
          'Payment Voucher Approval — Level 2',
          'Payment Voucher #PAY-20261009-9876 has passed Level 1 and now requires Level 2 approval.'
        )
      ).toBe('/payments?search=PAY-20261009-9876');
    });

    it('should route "Vendor Invoice / Dispatch Note Received" notifications to /procurement/create-purchase-invoice', () => {
      expect(
        getNotificationTargetUrl(
          'Vendor Invoice / Dispatch Note Received: #INV-2026-0095',
          'Vendor Apex Cloud Technologies has submitted Tax Invoice / Dispatch Note #INV-2026-0095 for PO #PO-20261008-5382. Please review and generate GRN & Purchase Invoice in the company system.'
        )
      ).toBe('/procurement/create-purchase-invoice?poId=PO-20261008-5382');

      expect(
        getNotificationTargetUrl(
          'Vendor Invoice Received',
          'New invoice submitted by supplier without PO ref'
        )
      ).toBe('/procurement/create-purchase-invoice');
    });
  });

  describe('Vendor notification routing (getVendorNotificationTargetUrl)', () => {
    it('should NOT route assigned notifications to /contracts due to "sign" substring', () => {
      const url = getVendorNotificationTargetUrl('New Form Assigned', 'Form assigned', undefined, 'HEL');
      expect(url).not.toBe('/v/HEL/contracts');
      expect(url).toBe('/v/HEL/agreements');
    });

    it('should route signed contract notifications to /contracts', () => {
      const url = getVendorNotificationTargetUrl('Contract Signed', 'Agreement signed', undefined, 'HEL');
      expect(url).toBe('/v/HEL/contracts');
    });

    it('should route "Quotation Submitted" notification to My Quotations (/vendor/quotations)', () => {
      const url = getVendorNotificationTargetUrl(
        'Quotation Submitted',
        'Your quotation for RFQ #HCL-RFQ-0061 has been submitted successfully and is now under review.',
        'rfq_123',
        undefined
      );
      expect(url).toBe('/vendor/quotations?search=HCL-RFQ-0061');
    });

    it('should route branded "Quotation Submitted" notification to /v/:companyCode/quotations', () => {
      const url = getVendorNotificationTargetUrl(
        'Quotation Submitted',
        'Your quotation for RFQ #HCL-RFQ-0061 has been submitted successfully and is now under review.',
        'rfq_123',
        'HEL'
      );
      expect(url).toBe('/v/HEL/quotations?search=HCL-RFQ-0061');
    });

    it('should route quotation status updates to /vendor/quotations', () => {
      expect(
        getVendorNotificationTargetUrl(
          '🎉 Quotation Approved — You Are the Winning Vendor!',
          'Congratulations! Your quotation for RFQ #HCL-RFQ-0061 has been fully approved.',
          'rfq_123'
        )
      ).toBe('/vendor/quotations?search=HCL-RFQ-0061');

      expect(
        getVendorNotificationTargetUrl(
          'Quotation Update — Not Selected',
          'Thank you for your quotation for RFQ #HCL-RFQ-0061.',
          'rfq_123'
        )
      ).toBe('/vendor/quotations?search=HCL-RFQ-0061');

      expect(
        getVendorNotificationTargetUrl(
          'Quotation Returned — Resubmission Required',
          'Your quotation for RFQ #HCL-RFQ-0061 has been returned by the approver.',
          'rfq_123'
        )
      ).toBe('/vendor/quotations?search=HCL-RFQ-0061');
    });

    it('should route RFQ invitations to /vendor/rfqs', () => {
      expect(
        getVendorNotificationTargetUrl(
          'New RFQ: HCL-RFQ-0061',
          'You have been invited to submit a quotation for "Office Supplies".',
          'rfq_123'
        )
      ).toBe('/vendor/rfqs?rfq=rfq_123');
    });
  });
});
