import React, { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import {
  FileText,
  Plus,
  Trash2,
  User,
  Building,
  Calendar,
  AlertCircle,
  Clock,
  Layers,
  UserCheck,
} from 'lucide-react';
import { purchaseRequisitionService } from '../../services/purchaseRequisitionService';
import { adminService, type UserWithRoles } from '../../services/adminService';
import { companySettingsService } from '../../services/companySettingsService';
import { useAuth } from '../../context/AuthContext';

interface RequisitionItemRow {
  itemName: string;
  itemClass?: string;
  preferredSupplier?: string;
  description: string;
  quantity: number;
  unit: string;
  estimatedPrice?: number;
}

interface CreatePurchaseRequisitionModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (newPr: any) => void;
}

const DEFAULT_DEPARTMENTS = ['Information Technology', 'Purchase', 'Finance', 'Human Resource', 'Operations', 'Sales'];
const SUGGESTED_ITEM_CLASSES = [
  'IT Hardware',
  'Networking',
  'Office Supplies',
  'Electronics',
  'Software / Licenses',
  'Furniture',
  'Facilities & Maintenance',
  'Stationery',
  'General',
];

export default function CreatePurchaseRequisitionModal({
  open,
  onClose,
  onSuccess,
}: CreatePurchaseRequisitionModalProps) {
  const { user } = useAuth();

  const [departmentsList, setDepartmentsList] = useState<string[]>([]);
  const [loadingDepts, setLoadingDepts] = useState(false);
  const [department, setDepartment] = useState(user?.department || 'Information Technology');
  const [customDepartment, setCustomDepartment] = useState('');
  const [requesterName, setRequesterName] = useState(user?.fullName || user?.username || 'Requester');
  const [priority, setPriority] = useState<'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'>('MEDIUM');
  const [deliveryDate, setDeliveryDate] = useState(
    new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
  );
  const [justification, setJustification] = useState('');

  // Submit To (Target purchase user / Approver)
  const [usersList, setUsersList] = useState<UserWithRoles[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [submittedToUserId, setSubmittedToUserId] = useState('');
  const [submittedToName, setSubmittedToName] = useState('');
  const [submittedToEmail, setSubmittedToEmail] = useState('');

  const [items, setItems] = useState<RequisitionItemRow[]>([
    {
      itemName: '',
      itemClass: 'IT Hardware',
      preferredSupplier: '',
      description: '',
      quantity: 1,
      unit: 'pcs',
    },
  ]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch departments from Company Settings & all company users when modal is opened
  useEffect(() => {
    let isMounted = true;
    if (open) {
      if (user?.fullName || user?.username) {
        setRequesterName(user.fullName || user.username || 'Requester');
      }
      if (user?.department) {
        setDepartment(user.department);
      }
      setLoadingDepts(true);
      setLoadingUsers(true);

      // Load Company Settings Departments
      companySettingsService
        .listDepartments()
        .then((deps) => {
          if (isMounted) {
            const uniqueNames = Array.from(
              new Set(
                (deps || [])
                  .filter((d) => d && d.isActive !== false && d.name?.trim())
                  .map((d) => d.name.trim())
              )
            );
            if (uniqueNames.length > 0) {
              setDepartmentsList(uniqueNames);
              setDepartment((prev) => {
                if (prev && uniqueNames.includes(prev)) return prev;
                if (user?.department && uniqueNames.includes(user.department)) return user.department;
                return uniqueNames[0];
              });
            } else {
              setDepartmentsList(DEFAULT_DEPARTMENTS);
            }
          }
        })
        .catch(() => {
          if (isMounted) setDepartmentsList(DEFAULT_DEPARTMENTS);
        })
        .finally(() => {
          if (isMounted) setLoadingDepts(false);
        });

      // Load Users
      adminService
        .listUsers()
        .then((users) => {
          if (isMounted) setUsersList(users || []);
        })
        .catch(() => {
          if (isMounted) setUsersList([]);
        })
        .finally(() => {
          if (isMounted) setLoadingUsers(false);
        });
    }
    return () => {
      isMounted = false;
    };
  }, [open, user?.department]);

  const departmentOptions = useMemo(() => {
    if (departmentsList.length > 0) return departmentsList;
    return DEFAULT_DEPARTMENTS;
  }, [departmentsList]);

  // Exclude current logged in user from dropdown
  const availableUsers = useMemo(() => {
    return usersList.filter((u) => {
      if (user?.id && String(u.id) === String(user.id)) return false;
      if (user?.username && u.username && u.username.toLowerCase() === user.username.toLowerCase()) return false;
      if (user?.email && u.email && u.email.toLowerCase() === user.email.toLowerCase()) return false;
      return true;
    });
  }, [usersList, user]);

  const effectiveDepartment = department === '__OTHER__' ? customDepartment : department;

  const handleAddItem = () => {
    setItems((prev) => [
      ...prev,
      {
        itemName: '',
        itemClass: 'IT Hardware',
        preferredSupplier: '',
        description: '',
        quantity: 1,
        unit: 'pcs',
      },
    ]);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleItemChange = (index: number, field: keyof RequisitionItemRow, value: any) => {
    setItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!effectiveDepartment) {
      setError('Please select or specify a department.');
      return;
    }
    if (!requesterName.trim()) {
      setError('Requester name is required.');
      return;
    }
    if (!submittedToUserId) {
      setError('Please select a company user in "Submit Requisition To".');
      return;
    }
    const validItems = items.filter((it) => it.itemName.trim().length > 0);
    if (validItems.length === 0) {
      setError('Please enter at least one item name.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await purchaseRequisitionService.createRequisition({
        requisitionType: 'SINGLE',
        department: effectiveDepartment,
        requesterName,
        requesterEmail: user?.email || '',
        priority,
        deliveryDate,
        submittedToUserId,
        submittedToName,
        submittedToEmail,
        justification,
        items: validItems.map((it) => ({
          ...it,
          requestedBy: requesterName,
          department: effectiveDepartment,
        })),
      });

      // Reset
      setSubmittedToUserId('');
      setSubmittedToName('');
      setSubmittedToEmail('');

      onSuccess(res.purchaseRequisition);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to submit purchase requisition.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-[720px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
              <FileText className="size-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold">New Purchase Requisition</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Raise an internal item requisition and route it to your purchase assignee.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {error && (
          <div className="flex items-center gap-2 rounded-lg bg-rose-500/10 border border-rose-500/30 p-3 text-xs text-rose-600 dark:text-rose-400">
            <AlertCircle className="size-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {/* Department, Requester & Submission Target */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="text-xs font-semibold text-foreground flex items-center gap-1.5 mb-1.5">
                <Building className="size-3.5 text-muted-foreground" /> Department
              </label>
              <select
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                disabled={loadingDepts}
                className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-xs shadow-xs focus:ring-1 focus:ring-primary outline-hidden"
              >
                {loadingDepts ? (
                  <option value="">Loading company departments...</option>
                ) : (
                  departmentOptions.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))
                )}
                <option value="__OTHER__">+ Custom Department…</option>
              </select>
              {department === '__OTHER__' && (
                <Input
                  className="mt-2 text-xs"
                  placeholder="Type department name..."
                  value={customDepartment}
                  onChange={(e) => setCustomDepartment(e.target.value)}
                />
              )}
            </div>

            <div>
              <label className="text-xs font-semibold text-foreground flex items-center gap-1.5 mb-1.5">
                <User className="size-3.5 text-muted-foreground" /> Requester Name
              </label>
              <Input
                className="text-xs"
                placeholder="e.g. Khushi, John Doe"
                value={requesterName}
                onChange={(e) => setRequesterName(e.target.value)}
                required
              />
            </div>

            {/* Submit Requisition To Dropdown */}
            <div className="sm:col-span-2">
              <label className="text-xs font-semibold text-foreground flex items-center justify-between gap-1.5 mb-1.5">
                <span className="flex items-center gap-1.5">
                  <UserCheck className="size-3.5 text-primary" /> Submit Requisition To (Purchase User / Approver)
                </span>
                <span className="text-xs font-normal text-muted-foreground">
                  (Company users excluding you)
                </span>
              </label>
              <select
                value={submittedToUserId}
                onChange={(e) => {
                  const selId = e.target.value;
                  setSubmittedToUserId(selId);
                  const selUser = availableUsers.find((u) => String(u.id) === selId);
                  if (selUser) {
                    setSubmittedToName(selUser.fullName || selUser.username || '');
                    setSubmittedToEmail(selUser.email || '');
                  } else {
                    setSubmittedToName('');
                    setSubmittedToEmail('');
                  }
                }}
                className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-xs shadow-xs focus:ring-1 focus:ring-primary outline-hidden cursor-pointer"
                required
              >
                <option value="">
                  {loadingUsers ? 'Loading company users…' : '-- Select user to submit to --'}
                </option>
                {availableUsers.map((u) => {
                  const roleStr = u.roles && u.roles.length > 0 ? u.roles.join(', ') : u.role || '';
                  const deptStr = u.department ? ` - ${u.department}` : '';
                  const detail = roleStr || deptStr ? ` (${roleStr}${deptStr})` : ` (${u.email})`;
                  return (
                    <option key={u.id} value={u.id}>
                      {u.fullName || u.username} {detail}
                    </option>
                  );
                })}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-foreground flex items-center gap-1.5 mb-1.5">
                <Clock className="size-3.5 text-muted-foreground" /> Urgency / Priority
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as any)}
                className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-xs shadow-xs focus:ring-1 focus:ring-primary outline-hidden"
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium (Standard)</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-foreground flex items-center gap-1.5 mb-1.5">
                <Calendar className="size-3.5 text-muted-foreground" /> Required By Date
              </label>
              <Input
                type="date"
                className="text-xs"
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
              />
            </div>
          </div>

          {/* Requested Line Items */}
          <div className="space-y-3 border-t border-border/60 pt-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Layers className="size-4 text-primary" /> Requested Items ({items.length})
              </label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1 border-primary/40 text-primary hover:bg-primary/5"
                onClick={handleAddItem}
              >
                <Plus className="size-3" /> Add Item
              </Button>
            </div>

            <div className="space-y-2.5">
              {items.map((item, idx) => (
                <div
                  key={idx}
                  className="rounded-xl border border-border/70 bg-card p-3 space-y-2 relative group"
                >
                  <div className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-12 sm:col-span-6">
                      <Input
                        placeholder="Item Name (e.g. Cisco Wi-Fi Router, Laptop)"
                        className="text-xs font-medium"
                        value={item.itemName}
                        onChange={(e) => handleItemChange(idx, 'itemName', e.target.value)}
                        required
                      />
                    </div>
                    <div className="col-span-6 sm:col-span-3">
                      <Input
                        type="number"
                        min="1"
                        placeholder="Qty"
                        className="text-xs text-center"
                        value={item.quantity}
                        onChange={(e) => handleItemChange(idx, 'quantity', Number(e.target.value) || 1)}
                        required
                      />
                    </div>
                    <div className="col-span-6 sm:col-span-3 flex items-center gap-1">
                      <Input
                        placeholder="Unit (pcs)"
                        className="text-xs text-center flex-1"
                        value={item.unit}
                        onChange={(e) => handleItemChange(idx, 'unit', e.target.value)}
                      />
                      {items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(idx)}
                          className="text-muted-foreground hover:text-rose-500 p-1.5 rounded-md transition-colors shrink-0"
                          title="Remove item"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-12 gap-2">
                    <div className="col-span-12 sm:col-span-4">
                      <Input
                        placeholder="Item Class / Category (e.g. IT Hardware)"
                        className="text-xs"
                        list="suggested-classes-list"
                        value={item.itemClass || ''}
                        onChange={(e) => handleItemChange(idx, 'itemClass', e.target.value)}
                      />
                    </div>
                    <div className="col-span-12 sm:col-span-4">
                      <Input
                        placeholder="Preferred Supplier (optional)"
                        className="text-xs"
                        value={item.preferredSupplier || ''}
                        onChange={(e) => handleItemChange(idx, 'preferredSupplier', e.target.value)}
                      />
                    </div>
                    <div className="col-span-12 sm:col-span-4">
                      <Input
                        placeholder="Specifications / Reason (optional)"
                        className="text-xs"
                        value={item.description}
                        onChange={(e) => handleItemChange(idx, 'description', e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <datalist id="suggested-classes-list">
              {SUGGESTED_ITEM_CLASSES.map((cls) => (
                <option key={cls} value={cls} />
              ))}
            </datalist>
          </div>

          {/* Justification / Notes */}
          <div>
            <label className="text-xs font-semibold text-foreground mb-1 block">
              Business Justification / Remarks
            </label>
            <textarea
              rows={2}
              className="w-full rounded-md border border-input bg-background p-2 text-xs shadow-xs focus:ring-1 focus:ring-primary outline-hidden"
              placeholder="Why is this purchase required? (e.g. New joiner setup, infrastructure upgrade)"
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t border-border/50">
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting} className="gap-1.5">
              {submitting ? 'Submitting…' : 'Submit Requisition'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export { CreatePurchaseRequisitionModal };
