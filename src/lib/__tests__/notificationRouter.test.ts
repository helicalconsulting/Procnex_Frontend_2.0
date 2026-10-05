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
  });
});
