import { useAuth } from '../../context/AuthContext';
import { useServiceData } from '../../hooks/useServiceData';
import { vendorPortalService, type VendorProfileData } from '../../services/vendorPortalService';
import { PageFrame, PageLead } from '../../components/ui/product';
import { VendorSignatureSection } from '../../components/vendor/VendorSignatureSection';
import { DetailSkeleton } from '../../components/shared/Skeleton';
import '../../styles/vendor-portal.css';

const EMPTY_PROFILE: VendorProfileData = {
  company: { name: '', email: '', phone: null, address: null, location: null, website: null, category: null, contactPerson: null, gstNumber: null, panNumber: null, status: '', isActive: false, createdAt: '' },
  banking: { bankName: null, bankBranch: null, bankAccountNumber: null, bankIfscCode: null },
  documents: [],
  performance: { avgQuality: 0, avgDelivery: 0, avgPriceScore: 0, overallScore: 0, quotationWinRate: 0, totalQuotations: 0, totalOrders: 0, deliveredOrders: 0 },
};

export default function VendorSignaturePage() {
  const { user } = useAuth();
  const { data: profile, loading } = useServiceData(
    () => vendorPortalService.getProfile(),
    EMPTY_PROFILE,
  );

  if (loading) {
    return (
      <PageFrame className="vendor-signature-page">
        <DetailSkeleton />
      </PageFrame>
    );
  }

  return (
    <PageFrame className="vendor-signature-page space-y-6">
      <PageLead
        title="My Digital Signature"
        description="Create, manage, and store your digital signature for seamless one-click signing across purchase orders, agreements, and contracts."
      />

      <VendorSignatureSection vendorName={profile.company.name || user?.fullName} />
    </PageFrame>
  );
}
