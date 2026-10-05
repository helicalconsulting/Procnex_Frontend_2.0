import LandingTable, { type LandingColumn } from '../../components/shared/LandingTable';
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { cn } from '../../lib/utils';
import {
  formWorkflowService,
  type FormSubmissionInstance,
} from '../../services/formWorkflowService';
import {
  Users,
  CheckCircle2,
  Clock,
  TrendingUp,
  Search,
  Eye,
  Building,
  UserCheck,
  X,
  FileText,
  Inbox,
  Plus,
  RotateCcw,
  Send,
  Trash2,
  CheckSquare,
  AlertTriangle,
  Check,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { Input, Select } from '../../components/ui/input';
import { Button } from '../../components/ui/button';
import { TablePagination } from '../../components/shared/TablePagination';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../../components/ui/dialog';
import { FormResponseFields } from '../../components/admin/FormResponseFields';

export default function FormResponsesPage() {
  const { hasPermission } = useAuth();
  const canCreateCustomForm = hasPermission('Custom Form Builder', 'canCreate') || hasPermission('Form Responses', 'canCreate');
  const canApproveFormResponse = hasPermission('Form Responses', 'canApprove') || hasPermission('Custom Form Builder', 'canApprove') || hasPermission('Form Builder', 'canApprove') || hasPermission('Forms', 'canApprove');
  const [submissions, setSubmissions] = useState<FormSubmissionInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [audienceFilter, setAudienceFilter] = useState<string>('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 8;

  const [selectedResponse, setSelectedResponse] = useState<FormSubmissionInstance | null>(null);
  const responseTrigger = useRef<HTMLButtonElement | null>(null);
  const [selectedSubmissionIds, setSelectedSubmissionIds] = useState<string[]>([]);
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);


  // Lock background scroll when drawer/modal is active
  useBodyScrollLock(showDeleteConfirmModal);

  const loadAllSubmissions = useCallback(() => formWorkflowService.listAllSubmissions()
    .then(setSubmissions)
    .catch(e => console.error('Error loading form responses:', e))
    .finally(() => setLoading(false)), []);

  useEffect(() => {
    loadAllSubmissions();
  }, [loadAllSubmissions]);

  // Analytics Metrics
  const metrics = useMemo(() => {
    const totalAssigned = submissions.length;
    const totalSubmitted = submissions.filter((s) => s.status === 'submitted' || s.status === 'completed').length;
    const pendingCount = submissions.filter((s) => s.status === 'pending').length;
    const completedCount = submissions.filter((s) => s.status === 'completed').length;
    const returnedCount = submissions.filter((s) => s.status === 'returned').length;
    const responseRate = totalAssigned > 0 ? Math.round((totalSubmitted / totalAssigned) * 100) : 0;

    return {
      totalAssigned,
      totalSubmitted,
      pendingCount,
      completedCount,
      returnedCount,
      responseRate,
    };
  }, [submissions]);

  // Filtered Submissions List
  const filteredSubmissions = useMemo(() => {
    return submissions.filter((s) => {
      if (statusFilter === 'submitted') {
        if (s.status !== 'submitted' && s.status !== 'completed') return false;
      } else if (statusFilter !== 'ALL' && s.status !== statusFilter) {
        return false;
      }
      if (audienceFilter !== 'ALL' && s.audienceType !== audienceFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          s.formTitle.toLowerCase().includes(q) ||
          s.assignedUserName.toLowerCase().includes(q) ||
          s.assignedUserEmail.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [submissions, statusFilter, audienceFilter, searchQuery]);

  // Reset page to 1 on filter or search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, audienceFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredSubmissions.length / pageSize));
  const paginatedSubmissions = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredSubmissions.slice(start, start + pageSize);
  }, [filteredSubmissions, currentPage, pageSize]);

  // Selection & Delete Handlers
  const isAllSelected = useMemo(() => {
    return (
      filteredSubmissions.length > 0 &&
      filteredSubmissions.every((s) => selectedSubmissionIds.includes(s.id))
    );
  }, [filteredSubmissions, selectedSubmissionIds]);

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedSubmissionIds([]);
    } else {
      setSelectedSubmissionIds(filteredSubmissions.map((s) => s.id));
    }
  };

  const handleToggleSelectRow = (id: string) => {
    setSelectedSubmissionIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleBulkDelete = () => {
    if (selectedSubmissionIds.length === 0) return;
    setShowDeleteConfirmModal(true);
  };

  const confirmBulkDelete = async () => {
    if (selectedSubmissionIds.length === 0) return;
    setIsDeleting(true);
    try {
      await formWorkflowService.deleteSubmissions(selectedSubmissionIds);
      setSelectedSubmissionIds([]);
      setShowDeleteConfirmModal(false);
      await loadAllSubmissions();
    } catch (e) {
      console.error('Failed to delete form responses:', e);
    } finally {
      setIsDeleting(false);
    }
  };

  const renderFormApprovalLevel = (sub: FormSubmissionInstance) => {
    if (!sub.workflowAttached || !sub.approvalLevels || sub.approvalLevels.length === 0) {
      return (
        <span className="text-xs text-muted-foreground">
          {sub.status === 'completed' || sub.status === 'submitted' ? 'Direct (Completed)' : 'No Workflow'}
        </span>
      );
    }

    const total = sub.totalLevels || sub.approvalLevels.length || 1;
    const isAllCompleted = sub.status === 'completed';
    const isRejected = String(sub.status) === 'rejected';

    let current = sub.currentLevelNumber || 1;
    if (isAllCompleted) current = total + 1;

    return (
      <div className="flex items-center gap-2" title={`Level ${Math.min(current, total)} of ${total}`}>
        <div className="flex items-center">
          {Array.from({ length: total }, (_, i) => {
            const stepNum = i + 1;
            const isDone = isAllCompleted || stepNum < current;
            const isCurrent = !isAllCompleted && stepNum === current;
            return (
              <div key={i} className="flex items-center">
                <div
                  className={`flex size-6 items-center justify-center rounded-full border text-[11px] font-bold ${isDone ? 'border-emerald-500 bg-emerald-500 text-white' : isRejected && isCurrent ? 'border-destructive bg-destructive/10 text-destructive' : isCurrent ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-muted text-muted-foreground'}`}
                >
                  {isDone ? '✓' : stepNum}
                </div>
                {i < total - 1 && (
                  <div className={`h-0.5 w-3 ${isDone ? 'bg-emerald-500' : 'bg-border'}`} />
                )}
              </div>
            );
          })}
        </div>
        <span className="text-[12px] font-semibold text-muted-foreground">
          L{isAllCompleted ? total : Math.min(current, total)}/{total}
        </span>
      </div>
    );
  };

  return (
    <div className="flex w-full flex-col gap-6 pb-10">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.035em] text-foreground">Form Responses & Analytics Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Enterprise administration overview for Custom Form Builder submissions, organization-wide responses, and workflow timelines.
          </p>
        </div>

        <div>
          <Link
            to="/admin/custom-form-builder"
            className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 ${!canCreateCustomForm ? 'pointer-events-auto opacity-50 cursor-not-allowed' : ''}`}
            title={!canCreateCustomForm ? "Admin has not allowed this action. You do not have permission to create custom forms." : undefined}
            onClick={(e) => { if (!canCreateCustomForm) e.preventDefault(); }}
          >
            <Plus size={16} /> Create Custom Form
          </Link>
        </div>
      </div>

      {/* Analytics Cards Grid */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <button
          type="button"
          aria-pressed={statusFilter === 'ALL'}
          className={cn(
            'flex min-h-24 items-center gap-4 rounded-2xl border bg-card p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md cursor-pointer select-none outline-none focus-visible:ring-2 focus-visible:ring-ring/50 duration-200',
            statusFilter === 'ALL'
              ? 'border-primary/45 ring-2 ring-primary/10 bg-primary/[0.08] dark:bg-primary/20 dark:border-[#388bfd] dark:shadow-[0_0_0_1.5px_#388bfd,0_0_25px_rgba(56,139,253,0.75),0_0_10px_rgba(56,139,253,0.9),inset_0_0_15px_rgba(56,139,253,0.2)] -translate-y-0.5'
              : 'border-border/70'
          )}
          onClick={() => setStatusFilter('ALL')}
          title="Click to view all assigned user submissions"
        >
          <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Users size={20} />
          </div>
          <div className="flex flex-col">
            <span className="text-2xl font-semibold text-foreground">{metrics.totalAssigned}</span>
            <span className="text-sm text-muted-foreground">Total Users Assigned</span>
          </div>
        </button>

        <button
          type="button"
          aria-pressed={statusFilter === 'submitted'}
          className={cn(
            'flex min-h-24 items-center gap-4 rounded-2xl border bg-card p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md cursor-pointer select-none outline-none focus-visible:ring-2 focus-visible:ring-ring/50 duration-200',
            statusFilter === 'submitted'
              ? 'border-primary/45 ring-2 ring-primary/10 bg-primary/[0.08] dark:bg-primary/20 dark:border-[#388bfd] dark:shadow-[0_0_0_1.5px_#388bfd,0_0_25px_rgba(56,139,253,0.75),0_0_10px_rgba(56,139,253,0.9),inset_0_0_15px_rgba(56,139,253,0.2)] -translate-y-0.5'
              : 'border-border/70'
          )}
          onClick={() => { setStatusFilter('submitted'); setCurrentPage(1); }}
          title="Click to view submitted responses"
        >
          <div className="flex size-11 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600">
            <TrendingUp size={20} />
          </div>
          <div className="flex flex-col">
            <span className="text-2xl font-semibold text-foreground">{metrics.totalSubmitted}</span>
            <span className="text-sm text-muted-foreground">Responses Received</span>
          </div>
        </button>

        <button
          type="button"
          aria-pressed={statusFilter === 'pending'}
          className={cn(
            'flex min-h-24 items-center gap-4 rounded-2xl border bg-card p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md cursor-pointer select-none outline-none focus-visible:ring-2 focus-visible:ring-ring/50 duration-200',
            statusFilter === 'pending'
              ? 'border-primary/45 ring-2 ring-primary/10 bg-primary/[0.08] dark:bg-primary/20 dark:border-[#388bfd] dark:shadow-[0_0_0_1.5px_#388bfd,0_0_25px_rgba(56,139,253,0.75),0_0_10px_rgba(56,139,253,0.9),inset_0_0_15px_rgba(56,139,253,0.2)] -translate-y-0.5'
              : 'border-border/70'
          )}
          onClick={() => { setStatusFilter('pending'); setCurrentPage(1); }}
          title="Click to view pending responses"
        >
          <div className="flex size-11 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600">
            <Clock size={20} />
          </div>
          <div className="flex flex-col">
            <span className="text-2xl font-semibold text-foreground">{metrics.pendingCount}</span>
            <span className="text-sm text-muted-foreground">Pending Responses</span>
          </div>
        </button>

        <button
          type="button"
          aria-pressed={statusFilter === 'completed'}
          className={cn(
            'flex min-h-24 items-center gap-4 rounded-2xl border bg-card p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md cursor-pointer select-none outline-none focus-visible:ring-2 focus-visible:ring-ring/50 duration-200',
            statusFilter === 'completed'
              ? 'border-primary/45 ring-2 ring-primary/10 bg-primary/[0.08] dark:bg-primary/20 dark:border-[#388bfd] dark:shadow-[0_0_0_1.5px_#388bfd,0_0_25px_rgba(56,139,253,0.75),0_0_10px_rgba(56,139,253,0.9),inset_0_0_15px_rgba(56,139,253,0.2)] -translate-y-0.5'
              : 'border-border/70'
          )}
          onClick={() => { setStatusFilter('completed'); setCurrentPage(1); }}
          title="Click to view completed workflows"
        >
          <div className="flex size-11 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600">
            <CheckCircle2 size={20} />
          </div>
          <div className="flex flex-col">
            <span className="text-2xl font-semibold text-foreground">{metrics.completedCount}</span>
            <span className="text-sm text-muted-foreground">Completed Workflows</span>
          </div>
        </button>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-card p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="relative min-w-0 flex-1 sm:max-w-xl">
          <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            aria-label="Search form responses"
            className="pl-10 pr-3"
            placeholder="Search by form title, employee name, or email..."
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
          />
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="response-audience" className="text-xs font-semibold text-muted-foreground">Audience:</label>
          <Select id="response-audience" className="w-48"
            value={audienceFilter}
            onChange={(e) => { setAudienceFilter(e.target.value); setCurrentPage(1); }}
          >
            <option value="ALL">All Audiences</option>
            <option value="specific_users">Specific Users</option>
            <option value="whole_org">Whole Organization</option>
          </Select>
        </div>
      </div>

      {/* Floating Bulk Action Bar */}
      {selectedSubmissionIds.length > 0 && (
        <div className="sticky top-16 z-20 flex flex-col gap-3 rounded-2xl border border-primary/25 bg-card/90 p-3 shadow-xl backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-sm text-foreground">
            <CheckSquare size={18} />
            <span><strong>{selectedSubmissionIds.length}</strong> form response(s) selected</span>
          </div>
          <div className="flex gap-2">
            <button type="button" className="inline-flex min-h-10 items-center rounded-xl border border-border px-3 text-xs font-semibold hover:bg-muted" onClick={() => setSelectedSubmissionIds([])}>
              Cancel
            </button>
            <button
              type="button"
              className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-destructive px-3 text-xs font-semibold text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={!canCreateCustomForm}
              title={!canCreateCustomForm ? "Admin has not allowed this action. You do not have permission to delete form responses." : undefined}
              onClick={() => canCreateCustomForm && handleBulkDelete()}
            >
              <Trash2 size={15} /> Delete Selected ({selectedSubmissionIds.length})
            </button>
          </div>
        </div>
      )}

      {/* Submissions Table */}
      <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
        {loading ? (
          <div className="px-6 py-16 text-center text-sm text-muted-foreground">Loading form responses...</div>
        ) : filteredSubmissions.length === 0 ? (
          <div className="flex min-h-80 flex-col items-center justify-center px-6 py-12 text-center">
            <div className="flex size-16 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
              <Inbox size={32} />
            </div>
            <h3 className="mt-4 text-base font-semibold text-foreground">No Form Responses Found</h3>
            <p className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">
              There are currently no form submissions matching your filters. Go to Custom Form Builder to create and publish a form.
            </p>
            <Link to="/admin/custom-form-builder" className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground">
              <Plus size={16} /> Create Custom Form
            </Link>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <LandingTable key="form-responses" preferenceKey="form-responses" columns={FORM_RESPONSES_COLUMNS} className="w-full min-w-[1000px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-border/70 bg-muted/35 text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <th className="w-12 px-4 py-3 text-center">
                      <input
                        type="checkbox"
                        className="size-4 rounded border-input accent-primary disabled:opacity-50 disabled:cursor-not-allowed"
                        checked={isAllSelected}
                        disabled={!canCreateCustomForm}
                        onChange={canCreateCustomForm ? handleToggleSelectAll : undefined}
                        title={!canCreateCustomForm ? "Admin has not allowed this action. You do not have permission to select form responses." : "Select All Form Responses"}
                      />
                    </th>
                    <th className="px-4 py-3">Form Name</th>
                    <th className="px-4 py-3">Audience</th>
                    <th className="px-4 py-3">Assigned User</th>
                    <th className="px-4 py-3">Workflow Status</th>
                    <th className="px-4 py-3">Level Progress</th>
                    <th className="px-4 py-3">Date Assigned</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedSubmissions.map((sub) => {
                    const isSelected = selectedSubmissionIds.includes(sub.id);

                    return (
                      <tr key={sub.id} className={`border-b border-border/60 transition hover:bg-muted/25 ${isSelected ? 'bg-primary/5' : ''}`}>
                        <td className="px-4 py-3 text-center">
                          <input
                            type="checkbox"
                            className="size-4 rounded border-input accent-primary disabled:opacity-50 disabled:cursor-not-allowed"
                            checked={isSelected}
                            disabled={!canCreateCustomForm}
                            onChange={() => canCreateCustomForm && handleToggleSelectRow(sub.id)}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex min-w-0 items-center gap-2.5">
                            <FileText size={16} className="shrink-0 text-primary" />
                            <div className="flex min-w-0 flex-col">
                              <strong className="truncate text-sm font-semibold text-foreground">{sub.formTitle}</strong>
                              <span className="text-[12px] text-muted-foreground">{sub.fields.length} fields configured</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {sub.audienceType === 'whole_org' ? (
                            <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-violet-500/10 px-2.5 py-1 text-[12px] font-semibold text-violet-700 dark:text-violet-300">
                              <Building size={12} /> Whole Organization
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-blue-500/10 px-2.5 py-1 text-[12px] font-semibold text-blue-700 dark:text-blue-300">
                              <UserCheck size={12} /> Specific Users
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex min-w-0 flex-col">
                            {sub.workflowAttached ? (
                              <>
                                <span className="text-xs font-semibold text-foreground">Approval Workflow</span>
                                <span className="text-[12px] text-muted-foreground">
                                  {sub.totalLevels}-Level Sequential Approval
                                </span>
                              </>
                            ) : (
                              <>
                                <span className="text-xs font-semibold text-foreground">{sub.assignedUserName}</span>
                                <span className="truncate text-[12px] text-muted-foreground">{sub.assignedUserEmail}</span>
                              </>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-semibold ${sub.status === 'completed' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : sub.status === 'returned' || String(sub.status) === 'rejected' ? 'bg-rose-500/10 text-rose-700 dark:text-rose-300' : sub.status === 'submitted' ? 'bg-blue-500/10 text-blue-700 dark:text-blue-300' : sub.status === 'pending' ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300' : 'bg-muted text-muted-foreground'}`}>
                            {sub.status === 'completed' && <CheckCircle2 size={12} />}
                            {sub.status === 'returned' && <RotateCcw size={12} />}
                            {sub.status === 'submitted' && <Send size={12} />}
                            {sub.status === 'pending' && <Clock size={12} />}
                            {sub.status === 'draft' && <FileText size={12} />}
                            <span>{sub.status.toUpperCase()}</span>
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {renderFormApprovalLevel(sub)}
                        </td>
                        <td className="px-4 py-3">{new Date(sub.createdAt).toLocaleDateString()}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button type="button" variant="ghost" size="sm"
                              title="View Response Data"
                              onClick={event => { responseTrigger.current = event.currentTarget; setSelectedResponse(sub); }}
                            >
                              <Eye size={14} /> View Response
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </LandingTable>
            </div>
            <TablePagination
              currentPage={currentPage}
              onPageChange={setCurrentPage}
              totalItems={filteredSubmissions.length}
              perPage={pageSize}
              className="border-t border-border/70 rounded-none bg-transparent"
            />
          </>
        )}
      </div>

      {/* View Response Modal */}
      {selectedResponse && (() => {
        const retEntry = selectedResponse.timeline?.slice().reverse().find((t) => t.action === 'Returned');
        const retReason = selectedResponse.returnComments || retEntry?.comments || (selectedResponse.status === 'returned' ? 'Form returned for updates and resubmission.' : null);

        return (
          <Dialog open onOpenChange={open => { if (!open) setSelectedResponse(null); }}>
            <DialogContent hideClose className="max-w-4xl overflow-hidden p-0" onCloseAutoFocus={event => { event.preventDefault(); responseTrigger.current?.focus(); }}>
              <div className="flex items-center justify-between border-b border-border/70 px-6 py-4">
                <div>
                  <DialogTitle>{selectedResponse.formTitle}</DialogTitle>
                  <DialogDescription className="mt-1 text-xs">
                    Response by <strong>{selectedResponse.assignedUserName}</strong> {selectedResponse.assignedUserEmail && `(${selectedResponse.assignedUserEmail})`}
                  </DialogDescription>
                </div>
                <Button type="button" variant="ghost" size="icon-sm" aria-label="Close response" onClick={() => setSelectedResponse(null)}><X size={18}/></Button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {selectedResponse.status === 'returned' && retReason && (
                  <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3.5 text-xs text-amber-700 dark:text-amber-300">
                    <RotateCcw size={16} className="mt-0.5 shrink-0" />
                    <div>
                      <strong>Form Returned for Edits / Updates:</strong>
                      <p className="mt-0.5">"{retReason}"</p>
                    </div>
                  </div>
                )}

                <FormResponseFields fields={selectedResponse.fields} responseData={selectedResponse.responseData}/>
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-border/70 bg-muted/20 px-6 py-4">
                <Button type="button" variant="outline" onClick={() => setSelectedResponse(null)}>Close</Button>
                {selectedResponse.workflowAttached && selectedResponse.status !== 'completed' && (
                  <button
                    type="button"
                    className="min-h-11 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={!canApproveFormResponse}
                    title={!canApproveFormResponse ? "Admin has not allowed this action. You do not have permission to approve form responses." : undefined}
                    onClick={async () => {
                      if (!canApproveFormResponse) return;
                      try {
                        const res = await formWorkflowService.approveFormLevel(
                          selectedResponse.id,
                          'Approved by Admin in Dashboard',
                          'Admin',
                          'Super Admin',
                          'admin@heliflow.com'
                        );
                        setSelectedResponse(null);
                        loadAllSubmissions();
                        if (res.isFinalCompletion) {
                          alert('🎉 Final approval level completed! Form workflow is finished.');
                        } else {
                          alert(`✅ Level ${selectedResponse.currentLevelNumber || 1} approved! Advanced to next level.`);
                        }
                      } catch (err) {
                        console.error('Approve error:', err);
                        alert('Error approving level: ' + (err instanceof Error ? err.message : 'Please try again.'));
                      }
                    }}
                  >
                    <Check size={16} /> Approve Level {selectedResponse.currentLevelNumber || 1}
                  </button>
                )}
              </div>
            </DialogContent>
          </Dialog>
        );
      })()}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setShowDeleteConfirmModal(false)}>
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-border/70 bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 text-center">
              <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
                <AlertTriangle size={28} />
              </div>
              <h3 className="mt-4 text-lg font-semibold text-foreground">Delete Form Responses?</h3>
              <p className="mt-2 text-sm text-muted-foreground">Are you sure you want to delete <span className="font-semibold text-foreground">{selectedSubmissionIds.length}</span> selected form response(s)? This action cannot be undone.</p>
            </div>
            <div className="flex items-center justify-end gap-3 border-t border-border/70 bg-muted/20 px-6 py-4">
              <button type="button" className="min-h-11 rounded-xl border border-input bg-background px-4 text-sm font-semibold text-foreground transition hover:bg-muted" onClick={() => setShowDeleteConfirmModal(false)} disabled={isDeleting}>Cancel</button>
              <button type="button" className="min-h-11 rounded-xl bg-destructive px-4 text-sm font-semibold text-destructive-foreground transition hover:bg-destructive/90 disabled:opacity-50" onClick={confirmBulkDelete} disabled={isDeleting}>
                {isDeleting ? 'Deleting...' : 'Delete Responses'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const FORM_RESPONSES_COLUMNS: LandingColumn[] = [
  { key: 'selection', label: 'Selection', defaultVisible: true, pinned: 'start' },
  { key: 'form', label: 'Form name', defaultVisible: true, required: true },
  { key: 'audience', label: 'Audience', defaultVisible: true },
  { key: 'user', label: 'Assigned user', defaultVisible: true },
  { key: 'status', label: 'Workflow status', defaultVisible: true },
  { key: 'progress', label: 'Level progress', defaultVisible: true },
  { key: 'assigned', label: 'Date assigned', defaultVisible: true },
  { key: 'actions', label: 'Actions', defaultVisible: true, pinned: 'end' },
];
