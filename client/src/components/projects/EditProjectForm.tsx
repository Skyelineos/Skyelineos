import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SubcontractorComboBox } from '@/components/ui/subcontractor-combobox';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
// TooltipProvider temporarily disabled due to React hook error
import { useToast } from '@/hooks/use-toast';
import { Loader2, User, Trash2, Edit3, Calendar, DollarSign, MapPin, FileText, Mail, Phone, Users } from 'lucide-react';

const editProjectSchema = z.object({
  name: z.string().min(1, 'Project name is required'),
  description: z.string().optional(),
  clientId: z.string().optional(),
  clientName: z.string().min(1, 'Client name is required'),
  clientEmail: z.string().email('Invalid email address').optional().or(z.literal('')),
  clientPhone: z.string().optional(),
  address: z.string().optional(),
  squareFootage: z.coerce.number().min(0, 'Square footage must be positive').optional(),
  estimatedBudget: z.coerce.number().min(0, 'Budget must be positive').optional(),
  status: z.enum(['planning', 'active', 'punch_list', 'closeout', 'completed', 'on_hold', 'cancelled', 'archived']),
  startDate: z.string().optional(),
  targetCompletion: z.string().optional(),
  assignedProjectManager: z.string().optional(),
});

type EditProjectFormData = z.infer<typeof editProjectSchema>;

interface EditProjectFormProps {
  project: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditProjectForm({ project, open, onOpenChange }: EditProjectFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedClientId, setSelectedClientId] = useState<string>('');

  // Fetch all contacts for project manager selection and client selection
  const { data: allContacts = [] } = useQuery({
    queryKey: ['/api/contacts'],
    queryFn: async () => {
      const response = await fetch('/api/contacts');
      if (!response.ok) {
        throw new Error('Failed to fetch contacts');
      }
      return response.json();
    },
  });

  // Filter to only show project manager contacts (both 'pm' and 'project_manager' roles)
  const projectManagerContacts = allContacts.filter((contact: any) => 
    contact.role === 'project_manager' || contact.role === 'pm'
  );

  // Filter to only show client contacts
  const clientContacts = allContacts.filter((contact: any) => 
    contact.role === 'client'
  );

  // Helper function to get current client from project metadata
  const getCurrentClientId = () => {
    try {
      const metadata = JSON.parse(project.projectMetadata || '{}');
      return metadata.clientId || '';
    } catch {
      return '';
    }
  };

  // Helper function to format date for input field
  const formatDateForInput = (dateString: string | null) => {
    if (!dateString) return '';
    try {
      const date = new Date(dateString);
      return date.toISOString().split('T')[0]; // Returns YYYY-MM-DD format
    } catch {
      return '';
    }
  };

  const form = useForm<EditProjectFormData>({
    resolver: zodResolver(editProjectSchema),
    defaultValues: {
      name: '',
      description: '',
      clientId: '',
      clientName: '',
      clientEmail: '',
      clientPhone: '',
      address: '',
      squareFootage: 0,
      estimatedBudget: 0,
      status: 'planning',
      startDate: '',
      targetCompletion: '',
      assignedProjectManager: '',
    },
  });



  // Reset form with current project data when project changes or dialog opens
  useEffect(() => {
    if (project && open) {
      // Development logging removed
      const currentClientId = getCurrentClientId();
      const currentClient = currentClientId ? clientContacts.find(c => c.id.toString() === currentClientId) : null;
      
      setSelectedClientId(currentClientId);

      const formData = {
        name: project.name || '',
        description: project.description || '',
        clientId: currentClientId,
        clientName: project.clientName || '',
        clientEmail: project.clientEmail || '',
        clientPhone: project.clientPhone || '',
        address: project.address || '',
        squareFootage: project.squareFootage || 0,
        estimatedBudget: project.estimatedBudget || 0,
        status: project.status || 'planning',
        startDate: formatDateForInput(project.startDate),
        targetCompletion: formatDateForInput(project.targetCompletion),
        assignedProjectManager: project.assignedProjectManager || '',
      };
      
      // Development logging removed
      form.reset(formData);
    }
  }, [project, open, form, clientContacts]);

