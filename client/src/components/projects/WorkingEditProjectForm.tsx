import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { collection, doc, getDocs, onSnapshot, query, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SubcontractorComboBox } from '@/components/ui/subcontractor-combobox';
import { useToast } from '@/hooks/use-toast';
import { Loader2, FileText, User, Mail, Phone, MapPin, Calendar, DollarSign, Users, Palette } from 'lucide-react';

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
  const [designerChoice, setDesignerChoice] = useState<string>('');
  const [designerContactId, setDesignerContactId] = useState<string>('');
  const [saving, setSaving] = useState(false);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Live contact list from Firestore. Used for client picker, designer picker,
  // and project-manager picker — replaces the broken /api/contacts route.
  const [allContacts, setAllContacts] = useState<any[]>([]);
  useEffect(() => {
    const q = query(collection(db, 'contacts'));
    const unsub = onSnapshot(q, snap => {
      setAllContacts(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })));
    }, () => {});
    return () => unsub();
  }, []);
  const clientContacts = allContacts.filter(c => String(c.role || '').toLowerCase() === 'client');
  const designerContacts = allContacts.filter(c => String(c.role || '').toLowerCase() === 'designer');
  const projectManagers = allContacts.filter(c => {
    const r = String(c.role || '').toLowerCase();
    return r === 'project_manager' || r === 'pm';
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
      setDesignerChoice(String(project.designerChoice || ''));
      setDesignerContactId(String(project.designerContactId || ''));
    }
  }, [open, project]);

  const handleSave = async () => {
    if (!name.trim()) {
      toast({
        title: 'Validation error',
        description: 'Project name is required',
        variant: 'destructive',
      });
      return;
    }
    if (!clientName.trim()) {
      toast({
        title: 'Validation error',
        description: 'Client name is required',
        variant: 'destructive',
      });
      return;
    }
    if (designerChoice === 'select' && !designerContactId) {
      toast({
        title: 'Pick a designer',
        description: 'Choose a designer contact or change the option.',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    try {
      const designer = designerChoice === 'select'
        ? designerContacts.find((d: any) => String(d.id) === String(designerContactId)) || null
        : null;
      await updateDoc(doc(db, 'projects', project.id), {
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
        designerChoice: designerChoice || '',
        designerContactId: designerChoice === 'select' ? (designerContactId || '') : '',
        designerName: designer?.name || '',
        designerEmail: designer?.email || '',
        designerCompany: designer?.company || '',
        updatedAt: serverTimestamp(),
      });
      toast({ title: 'Project updated', description: 'Project details saved.' });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${project.id}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
      onOpenChange(false);
    } catch (e: any) {
      toast({
        title: 'Could not update project',
        description: e?.message || 'Save failed',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
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
                    <SelectItem value="punch_list">Punch List</SelectItem>
                    <SelectItem value="closeout">Closeout</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="on_hold">On Hold</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
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

          {/* Designer section */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold border-b pb-2 flex items-center gap-2">
              <Palette className="h-4 w-4" />
              Designer
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {[
                { val: 'select', label: 'Select a designer', desc: 'Pick from your designer contacts' },
                { val: 'none', label: 'No designer needed', desc: 'Spec build or self-managed' },
                { val: 'client_self', label: 'Client doing design', desc: 'The client owns design selections' },
                { val: 'later', label: 'Decide later', desc: 'Flag to come back to this' },
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
                      name="designerChoice"
                      value={opt.val}
                      checked={active}
                      onChange={() => setDesignerChoice(opt.val)}
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
            {designerChoice === 'select' && (
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Designer <span className="text-red-500 font-bold">*</span>
                </label>
                <Select
                  value={designerContactId}
                  onValueChange={setDesignerContactId}
                >
                  <SelectTrigger>
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
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-theme-primary hover:bg-theme-primary-hover text-white"
          >
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving…
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