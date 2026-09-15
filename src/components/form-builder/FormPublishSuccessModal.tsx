import { Building, Calendar, CheckCircle2, Clock, FileSpreadsheet, GitMerge, ListFilter, PlusCircle, Users } from 'lucide-react';
import type { AudienceType } from '../../services/formWorkflowService';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';

interface FormPublishSuccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  formTitle: string;
  recipientCount: number;
  audienceType: AudienceType;
  dueDate: string;
  priority: string;
  hasWorkflow: boolean;
  onCreateAnotherForm: () => void;
  onViewFormsList: () => void;
  onViewResponses: () => void;
}

export default function FormPublishSuccessModal({
  isOpen,
  onClose,
  formTitle,
  recipientCount,
  audienceType,
  dueDate,
  priority,
  hasWorkflow,
  onCreateAnotherForm,
  onViewFormsList,
  onViewResponses,
}: FormPublishSuccessModalProps) {
  const details = [
    {
      icon: audienceType === 'whole_org' ? Building : Users,
      label: 'Recipients',
      value:
        audienceType === 'whole_org'
          ? `Whole organization (${recipientCount} active employees)`
          : `${recipientCount} specific user${recipientCount === 1 ? '' : 's'}`,
    },
    { icon: Calendar, label: 'Due date', value: dueDate || 'No deadline' },
    { icon: Clock, label: 'Priority', value: `${priority} priority` },
    { icon: GitMerge, label: 'Workflow', value: hasWorkflow ? 'Approval matrix attached' : 'Direct distribution' },
  ];

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader className="items-center pr-0 text-center">
          <div className="mb-2 grid size-14 place-items-center rounded-2xl bg-emerald-500/10 text-emerald-600 ring-1 ring-emerald-500/20">
            <CheckCircle2 className="size-7" />
          </div>
          <DialogTitle>Form published and distributed</DialogTitle>
          <DialogDescription className="font-medium text-foreground/75">“{formTitle}”</DialogDescription>
        </DialogHeader>
        <dl className="grid gap-2 sm:grid-cols-2">
          {details.map((item) => (
            <div key={item.label} className="flex items-start gap-2.5 rounded-xl border border-border/65 bg-secondary/40 p-3">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                <item.icon className="size-4" />
              </span>
              <div>
                <dt className="text-[10px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">{item.label}</dt>
                <dd className="mt-1 text-xs font-medium leading-relaxed">{item.value}</dd>
              </div>
            </div>
          ))}
        </dl>
        <DialogFooter className="sm:flex-wrap sm:justify-center">
          <Button variant="ghost" onClick={onViewFormsList}>
            <ListFilter /> Forms list
          </Button>
          <Button variant="secondary" onClick={onViewResponses}>
            <FileSpreadsheet /> View responses
          </Button>
          <Button onClick={onCreateAnotherForm}>
            <PlusCircle /> Create another
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
