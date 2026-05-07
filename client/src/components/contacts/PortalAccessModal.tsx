import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { AlertCircle, Key, Mail, User, Calendar, Clock } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

interface Contact {
  id: number;
  name: string;
  role: string;
  email?: string;
  hasPortalAccess?: boolean;
  portalEmail?: string;
  portalRole?: string;
  portalAccessGrantedAt?: string;
  lastLogin?: string;
}

interface PortalAccessModalProps {
  contact: Contact;
  open: boolean;
  onClose: () => void;
}

export function PortalAccessModal({ contact, open, onClose }: PortalAccessModalProps) {
  const [portalEmail, setPortalEmail] = useState(contact.portalEmail || contact.email || '');
  const [portalPassword, setPortalPassword] = useState('');
  const [portalRole, setPortalRole] = useState<'client' | 'subcontractor' | 'designer'>(
    contact.portalRole as any || (contact.role === 'pm' ? 'client' : contact.role as any) || 'client'
  );
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [newPassword, setNewPassword] = useState('');

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const grantAccessMutation = useMutation({
    mutationFn: async (data: { portalEmail: string; portalPassword: string; portalRole: string }) => {
      return apiRequest(`PATCH`, `/api/contacts/${contact.id}/portal-access`, data);
    },
    onSuccess: () => {
      toast({
        title: "Portal Access Granted",
        description: `${contact.name} now has access to the ${portalRole} portal.`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/contacts'] });
      onClose();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to grant portal access",
        variant: "destructive",
      });
    },
  });

  const revokeAccessMutation = useMutation({
    mutationFn: async () => {
      return apiRequest(`DELETE`, `/api/contacts/${contact.id}/portal-access`);
    },
    onSuccess: () => {
      toast({
        title: "Portal Access Revoked",
        description: `${contact.name} no longer has portal access.`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/contacts'] });
      onClose();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to revoke portal access",
        variant: "destructive",
      });
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async (newPassword: string) => {
      return apiRequest(`PATCH`, `/api/contacts/${contact.id}/reset-password`, { newPassword });
    },
    onSuccess: () => {
      toast({
        title: "Password Reset",
        description: `Portal password has been updated for ${contact.name}.`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/contacts'] });
      setShowPasswordReset(false);
      setNewPassword('');
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to reset password",
        variant: "destructive",
      });
    },
  });

  const generateTempPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    let result = '';
    for (let i = 0; i < 8; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setPortalPassword(result);
  };

  const handleGrantAccess = () => {
    if (!portalEmail || !portalPassword || !portalRole) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }

    grantAccessMutation.mutate({
      portalEmail,
      portalPassword,
      portalRole,
    });
  };

  const handleResetPassword = () => {
    if (!newPassword) {
      toast({
        title: "Missing Information",
        description: "Please enter a new password.",
        variant: "destructive",
      });
      return;
    }

    resetPasswordMutation.mutate(newPassword);
  };

  const getPortalUrl = (role: string) => {
    const baseUrl = window.location.origin;
    switch (role) {
      case 'client': return `${baseUrl}/client-portal`;
      case 'subcontractor': return `${baseUrl}/subcontractor-portal`;
      case 'designer': return `${baseUrl}/designer-portal`;
      default: return `${baseUrl}/login`;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Portal Access - {contact.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {contact.hasPortalAccess ? (
            // Existing access - show details and options
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Portal Status</span>
                <Badge variant="default" className="bg-green-100 text-green-800">
                  Active
                </Badge>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">Email:</span>
                  <span>{contact.portalEmail}</span>
                </div>

                <div className="flex items-center gap-2 text-sm">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">Role:</span>
                  <Badge variant="outline" className="capitalize">
                    {contact.portalRole}
                  </Badge>
                </div>

                {contact.portalAccessGrantedAt && (
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">Access Granted:</span>
                    <span>{new Date(contact.portalAccessGrantedAt).toLocaleDateString()}</span>
                  </div>
                )}

                {contact.lastLogin && (
                  <div className="flex items-center gap-2 text-sm">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">Last Login:</span>
                    <span>{new Date(contact.lastLogin).toLocaleDateString()}</span>
                  </div>
                )}
              </div>

              <div className="p-3 bg-blue-50 rounded-lg">
                <div className="text-sm font-medium mb-1">Portal URL:</div>
                <div className="text-sm text-theme-primary break-all">
                  {getPortalUrl(contact.portalRole || 'client')}
                </div>
              </div>

              <Separator />

              <div className="space-y-3">
                {!showPasswordReset ? (
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowPasswordReset(true)}
                      className="flex-1"
                    >
                      <Key className="h-4 w-4 mr-1" />
                      Reset Password
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => revokeAccessMutation.mutate()}
                      disabled={revokeAccessMutation.isPending}
                      className="flex-1"
                    >
                      <AlertCircle className="h-4 w-4 mr-1" />
                      Revoke Access
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <Label htmlFor="newPassword">New Password</Label>
                      <div className="flex gap-2 mt-1">
                        <Input
                          id="newPassword"
                          type="text"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="Enter new password"
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setNewPassword(Math.random().toString(36).slice(-8))}
                        >
                          Generate
                        </Button>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setShowPasswordReset(false);
                          setNewPassword('');
                        }}
                        className="flex-1"
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={handleResetPassword}
                        disabled={resetPasswordMutation.isPending}
                        size="sm"
                        className="flex-1"
                      >
                        Update Password
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            // No access - create new access
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-amber-600">
                <AlertCircle className="h-4 w-4" />
                <span className="text-sm">No portal access configured</span>
              </div>

              <div className="space-y-4">
                <div>
                  <Label htmlFor="portalEmail">Portal Email</Label>
                  <Input
                    id="portalEmail"
                    type="email"
                    value={portalEmail}
                    onChange={(e) => setPortalEmail(e.target.value)}
                    placeholder="Enter portal email"
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label htmlFor="portalRole">Portal Role</Label>
                  <Select value={portalRole} onValueChange={(value: any) => setPortalRole(value)}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Select portal role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="client">Client Portal</SelectItem>
                      <SelectItem value="subcontractor">Subcontractor Portal</SelectItem>
                      <SelectItem value="designer">Designer Portal</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="portalPassword">Temporary Password</Label>
                  <div className="flex gap-2 mt-1">
                    <Input
                      id="portalPassword"
                      type="text"
                      value={portalPassword}
                      onChange={(e) => setPortalPassword(e.target.value)}
                      placeholder="Enter temporary password"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={generateTempPassword}
                    >
                      Generate
                    </Button>
                  </div>
                </div>

                <Button
                  onClick={handleGrantAccess}
                  disabled={grantAccessMutation.isPending}
                  className="w-full"
                >
                  {grantAccessMutation.isPending ? "Granting Access..." : "Grant Portal Access"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}