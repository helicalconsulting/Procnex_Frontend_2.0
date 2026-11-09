import { useState, useEffect, useRef, useMemo } from 'react';
import {
  ListTodo,
  Clock,
  CheckCircle2,
  UserCheck,
  Search,
  ChevronDown,
  ChevronUp,
  Download,
  FileText,
  AlertCircle,
  X,
  RefreshCw,
  Calendar,
  User,
  ArrowRight,
  Plus,
} from 'lucide-react';
import { taskService, type TaskItem, type TaskAttachment } from '../../services/taskService';
import { adminService, type UserWithRoles } from '../../services/adminService';
import { useAuth } from '../../context/AuthContext';
import AssignTaskModal from './AssignTaskModal';
import './TaskInboxPopover.css';

interface TaskInboxPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  triggerRef?: React.RefObject<HTMLElement | null>;
  onTasksUpdated?: () => void;
}

export default function TaskInboxPopover({
  isOpen,
  onClose,
  triggerRef,
  onTasksUpdated,
}: TaskInboxPopoverProps) {
  const { user } = useAuth();
  const currentUserId = user?.id || '';

  const [activeTab, setActiveTab] = useState<'assigned_to_me' | 'assigned_by_me' | 'all'>('assigned_to_me');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'completed' | 'reassigned'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Reassignment state: map of taskId -> boolean indicating dropdown is open
  const [reassigningTaskId, setReassigningTaskId] = useState<string | null>(null);
  const [companyUsers, setCompanyUsers] = useState<UserWithRoles[]>([]);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState<string | null>(null);

  // Expanded task IDs for viewing description and attachments
  const [expandedTaskIds, setExpandedTaskIds] = useState<Set<string>>(new Set());
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);

  const popoverRef = useRef<HTMLDivElement>(null);

  // Fetch tasks
  const fetchTasks = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await taskService.getTasks({
        type: activeTab,
        status: statusFilter,
        search: searchQuery.trim() || undefined,
      });
      setTasks(res.tasks || []);
    } catch (err: any) {
      console.error('Failed to load tasks', err);
      setError(err?.message || 'Failed to load tasks');
    } finally {
      setLoading(false);
    }
  };

  // Fetch company users for reassignment dropdown
  useEffect(() => {
    adminService
      .listUsers()
      .then((users) => {
        setCompanyUsers(users.filter((u) => u.isActive));
      })
      .catch((err) => console.error('Failed to fetch users for reassignment', err));
  }, []);

  // Fetch tasks when popover opens, tab changes, or status filter changes
  useEffect(() => {
    if (isOpen) {
      fetchTasks();
    }
  }, [isOpen, activeTab, statusFilter]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (isAssignModalOpen) return;

      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.closest('[role="dialog"]') ||
          target.closest('[data-radix-portal]') ||
          target.closest('.motion-dialog-content') ||
          target.closest('.motion-dialog-overlay') ||
          target.closest('[data-mail-trigger="true"]'))
      ) {
        return;
      }

      if (popoverRef.current && !popoverRef.current.contains(target)) {
        if (triggerRef?.current && triggerRef.current.contains(target)) {
          return;
        }
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isAssignModalOpen) return;
      if (e.key === 'Escape') {
        onClose();
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose, triggerRef, isAssignModalOpen]);

  // Listen for global task update events
  useEffect(() => {
    const handleGlobalUpdate = () => {
      if (isOpen) {
        fetchTasks();
      }
    };
    window.addEventListener('heliflow_tasks_updated', handleGlobalUpdate);
    return () => {
      window.removeEventListener('heliflow_tasks_updated', handleGlobalUpdate);
    };
  }, [isOpen, activeTab, statusFilter]);

  const toggleExpand = (id: string) => {
    setExpandedTaskIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Handle status change
  const handleStatusChange = async (task: TaskItem, newStatus: string) => {
    if (newStatus === 'assigned_to_someone_else' || newStatus === 'reassigned') {
      // Open inline user dropdown to pick who to reassign to
      setReassigningTaskId(task.id);
      return;
    }

    setIsUpdatingStatus(task.id);
    try {
      const updated = await taskService.updateTaskStatus(task.id, {
        status: newStatus,
      });
      setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)));
      window.dispatchEvent(new CustomEvent('heliflow_tasks_updated'));
      onTasksUpdated?.();
    } catch (err: any) {
      console.error('Failed to update status', err);
      alert(err?.message || 'Failed to update status');
    } finally {
      setIsUpdatingStatus(null);
    }
  };

  // Handle reassignment execution
  const handleExecuteReassign = async (taskId: string, targetUserId: string) => {
    if (!targetUserId) return;
    setIsUpdatingStatus(taskId);
    try {
      const updated = await taskService.updateTaskStatus(taskId, {
        status: 'pending',
        reassignToUserId: targetUserId,
      });
      setTasks((prev) => prev.map((t) => (t.id === taskId ? updated : t)));
      setReassigningTaskId(null);
      window.dispatchEvent(new CustomEvent('heliflow_tasks_updated'));
      onTasksUpdated?.();
    } catch (err: any) {
      console.error('Failed to reassign task', err);
      alert(err?.message || 'Failed to reassign task');
    } finally {
      setIsUpdatingStatus(null);
    }
  };

  const formatDeadline = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return isoString;
    }
  };

  const isOverdue = (isoString: string, status: string) => {
    if (status === 'completed') return false;
    try {
      const d = new Date(isoString);
      return d.getTime() < Date.now();
    } catch {
      return false;
    }
  };

  // Filter tasks locally by search query
  const filteredTasks = useMemo(() => {
    if (!searchQuery.trim()) return tasks;
    const q = searchQuery.toLowerCase();
    return tasks.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        (t.description && t.description.toLowerCase().includes(q)) ||
        (t.assignedBy?.fullName && t.assignedBy.fullName.toLowerCase().includes(q)) ||
        (t.currentAssignee?.fullName && t.currentAssignee.fullName.toLowerCase().includes(q))
    );
  }, [tasks, searchQuery]);

  if (!isOpen) return null;

  return (
    <div
      className="task-inbox-popover"
      ref={popoverRef}
      role="dialog"
      aria-label="Tasks Inbox"
    >
      {/* Top Header */}
      <div className="task-inbox-header">
        <div className="task-inbox-header__title-row">
          <div className="task-inbox-header__title">
            <ListTodo size={19} className="text-primary-500" />
            <span>Tasks</span>
          </div>
          <div className="task-inbox-header__actions">
            <button
              type="button"
              className="task-inbox-assign-btn"
              onClick={() => setIsAssignModalOpen(true)}
              title="Assign a new task"
            >
              <Plus size={13} />
              <span>Assign Task</span>
            </button>
            <button
              type="button"
              className="task-inbox-btn-icon"
              onClick={fetchTasks}
              title="Refresh tasks"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
            <button
              type="button"
              className="task-inbox-btn-icon"
              onClick={onClose}
              title="Close"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* View Tabs */}
        <div className="task-inbox-tabs">
          <button
            type="button"
            className={`task-inbox-tab ${activeTab === 'assigned_to_me' ? 'task-inbox-tab--active' : ''}`}
            onClick={() => setActiveTab('assigned_to_me')}
          >
            Assigned to Me
          </button>
          <button
            type="button"
            className={`task-inbox-tab ${activeTab === 'assigned_by_me' ? 'task-inbox-tab--active' : ''}`}
            onClick={() => setActiveTab('assigned_by_me')}
          >
            Assigned by Me
          </button>
          <button
            type="button"
            className={`task-inbox-tab ${activeTab === 'all' ? 'task-inbox-tab--active' : ''}`}
            onClick={() => setActiveTab('all')}
          >
            All Tasks
          </button>
        </div>

        {/* Search & Status Filter Row */}
        <div className="task-inbox-controls">
          <div className="task-inbox-search">
            <Search size={13} className="task-inbox-search__icon" />
            <input
              type="text"
              placeholder="Search tasks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="task-inbox-filters">
            {(['all', 'pending', 'completed', 'reassigned'] as const).map((st) => (
              <button
                key={st}
                type="button"
                className={`task-inbox-filter-pill ${statusFilter === st ? 'task-inbox-filter-pill--active' : ''}`}
                onClick={() => setStatusFilter(st)}
              >
                {st === 'all' ? 'All' : st === 'reassigned' ? 'Reassigned' : st.charAt(0).toUpperCase() + st.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Task List Body */}
      <div className="task-inbox-body">
        {error && (
          <div className="task-inbox-error">
            <AlertCircle size={15} />
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div className="task-inbox-loading">
            <RefreshCw size={20} className="animate-spin text-primary-500" />
            <span>Loading tasks...</span>
          </div>
        ) : filteredTasks.length === 0 ? (
          <div className="task-inbox-empty">
            <ListTodo size={32} className="task-inbox-empty__icon" />
            <span className="task-inbox-empty__title">No tasks found</span>
            <span className="task-inbox-empty__sub">
              {activeTab === 'assigned_to_me'
                ? "You don't have any tasks in this view."
                : 'No tasks have been assigned yet.'}
            </span>
          </div>
        ) : (
          <div className="task-inbox-list">
            {filteredTasks.map((task) => {
              const isCurrentAssignee =
                task.currentAssigneeId === currentUserId ||
                (!task.currentAssigneeId && task.assignedToId === currentUserId);
              const isCreator = task.assignedById === currentUserId;
              const overdue = isOverdue(task.deadline, task.status);
              const isExpanded = expandedTaskIds.has(task.id);
              const isReassigning = reassigningTaskId === task.id;

              return (
                <div
                  key={task.id}
                  className={`task-card ${task.status === 'completed' ? 'task-card--completed' : ''} ${overdue ? 'task-card--overdue' : ''}`}
                >
                  {/* Main Card Header */}
                  <div className="task-card__main">
                    <div className="task-card__left" onClick={() => toggleExpand(task.id)}>
                      <div className="task-card__title-row">
                        <span className="task-card__title">{task.title}</span>
                        {task.status === 'completed' ? (
                          <span className="task-badge task-badge--completed">
                            <CheckCircle2 size={11} /> Completed
                          </span>
                        ) : overdue ? (
                          <span className="task-badge task-badge--overdue">
                            <Clock size={11} /> Overdue
                          </span>
                        ) : task.currentAssigneeId && task.assignedToId && task.currentAssigneeId !== task.assignedToId ? (
                          <span className="task-badge task-badge--reassigned">
                            <ArrowRight size={11} /> {isCurrentAssignee ? 'Delegated to you' : 'Reassigned'}
                          </span>
                        ) : (
                          <span className="task-badge task-badge--pending">
                            <Clock size={11} /> Pending
                          </span>
                        )}
                      </div>

                      {/* Metadata row: Deadline & Assigner */}
                      <div className="task-card__meta">
                        <span className="task-card__meta-item" title="Deadline">
                          <Calendar size={12} />
                          <span>{formatDeadline(task.deadline)}</span>
                        </span>

                        <span className="task-card__meta-item" title="Assigned By">
                          <User size={12} />
                          <span>
                            By: <strong>{task.assignedBy?.fullName || 'Assigner'}</strong>
                          </span>
                        </span>

                        {/* Current Assignee (Updated in real-time for original assigner) */}
                        <span className="task-card__meta-item task-card__meta-assignee" title="Current Assignee">
                          <UserCheck size={12} />
                          <span>
                            Assigned to:{' '}
                            <strong className="text-primary-600 dark:text-primary-400">
                              {task.currentAssignee?.fullName || task.assignedTo?.fullName || 'User'}
                            </strong>
                          </span>
                        </span>

                        {task.attachments && task.attachments.length > 0 && (
                          <span className="task-card__meta-item task-card__meta-files">
                            <FileText size={12} />
                            <span>{task.attachments.length} file(s)</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Status Dropdown */}
                    <div className="task-card__right">
                      <div className="task-status-selector">
                        <select
                          value={
                            task.status === 'completed'
                              ? 'completed'
                              : isCurrentAssignee
                              ? 'pending'
                              : 'assigned_to_someone_else'
                          }
                          disabled={isUpdatingStatus === task.id || !isCurrentAssignee}
                          onChange={(e) => handleStatusChange(task, e.target.value)}
                          className={`task-status-select task-status-select--${task.status === 'completed' ? 'completed' : isCurrentAssignee ? 'pending' : 'reassigned'}`}
                        >
                          <option value="pending">Pending</option>
                          <option value="completed">Completed</option>
                          <option value="assigned_to_someone_else">
                            Assigned to someone else
                          </option>
                        </select>
                      </div>

                      <button
                        type="button"
                        className="task-card__expand-btn"
                        onClick={() => toggleExpand(task.id)}
                        title={isExpanded ? 'Collapse' : 'View details'}
                      >
                        {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                      </button>
                    </div>
                  </div>

                  {/* Inline Reassign User Picker Dropdown (Appears immediately when 'Assigned to someone else' is picked) */}
                  {isReassigning && (
                    <div className="task-reassign-picker">
                      <div className="task-reassign-picker__header">
                        <UserCheck size={13} />
                        <span>Select colleague to reassign this task to:</span>
                        <button
                          type="button"
                          className="task-reassign-picker__cancel"
                          onClick={() => setReassigningTaskId(null)}
                        >
                          <X size={12} />
                        </button>
                      </div>
                      <div className="task-reassign-picker__controls">
                        <select
                          defaultValue=""
                          onChange={(e) => handleExecuteReassign(task.id, e.target.value)}
                          className="task-reassign-select"
                          autoFocus
                        >
                          <option value="" disabled>
                            -- Choose Company User --
                          </option>
                          {companyUsers
                            .filter((u) => u.id !== currentUserId)
                            .map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.fullName} {u.department ? `(${u.department})` : ''} - {u.email}
                              </option>
                            ))}
                        </select>
                      </div>
                    </div>
                  )}

                  {/* Expanded Task Details & Attachments */}
                  {isExpanded && (
                    <div className="task-card__expanded">
                      {task.description && (
                        <div className="task-card__desc">
                          <span className="task-card__section-label">Details & Description:</span>
                          <p>{task.description}</p>
                        </div>
                      )}

                      {task.attachments && task.attachments.length > 0 && (
                        <div className="task-card__attachments">
                          <span className="task-card__section-label">Attachments:</span>
                          <div className="task-card__attachments-list">
                            {task.attachments.map((file, idx) => (
                              <a
                                key={idx}
                                href={file.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                download={file.name}
                                className="task-attachment-item"
                              >
                                <FileText size={13} />
                                <span className="task-attachment-name truncate max-w-[200px]">
                                  {file.name}
                                </span>
                                <Download size={12} className="task-attachment-download" />
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <AssignTaskModal
        isOpen={isAssignModalOpen}
        onClose={() => setIsAssignModalOpen(false)}
        onTaskCreated={() => {
          fetchTasks();
          onTasksUpdated?.();
        }}
      />
    </div>
  );
}
