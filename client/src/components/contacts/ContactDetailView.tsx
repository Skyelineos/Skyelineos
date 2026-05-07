import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle 
} from '@/components/ui/dialog';
import SubcontractorDocuments from './SubcontractorDocuments';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import {
  User,
  Mail,
  Phone,
  Building2,
  Briefcase,
  MapPin,
  Calendar,
  MessageSquare,
  Edit3,
  Archive,
  ExternalLink,
  Copy,
  Star,
  FileText,
  Shield,
  Upload,
  Download,
  AlertTriangle,
  CheckCircle,
  Clock,
  Palette,
  Wrench,
  Users2,
  LogIn,
  RotateCcw,
  Key,
  Trash2
} from 'lucide-react';

// Use shared Contact type from shared/types.ts
import { Contact } from '@shared/types';

interface ContactDetailViewProps {
  contact: Contact;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit?: (contact: Contact) => void;
  userRole?: 'admin' | 'projectManager' | 'client';
}

export default function ContactDetailView({ 
  contact, 
  open, 
  onOpenChange, 
  onEdit,
  userRole = 'admin'
}: ContactDetailViewProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Contact is passed as prop, no need to fetch
  const isLoading = false;

  const archiveContactMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/contacts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: false }),
      });
      if (!response.ok) throw new Error('Failed to archive contact');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/contacts'] });
      toast({ title: "Contact Archived", description: "Contact has been archived successfully." });
      onOpenChange(false);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to archive contact.", variant: "destructive" });
    },
  });

  const deleteContactMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/contacts/${id}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Failed to delete contact');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/contacts'] });
      toast({ title: "Contact Deleted", description: "Contact has been permanently deleted." });
      onOpenChange(false);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete contact.", variant: "destructive" });
    },
  });

  const getRoleColor = (role: string) => {
    const colors: Record<string, string> = {
      client: 'bg-green-100 text-green-800 hover:bg-green-200',
      subcontractor: 'bg-blue-100 text-blue-800 hover:bg-blue-200',
      designer: 'bg-purple-100 text-purple-800 hover:bg-purple-200',
      pm: 'bg-orange-100 text-orange-800 hover:bg-orange-200',
      vendor: 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200',
      employee: 'bg-gray-100 text-gray-800 hover:bg-gray-200',
      accountant: 'bg-indigo-100 text-indigo-800 hover:bg-indigo-200',
    };
    return colors[role] || colors.client;
  };

  const getRoleLabel = (role: string) => {
    const labels: Record<string, string> = {
      client: 'Client',
      subcontractor: 'Subcontractor',
      designer: 'Designer',
      pm: 'Project Manager',
      vendor: 'Vendor',
      employee: 'Employee',
      accountant: 'Accountant',
    };
    return labels[role] || role;
  };

  const getRatingStars = (rating: number) => {
    return Array.from({ length: 5 }, (_, i) => (
      <Star
        key={i}
        className={`h-4 w-4 ${
          i < rating ? 'text-yellow-400 fill-current' : 'text-gray-300'
        }`}
      />
    ));
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied", description: `${label} copied to clipboard.` });
  };

  const canEdit = userRole === 'admin' || userRole === 'projectManager';

  // Portal access management mutations
  const updatePortalAccessMutation = useMutation({
    mutationFn: async ({ contactId, hasPortalAccess, portalEmail }: { 
      contactId: number; 
      hasPortalAccess: boolean; 
      portalEmail?: string; 
    }) => {
      const response = await fetch(`/api/contacts/${contactId}/portal-access`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          hasPortalAccess, 
          portalEmail: portalEmail || contact?.email,
          portalAccessGrantedAt: hasPortalAccess ? new Date().toISOString() : null
        }),
      });
      if (!response.ok) throw new Error('Failed to update portal access');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/contacts'] });
      toast({ 
        title: "Portal Access Updated", 
        description: `Portal access has been ${contact?.hasPortalAccess ? 'revoked' : 'granted'} successfully.` 
      });
    },
    onError: () => {
      toast({ 
        title: "Error", 
        description: "Failed to update portal access.", 
        variant: "destructive" 
      });
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async (contactId: number) => {
      const response = await fetch(`/api/contacts/${contactId}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) throw new Error('Failed to reset password');
      return response.json();
    },
    onSuccess: (data) => {
      toast({ 
        title: "Password Reset", 
        description: `New temporary password: ${data.temporaryPassword}`,
        duration: 10000 // Show longer for user to copy
      });
    },
    onError: () => {
      toast({ 
        title: "Error", 
        description: "Failed to reset password.", 
        variant: "destructive" 
      });
    },
  });

  const handlePortalAccess = (newAccessStatus: boolean) => {
    if (!contact) return;
    updatePortalAccessMutation.mutate({
      contactId: contact.id,
      hasPortalAccess: newAccessStatus,
      portalEmail: contact.portalEmail || contact.email
    });
  };

  const handleResetPassword = () => {
    if (!contact) return;
    resetPasswordMutation.mutate(contact.id);
  };

  // Helper function to check if insurance is expiring within 30 days
  const isInsuranceExpiringSoon = (expirationDate: string) => {
    const expDate = new Date(expirationDate);
    const today = new Date();
    const thirtyDaysFromNow = new Date(today.getTime() + (30 * 24 * 60 * 60 * 1000));
    return expDate <= thirtyDaysFromNow && expDate >= today;
  };

  // Helper function to check if insurance is expired
  const isInsuranceExpired = (expirationDate: string) => {
    const expDate = new Date(expirationDate);
    const today = new Date();
    return expDate < today;
  };

  // Role-specific field rendering components
  const renderSubcontractorFields = (contact: Contact) => (
    <div className="space-y-6">
      {/* Trade Information */}
      <Card className="bg-gray-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5" />
            Trade Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Briefcase className="h-4 w-4 text-gray-400" />
            <div>
              <div className="font-medium">Trade Specialties</div>
              <div className="flex flex-wrap gap-1 mt-1">
                {contact.trades && contact.trades.length > 0 ? (
                  contact.trades.map((trade, index) => (
                    <Badge key={index} variant="outline" className="text-xs">
                      {trade}
                    </Badge>
                  ))
                ) : contact.trade ? (
                  <Badge variant="outline" className="text-xs">
                    {contact.trade}
                  </Badge>
                ) : (
                  <span className="text-sm text-gray-600">Not specified</span>
                )}
              </div>
            </div>
          </div>
          
          <Separator />
          
          <div className="flex items-center gap-3">
            <Building2 className="h-4 w-4 text-gray-400" />
            <div>
              <div className="font-medium">Company</div>
              <div className="text-sm text-gray-600">{contact.company || 'Not specified'}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Documents - Enhanced Component */}
      <SubcontractorDocuments contact={contact as any} />

      {/* Status */}
      <Card className="bg-gray-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5" />
            Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Badge className="bg-green-100 text-green-800">Active</Badge>
            
            {/* Insurance Status Badges */}
            {contact.insuranceExpirationDate && (
              <>
                {isInsuranceExpired(contact.insuranceExpirationDate) ? (
                  <Badge variant="outline" className="text-red-600 border-red-300 bg-red-50">
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    Insurance Expired
                  </Badge>
                ) : isInsuranceExpiringSoon(contact.insuranceExpirationDate) ? (
                  <Badge variant="outline" className="text-orange-600 border-orange-300 bg-orange-50">
                    <Clock className="h-3 w-3 mr-1" />
                    Insurance Expiring Soon
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-green-600 border-green-300 bg-green-50">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Insurance Current
                  </Badge>
                )}
              </>
            )}
            
            {/* W-9 Status */}
            {contact.w9FileUrl ? (
              <Badge variant="outline" className="text-green-600 border-green-300 bg-green-50">
                <CheckCircle className="h-3 w-3 mr-1" />
                W-9 Complete
              </Badge>
            ) : (
              <Badge variant="outline" className="text-red-600 border-red-300 bg-red-50">
                <AlertTriangle className="h-3 w-3 mr-1" />
                W-9 Missing
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>


    </div>
  );

  const renderClientFields = (contact: Contact) => (
    <div className="space-y-6">
      {/* Project Information */}
      <Card className="bg-gray-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Project Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <MapPin className="h-4 w-4 text-gray-400" />
            <div>
              <div className="font-medium">Project Address</div>
              <div className="text-sm text-gray-600">
                {contact.address ? `${contact.address}, ${contact.city}, ${contact.state}` : 'Not specified'}
              </div>
            </div>
          </div>
          
          <Separator />
          
          <div className="flex items-center gap-3">
            <User className="h-4 w-4 text-gray-400" />
            <div>
              <div className="font-medium">Assigned Designer</div>
              <div className="text-sm text-gray-600">Not assigned</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Communication Preferences */}
      <Card className="bg-gray-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Communication
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <Phone className="h-4 w-4 text-gray-400" />
            <div>
              <div className="font-medium">Preferred Contact Method</div>
              <div className="text-sm text-gray-600">Phone calls</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const renderDesignerFields = (contact: Contact) => (
    <div className="space-y-6">
      {/* Design Information */}
      <Card className="bg-gray-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5" />
            Design Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Palette className="h-4 w-4 text-gray-400" />
            <div>
              <div className="font-medium">Design Specialty</div>
              <div className="text-sm text-gray-600">Modern & Contemporary</div>
            </div>
          </div>
          
          <Separator />
          
          <div className="flex items-center gap-3">
            <Building2 className="h-4 w-4 text-gray-400" />
            <div>
              <div className="font-medium">Company Type</div>
              <div className="text-sm text-gray-600">
                {contact.company ? 'External Designer' : 'Internal Team'}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const renderEmployeeFields = (contact: Contact) => (
    <div className="space-y-6">
      {/* Employee Information */}
      <Card className="bg-gray-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users2 className="h-5 w-5" />
            Employee Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Briefcase className="h-4 w-4 text-gray-400" />
            <div>
              <div className="font-medium">Department</div>
              <div className="text-sm text-gray-600">
                {contact.role === 'pm' ? 'Project Management' :
                 contact.role === 'accountant' ? 'Accounting' : 'General'}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const renderVendorFields = (contact: Contact) => (
    <div className="space-y-6">
      {/* Vendor Information */}
      <Card className="bg-gray-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Vendor Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Building2 className="h-4 w-4 text-gray-400" />
            <div>
              <div className="font-medium">Company</div>
              <div className="text-sm text-gray-600">{contact.company || 'Not specified'}</div>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <Briefcase className="h-4 w-4 text-gray-400" />
            <div>
              <div className="font-medium">Vendor Type</div>
              <div className="text-sm text-gray-600">{contact.trade || 'General Vendor'}</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const renderRoleSpecificFields = (contact: Contact) => {
    switch (contact.role) {
      case 'subcontractor':
        return renderSubcontractorFields(contact);
      case 'client':
        return renderClientFields(contact);
      case 'designer':
        return renderDesignerFields(contact);
      case 'vendor':
        return renderVendorFields(contact);
      case 'pm':
      case 'employee':
      case 'accountant':
        return renderEmployeeFields(contact);
      default:
        return null;
    }
  };

  if (!contact || !open) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-full max-h-[95vh] overflow-y-auto sm:max-w-4xl lg:max-w-6xl xl:max-w-7xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="h-12 w-12 bg-blue-100 rounded-full flex items-center justify-center">
              <User className="h-6 w-6 text-theme-primary" />
            </div>
            Contact Details
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-theme-primary"></div>
          </div>
        ) : contact ? (
          <div className="space-y-6">
            {/* Header Section */}
            <Card className="bg-gray-50">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-4">
                    <div className="h-16 w-16 bg-blue-100 rounded-full flex items-center justify-center">
                      <User className="h-8 w-8 text-theme-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-2xl">{contact.name}</CardTitle>
                      <div className="flex items-center gap-3 mt-2">
                        <Badge className={getRoleColor(contact.role)}>
                          {getRoleLabel(contact.role)}
                        </Badge>
                        {contact.trade && (
                          <Badge variant="outline">{contact.trade}</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1 mt-2">
                        {getRatingStars(contact.rating || 0)}
                        <span className="text-sm text-gray-600 ml-2">
                          ({contact.rating || 0}/5)
                        </span>
                      </div>
                      
                      {/* Contact Information */}
                      <div className="flex flex-wrap items-center gap-4 sm:gap-6 mt-4 pt-3 border-t border-gray-200">
                        {contact.email && (
                          <div className="flex items-center gap-2">
                            <Mail className="h-4 w-4 text-gray-400" />
                            <span className="text-sm text-gray-600">{contact.email}</span>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              className="h-5 w-5 p-0 ml-1"
                              onClick={() => copyToClipboard(contact.email, 'Email')}
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                        {contact.phone && (
                          <div className="flex items-center gap-2">
                            <Phone className="h-4 w-4 text-gray-400" />
                            <span className="text-sm text-gray-600">{contact.phone}</span>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              className="h-5 w-5 p-0 ml-1"
                              onClick={() => copyToClipboard(contact.phone, 'Phone')}
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                        {contact.company && (
                          <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4 text-gray-400" />
                            <span className="text-sm text-gray-600">{contact.company}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-gray-400" />
                          <span className="text-sm text-gray-600">
                            Added {new Date(contact.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {canEdit && (
                      <>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => onEdit && onEdit(contact)}
                        >
                          <Edit3 className="h-4 w-4 mr-2" />
                          Edit
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => archiveContactMutation.mutate(contact.id)}
                          disabled={archiveContactMutation.isPending}
                        >
                          <Archive className="h-4 w-4 mr-2" />
                          Archive
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => setShowDeleteConfirm(true)}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </Button>
                      </>
                    )}
                    <Button variant="outline" size="sm">
                      <MessageSquare className="h-4 w-4 mr-2" />
                      Message
                    </Button>
                  </div>
                </div>
              </CardHeader>
            </Card>



            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Left Column - Role-Specific Information */}
              <div className="space-y-6">
                {renderRoleSpecificFields(contact)}
              </div>

              {/* Right Column - Portal Access and Additional Information */}
              <div className="space-y-6">
                {/* Associated Projects */}
                <Card className="bg-gray-50">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Briefcase className="h-5 w-5" />
                      Associated Projects ({(() => {
                        try {
                          return JSON.parse(contact.associatedProjects || '[]').length;
                        } catch {
                          return 0;
                        }
                      })()})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {(() => {
                      try {
                        const projects = JSON.parse(contact.associatedProjects || '[]');
                        return projects.length > 0 ? (
                          <div className="space-y-2">
                            {projects.map((project: string, index: number) => (
                              <div
                                key={index}
                                className="flex items-center justify-between p-2 rounded-lg bg-gray-50 hover:bg-gray-100 cursor-pointer"
                                onClick={() => {
                                  // Navigate to project detail
                                  window.open(`/projects/${project}`, '_blank');
                                }}
                              >
                                <span className="font-medium">{project}</span>
                                <ExternalLink className="h-4 w-4 text-gray-400" />
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-center py-6 text-gray-500">
                            No associated projects
                          </div>
                        );
                      } catch {
                        return (
                          <div className="text-center py-6 text-gray-500">
                            No associated projects
                          </div>
                        );
                      }
                    })()}
                  </CardContent>
                </Card>

                {/* Portal Access Management - For eligible contact types */}
                {(canEdit && (contact.role === 'client' || contact.role === 'subcontractor' || contact.role === 'designer' || contact.role === 'vendor')) && (
                  <Card className="bg-gray-50">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Shield className="h-5 w-5" />
                        Portal Access
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <LogIn className="h-4 w-4 text-gray-400" />
                          <div>
                            <div className="font-medium">Portal Access</div>
                            <div className="text-sm text-gray-600">
                              {contact.hasPortalAccess ? 'Enabled' : 'Disabled'}
                            </div>
                          </div>
                        </div>
                        <Badge 
                          variant="outline" 
                          className={contact.hasPortalAccess 
                            ? "text-green-600 border-green-300 bg-green-50" 
                            : "text-gray-600 border-gray-300 bg-gray-50"
                          }
                        >
                          {contact.hasPortalAccess ? (
                            <>
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Active
                            </>
                          ) : (
                            <>
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              Inactive
                            </>
                          )}
                        </Badge>
                      </div>

                      {contact.hasPortalAccess && (
                        <>
                          <Separator />
                          <div className="space-y-3">
                            <div className="flex items-center gap-3">
                              <Mail className="h-4 w-4 text-gray-400" />
                              <div>
                                <div className="font-medium">Portal Email</div>
                                <div className="text-sm text-gray-600">{contact.portalEmail || contact.email}</div>
                              </div>
                            </div>
                            
                            {contact.lastPortalLogin && (
                              <div className="flex items-center gap-3">
                                <Clock className="h-4 w-4 text-gray-400" />
                                <div>
                                  <div className="font-medium">Last Portal Login</div>
                                  <div className="text-sm text-gray-600">
                                    {new Date(contact.lastPortalLogin).toLocaleDateString()}
                                  </div>
                                </div>
                              </div>
                            )}

                            {contact.portalAccessGrantedAt && (
                              <div className="flex items-center gap-3">
                                <Calendar className="h-4 w-4 text-gray-400" />
                                <div>
                                  <div className="font-medium">Access Granted</div>
                                  <div className="text-sm text-gray-600">
                                    {new Date(contact.portalAccessGrantedAt).toLocaleDateString()}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </>
                      )}

                      <div className="flex gap-2 pt-2">
                        <Button 
                          variant={contact.hasPortalAccess ? "outline" : "default"}
                          size="sm"
                          onClick={() => handlePortalAccess(!contact.hasPortalAccess)}
                        >
                          <Shield className="h-4 w-4 mr-2" />
                          {contact.hasPortalAccess ? 'Revoke Access' : 'Grant Access'}
                        </Button>
                        
                        {contact.hasPortalAccess && (
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleResetPassword()}
                          >
                            <Key className="h-4 w-4 mr-2" />
                            Reset Password
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Tags */}
                {(() => {
                  try {
                    const tags = JSON.parse(contact.tags || '[]');
                    return tags.length > 0 && (
                      <Card className="bg-gray-50">
                        <CardHeader>
                          <CardTitle>Tags</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="flex flex-wrap gap-2">
                            {tags.map((tag: string) => (
                              <Badge key={tag} variant="outline">
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  } catch {
                    return null;
                  }
                })()}

                {/* Notes */}
                {contact.notes && (
                  <Card className="bg-gray-50">
                    <CardHeader>
                      <CardTitle>Notes</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="bg-gray-50 rounded-lg p-4 max-h-40 overflow-y-auto">
                        <p className="text-sm whitespace-pre-wrap">{contact.notes}</p>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-12">
            <div className="text-gray-500">Contact not found</div>
          </div>
        )}
      </DialogContent>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Contact</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to permanently delete "{contact?.name}"? This action cannot be undone and will remove all contact information and associations.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (contact) {
                  deleteContactMutation.mutate(contact.id);
                  setShowDeleteConfirm(false);
                }
              }}
              className="bg-red-600 hover:bg-red-700"
              disabled={deleteContactMutation.isPending}
            >
              {deleteContactMutation.isPending ? 'Deleting...' : 'Delete Contact'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}