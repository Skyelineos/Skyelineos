import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { collection, doc, getDocs, query as fsQuery, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { sendPasswordResetEmail } from 'firebase/auth';
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
      toast({ title: "Contact archived", description: "Contact has been archived successfully." });
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
      toast({ title: "Contact deleted", description: "Contact has been permanently deleted." });
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

  // Portal access management — direct Firestore writes (the /api/* route is
  // blocked by org IAM on Cloud Run).
  const updatePortalAccessMutation = useMutation({
    mutationFn: async ({ contactId, hasPortalAccess, portalEmail }: {
      contactId: number | string;
      hasPortalAccess: boolean;
      portalEmail?: string;
    }) => {
      await updateDoc(doc(db, 'contacts', String(contactId)), {
        hasPortalAccess,
        portalEmail: portalEmail || contact?.email || '',
        portalAccessGrantedAt: hasPortalAccess ? serverTimestamp() : null,
        updatedAt: serverTimestamp(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/contacts'] });
      toast({
        title: 'Portal access updated',
        description: `Portal access has been ${contact?.hasPortalAccess ? 'revoked' : 'granted'}.`,
      });
    },
    onError: (e: any) => {
      toast({
        title: 'Error',
        description: e?.message || 'Failed to update portal access.',
        variant: 'destructive',
      });
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async (contactId: number | string) => {
      // Use Firebase Auth's built-in password reset — emails the user a
      // one-click reset link. No /api route, no temp password generation.
      void contactId; // unused — keyed by email
      const email = (contact?.email || '').trim();
      if (!email) throw new Error('No email on file for this contact');
      await sendPasswordResetEmail(auth, email);
      return { email };
    },
    onSuccess: (data: any) => {
      toast({
        title: 'Password reset email sent',
        description: `Reset link sent to ${data.email}. They'll receive it within a minute.`,
        duration: 8000,
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
            <Building2 className="h-4 w-4 text-gray-400" />
            <div>
              <div className="font-medium">Business Name</div>
              <div className="text-sm text-gray-600">
                {contact.company || <span className="italic text-gray-400">Not set</span>}
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
                      <ContactAverageRating contact={contact} />
                      
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
                            {(() => {
                              const raw: any = contact.createdAt;
                              const ms = raw?.toMillis
                                ? raw.toMillis()
                                : (raw?.seconds ? raw.seconds * 1000 : Date.parse(String(raw || '')));
                              return Number.isFinite(ms)
                                ? `Added ${new Date(ms).toLocaleDateString()}`
                                : 'Added recently';
                            })()}
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
                {/* Spouse — only meaningful for clients. */}
                {String(contact.role || '').toLowerCase() === 'client' && (
                  <SpouseCard contact={contact} />
                )}

                {/* Associated Projects — real lookup against projects collection. */}
                <AssociatedProjectsCard contact={contact} />

                {/* Portal Access Management - For eligible contact types */}
                {(canEdit && (contact.role === 'client' || contact.role === 'subcontractor' || contact.role === 'designer' || contact.role === 'vendor')) && (() => {
                  // A contact has real portal access if EITHER an admin explicitly
                  // granted it (`hasPortalAccess`) OR they self-signed-up and got
                  // linked (`linkedUserId` is set).
                  const linkedUserId = (contact as any).linkedUserId;
                  const portalActive = !!contact.hasPortalAccess || !!linkedUserId;
                  return (
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
                              {portalActive
                                ? (linkedUserId ? 'Active (self-registered)' : 'Enabled')
                                : 'Disabled'}
                            </div>
                          </div>
                        </div>
                        <Badge
                          variant="outline"
                          className={portalActive
                            ? "text-green-600 border-green-300 bg-green-50"
                            : "text-gray-600 border-gray-300 bg-gray-50"
                          }
                        >
                          {portalActive ? (
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

                      {portalActive && (
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
                          variant={portalActive ? "outline" : "default"}
                          size="sm"
                          onClick={() => handlePortalAccess(!portalActive)}
                        >
                          <Shield className="h-4 w-4 mr-2" />
                          {portalActive ? 'Revoke Access' : 'Grant Access'}
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
                  );
                })()}

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

// ─── Associated Projects (real Firestore lookup) ─────────────────────────────
interface AssociatedProjectRow {
  id: string;
  name: string;
  status: string;
  projectCode?: string;
}

function AssociatedProjectsCard({ contact }: { contact: any }) {
  const [, setLocation] = useLocation();
  const [projects, setProjects] = useState<AssociatedProjectRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!contact?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const contactId = String(contact.id);
        // Three possible links — run all in parallel, then de-dupe by doc id.
        const queries = [
          // Client picker (NewProjectForm) writes contactId into clientIds array.
          fsQuery(collection(db, 'projects'), where('clientIds', 'array-contains', contactId)),
          // Designer selection writes contactId into designerContactId.
          fsQuery(collection(db, 'projects'), where('designerContactId', '==', contactId)),
        ];
        // Sales-converted clients link via salesClientId on the contact pointing
        // at the clients/{id} doc — and the project may reference that same id.
        if (contact.salesClientId) {
          queries.push(fsQuery(
            collection(db, 'projects'),
            where('salesClientId', '==', String(contact.salesClientId)),
          ));
        }
        const snaps = await Promise.all(queries.map(q => getDocs(q).catch(() => null)));
        if (cancelled) return;
        const seen = new Map<string, AssociatedProjectRow>();
        for (const snap of snaps) {
          if (!snap) continue;
          snap.docs.forEach(d => {
            const data = d.data() as any;
            if (!seen.has(d.id)) {
              seen.set(d.id, {
                id: d.id,
                name: data.name || '(unnamed project)',
                status: data.status || '',
                projectCode: data.projectCode,
              });
            }
          });
        }
        setProjects(Array.from(seen.values()));
      } catch {
        setProjects([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [contact?.id, contact?.salesClientId]);

  return (
    <Card className="bg-gray-50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Briefcase className="h-5 w-5" />
          Associated Projects ({projects.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-center py-6 text-gray-400 text-sm">Loading…</div>
        ) : projects.length === 0 ? (
          <div className="text-center py-6 text-gray-500">No associated projects</div>
        ) : (
          <div className="space-y-2">
            {projects.map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => setLocation(`/projects/${p.id}/overview`)}
                className="w-full flex items-center justify-between p-2 rounded-lg bg-white hover:bg-gray-100 border border-gray-200 text-left"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{p.name}</p>
                  <p className="text-[11px] text-gray-500 truncate">
                    {p.projectCode || ''}{p.projectCode && p.status ? ' · ' : ''}{p.status}
                  </p>
                </div>
                <ExternalLink className="h-4 w-4 text-gray-400 flex-shrink-0" />
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Spouse card ─────────────────────────────────────────────────────────────
// Shows linked spouse contact info (when set) plus inline-captured fallback
// fields. If a contact is linked, name/email pull from there. If only inline
// info is set (because spouse hasn't been entered as a separate contact yet),
// show that. Edit happens via the Edit Contact dialog.
function SpouseCard({ contact }: { contact: any }) {
  const [, setLocation] = useLocation();
  const [spouseContact, setSpouseContact] = useState<any>(null);
  const spouseId = String(contact?.spouseContactId || '');
  const inlineName = String(contact?.spouseName || '');
  const inlineEmail = String(contact?.spouseEmail || '');
  const inlinePhone = String(contact?.spousePhone || '');

  useEffect(() => {
    if (!spouseId) {
      setSpouseContact(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDocs(fsQuery(
          collection(db, 'contacts'),
          where('__name__', '==', spouseId),
        ));
        if (cancelled) return;
        if (!snap.empty) setSpouseContact({ id: snap.docs[0].id, ...(snap.docs[0].data() as any) });
        else setSpouseContact(null);
      } catch {
        setSpouseContact(null);
      }
    })();
    return () => { cancelled = true; };
  }, [spouseId]);

  const hasAnything = !!spouseId || !!inlineName || !!inlineEmail || !!inlinePhone;
  const name = spouseContact?.name || inlineName;
  const email = spouseContact?.email || inlineEmail;
  const phone = spouseContact?.phone || inlinePhone;

  return (
    <Card className="bg-gray-50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <User className="h-5 w-5" />
          Spouse
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!hasAnything ? (
          <p className="text-sm text-gray-400 italic">No spouse added — use Edit to add.</p>
        ) : (
          <div className="space-y-2">
            <div>
              <p className="text-sm font-medium">{name || <span className="italic text-gray-400">Name not set</span>}</p>
              {spouseContact && (
                <button
                  type="button"
                  onClick={() => setLocation('/contacts')}
                  className="text-[11px] text-[#C9A96E] hover:underline"
                >
                  Linked contact — open Contacts
                </button>
              )}
              {!spouseContact && spouseId && (
                <p className="text-[11px] text-amber-700">Linked contact not found.</p>
              )}
              {!spouseContact && !spouseId && (
                <p className="text-[11px] text-gray-500 italic">Not yet signed up — will auto-link when they register with this email.</p>
              )}
            </div>
            {email && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Mail className="h-3.5 w-3.5 text-gray-400" />
                <a href={`mailto:${email}`} className="hover:underline">{email}</a>
              </div>
            )}
            {phone && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Phone className="h-3.5 w-3.5 text-gray-400" />
                <a href={`tel:${phone}`} className="hover:underline">{phone}</a>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Average rating from projectReviews ──────────────────────────────────────
// Pulls reviews this contact submitted (via clientUid OR contactId) and averages
// projectRating + builderRating across all of them. Only shown for clients —
// designers/subs get separate review channels later.
function ContactAverageRating({ contact }: { contact: any }) {
  const [avg, setAvg] = useState<number | null>(null);
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!contact?.id) return;
    const role = String(contact.role || '').toLowerCase();
    if (role !== 'client') return;
    let cancelled = false;
    (async () => {
      try {
        const contactId = String(contact.id);
        // Match reviews by contactId on the review doc. Also include reviews
        // submitted by the contact's linked Firebase Auth uid for safety.
        const queries = [
          fsQuery(collection(db, 'projectReviews'), where('contactId', '==', contactId)),
        ];
        const linkedUid = (contact as any).linkedUserId;
        if (linkedUid) {
          queries.push(fsQuery(collection(db, 'projectReviews'), where('clientUid', '==', String(linkedUid))));
        }
        const snaps = await Promise.all(queries.map(q => getDocs(q).catch(() => null)));
        if (cancelled) return;
        const seen = new Map<string, any>();
        for (const snap of snaps) {
          if (!snap) continue;
          snap.docs.forEach(d => {
            if (!seen.has(d.id)) seen.set(d.id, d.data());
          });
        }
        const reviews = Array.from(seen.values());
        if (reviews.length === 0) {
          setAvg(null);
          setCount(0);
          return;
        }
        const vals: number[] = [];
        reviews.forEach((r: any) => {
          if (typeof r.projectRating === 'number' && r.projectRating > 0) vals.push(r.projectRating);
          if (typeof r.builderRating === 'number' && r.builderRating > 0) vals.push(r.builderRating);
        });
        if (vals.length === 0) {
          setAvg(null);
          setCount(reviews.length);
          return;
        }
        setAvg(vals.reduce((a, b) => a + b, 0) / vals.length);
        setCount(reviews.length);
      } catch {
        setAvg(null);
      }
    })();
    return () => { cancelled = true; };
  }, [contact?.id, contact?.linkedUserId, contact?.role]);

  if (String(contact?.role || '').toLowerCase() !== 'client') return null;
  if (avg === null) {
    return (
      <div className="flex items-center gap-1 mt-2">
        {[1, 2, 3, 4, 5].map(i => (
          <Star key={i} className="h-4 w-4 text-gray-300" />
        ))}
        <span className="text-sm text-gray-400 ml-2 italic">No reviews yet</span>
      </div>
    );
  }
  const rounded = Math.round(avg);
  return (
    <div className="flex items-center gap-1 mt-2">
      {[1, 2, 3, 4, 5].map(i => (
        <Star
          key={i}
          className={`h-4 w-4 ${i <= rounded ? 'text-amber-400 fill-current' : 'text-gray-300'}`}
        />
      ))}
      <span className="text-sm text-gray-600 ml-2">
        {avg.toFixed(1)} / 5
      </span>
      <span className="text-xs text-gray-400">
        · {count} review{count === 1 ? '' : 's'}
      </span>
    </div>
  );
}