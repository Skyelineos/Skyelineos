import { useState, useEffect } from 'react';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { X, Building, User, DollarSign, Search, Plus, Hammer } from 'lucide-react';
import { collection, query, orderBy, getDocs, where, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { applyJobTemplate } from '@/lib/applyJobTemplate';
import { buildProjectCode } from '@/lib/projectUtils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SubcontractorComboBox } from '@/components/ui/subcontractor-combobox';
import { MultiSelect, type Option } from '@/components/ui/multi-select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/hooks/use-auth';
import { NewClientModal } from '@/components/contacts/NewClientModal';
import type { Contact } from '@shared/messaging-types';

const projectSchema = z.object({
  // Client Info (handled through client selection)
  selectedClientIds: z.array(z.string()).min(1, 'Please select at least one client'),
  projectAddress: z.string().min(1, 'Project address is required'),
  
  // Project Details
  projectName: z.string().min(1, 'Project name is required'),
  projectType: z.enum(['new_build', 'remodel', 'addition'], {
    required_error: 'Please select a project type',
  }),
  squareFootage: z.preprocess(
    (val) => val === '' || val === null || val === undefined ? undefined : Number(val),
    z.number().min(0).optional()
  ),
  startDate: z.string().min(1, 'Start date is required'),
  estimatedFinishDate: z.string().optional(),
  assignedProjectManager: z.string().optional(),
  notes: z.string().optional(),
  
  // Financial Setup
  targetBudget: z.preprocess(
    (val) => val === '' || val === null || val === undefined ? undefined : Number(val),
    z.number().min(0).optional()
  ),

  // Designer setup — required choice so we don't ship projects without an
  // owner for design selections.
  designerChoice: z.enum(['select', 'none', 'client_self', 'later'], {
    required_error: 'Pick a designer option',
  }),
  designerContactId: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.designerChoice === 'select' && !data.designerContactId?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Pick a designer contact',
      path: ['designerContactId'],
    });
  }
});

type ProjectFormData = z.infer<typeof projectSchema>;

interface NewProjectFormProps {
  isOpen: boolean;
  onClose: () => void;
  onProjectCreated?: (projectId: string) => void;
}

// Project managers fetched from contacts database

