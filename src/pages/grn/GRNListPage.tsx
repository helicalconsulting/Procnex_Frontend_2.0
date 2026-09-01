import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useServiceData } from '../../hooks/useServiceData';
import { grnService, type GoodsReceivedNote } from '../../services/grnService';
import { purchaseOrderService } from '../../services/purchaseOrderService';
import { invoiceService } from '../../services/invoiceService';
import {
  PackageCheck,
  Search,
  Truck,
  Receipt,
  ArrowRight,
  Eye,
  X,
  ShoppingCart,
  CheckCircle2,
} from 'lucide-react';
import { useCurrency } from '../../components/shared/CurrencyMaster';
import './GRNListPage.css';

export default function GRNListPage() {
  const navigate = useNavigate();
  const { companyDefaultCurrency, formatAmount } = useCurrency();

  const [search, setSearch] = useState('');
  const [kpiFilter, setKpiFilter] = useState<'ALL' | 'PENDING' | 'GRN'>('ALL');
  const [selectedGrn, setSelectedGrn] = useState<GoodsReceivedNote | null>(null);

  // Load GRNs
  const { data: grnData, loading: grnLoading } = useServiceData(
    () => grnService.list({ search }),
    { grns: [], total: 0 },
    [search]
  );
  const grns = grnData.grns || [];

  // Load Purchase Orders
  const { data: poData, loading: poLoading } = useServiceData(
    () => purchaseOrderService.list({ limit: 100 }),
    { orders: [], total: 0 },
    []
  );
  const poList = poData.orders || [];

  // Load Invoices to check if GRN / PO is already invoiced
  const { data: invoicesList } = useServiceData(
    () => invoiceService.list(),
    [],
    []
  );

  const invoicedPoNumbers = useMemo(() => {
    const set = new Set<string>();
    (invoicesList || []).forEach((inv) => {
      if (inv.poNumber) set.add(String(inv.poNumber).toLowerCase());
      if (inv.id) set.add(String(inv.id).toLowerCase());
    });
    return set;
  }, [invoicesList]);

  // Filter POs by search & KPI filter — ONLY Approved/Confirmed orders can have GRNs created
  const filteredPOs = useMemo(() => {
    let list = poList.filter((po) => {
      const s = String(po?.status || '').toUpperCase();
      return s === 'APPROVED' || s === 'CONFIRMED' || s === 'SENT_TO_VENDOR' || s === 'PROCESSING' || s === 'SHIPPED' || s === 'GRN_RECEIVED';
    });

    if (kpiFilter === 'PENDING') {
      list = list.filter((po) => String(po?.status || '') !== 'GRN_RECEIVED' && String(po?.status || '') !== 'DELIVERED');
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((po) => {
        const poNum = String(po?.poNumber || '');
        const vName = typeof po?.vendor === 'object' && po?.vendor?.name ? String(po.vendor.name) : (typeof po?.vendor === 'string' ? po.vendor : '');
        const statusStr = String(po?.status || '');
        return (
          poNum.toLowerCase().includes(q) ||
          vName.toLowerCase().includes(q) ||
          statusStr.toLowerCase().includes(q)
        );
      });
    }
    return list;
  }, [poList, search, kpiFilter]);

  // Filter GRNs by search
  const filteredGRNs = useMemo(() => {
    if (!search.trim()) return grns;
    const q = search.toLowerCase();
    return grns.filter((g) => {
      const gNum = String(g?.grnNumber || '');
      const poNum = String(g?.purchaseOrder?.poNumber || '');
      const vName = typeof g?.purchaseOrder?.vendor === 'object' && g?.purchaseOrder?.vendor?.name ? String(g.purchaseOrder.vendor.name) : '';
      return (
        gNum.toLowerCase().includes(q) ||
        poNum.toLowerCase().includes(q) ||
        vName.toLowerCase().includes(q)
      );
    });
  }, [grns, search]);

  // Eligible Approved POs for GRN creation
  const approvedOrders = useMemo(() => {
    return poList.filter((po) => {
      const s = String(po?.status || '').toUpperCase();
      return s === 'APPROVED' || s === 'CONFIRMED' || s === 'SENT_TO_VENDOR' || s === 'PROCESSING' || s === 'SHIPPED' || s === 'GRN_RECEIVED';
    });
  }, [poList]);

  // KPIs
  const kpis = useMemo(() => {
    return {
      totalOrders: approvedOrders.length,
      recordedGrns: grns.length,
      pendingGrns: Math.max(0, approvedOrders.length - grns.length),
    };
  }, [approvedOrders, grns]);

  return (
    <div className="grn-page">
      {/* Header */}
      <div className="grn-header">
        <div>
          <h1>My Invoices & GRN 📦</h1>
          <p>View all purchase orders, generate GRNs, and manage received delivery notes</p>
        </div>
      </div>

      {/* Clickable Filter KPI Cards */}
      <div className="grn-kpis">
        {/* Card 1: Total Approved Orders */}
        <div
          className={`grn-kpi-card ${kpiFilter === 'ALL' ? 'grn-kpi-card--active-primary' : ''}`}
          onClick={() => setKpiFilter('ALL')}
          title="Click to view all approved orders"
        >
          <div className="grn-kpi-icon" style={{ background: 'rgba(10, 110, 209, 0.1)', color: 'var(--primary-500)' }}>
            <ShoppingCart size={22} />
          </div>
          <div>
            <div className="grn-kpi-label">Total Approved Orders</div>
            <div className="grn-kpi-value">{kpis.totalOrders}</div>
          </div>
        </div>

        {/* Card 2: Orders Pending GRN */}
        <div
          className={`grn-kpi-card ${kpiFilter === 'PENDING' ? 'grn-kpi-card--active-warning' : ''}`}
          onClick={() => setKpiFilter('PENDING')}
          title="Click to view orders pending GRN"
        >
          <div className="grn-kpi-icon" style={{ background: 'rgba(234, 179, 8, 0.1)', color: '#eab308' }}>
            <Truck size={22} />
          </div>
          <div>
            <div className="grn-kpi-label">Orders Pending GRN</div>
            <div className="grn-kpi-value">{kpis.pendingGrns}</div>
          </div>
        </div>

        {/* Card 3: Recorded GRNs */}
        <div
          className={`grn-kpi-card ${kpiFilter === 'GRN' ? 'grn-kpi-card--active-success' : ''}`}
          onClick={() => setKpiFilter('GRN')}
          title="Click to view recorded GRNs"
        >
          <div className="grn-kpi-icon" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
            <PackageCheck size={22} />
          </div>
          <div>
            <div className="grn-kpi-label">Recorded GRNs</div>
            <div className="grn-kpi-value">{kpis.recordedGrns}</div>
          </div>
        </div>
      </div>

      {/* Horizontally Full Length Search Bar */}
      <div className="grn-toolbar">
        <div className="grn-search-box">
          <Search size={18} style={{ color: 'var(--text-secondary)' }} />
          <input
            type="text"
            placeholder={
              kpiFilter === 'GRN'
                ? 'Search across recorded GRNs by GRN number, PO number, or supplier...'
                : 'Search across all approved orders by PO number or supplier name in full length...'
            }
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Conditional Table Display based on Clicked KPI Card */}
      {kpiFilter !== 'GRN' ? (
        /* Orders Table (ALL or PENDING) */
        <div className="grn-table-wrap">
          <table className="grn-table">
            <thead>
              <tr>
                <th>PO Number</th>
                <th>Supplier / Vendor</th>
                <th>Total Value</th>
                <th>Order Date</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {poLoading ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '36px', color: 'var(--text-secondary)' }}>
                    Loading Purchase Orders…
                  </td>
                </tr>
              ) : filteredPOs.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '48px' }}>
                    <div style={{ fontSize: 32, marginBottom: 8 }}>🛒</div>
                    <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-primary)' }}>
                      {kpiFilter === 'PENDING' ? 'No Orders Pending GRN' : 'No Purchase Orders Found'}
                    </div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>
                      {search ? 'Try adjusting your full length search query.' : 'Once purchase orders are generated, they will appear here.'}
                    </div>
                  </td>
                </tr>
              ) : (
                filteredPOs.map((po) => {
                  const poNum = String(po?.poNumber || '');
                  const vName = typeof po?.vendor === 'object' && po?.vendor?.name ? String(po.vendor.name) : (typeof po?.vendor === 'string' ? po.vendor : 'Supplier');
                  const statusStr = String(po?.status || 'APPROVED');
                  return (
                    <tr key={String(po.id)}>
                      <td style={{ fontWeight: 700, color: 'var(--primary-500)' }}>{poNum}</td>
                      <td style={{ fontWeight: 600 }}>{vName}</td>
                      <td style={{ fontWeight: 700 }}>{formatAmount(po.totalAmount, companyDefaultCurrency)}</td>
                      <td>{new Date(po.createdAt || Date.now()).toLocaleDateString()}</td>
                      <td>
                        <span className="grn-status-badge grn-status-badge--po">
                          {statusStr}
                        </span>
                      </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                        <button
                          className="grn-action-btn-generate"
                          onClick={() => navigate(`/procurement/create-grn?poId=${po.id}`)}
                        >
                          <Truck size={14} /> Generate GRN
                        </button>
                        <button
                          className="grn-action-btn-invoice"
                          onClick={() => navigate(`/procurement/create-purchase-invoice?poId=${po.id}`)}
                        >
                          <Receipt size={14} /> Create Invoice
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
              )}
            </tbody>
          </table>
        </div>
      ) : (
        /* Recorded GRNs Table */
        <div className="grn-table-wrap">
          <table className="grn-table">
            <thead>
              <tr>
                <th>GRN Number</th>
                <th>Linked PO Number</th>
                <th>Supplier / Vendor</th>
                <th>Received Date</th>
                <th>Items Count</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {grnLoading ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '36px', color: 'var(--text-secondary)' }}>
                    Loading Goods Received Notes…
                  </td>
                </tr>
              ) : filteredGRNs.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '48px' }}>
                    <div style={{ fontSize: 32, marginBottom: 8 }}>📦</div>
                    <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-primary)' }}>No GRNs Recorded Yet</div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>
                      Click "Total Approved Orders" card above to select an order and generate a GRN.
                    </div>
                  </td>
                </tr>
              ) : (
                filteredGRNs.map((grn) => {
                  const poNum = String(grn.purchaseOrder?.poNumber || '').toLowerCase();
                  const poId = String(grn.poId || grn.purchaseOrder?.id || '').toLowerCase();
                  const grnNum = String(grn.grnNumber || '').toLowerCase();
                  const grnId = String(grn.id || '').toLowerCase();

                  const poObj = poList.find((p) => String(p.id) === String(grn.poId) || String(p.poNumber) === String(grn.purchaseOrder?.poNumber));
                  const isPoInvoiced = poObj && (poObj.status === 'INVOICED' || poObj.status === 'CLOSED');

                  const isInvoiced =
                    isPoInvoiced ||
                    (poNum && invoicedPoNumbers.has(poNum)) ||
                    (poId && invoicedPoNumbers.has(poId)) ||
                    (grnNum && invoicedPoNumbers.has(grnNum)) ||
                    (grnId && invoicedPoNumbers.has(grnId));

                  return (
                    <tr key={grn.id}>
                      <td style={{ fontWeight: 700, color: 'var(--primary-500)' }}>{grn.grnNumber}</td>
                      <td style={{ fontWeight: 600 }}>{grn.purchaseOrder?.poNumber || '—'}</td>
                      <td>{grn.purchaseOrder?.vendor?.name || 'Supplier'}</td>
                      <td>{new Date(grn.receivedDate).toLocaleDateString()}</td>
                      <td>{grn.items?.length || 0} line item(s)</td>
                      <td>
                        {isInvoiced ? (
                          <span className="grn-status-badge grn-status-badge--invoiced">
                            <CheckCircle2 size={12} /> INVOICED
                          </span>
                        ) : (
                          <span className="grn-status-badge grn-status-badge--received">
                            RECEIVED
                          </span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right', minWidth: '270px' }}>
                        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', alignItems: 'center' }}>
                          <button
                            className="grn-btn-view"
                            onClick={() => setSelectedGrn(grn)}
                          >
                            <Eye size={14} /> View Details
                          </button>
                          {isInvoiced ? (
                            <button className="grn-btn-invoiced" disabled title="Invoice already sent for this order">
                              <CheckCircle2 size={14} /> Invoice Sent
                            </button>
                          ) : (
                            <button
                              className="grn-btn-create-invoice"
                              onClick={() => {
                                const targetPo = grn.purchaseOrder?.poNumber || grn.poId || grn.purchaseOrder?.id;
                                const targetGrn = grn.grnNumber || grn.id;
                                navigate(`/procurement/create-purchase-invoice?poId=${targetPo}&grnId=${targetGrn}`);
                              }}
                            >
                              <Receipt size={14} /> Create Invoice <ArrowRight size={13} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Details Modal */}
      {selectedGrn && (
        <div className="grn-modal-overlay" onClick={() => setSelectedGrn(null)}>
          <div className="grn-modal" onClick={(e) => e.stopPropagation()}>
            <div className="grn-modal__header">
              <div>
                <h2>{selectedGrn.grnNumber}</h2>
                <p>Linked PO: {selectedGrn.purchaseOrder?.poNumber} | Supplier: {selectedGrn.purchaseOrder?.vendor?.name}</p>
              </div>
              <button className="grn-close-btn" onClick={() => setSelectedGrn(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="grn-modal__body">
              <h4 style={{ margin: '0 0 12px 0' }}>Received Items Breakdown</h4>
              <table className="grn-table">
                <thead>
                  <tr>
                    <th>Item Name</th>
                    <th>Ordered Qty</th>
                    <th>Delivered / Received Qty</th>
                    <th>Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedGrn.items?.map((it) => (
                    <tr key={it.id}>
                      <td style={{ fontWeight: 600 }}>{it.itemName}</td>
                      <td>{it.orderedQty}</td>
                      <td style={{ fontWeight: 700, color: 'var(--primary-500)' }}>{it.receivedQty}</td>
                      <td style={{ color: 'var(--text-secondary)' }}>{it.remarks || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {selectedGrn.notes && (
                <div style={{ marginTop: 16 }}>
                  <strong>Notes / Remarks:</strong>
                  <p style={{ margin: '4px 0 0 0', color: 'var(--text-secondary)' }}>{selectedGrn.notes}</p>
                </div>
              )}
            </div>
            <div className="grn-modal__footer">
              <button className="cpo-btn cpo-btn--secondary" onClick={() => setSelectedGrn(null)}>
                Close
              </button>
              {(() => {
                const safeStr = (v: any) => {
                  if (!v) return '';
                  if (typeof v === 'string') return v;
                  if (typeof v === 'number') return String(v);
                  if (typeof v === 'object') return v.$oid || v._id || v.id || v.poNumber || v.grnNumber || '';
                  return '';
                };

                const poNum = safeStr(selectedGrn.purchaseOrder?.poNumber).toLowerCase();
                const poId = safeStr(selectedGrn.poId || selectedGrn.purchaseOrder?.id).toLowerCase();
                const grnNum = safeStr(selectedGrn.grnNumber).toLowerCase();
                const grnId = safeStr(selectedGrn.id).toLowerCase();

                const targetSelectedPoId = safeStr(selectedGrn.poId);
                const targetSelectedPoNum = safeStr(selectedGrn.purchaseOrder?.poNumber);
                const poObj = poList.find((p) => {
                  const pId = safeStr(p.id);
                  const pNum = safeStr(p.poNumber);
                  return (pId && pId === targetSelectedPoId) || (pNum && pNum === targetSelectedPoNum);
                });
                const isPoInvoiced = poObj && (poObj.status === 'INVOICED' || poObj.status === 'CLOSED');

                const isModalGrnInvoiced =
                  isPoInvoiced ||
                  (poNum && invoicedPoNumbers.has(poNum)) ||
                  (poId && invoicedPoNumbers.has(poId)) ||
                  (grnNum && invoicedPoNumbers.has(grnNum)) ||
                  (grnId && invoicedPoNumbers.has(grnId));

                if (isModalGrnInvoiced) {
                  return (
                    <button className="grn-btn-invoiced" disabled style={{ padding: '9px 18px', fontSize: '13.5px' }}>
                      <CheckCircle2 size={16} /> Invoice Sent for this GRN
                    </button>
                  );
                }

                return (
                  <button
                    className="grn-btn-create-invoice"
                    onClick={() => {
                      const targetPo = selectedGrn.purchaseOrder?.poNumber || selectedGrn.poId || selectedGrn.purchaseOrder?.id;
                      const targetGrn = selectedGrn.grnNumber || selectedGrn.id;
                      setSelectedGrn(null);
                      navigate(`/procurement/create-purchase-invoice?poId=${targetPo}&grnId=${targetGrn}`);
                    }}
                  >
                    <Receipt size={15} /> Create Purchase Invoice for this GRN
                  </button>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
