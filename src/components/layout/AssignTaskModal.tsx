import { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../ui/dialog';
import { Button } from '../ui/button';
import {
  UserCheck,
  UploadCloud,
  X,
  FileText,
  Calendar,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { adminService, type UserWithRoles } from '../../services/adminService';
import { taskService, type TaskItem } from '../../services/taskService';
import { useAuth } from '../../context/AuthContext';
import { calendarService } from '../../services/calendarService';

interface AssignTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultDeadline?: string;
  onTaskCreated?: (task: TaskItem) => void;
}

export default function AssignTaskModal({
  isOpen,
  onClose,
  defaultDeadline,
  onTaskCreated,
}: AssignTaskModalProps) {
  const { user } = useAuth();
  const userId = user?.id || user?.email || 'guest';

  const [taskTitle, setTaskTitle] = useState('');
  const [taskDeadline, setTaskDeadline] = useState(defaultDeadline || '');
  const [taskAssigneeId, setTaskAssigneeId] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [taskFiles, setTaskFiles] = useState<File[]>([]);
  const [assigneesList, setAssigneesList] = useState<UserWithRoles[]>([]);
  const [isAssigning, setIsAssigning] = useState(false);
  const [taskSuccessMsg, setTaskSuccessMsg] = useState('');
  const [taskErrorMsg, setTaskErrorMsg] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync deadline if defaultDeadline changes
  useEffect(() => {
    if (defaultDeadline) {
      setTaskDeadline(defaultDeadline);
    } else {
      const today = new Date().toISOString().slice(0, 10);
      setTaskDeadline(today);
    }
  }, [defaultDeadline, isOpen]);

  // Load company users when modal opens
  useEffect(() => {
    if (isOpen) {
      setTaskSuccessMsg('');
      setTaskErrorMsg('');
      adminService
        .listUsers()
        .then((users) => {
          setAssigneesList(users.filter((u) => u.isActive));
        })
        .catch((err) => console.error('Failed to load users for assignment', err));
    }
  }, [isOpen]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selected = Array.from(e.target.files);
      setTaskFiles((prev) => [...prev, ...selected]);
    }
  };

  const removeFile = (index: number) => {
    setTaskFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskTitle.trim()) {
      setTaskErrorMsg('Please enter a task name.');
      return;
    }
    if (!taskAssigneeId) {
      setTaskErrorMsg('Please select an assignee.');
      return;
    }
    if (!taskDeadline) {
      setTaskErrorMsg('Please specify a task deadline.');
      return;
    }

    setIsAssigning(true);
    setTaskErrorMsg('');
    try {
      const formData = new FormData();
      formData.append('title', taskTitle.trim());
      formData.append('assignedToId', taskAssigneeId);
      formData.append('deadline', taskDeadline);
      if (taskDescription.trim()) {
        formData.append('description', taskDescription.trim());
      }
      for (const file of taskFiles) {
        formData.append('attachments', file);
      }

      const created = await taskService.createTask(formData);

      // Add to calendar note for visibility
      const assigneeObj = assigneesList.find((u) => u.id === taskAssigneeId);
      const assigneeLabel = assigneeObj ? assigneeObj.fullName : 'Colleague';
      try {
        await calendarService.addEvent(
          userId,
          taskDeadline,
          `Task: ${taskTitle.trim()} (Assigned to ${assigneeLabel})`
        );
      } catch {}

      setTaskSuccessMsg('Task assigned successfully!');
      onTaskCreated?.(created);

      // Notify TopBar and task components
      window.dispatchEvent(new CustomEvent('heliflow_tasks_updated'));

      setTimeout(() => {
        setTaskTitle('');
        setTaskDescription('');
        setTaskFiles([]);
        setTaskAssigneeId('');
        setTaskSuccessMsg('');
        onClose();
      }, 1200);
    } catch (err: any) {
      setTaskErrorMsg(err?.message || 'Failed to assign task');
    } finally {
      setIsAssigning(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-w-xl p-6 sm:rounded-2xl"
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            <div className="grid size-9 place-items-center rounded-xl bg-emerald-500/10 text-emerald-600 ring-1 ring-emerald-500/20">
              <UserCheck size={20} />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-foreground">
                Assign Task
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Delegate work to company team members with deadlines and files.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {taskErrorMsg && (
          <div className="flex items-center gap-2 rounded-xl bg-destructive/10 border border-destructive/20 p-3 text-xs text-destructive">
            <AlertCircle size={15} className="shrink-0" />
            <span>{taskErrorMsg}</span>
          </div>
        )}

        {taskSuccessMsg && (
          <div className="flex items-center gap-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3 text-xs text-emerald-600 font-semibold">
            <CheckCircle2 size={15} className="shrink-0" />
            <span>{taskSuccessMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          {/* Row 1: Task Name & Task Deadline (as sketched in diagram) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                Task Name <span className="text-destructive">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. Prepare Q4 Financial Audit Report"
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                required
                className="w-full h-10 px-3 rounded-xl border border-border/80 bg-background text-sm text-foreground placeholder:text-muted-foreground outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                Task Deadline <span className="text-destructive">*</span>
              </label>
              <div className="relative">
                <input
                  type="date"
                  value={taskDeadline}
                  onChange={(e) => setTaskDeadline(e.target.value)}
                  required
                  className="w-full h-10 px-3 rounded-xl border border-border/80 bg-background text-sm text-foreground outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>
          </div>

          {/* Row 2: Assigned To: Dropdown with all users in the company */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">
              Assigned To: Drop down with all users in the company <span className="text-destructive">*</span>
            </label>
            <select
              value={taskAssigneeId}
              onChange={(e) => setTaskAssigneeId(e.target.value)}
              required
              className="w-full h-10 px-3 rounded-xl border border-border/80 bg-background text-sm text-foreground outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20 cursor-pointer"
            >
              <option value="" disabled>
                -- Select Employee from Company --
              </option>
              {assigneesList.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName} {u.department ? `· ${u.department}` : ''} {u.role ? `(${u.role})` : ''} - {u.email}
                </option>
              ))}
            </select>
          </div>

          {/* Row 3: Task Details / Description */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">
              Task Details / Description
            </label>
            <textarea
              placeholder="Specify requirements, deliverables, milestones, or instructions..."
              value={taskDescription}
              onChange={(e) => setTaskDescription(e.target.value)}
              rows={3}
              className="w-full p-3 rounded-xl border border-border/80 bg-background text-sm text-foreground placeholder:text-muted-foreground outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20 resize-none"
            />
          </div>

          {/* Row 4: Uploads */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">
              Uploads
            </label>
            <div
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                fileInputRef.current?.click();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              className="flex flex-col items-center justify-center p-3.5 border-2 border-dashed border-border/80 hover:border-primary/50 hover:bg-muted/30 rounded-xl cursor-pointer transition-colors text-center outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              <UploadCloud className="size-6 text-muted-foreground mb-1" />
              <span className="text-xs font-medium text-foreground">
                Click to attach files, images, or documents
              </span>
              <span className="text-[11px] text-muted-foreground">
                PDF, Excel, Word, Images up to 10MB each
              </span>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onClick={(e) => e.stopPropagation()}
                onChange={handleFileChange}
                className="hidden"
              />
            </div>

            {taskFiles.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1.5">
                {taskFiles.map((file, idx) => (
                  <div
                    key={idx}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary/10 border border-primary/20 text-xs text-foreground font-medium"
                  >
                    <FileText size={13} className="text-primary" />
                    <span className="max-w-[180px] truncate">{file.name}</span>
                    <button
                      type="button"
                      onClick={() => removeFile(idx)}
                      className="text-muted-foreground hover:text-destructive transition-colors ml-1"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isAssigning}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isAssigning}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
            >
              {isAssigning ? 'Assigning Task...' : 'Assign Task'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