export function NewProjectForm({ isOpen, onClose, onProjectCreated }: NewProjectFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>([]);
  const [isNewClientModalOpen, setIsNewClientModalOpen] = useState(false);
  const [templates, setTemplates] = useState<{ id: string; name: string }[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  // Schedule template (Gantt) — separate from Job Template above. Loads a
  // pre-built Gantt into the project's schedule so the timeline is ready to
  // edit + sign off as soon as the project is created.
  const [scheduleTemplates, setScheduleTemplates] = useState<{ id: string; name: string }[]>([]);
  const [selectedScheduleTemplateId, setSelectedScheduleTemplateId] = useState<string>('');
  const { user, hasRole } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Load job templates for prefill
  useEffect(() => {
    if (!isOpen) return;
    (async () => {
      try {
        // Templates collection holds documents of type 'job' (others may exist for emails etc.)
        const snap = await getDocs(query(collection(db, 'templates'), orderBy('name')));
        const list = snap.docs
          .map(d => ({ id: d.id, ...(d.data() as any) }))
          .filter((t: any) => !t.type || t.type === 'job')
          .map((t: any) => ({ id: t.id, name: t.name || 'Untitled' }));
        setTemplates(list);
      } catch {
        setTemplates([]);
      }
    })();
  }, [isOpen]);

  // Load schedule templates (Gantt) for prefill — separate collection.
  useEffect(() => {
    if (!isOpen) return;
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, 'scheduleTemplates'), orderBy('createdAt', 'desc')));
        setScheduleTemplates(snap.docs.map(d => ({
          id: d.id,
          name: String((d.data() as any).name || 'Untitled'),
        })));
      } catch {
        setScheduleTemplates([]);
      }
    })();
  }, [isOpen]);

  // Fetch all contacts for client selection
  const { data: allContacts = [], refetch: refetchContacts } = useQuery({
    queryKey: ['/api/contacts'],
    queryFn: async () => {
      console.log('🔄 Fetching contacts for project form...');
      const response = await fetch('/api/contacts');
      if (!response.ok) {
        throw new Error('Failed to fetch contacts');
      }
      const data = await response.json();
      const processedData = data.map((contact: Contact) => ({
        ...contact,
        associatedProjects: contact.associatedProjects ? JSON.parse(contact.associatedProjects as unknown as string) : [],
        tags: contact.tags ? JSON.parse(contact.tags as unknown as string) : [],
      }));
      console.log('📋 Fetched contacts for project form:', processedData.length, 'contacts');
      return processedData;
    },
    staleTime: 0, // Always refetch when query is invalidated
    refetchOnMount: true, // Refetch when component mounts
  });

  // Filter to only show client contacts (check both 'role' and 'type' fields for compatibility)
  const clientContacts = allContacts.filter((contact: any) => 
    contact.role === 'client' || 
    contact.type === 'client' ||
    contact.role === 'Client' ||
    contact.type === 'Client'
  );

  // Filter to only show project manager contacts (both 'pm' and 'project_manager' roles)
  const projectManagerContacts = allContacts.filter((contact: any) =>
    (contact.role && (contact.role === 'project_manager' || contact.role === 'pm')) ||
    (contact.type && (contact.type === 'project_manager' || contact.type === 'pm'))
  );

  // Designer contacts — only surface real designers (not subs / clients / etc.)
  const designerContacts = allContacts.filter((contact: any) =>
    String(contact.role || '').toLowerCase() === 'designer' ||
    String(contact.type || '').toLowerCase() === 'designer'
  );

  // Create options for multi-select
  const clientOptions: Option[] = clientContacts.map((client: any) => ({
    label: `${client.name}${client.email ? ` (${client.email})` : ''}`,
    value: client.id.toString(),
  }));

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<ProjectFormData>({
    resolver: zodResolver(projectSchema),
    defaultValues: {
      selectedClientIds: [],
    },
  });

  // Sync multi-select with form
  React.useEffect(() => {
    setValue('selectedClientIds', selectedClientIds);
  }, [selectedClientIds, setValue]);

  const selectedProjectType = watch('projectType');
  const designerChoice = watch('designerChoice');
  const designerContactId = watch('designerContactId');

  const onSubmit = async (data: ProjectFormData) => {
    if (!user) {
      toast({
        title: 'Authentication Error',
        description: 'You must be logged in to create a project.',
        variant: 'destructive',
      });
      return;
    }

    // Check user permissions using the hasRole method from useAuth
    if (!hasRole('Admin') && !hasRole('ProjectManager')) {
      toast({
        title: 'Permission Denied',
        description: 'Only Admins and Project Managers can create projects.',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // Get selected clients details
      const selectedClients = clientContacts.filter((c: any) =>
        data.selectedClientIds.includes(c.id.toString())
      );

      if (selectedClients.length === 0) {
        throw new Error('Selected clients not found');
      }

      // Auto-include each selected client's linked spouse (when one exists)
      // so both halves of a household appear on the project automatically.
      const augmentedIds = new Set<string>(data.selectedClientIds);
      selectedClients.forEach((c: any) => {
        const spouseId = String(c?.spouseContactId || '');
        if (spouseId) augmentedIds.add(spouseId);
      });
      // Materialize the final client list including any auto-added spouses.
      const finalClients = allContacts.filter((c: any) => augmentedIds.has(c.id.toString()));
      data.selectedClientIds = Array.from(augmentedIds);

      // Use primary client (first selected) for main fields, store all client IDs
      const primaryClient = finalClients[0] || selectedClients[0];
      
      const designer = data.designerChoice === 'select'
        ? designerContacts.find((d: any) => String(d.id) === data.designerContactId) || null
        : null;
      // Stable display code: LastName + MMDDYYYY. Computed from the primary
      // (first selected) client's name and today's date so it stays human-readable.
      const projectCode = buildProjectCode(primaryClient?.name, new Date());
      const projectData = {
        name: data.projectName,
        projectCode,
        clientName: finalClients.map((c: any) => c.name).join(' & '), // "Steve Gardanier & Laura Gardanier"
        clientIds: data.selectedClientIds, // Store all client IDs
        address: data.projectAddress,
        description: data.notes || '',
        clientEmail: primaryClient.email,
        clientPhone: primaryClient.phone || '',
        squareFootage: data.squareFootage || 0,
        estimatedBudget: data.targetBudget || 0,
        actualCost: 0,
        status: 'planning',
        startDate: data.startDate,
        targetCompletion: data.estimatedFinishDate || null,
        projectManagerId: null,
        notes: data.notes || '',
        // Designer setup — captured at creation so design selections always have an owner.
        designerChoice: data.designerChoice,
        designerContactId: data.designerChoice === 'select' ? (data.designerContactId || '') : '',
        designerName: designer?.name || '',
        designerEmail: designer?.email || '',
        designerCompany: designer?.company || '',
        // Every project starts with an unsigned schedule — the dashboard
        // surfaces these until you review the Gantt and sign off.
        scheduleSignedOff: false,
        projectMetadata: JSON.stringify({
          assignedProjectManager: data.assignedProjectManager || '',
          projectType: data.projectType,
          clientIds: data.selectedClientIds,
        }),
      };

      // Write directly to Firestore — the api function path is blocked by org
      // IAM policy, and the rest of the app already does direct writes.
      const docRef = await addDoc(collection(db, 'projects'), {
        ...projectData,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      const newProjectId = docRef.id;

      // If the user chose "select designer later", create a dashboard reminder
      // for 7 days out so it doesn't slip.
      if (data.designerChoice === 'later') {
        try {
          const due = new Date();
          due.setDate(due.getDate() + 7);
          await addDoc(collection(db, 'reminders'), {
            kind: 'select_designer',
            projectId: newProjectId,
            projectName: data.projectName,
            ownerUid: user.id?.toString() || user.email || 'unknown',
            ownerName: user.name || '',
            dueAt: due.toISOString(),
            status: 'pending',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } catch (e: any) {
          // Non-fatal — surface but don't block project creation.
          console.warn('Failed to create designer reminder', e?.message || e);
        }
      }

      // If a template was selected, copy its tasks into this project. Failure
      // here shouldn't kill the project create — surface as a separate toast.
      let templateMsg = '';
      if (selectedTemplateId) {
        try {
          const { taskCount } = await applyJobTemplate(
            selectedTemplateId,
            newProjectId,
            data.startDate,
          );
          templateMsg = ` ${taskCount} task${taskCount === 1 ? '' : 's'} added from template.`;
        } catch (e: any) {
          toast({
            title: 'Template apply failed',
            description: e.message || 'Project was created, but tasks were not copied. Apply the template manually from Templates.',
            variant: 'destructive',
          });
        }
      }

      // If a schedule (Gantt) template was selected, clone its tasks + links
      // into schedules/{newProjectId}. The project's Schedule tab reads from
      // there. Failures are non-fatal — Tyler can apply manually later.
      if (selectedScheduleTemplateId) {
        try {
          const { loadTemplate, saveSchedule } = await import('@/modules/gantt/useSchedulePersistence');
          const tmpl = await loadTemplate(selectedScheduleTemplateId);
          if (tmpl) {
            await saveSchedule(newProjectId, tmpl.tasks || [], tmpl.links || []);
            templateMsg += ` Gantt schedule applied from "${tmpl.name}".`;
          }
        } catch (e: any) {
          toast({
            title: 'Schedule template apply failed',
            description: e?.message || 'Project was created, but the Gantt template was not applied. Try again from the Schedule tab.',
            variant: 'destructive',
          });
        }
      }

      toast({
        title: 'Project Created Successfully',
        description: `${data.projectName} has been linked to ${finalClients.map((c: any) => c.name).join(' & ')}.${templateMsg}`,
      });

      // Invalidate queries to refresh the projects list
      queryClient.invalidateQueries({ queryKey: ['/api/projects'] });

      reset();
      setSelectedTemplateId('');
      onClose();
      onProjectCreated?.(newProjectId);
    } catch (error) {
      console.error('Error creating project:', error);
      toast({
        title: 'Error Creating Project',
        description: error instanceof Error ? error.message : 'An unexpected error occurred.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      reset();
      setSelectedClientIds([]);
      onClose();
    }
  };

  const handleClientCreated = async (newClient: any) => {
    console.log('🎯 Client created callback:', newClient);
    
    // Close the modal first
    setIsNewClientModalOpen(false);
    
    try {
      // Refresh the contacts query to include the new client
      await queryClient.invalidateQueries({ queryKey: ['/api/contacts'] });
      await refetchContacts(); // Force immediate refetch and wait for completion
      
      // Add a small delay to ensure UI updates
      setTimeout(() => {
        // Add the new client to selected clients
        const newClientIds = [...selectedClientIds, newClient.id.toString()];
        setSelectedClientIds(newClientIds);
        
        toast({
          title: 'Client Added',
          description: `${newClient.name} has been added and selected for this project.`,
        });
      }, 200);
      
    } catch (error) {
      console.error('Error refreshing client data:', error);
      toast({
        title: 'Warning',
        description: `${newClient.name} was created but may not appear immediately. Try refreshing if needed.`,
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building className="h-5 w-5" />
            Create New Project
          </DialogTitle>
          <DialogDescription>
            Enter all the details to start a new construction project
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
          {/* Client Selection Section */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <User className="h-5 w-5" />
              Client Selection
            </h3>
            <div className="space-y-4">
              <div>
                <Label htmlFor="clientSelect">Select Clients *</Label>
                <p className="text-sm text-gray-500 mb-2">
                  Select one or more clients for this project (couples, families, multiple stakeholders)
                </p>
                <MultiSelect
                  options={clientOptions}
                  selected={selectedClientIds}
                  onChange={setSelectedClientIds}
                  placeholder="Select clients..."
                  className="w-full"
                />
                
                {errors.selectedClientIds && (
                  <p className="text-sm text-red-600 mt-1">{errors.selectedClientIds.message}</p>
                )}
              </div>

              <div className="flex justify-center">
                <Button
                  type="button"
                  variant="accent"
                  size="sm"
                  onClick={() => setIsNewClientModalOpen(true)}
                  className="!bg-accent !text-accent-foreground !border-accent hover:!bg-accent/90"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add New Client
                </Button>
              </div>
            </div>
            
            <div>
              <Label htmlFor="projectAddress">Project Address *</Label>
              <Input
                id="projectAddress"
                {...register('projectAddress')}
                placeholder="456 Construction St, City, State 12345"
              />
              {errors.projectAddress && (
                <p className="text-sm text-red-600 mt-1">{errors.projectAddress.message}</p>
              )}
            </div>
          </div>

          {/* Project Details Section */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Building className="h-5 w-5" />
              Project Details
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="projectName">Project Name *</Label>
                <Input
                  id="projectName"
                  {...register('projectName')}
                  placeholder="Modern Family Home - Westfield"
                />
                {errors.projectName && (
                  <p className="text-sm text-red-600 mt-1">{errors.projectName.message}</p>
                )}
              </div>
              <div>
                <Label htmlFor="projectType">Project Type *</Label>
                <Select onValueChange={(value) => setValue('projectType', value as any)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select project type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new_build">New Build</SelectItem>
                    <SelectItem value="remodel">Remodel</SelectItem>
                    <SelectItem value="addition">Addition</SelectItem>
                  </SelectContent>
                </Select>
                {errors.projectType && (
                  <p className="text-sm text-red-600 mt-1">{errors.projectType.message}</p>
                )}
              </div>
              <div>
                <Label htmlFor="squareFootage">Square Footage</Label>
                <Input
                  id="squareFootage"
                  type="number"
                  {...register('squareFootage')}
                  placeholder="2400"
                />
                {errors.squareFootage && (
                  <p className="text-sm text-red-600 mt-1">{errors.squareFootage.message}</p>
                )}
              </div>
              <div>
                <Label htmlFor="assignedProjectManager">Assigned Project Manager</Label>
                <SubcontractorComboBox
                  subcontractors={projectManagerContacts}
                  value={watch('assignedProjectManager')}
                  onValueChange={(value) => setValue('assignedProjectManager', value)}
                  placeholder="Select project manager"
                  showTrade={false}
                />
              </div>
              <div>
                <Label htmlFor="startDate">Start Date *</Label>
                <Input
                  id="startDate"
                  type="date"
                  {...register('startDate')}
                />
                {errors.startDate && (
                  <p className="text-sm text-red-600 mt-1">{errors.startDate.message}</p>
                )}
              </div>
              <div>
                <Label htmlFor="estimatedFinishDate">Estimated Finish Date</Label>
                <Input
                  id="estimatedFinishDate"
                  type="date"
                  {...register('estimatedFinishDate')}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                {...register('notes')}
                placeholder="Additional project details or requirements..."
                rows={3}
              />
            </div>

            {/* Template prefill — Job + Schedule */}
            <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-4 space-y-3">
              <div>
                <Label className="flex items-center gap-2 mb-1">
                  <Hammer className="h-4 w-4 text-[#C9A96E]" />
                  Apply Job Template (optional)
                </Label>
                <p className="text-xs text-gray-500 mb-2">
                  Pre-populate this project's tasks + due dates from a saved job template.
                </p>
                <Select value={selectedTemplateId || 'none'} onValueChange={v => setSelectedTemplateId(v === 'none' ? '' : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder={templates.length > 0 ? 'Pick a template' : 'No templates saved yet'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— No template —</SelectItem>
                    {templates.map(t => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="flex items-center gap-2 mb-1">
                  <Hammer className="h-4 w-4 text-[#C9A96E]" />
                  Apply Schedule Template (Gantt, optional)
                </Label>
                <p className="text-xs text-gray-500 mb-2">
                  Drops a saved Gantt schedule straight onto the project's Schedule tab — ready to review and sign off.
                </p>
                <Select value={selectedScheduleTemplateId || 'none'} onValueChange={v => setSelectedScheduleTemplateId(v === 'none' ? '' : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder={scheduleTemplates.length > 0 ? 'Pick a schedule template' : 'No schedule templates saved yet — save one from any project\'s Schedule tab'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Blank Gantt (build from scratch) —</SelectItem>
                    {scheduleTemplates.map(t => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Financial Setup Section */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Financial Setup
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="targetBudget">Target Budget</Label>
                <Input
                  id="targetBudget"
                  type="number"
                  step="0.01"
                  {...register('targetBudget')}
                  placeholder="450000.00"
                />
                {errors.targetBudget && (
                  <p className="text-sm text-red-600 mt-1">{errors.targetBudget.message}</p>
                )}
              </div>


            </div>
          </div>

          {/* Designer Section */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <User className="h-5 w-5" />
              Designer <span className="text-red-500 font-bold text-base">*</span>
            </h3>
            <p className="text-sm text-gray-500 -mt-2">
              Who's running design selections? Pick now or flag to come back.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {[
                { val: 'select', label: 'Select a designer', desc: 'Pick from your designer contacts' },
                { val: 'none', label: 'No designer needed', desc: 'Spec build or self-managed' },
                { val: 'client_self', label: 'Client doing design', desc: 'The client owns design selections' },
                { val: 'later', label: 'Decide later', desc: '7-day reminder will appear on your dashboard' },
              ].map(opt => {
                const active = designerChoice === opt.val;
                return (
                  <label
                    key={opt.val}
                    className={`flex items-start gap-3 border rounded-lg p-3 cursor-pointer transition-colors ${
                      active ? 'border-[#C9A96E] bg-[#FFF8E7]/60' : 'border-gray-200 hover:border-gray-400'
                    }`}
                  >
                    <input
                      type="radio"
                      value={opt.val}
                      {...register('designerChoice')}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <p className="text-sm font-medium">{opt.label}</p>
                      <p className="text-xs text-gray-500">{opt.desc}</p>
                    </div>
                  </label>
                );
              })}
            </div>
            {errors.designerChoice && (
              <p className="text-sm text-red-600">{errors.designerChoice.message}</p>
            )}
            {designerChoice === 'select' && (
              <div>
                <Label htmlFor="designerContactId">Designer <span className="text-red-500 font-bold">*</span></Label>
                <Select
                  value={designerContactId || ''}
                  onValueChange={(v) => setValue('designerContactId', v, { shouldValidate: true })}
                >
                  <SelectTrigger id="designerContactId">
                    <SelectValue placeholder={designerContacts.length === 0 ? 'No designer contacts yet — add one in Contacts' : 'Pick a designer'} />
                  </SelectTrigger>
                  <SelectContent>
                    {designerContacts.map((d: any) => (
                      <SelectItem key={d.id} value={String(d.id)}>
                        {d.name}{d.company ? ` — ${d.company}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.designerContactId && (
                  <p className="text-sm text-red-600 mt-1">{errors.designerContactId.message}</p>
                )}
              </div>
            )}
          </div>

          {/* Form Actions */}
          <div className="flex justify-end gap-3 pt-6 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              variant="accent"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Creating Project...' : 'Create Project'}
            </Button>
          </div>
        </form>

        {/* New Client Modal */}
        <NewClientModal
          isOpen={isNewClientModalOpen}
          onClose={() => setIsNewClientModalOpen(false)}
          onClientCreated={handleClientCreated}
          defaultName=""
          defaultEmail=""
        />
      </DialogContent>
    </Dialog>
  );
}