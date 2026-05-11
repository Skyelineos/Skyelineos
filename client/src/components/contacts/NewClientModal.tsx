import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { User, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  collection, addDoc, doc, getDoc, serverTimestamp, writeBatch,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { LIFECYCLE_PHASES, getStatusLabel } from '@/lib/projectUtils';

// Sales stages at which a project is REQUIRED. Once a deal is past contract
// signing, it must land in the Projects pipeline. Before that, the project section
// is optional — leads in design/estimating may not have a real job yet.
// Includes both the legacy default stage key ('won') and the keys from the
// custom Skyeline pipeline (contract, qualified, active, etc.).
const STAGES_REQUIRING_PROJECT = [
  'won', 'contract', 'qualified', 'active',
  // Tyler's custom-named stages (timestamp-keyed):
  'new_stage_1778269537851', // Punchlist/Warranty
  'new_stage_1778269604055', // Completed Build
];

const clientSchema = z.object({
  name: z.string().min(1, 'Full name is required'),
  email: z.string().email('Please enter a valid email address'),
  phone: z.string().optional(),
  stage: z.string().min(1, 'Pick a sales pipeline stage'),
  hasProject:    z.boolean().optional(),
  projectName:   z.string().optional(),
  projectStatus: z.string().optional(),
})
  .refine(
    d => !d.hasProject || (d.projectName && d.projectName.trim().length > 0),
    { message: 'Project name is required when "has a current project" is checked', path: ['projectName'] },
  )
  .refine(
    d => !STAGES_REQUIRING_PROJECT.includes(d.stage) || (d.projectName && d.projectName.trim().length > 0),
    { message: 'Once the contract is signed (Won), this client needs a project in the Projects pipeline', path: ['projectName'] },
  );

type ClientFormData = z.infer<typeof clientSchema>;

interface NewClientModalProps {
  isOpen: boolean;
  onClose: () => void;
  onClientCreated: (client: any) => void;
  defaultName?: string;
  defaultEmail?: string;
}

interface StageConfig { key: string; label: string; color: string; }

// Same defaults as Sales.tsx — kept in sync. Real config lives in settings/salesStages.
const DEFAULT_STAGES: StageConfig[] = [
  { key: 'new_lead',        label: 'New Lead',         color: '#64748b' },
  { key: 'meeting_booked',  label: 'Meeting Booked',   color: '#3b82f6' },
  { key: 'design_phase',    label: 'Design Phase',     color: '#8b5cf6' },
  { key: 'in_estimating',   label: 'In Estimating',    color: '#f59e0b' },
  { key: 'close_to_sign',   label: 'Close to Signing', color: '#C9A96E' },
  { key: 'won',             label: 'Won',              color: '#22c55e' },
  { key: 'lost',             label: 'Lost',             color: '#ef4444' },
];

export function NewClientModal({
  isOpen,
  onClose,
  onClientCreated,
  defaultName = '',
  defaultEmail = '',
}: NewClientModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [stages, setStages] = useState<StageConfig[]>(DEFAULT_STAGES);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Load pipeline stages from settings (same source Sales.tsx uses); fallback to defaults.
  useEffect(() => {
    if (!isOpen) return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'settings', 'pipeline'));
        const data = snap.exists() ? snap.data() : null;
        if (data?.stages && Array.isArray(data.stages) && data.stages.length > 0) {
          setStages(data.stages);
        }
      } catch {
        // Stay on defaults — settings doc may not exist yet.
      }
    })();
  }, [isOpen]);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<ClientFormData>({
    resolver: zodResolver(clientSchema),
    defaultValues: {
      name: defaultName,
      email: defaultEmail,
      phone: '',
      stage: '',
      hasProject: false,
      projectName: '',
      projectStatus: 'planning',
    },
  });

  const stage         = watch('stage');
  const hasProject    = watch('hasProject');
  const projectStatus = watch('projectStatus');

  // Once the deal is "won" the project section is required — auto-check the
  // box and lock it on so the user can't dismiss it.
  const projectRequired = STAGES_REQUIRING_PROJECT.includes(stage);
  useEffect(() => {
    if (projectRequired && !hasProject) {
      setValue('hasProject', true, { shouldValidate: false });
    }
  }, [projectRequired, hasProject, setValue]);

  // Pick a sensible default project phase based on the sales stage.
  useEffect(() => {
    if (stage === 'won' && (projectStatus === 'planning' || !projectStatus)) {
      setValue('projectStatus', 'active', { shouldValidate: false });
    }
  }, [stage, projectStatus, setValue]);

  const createClientMutation = useMutation({
    mutationFn: async (form: ClientFormData) => {
      const contactData = {
        name: form.name,
        email: form.email,
        phone: form.phone || '',
        type: 'client',
        role: 'client',
        company: '',
        trade: '',
        associatedProjects: [],
        notes: '',
        avatarUrl: '',
        rating: 0,
        tags: [],
        isActive: true,
        address: '',
        city: '',
        state: '',
        zipCode: '',
        lastContact: null,
        insuranceProvider: '',
        insurancePolicyNumber: '',
        insuranceExpirationDate: null,
        insuranceFileUrl: '',
        w9FileUrl: '',
      };

      // Up to three writes, one batch: contact (Contacts page), CRM client
      // (Sales pipeline), and optionally a project (Projects pipeline if the user
      // checked "has a current project"). All docs cross-reference each other.
      const batch = writeBatch(db);
      const contactRef = doc(collection(db, 'contacts'));
      const clientRef  = doc(collection(db, 'clients'));
      const wantsProject = !!form.hasProject || STAGES_REQUIRING_PROJECT.includes(form.stage);
      const projectRef = wantsProject ? doc(collection(db, 'projects')) : null;

      batch.set(contactRef, {
        ...contactData,
        salesClientId: clientRef.id,
        ...(projectRef ? { primaryProjectId: projectRef.id } : {}),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      batch.set(clientRef, {
        name: form.name,
        email: form.email,
        phone: form.phone || '',
        stage: form.stage,
        projectType: 'custom_home',
        source: 'referral',
        priority: 'medium',
        tags: [],
        contactId: contactRef.id,
        ...(projectRef ? { linkedJobId: projectRef.id } : {}),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      if (projectRef) {
        batch.set(projectRef, {
          name: (form.projectName || '').trim(),
          clientName: form.name,
          clientId: contactRef.id,
          clientIds: [contactRef.id],
          clientEmail: form.email,
          clientPhone: form.phone || '',
          status: form.projectStatus || 'planning',
          startDate: new Date().toISOString().slice(0, 10),
          targetCompletion: null,
          actualCost: 0,
          estimatedBudget: 0,
          squareFootage: 0,
          notes: `Created with new client ${form.name} on ${new Date().toLocaleDateString()}`,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();

      return { id: contactRef.id, salesClientId: clientRef.id, projectId: projectRef?.id ?? null, ...contactData };
    },
    onSuccess: (newClient) => {
      const stageLabel = stages.find(s => s.key === stage)?.label || stage;
      const projectMsg = newClient.projectId
        ? ` Project added at "${getStatusLabel(projectStatus || 'planning')}".`
        : '';
      toast({
        title: 'Client Created',
        description: `${newClient.name} added — also placed in Sales at "${stageLabel}".${projectMsg}`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/contacts'] });
      onClientCreated(newClient);
      handleClose();
    },
    onError: (error: any) => {
      console.error('Error creating client:', error);
      toast({
        title: 'Error Creating Client',
        description: error.message || 'An unexpected error occurred.',
        variant: 'destructive',
      });
    },
  });

  const onSubmit = async (data: ClientFormData) => {
    setIsSubmitting(true);
    try {
      await createClientMutation.mutateAsync(data);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      reset();
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Add New Client
          </DialogTitle>
          <DialogDescription>
            Creates a contact AND a Sales record at the chosen pipeline stage. The two stay linked.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <Label htmlFor="name">Full Name *</Label>
            <Input
              id="name"
              {...register('name')}
              placeholder="Client's full name"
              className="mt-1"
            />
            {errors.name && (
              <p className="text-sm text-red-600 mt-1">{errors.name.message}</p>
            )}
          </div>

          <div>
            <Label htmlFor="email">Email Address *</Label>
            <Input
              id="email"
              type="email"
              {...register('email')}
              placeholder="client@example.com"
              className="mt-1"
            />
            {errors.email && (
              <p className="text-sm text-red-600 mt-1">{errors.email.message}</p>
            )}
          </div>

          <div>
            <Label htmlFor="phone">Phone Number</Label>
            <Input
              id="phone"
              {...register('phone')}
              placeholder="(555) 123-4567"
              className="mt-1"
            />
            {errors.phone && (
              <p className="text-sm text-red-600 mt-1">{errors.phone.message}</p>
            )}
          </div>

          <div>
            <Label htmlFor="stage">Sales Pipeline Stage *</Label>
            <Select value={stage} onValueChange={v => setValue('stage', v, { shouldValidate: true })}>
              <SelectTrigger id="stage" className="mt-1">
                <SelectValue placeholder="Where in the pipeline?" />
              </SelectTrigger>
              <SelectContent>
                {stages.map(s => (
                  <SelectItem key={s.key} value={s.key}>
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                      {s.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.stage && (
              <p className="text-sm text-red-600 mt-1">{errors.stage.message}</p>
            )}
          </div>

          {/* Project pipeline — optional unless the sales stage is past contract
              signed ("Won"), at which point we require a project and lock the box on. */}
          <div className={`rounded-lg border p-3 space-y-3 ${projectRequired ? 'border-[#C9A96E] bg-[#FFF8E7]/60' : 'border-amber-200 bg-amber-50/40'}`}>
            <label className={`flex items-center gap-2 ${projectRequired ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
              <Checkbox
                checked={!!hasProject || projectRequired}
                disabled={projectRequired}
                onCheckedChange={(c) => setValue('hasProject', !!c)}
              />
              <span className="text-sm font-medium flex items-center gap-1.5">
                <Building2 className="h-4 w-4 text-[#C9A96E]" />
                {projectRequired
                  ? 'Contract signed — project required in the Projects pipeline'
                  : 'This client already has a current project'}
              </span>
            </label>

            {(hasProject || projectRequired) && (
              <div className="space-y-3">
                <div>
                  <Label htmlFor="projectName">Project Name *</Label>
                  <Input
                    id="projectName"
                    {...register('projectName')}
                    placeholder="e.g. Modern Lakehouse — Heber City"
                    className="mt-1"
                  />
                  {errors.projectName && (
                    <p className="text-sm text-red-600 mt-1">{errors.projectName.message}</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="projectStatus">Project Pipeline Phase *</Label>
                  <Select
                    value={projectStatus}
                    onValueChange={v => setValue('projectStatus', v, { shouldValidate: true })}
                  >
                    <SelectTrigger id="projectStatus" className="mt-1">
                      <SelectValue placeholder="Where is the project right now?" />
                    </SelectTrigger>
                    <SelectContent>
                      {LIFECYCLE_PHASES.map(s => (
                        <SelectItem key={s} value={s}>{getStatusLabel(s)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Creating...' : 'Create Client'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