  const updateProjectMutation = useMutation({
    mutationFn: async (data: EditProjectFormData) => {
      // Include all form data
      const updateData = {
        name: data.name,
        description: data.description,
        clientName: data.clientName,
        clientEmail: data.clientEmail,
        clientPhone: data.clientPhone,
        address: data.address,
        squareFootage: data.squareFootage,
        estimatedBudget: data.estimatedBudget,
        status: data.status,
        startDate: data.startDate ? new Date(data.startDate).toISOString() : null,
        targetCompletion: data.targetCompletion ? new Date(data.targetCompletion).toISOString() : null,
        assignedProjectManager: data.assignedProjectManager,
        projectMetadata: JSON.stringify({
          assignedProjectManager: data.assignedProjectManager,
          clientId: data.clientId || selectedClientId,
        }),
        updatedAt: new Date().toISOString(),
      };

      return apiRequest(`/api/projects/${project.id}`, {
        method: 'PUT',
        body: JSON.stringify(updateData),
        headers: {
          'Content-Type': 'application/json',
        },
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${project.id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${project.id}/tasks`] });
      // Invalidate global schedule cache for project changes that affect scheduling
      queryClient.invalidateQueries({ queryKey: ['/api/tasks/all-active'] });
      
      // If start date was changed, show specific message about schedule shifting
      if (variables.startDate && variables.startDate !== formatDateForInput(project.startDate)) {
        toast({
          title: "Project Updated",
          description: "Project details updated and schedule automatically shifted to new start date.",
        });
      } else {
        toast({
          title: "Project Updated",
          description: "Project details have been successfully updated.",
        });
      }
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error updating project",
        description: error.message || "Failed to update project. Please try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: EditProjectFormData) => {
    // Development logging removed
    updateProjectMutation.mutate(data);
  };

  // Debug form values
  const watchedValues = form.watch();
  // Development logging removed

  // Component for editable field with icon
  const EditableField = ({ label, icon: Icon, children }: any) => {
    return (
      <FormItem className="space-y-2">
        <FormLabel className="flex items-center gap-2 text-sm font-medium">
          {Icon && <Icon className="h-4 w-4" />}
          {label}
        </FormLabel>
        <FormControl>
          <div className="w-full">
            {children}
          </div>
        </FormControl>
        <FormMessage />
      </FormItem>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Edit Project Details
          </DialogTitle>
          <DialogDescription>
            Update project information below. All fields are editable.
          </DialogDescription>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            
            {/* Simple test - Project Name */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Project Name</label>
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <input 
                        type="text"
                        value={field.value || ''}
                        onChange={(e) => field.onChange(e.target.value)}
                        onBlur={field.onBlur}
                        name={field.name}
                        placeholder="Enter project name"
                        className="w-full border-2 border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:border-theme-primary focus:ring-1 focus:ring-theme-primary"
                        autoComplete="off"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Simple test - Description */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Description</label>
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <textarea 
                        value={field.value || ''}
                        onChange={(e) => field.onChange(e.target.value)}
                        onBlur={field.onBlur}
                        name={field.name}
                        placeholder="Enter project description"
                        className="w-full border-2 border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:border-theme-primary focus:ring-1 focus:ring-theme-primary"
                        rows={3}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Client Name */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Client Name</label>
              <FormField
                control={form.control}
                name="clientName"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <input 
                        type="text"
                        value={field.value || ''}
                        onChange={(e) => field.onChange(e.target.value)}
                        onBlur={field.onBlur}
                        name={field.name}
                        placeholder="Enter client name"
                        className="w-full border-2 border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:border-theme-primary focus:ring-1 focus:ring-theme-primary"
                        autoComplete="off"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

            </div>

            {/* Status */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Status</label>
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="planning">Planning</SelectItem>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="punch_list">Punch List</SelectItem>
                          <SelectItem value="closeout">Closeout</SelectItem>
                          <SelectItem value="completed">Completed</SelectItem>
                          <SelectItem value="on_hold">On Hold</SelectItem>
                          <SelectItem value="cancelled">Cancelled</SelectItem>
                          <SelectItem value="archived">Archived</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Client Information Section */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900 border-b pb-2">Client Information</h3>

            <FormField
              control={form.control}
              name="clientId"
              render={({ field }) => (
                <EditableField label="Select Client from Contacts" icon={User}>
                  <Select 
                    onValueChange={(value) => {
                      field.onChange(value === 'manual' ? '' : value);
                      setSelectedClientId(value === 'manual' ? '' : value);
                      
                      // Auto-fill client details when a contact is selected
                      if (value !== 'manual') {
                        const selectedClient = clientContacts.find(c => c.id.toString() === value);
                        if (selectedClient) {
                          form.setValue('clientName', selectedClient.name || '');
                          form.setValue('clientEmail', selectedClient.email || '');
                          form.setValue('clientPhone', selectedClient.phone || '');
                        }
                      } else {
                        // Clear fields when manual is selected
                        form.setValue('clientName', '');
                        form.setValue('clientEmail', '');
                        form.setValue('clientPhone', '');
                      }
                    }} 
                    value={field.value && field.value !== '' ? field.value : (selectedClientId && selectedClientId !== '' ? selectedClientId : 'manual')}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choose existing client or enter manually below" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manual">
                        <span className="text-gray-500">Enter client details manually</span>
                      </SelectItem>
                      {clientContacts.map((client) => (
                        <SelectItem key={client.id.toString()} value={client.id.toString()}>
                          <div className="flex flex-col">
                            <span className="font-medium">{client.name}</span>
                            <span className="text-sm text-gray-500">{client.email}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </EditableField>
              )}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="clientName"
                render={({ field }) => (
                  <EditableField label="Client Name" icon={User}>
                    <Input 
                      placeholder="Enter client name" 
                      {...field}
                      className="border-2 focus:border-theme-primary focus:ring-2 focus:ring-theme-primary transition-all"
                    />
                  </EditableField>
                )}
              />

              <FormField
                control={form.control}
                name="clientEmail"
                render={({ field }) => (
                  <EditableField label="Client Email" icon={Mail}>
                    <Input 
                      type="email" 
                      placeholder="client@email.com" 
                      {...field}
                      className="border-2 focus:border-theme-primary focus:ring-2 focus:ring-theme-primary transition-all"
                    />
                  </EditableField>
                )}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="clientPhone"
                render={({ field }) => (
                  <EditableField label="Client Phone" icon={Phone}>
                    <Input 
                      placeholder="(555) 123-4567" 
                      {...field}
                      className="border-2 focus:border-theme-primary focus:ring-2 focus:ring-theme-primary transition-all"
                    />
                  </EditableField>
                )}
              />

              <FormField
                control={form.control}
                name="assignedProjectManager"
                render={({ field }) => (
                  <EditableField label="Project Manager" icon={Users}>
                    <SubcontractorComboBox
                      subcontractors={projectManagerContacts}
                      value={field.value}
                      onValueChange={field.onChange}
                      placeholder="Select project manager"
                      showTrade={false}
                    />
                  </EditableField>
                )}
              />
            </div>
            </div>

            {/* Project Details Section */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900 border-b pb-2">Project Details</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="address"
                  render={({ field }) => (
                    <EditableField label="Project Address" icon={MapPin}>
                      <Input placeholder="Enter project address" {...field} />
                    </EditableField>
                  )}
                />

                <FormField
                  control={form.control}
                  name="estimatedBudget"
                  render={({ field }) => (
                    <EditableField label="Estimated Budget" icon={DollarSign}>
                      <Input 
                        type="number" 
                        placeholder="450000" 
                        {...field}
                      />
                    </EditableField>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="startDate"
                  render={({ field }) => (
                    <EditableField label="Start Date" icon={Calendar}>
                      <Input 
                        type="date" 
                        {...field}
                        value={field.value || ''}
                        onChange={(e) => field.onChange(e.target.value)}
                      />
                    </EditableField>
                  )}
                />

                <FormField
                  control={form.control}
                  name="targetCompletion"
                  render={({ field }) => (
                    <EditableField label="Target Completion" icon={Calendar}>
                      <Input 
                        type="date" 
                        {...field}
                        value={field.value || ''}
                        onChange={(e) => field.onChange(e.target.value)}
                      />
                    </EditableField>
                  )}
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={updateProjectMutation.isPending}
              >
                Cancel
              </Button>
              <Button 
                variant="accent"
                type="submit" 
                disabled={updateProjectMutation.isPending}
              >
                {updateProjectMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Save Changes
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}