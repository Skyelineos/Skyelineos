import { useState, useEffect } from 'react';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { X, Building, User, DollarSign, Search, Plus } from 'lucide-react';
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
  const { user, hasRole } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

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

      // Use primary client (first selected) for main fields, store all client IDs
      const primaryClient = selectedClients[0];
      
      const projectData = {
        name: data.projectName,
        clientName: selectedClients.map((c: any) => c.name).join(', '), // Display all client names
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
        projectMetadata: JSON.stringify({
          assignedProjectManager: data.assignedProjectManager || '',
          projectType: data.projectType,
          clientIds: data.selectedClientIds,
        }),
      };

      const result = await apiRequest('/api/projects', {
        method: 'POST',
        body: JSON.stringify(projectData),
      });

      toast({
        title: 'Project Created Successfully',
        description: `${data.projectName} has been linked to ${selectedClients.map((c: any) => c.name).join(', ')} and added to your projects.`,
      });

      // Invalidate queries to refresh the projects list
      queryClient.invalidateQueries({ queryKey: ['/api/projects'] });

      reset();
      onClose();
      onProjectCreated?.(result.id.toString());
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