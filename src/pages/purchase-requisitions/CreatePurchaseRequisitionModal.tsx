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
import { itemMasterService, type ItemMaster } from '../../services/itemMasterService';
import { vendorService } from '../../services/vendorService';
import { adminService, type UserWithRoles } from '../../services/adminService';
import { companySettingsService, type ItemClass, type Unit } from '../../services/companySettingsService';
import { useAuth } from '../../context/AuthContext';
import PriorityBadge from '../../components/shared/PriorityBadge';
import InventoryItemCombobox from '../../components/shared/InventoryItemCombobox';

interface RequisitionItemRow {
  itemName: string;
  itemCode?: string;
  itemClass?: string;
  preferredSupplier?: string;
  description: string;
  quantity: number | string;
  unit: string;
  estimatedPrice?: number;
}

interface CreatePurchaseRequisitionModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (newPr: any) => void;
}

const DEFAULT_DEPARTMENTS = ['Information Technology', 'Purchase', 'Finance', 'Human Resource', 'Operations', 'Sales'];
const DEFAULT_FALLBACK_UNITS = [
  { value: 'pcs', label: 'Pieces (pcs)' },
  { value: 'box', label: 'Box (box)' },
  { value: 'kg', label: 'Kilogram (kg)' },
  { value: 'ltr', label: 'Liter (ltr)' },
  { value: 'mtr', label: 'Meter (mtr)' },
  { value: 'set', label: 'Set (set)' },
  { value: 'nos', label: 'Numbers (nos)' },
  { value: 'pair', label: 'Pair (pair)' },
];
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
  const [priority, setPriority] = useState<'LOW' | 'MODERATE' | 'URGENT'>('MODERATE');
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
      itemCode: '',
      description: '',
      quantity: 1,
      unit: 'pcs',
    },
  ]);
  const [inventoryItems, setInventoryItems] = useState<ItemMaster[]>([]);

  useEffect(() => {
    itemMasterService.list({ limit: 1000 }).then((res) => {
      setInventoryItems(res.items || []);
    }).catch(() => {});
  }, []);

  const [itemClassesList, setItemClassesList] = useState<ItemClass[]>([]);
  const [unitsList, setUnitsList] = useState<Unit[]>([]);
  const [loadingUnits, setLoadingUnits] = useState(false);
  const [vendorSuggestions, setVendorSuggestions] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync Item Classes & Units dynamically from Company Settings
  useEffect(() => {
    const handleUpdate = () => {
      companySettingsService.listItemClasses(false).then(setItemClassesList).catch(() => {});
    };
    const handleUnitsUpdate = () => {
      companySettingsService
        .listUnits()
        .then((units) => {
          setUnitsList((units || []).filter((u) => u && u.isActive !== false));
        })
        .catch(() => {});
    };
    window.addEventListener('itemClassesChanged', handleUpdate);
    window.addEventListener('unitsChanged', handleUnitsUpdate);
    return () => {
      window.removeEventListener('itemClassesChanged', handleUpdate);
      window.removeEventListener('unitsChanged', handleUnitsUpdate);
    };
  }, []);

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
      setLoadingUnits(true);

      // Load Units from Company Settings
      companySettingsService
        .listUnits()
        .then((units) => {
          if (isMounted) {
            const activeUnits = (units || []).filter((u) => u && u.isActive !== false);
            setUnitsList(activeUnits);
            if (activeUnits.length > 0) {
              setItems((prev) =>
                prev.map((it) => {
                  if (!it.unit || it.unit.toLowerCase() === 'pcs') {
                    const match = activeUnits.find(
                      (u) =>
                        u.abbreviation?.toLowerCase() === 'pcs' ||
                        u.name.toLowerCase() === 'pcs' ||
                        u.name.toLowerCase() === 'pieces'
                    );
                    if (match) {
                      return { ...it, unit: match.abbreviation || match.name };
                    }
                    return { ...it, unit: activeUnits[0].abbreviation || activeUnits[0].name };
                  }
                  return it;
                })
              );
            }
          }
        })
        .catch(() => {
          if (isMounted) setUnitsList([]);
        })
        .finally(() => {
          if (isMounted) setLoadingUnits(false);
        });

      // Load Item Classes from Company Settings
      companySettingsService
        .listItemClasses(false)
        .then((classes) => {
          if (isMounted) {
            setItemClassesList(classes);
            if (classes.length > 0) {
              setItems((prev) =>
                prev.map((it) =>
                  !it.itemClass ? { ...it, itemClass: classes[0].name } : it
                )
              );
            }
          }
        })
        .catch(() => {});

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

      // Load Vendors for suggestions
      vendorService
        .list()
        .then((res) => {
          if (isMounted && Array.isArray(res)) {
            const names = res.map((v: any) => v.companyName || v.name).filter(Boolean);
            setVendorSuggestions(Array.from(new Set(names)));
          }
        })
        .catch(() => {});
    }
    return () => {
      isMounted = false;
    };
  }, [open, user?.department]);

  const departmentOptions = useMemo(() => {
    if (departmentsList.length > 0) return departmentsList;
    return DEFAULT_DEPARTMENTS;
  }, [departmentsList]);

  // Dynamic Unit Options derived from Company Settings (with fallback)
  const unitOptions = useMemo(() => {
    if (!unitsList || unitsList.length === 0) {
      return DEFAULT_FALLBACK_UNITS;
    }
    const seen = new Set<string>();
    const options: { value: string; label: string }[] = [];

    unitsList.forEach((u) => {
      const name = u.name?.trim();
      if (!name) return;
      const abbr = u.abbreviation?.trim();
      const val = abbr || name;
      const label = abbr && abbr.toLowerCase() !== name.toLowerCase()
        ? `${name} (${abbr})`
        : name;

      if (!seen.has(val.toLowerCase())) {
        seen.add(val.toLowerCase());
        options.push({ value: val, label });
      }
    });

    return options.length > 0 ? options : DEFAULT_FALLBACK_UNITS;
  }, [unitsList]);

  // Combined Item Classes from Company Settings and defaults
  const allItemClasses = useMemo(() => {
    const list: string[] = [];
    const seen = new Set<string>();
    (itemClassesList || []).forEach((c) => {
      if (c.name?.trim() && !seen.has(c.name.trim().toLowerCase())) {
        seen.add(c.name.trim().toLowerCase());
        list.push(c.name.trim());
      }
    });
    SUGGESTED_ITEM_CLASSES.forEach((c) => {
      if (!seen.has(c.toLowerCase())) {
        seen.add(c.toLowerCase());
        list.push(c);
      }
    });
    return list;
  }, [itemClassesList]);

  // Combined Vendor & Supplier Options
  const allVendorOptions = useMemo(() => {
    const set = new Set<string>();
    vendorSuggestions.forEach((v) => {
      if (v?.trim()) set.add(v.trim());
    });
    inventoryItems.forEach((itm) => {
      if (itm.preferredSupplierName?.trim()) set.add(itm.preferredSupplierName.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [vendorSuggestions, inventoryItems]);

  // Exclude current logged in user from dropdown
  const availableUsers = useMemo(() => {
    return usersList.filter((u) => {
      if (user?.id && String(u.id) === String(user.id)) return false;
      if (user?.username && u.username && u.username.toLowerCase() === user.username.toLowerCase()) return false;
      if (user?.email && u.email && u.email.toLowerCase() === user.email.toLowerCase()) return false;
      return true;
    });
  }, [usersList, user]);

  const effectiveDepartment = department || user?.department || 'Information Technology';

  const handleAddItem = () => {
    const defaultUnit =
      unitOptions.find((uo) => uo.value.toLowerCase() === 'pcs')?.value ||
      unitOptions[0]?.value ||
      'pcs';
    const defaultItemClass = allItemClasses[0] || '';
    setItems((prev) => [
      ...prev,
      {
        itemName: '',
        itemCode: '',
        itemClass: defaultItemClass,
        preferredSupplier: '',
        description: '',
        quantity: 1,
        unit: defaultUnit,
      },
    ]);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSelectInventoryItem = (index: number, itm: ItemMaster) => {
    setItems((prev) => {
      const next = [...prev];
      let resolvedUnit = next[index].unit;
      if (itm.uom) {
        const matchedUnit = unitOptions.find(
          (uo) =>
            uo.value.toLowerCase() === itm.uom.toLowerCase() ||
            uo.label.toLowerCase().includes(itm.uom.toLowerCase())
        );
        resolvedUnit = matchedUnit ? matchedUnit.value : itm.uom;
      }

      next[index] = {
        ...next[index],
        itemCode: itm.itemCode,
        itemName: itm.itemName,
        description: itm.description || next[index].description || '',
        itemClass: itm.productClass || next[index].itemClass || '',
        preferredSupplier: itm.preferredSupplierName || next[index].preferredSupplier || '',
        unit: resolvedUnit,
      };
      return next;
    });
  };

  const handleItemChange = (index: number, field: keyof RequisitionItemRow, value: any) => {
    setItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      if (field === 'itemCode' && typeof value === 'string' && value.trim()) {
        const query = value.trim().toLowerCase();
        const matched = inventoryItems.find((itm) => itm.itemCode?.toLowerCase() === query);
        if (matched) {
          next[index].itemName = matched.itemName;
          next[index].description = matched.description || '';
          if (matched.productClass) next[index].itemClass = matched.productClass;
          if (matched.preferredSupplierName) next[index].preferredSupplier = matched.preferredSupplierName;
          if (matched.uom) {
            const matchedUnit = unitOptions.find(
              (uo) =>
                uo.value.toLowerCase() === matched.uom.toLowerCase() ||
                uo.label.toLowerCase().includes(matched.uom.toLowerCase())
            );
            next[index].unit = matchedUnit ? matchedUnit.value : matched.uom;
          }
        }
      } else if (field === 'itemName' && typeof value === 'string' && value.trim()) {
        const query = value.trim().toLowerCase();
        const matched = inventoryItems.find((itm) => itm.itemName?.toLowerCase() === query);
        if (matched) {
          next[index].itemCode = matched.itemCode;
          next[index].description = matched.description || '';
          if (matched.productClass) next[index].itemClass = matched.productClass;
          if (matched.preferredSupplierName) next[index].preferredSupplier = matched.preferredSupplierName;
          if (matched.uom) {
            const matchedUnit = unitOptions.find(
              (uo) =>
                uo.value.toLowerCase() === matched.uom.toLowerCase() ||
                uo.label.toLowerCase().includes(matched.uom.toLowerCase())
            );
            next[index].unit = matchedUnit ? matchedUnit.value : matched.uom;
          }
        }
      }
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
        description: justification,
        items: validItems.map((it) => ({
          ...it,
          quantity: Math.max(1, Number(it.quantity) || 1),
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
      <DialogContent
        className="sm:max-w-[860px] md:max-w-[880px] max-h-[90vh] overflow-y-auto"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
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
              <Input
                className="h-[42px] text-sm bg-muted/50 cursor-not-allowed text-foreground font-medium select-none rounded-lg"
                value={department || user?.department || 'Information Technology'}
                readOnly
                tabIndex={-1}
                title="Department is assigned to your profile and cannot be changed"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-foreground flex items-center gap-1.5 mb-1.5">
                <User className="size-3.5 text-muted-foreground" /> Requester Name
              </label>
              <Input
                className="h-[42px] text-sm rounded-lg"
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
                className="w-full h-[42px] rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-xs focus:ring-1 focus:ring-primary outline-hidden cursor-pointer"
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
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Clock className="size-3.5 text-muted-foreground" /> Urgency / Priority
                </label>
                <PriorityBadge priority={priority} size="sm" />
              </div>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as any)}
                className="w-full h-[42px] rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-xs focus:ring-1 focus:ring-primary outline-hidden font-medium cursor-pointer"
              >
                <option value="LOW">Low</option>
                <option value="MODERATE">Moderate</option>
                <option value="URGENT">Urgent</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-foreground flex items-center gap-1.5 mb-1.5">
                <Calendar className="size-3.5 text-muted-foreground" /> Required By Date
              </label>
              <Input
                type="date"
                className="h-[42px] text-sm rounded-lg"
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
                  className="rounded-xl border border-border/70 bg-card p-3 relative group space-y-2.5"
                >
                  {/* Row 1: Item Code, Item Name, Quantity, Unit & Remove Button */}
                  <div className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-12 sm:col-span-3">
                      <InventoryItemCombobox
                        mode="code"
                        value={item.itemCode || ''}
                        items={inventoryItems}
                        placeholder="Item Code (e.g. AST-00001)"
                        onChange={(val) => handleItemChange(idx, 'itemCode', val)}
                        onSelect={(itm) => handleSelectInventoryItem(idx, itm)}
                      />
                    </div>
                    <div className="col-span-12 sm:col-span-4">
                      <InventoryItemCombobox
                        mode="name"
                        value={item.itemName || ''}
                        items={inventoryItems}
                        placeholder="Item Name *"
                        required
                        onChange={(val) => handleItemChange(idx, 'itemName', val)}
                        onSelect={(itm) => handleSelectInventoryItem(idx, itm)}
                      />
                    </div>
                    <div className="col-span-6 sm:col-span-2">
                      <Input
                        type="number"
                        min="1"
                        placeholder="Qty"
                        className="h-[42px] text-sm text-center rounded-lg"
                        value={item.quantity}
                        onChange={(e) => handleItemChange(idx, 'quantity', e.target.value)}
                        onBlur={() => {
                          if (item.quantity === '' || Number(item.quantity) < 1) {
                            handleItemChange(idx, 'quantity', 1);
                          }
                        }}
                        onFocus={(e) => e.target.select()}
                        required
                      />
                    </div>
                    <div className="col-span-6 sm:col-span-3 flex items-center gap-1">
                      <select
                        value={
                          unitOptions.find(
                            (opt) => opt.value.toLowerCase() === (item.unit || '').toLowerCase()
                          )?.value || item.unit
                        }
                        onChange={(e) => handleItemChange(idx, 'unit', e.target.value)}
                        className="w-full h-[42px] rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-xs focus:ring-1 focus:ring-primary outline-hidden cursor-pointer"
                        title="Unit of measurement"
                      >
                        {loadingUnits && unitOptions.length === 0 && (
                          <option value="">Loading units…</option>
                        )}
                        {unitOptions.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                        {item.unit &&
                          !unitOptions.some(
                            (opt) => opt.value.toLowerCase() === item.unit.toLowerCase()
                          ) && (
                            <option value={item.unit}>{item.unit}</option>
                          )}
                      </select>
                      {items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(idx)}
                          className="text-muted-foreground hover:text-rose-500 p-2 rounded-md transition-colors shrink-0 flex items-center justify-center h-[42px]"
                          title="Remove item"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Row 2: Item Class & Preferred Supplier */}
                  <div className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-12 sm:col-span-6">
                      <select
                        value={item.itemClass || ''}
                        onChange={(e) => handleItemChange(idx, 'itemClass', e.target.value)}
                        className="w-full h-[42px] rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-xs focus:ring-1 focus:ring-primary outline-hidden cursor-pointer"
                        title="Item Class"
                      >
                        <option value="">-- Select Item Class --</option>
                        {allItemClasses.map((cls) => (
                          <option key={cls} value={cls}>
                            {cls}
                          </option>
                        ))}
                        {item.itemClass && !allItemClasses.includes(item.itemClass) && (
                          <option value={item.itemClass}>{item.itemClass}</option>
                        )}
                      </select>
                    </div>
                    <div className="col-span-12 sm:col-span-6">
                      <select
                        value={item.preferredSupplier || ''}
                        onChange={(e) => handleItemChange(idx, 'preferredSupplier', e.target.value)}
                        className="w-full h-[42px] rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-xs focus:ring-1 focus:ring-primary outline-hidden cursor-pointer"
                        title="Preferred Supplier"
                      >
                        <option value="">-- Select Preferred Supplier (Optional) --</option>
                        {allVendorOptions.map((v) => (
                          <option key={v} value={v}>
                            {v}
                          </option>
                        ))}
                        {item.preferredSupplier && !allVendorOptions.includes(item.preferredSupplier) && (
                          <option value={item.preferredSupplier}>{item.preferredSupplier}</option>
                        )}
                      </select>
                    </div>
                  </div>

                  {/* Row 3: Item Description */}
                  <div>
                    <Input
                      placeholder="Item Description / specifications (e.g. 14 in, Core i7, 16 GB, 512 GB SSD)..."
                      className="h-[42px] text-sm text-foreground placeholder:text-muted-foreground rounded-lg"
                      value={item.description || ''}
                      onChange={(e) => handleItemChange(idx, 'description', e.target.value)}
                    />
                  </div>
                </div>
              ))}
            </div>

            <datalist id="vendor-suggestions-list">
              {Array.from(
                new Set([
                  ...vendorSuggestions,
                  ...inventoryItems.map((itm) => itm.preferredSupplierName).filter(Boolean),
                ])
              ).map((v) => (
                <option key={v} value={v!} />
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
