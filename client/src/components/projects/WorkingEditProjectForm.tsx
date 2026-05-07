import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SubcontractorComboBox } from '@/components/ui/subcontractor-combobox';
import { useToast } from '@/hooks/use-toast';
import { Loader2, FileText, User, Mail, Phone, MapPin, Calendar, DollarSign, Users } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';

interface EditProjectFormProps {
  project: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function WorkingEditProjectForm({ project, open, onOpenChange }: EditProjectFormProps) {
  // Form state using useState
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [status, setStatus] = useState('planning');
  const [address, setAddress] = useState('');
  const [estimatedBudget, setEstimatedBudget] = useState('');
  const [startDate, setStartDate] = useState('');
  const [targetCompletion, setTargetCompletion] = useState('');
  const [assignedProjectManager, setAssignedProjectManager] = useState('');
  const [clientId, setClientId] = useState('');

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Load client contacts
  const { data: clientContacts = [] } = useQuery({
    queryKey: ['/api/contacts'],
    select: (data: any[]) => data.filter(contact => contact.role === 'client')
  });

  // Load project managers
  const { data: projectManagers = [] } = useQuery({
    queryKey: ['/api/project-managers']
  });

  // Initialize form with project data when dialog opens
  useEffect(() => {
    if (open && project) {
      setName(project.name || '');
      setDescription(project.description || '');
      setClientName(project.clientName || '');
      setClientEmail(project.clientEmail || '');
      setClientPhone(project.clientPhone || '');
      setStatus(project.status || 'planning');
      setAddress(project.address || '');
      setEstimatedBudget(project.estimatedBudget?.toString() || '');
      setStartDate(project.startDate ? project.startDate.split('T')[0] : '');
      setTargetCompletion(project.targetCompletion ? project.targetCompletion.split('T')[0] : '');
      setAssignedProjectManager(project.assignedProjectManager || '');
      setClientId(project.metadata?.clientId || '');
    }
  }, [open, project]);

  // Update project mutation
  const updateProjectMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest(`/api/projects/${project.id}`, 'PUT', data);
    },
    onSuccess: () => {
      toast({
        title: 'Project Updated',
        description: 'Project details have been saved successfully.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${project.id}`] });
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: 'Update Failed',
        description: error.message || 'Failed to update project',
        variant: 'destructive',
      });
    },
  });

  const handleSave = () => {
    // Basic validation
    if (!name.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Project name is required',
        variant: 'destructive',
      });
      return;
    }

    if (!clientName.trim()) {
      toast({
        title: 'Validation Error', 
        description: 'Client name is required',
        variant: 'destructive',
      });
      return;
    }

    const updateData = {
      name: name.trim(),
      description: description.trim(),
      clientName: clientName.trim(),
      clientEmail: clientEmail.trim(),
      clientPhone: clientPhone.trim(),
      status,
      address: address.trim(),
      estimatedBudget: estimatedBudget ? parseFloat(estimatedBudget) : null,
      startDate: startDate || null,
      targetCompletion: targetCompletion || null,
      assignedProjectManager: assignedProjectManager || null,
      metadata: {
        ...project.metadata,
        clientId: clientId || null,
      }
    };

    updateProjectMutation.mutate(updateData);
  };

  const handleClientSelection = (selectedClientId: string) => {
    setClientId(selectedClientId);
    
    if (selectedClientId === 'manual' || !selectedClientId) {
      setClientName('');
      setClientEmail('');
      setClientPhone('');
    } else {
      const selectedClient = clientContacts.find(c => c.id.toString() === selectedClientId);
      if (selectedClient) {
        setClientName(selectedClient.name || '');
        setClientEmail(selectedClient.email || '');
        setClientPhone(selectedClient.phone || '');
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Edit Project Details
          </DialogTitle>
          <DialogDescription>
            Update project information. All fields are editable.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Project Information */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold border-b pb-2">Project Information</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Project Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full p-3 border-2 border-gray-300 rounded-lg focus:border-theme-primary focus:outline-none"
                  placeholder="Enter project name"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Status</label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="planning">Planning</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="on_hold">On Hold</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full p-3 border-2 border-gray-300 rounded-lg focus:border-theme-primary focus:outline-none"
                placeholder="Enter project description"
                rows={3}
              />
            </div>
          </div>

          {/* Client Information */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold border-b pb-2">Client Information</h3>

            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <User className="h-4 w-4" />
                Select Client from Contacts
              </label>
              <Select value={clientId} onValueChange={handleClientSelection}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose existing client or enter manually below" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">
                    <span className="text-gray-500">Enter client details manually</span>
                  </SelectItem>
                  {clientContacts.map((client) => (
                    <SelectItem key={client.id} value={client.id.toString()}>
                      <div className="flex flex-col">
                        <span>{client.name}</span>
                        <span className="text-sm text-gray-500">{client.email}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Client Name
                </label>
                <input
                  type="text"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  className={`w-full p-3 border-2 rounded-lg focus:border-theme-primary focus:outline-none ${
                    clientId && clientId !== 'manual' ? 'bg-gray-50 border-gray-200' : 'border-gray-300'
                  }`}
                  placeholder="Enter client name"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  Client Email
                </label>
                <input
                  type="email"
                  value={clientEmail}
                  onChange={(e) => setClientEmail(e.target.value)}
                  className={`w-full p-3 border-2 rounded-lg focus:border-theme-primary focus:outline-none ${
                    clientId && clientId !== 'manual' ? 'bg-gray-50 border-gray-200' : 'border-gray-300'
                  }`}
                  placeholder="client@email.com"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Phone className="h-4 w-4" />
                  Client Phone
                </label>
                <input
                  type="text"
                  value={clientPhone}
                  onChange={(e) => setClientPhone(e.target.value)}
                  className={`w-full p-3 border-2 rounded-lg focus:border-theme-primary focus:outline-none ${
                    clientId && clientId !== 'manual' ? 'bg-gray-50 border-gray-200' : 'border-gray-300'
                  }`}
                  placeholder="(555) 123-4567"
                />
              </div>
            </div>
          </div>

          {/* Project Details */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold border-b pb-2">Project Details</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  Project Address
                </label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full p-3 border-2 border-gray-300 rounded-lg focus:border-theme-primary focus:outline-none"
                  placeholder="Enter project address"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  Estimated Budget
                </label>
                <input
                  type="number"
                  value={estimatedBudget}
                  onChange={(e) => setEstimatedBudget(e.target.value)}
                  className="w-full p-3 border-2 border-gray-300 rounded-lg focus:border-theme-primary focus:outline-none"
                  placeholder="450000"
                  step="0.01"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Start Date
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full p-3 border-2 border-gray-300 rounded-lg focus:border-theme-primary focus:outline-none"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Target Completion
                </label>
                <input
                  type="date"
                  value={targetCompletion}
                  onChange={(e) => setTargetCompletion(e.target.value)}
                  className="w-full p-3 border-2 border-gray-300 rounded-lg focus:border-theme-primary focus:outline-none"
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Project Manager
                </label>
                <SubcontractorComboBox
                  subcontractors={projectManagers}
                  value={assignedProjectManager}
                  onValueChange={setAssignedProjectManager}
                  placeholder="Select project manager"
                  className="w-full"
                  showTrade={false}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button 
            variant="outline" 
            onClick={() => onOpenChange(false)}
            disabled={updateProjectMutation.isPending}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleSave}
            disabled={updateProjectMutation.isPending}
            className="bg-theme-primary hover:bg-theme-primary-hover text-white"
          >
            {updateProjectMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Changes'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}