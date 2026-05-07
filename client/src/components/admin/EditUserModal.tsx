import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { User, Calendar, Mail, Shield, RefreshCw } from 'lucide-react';

// Role configuration
const ROLES = [
  { value: 'admin', label: 'Administrator', description: 'Full system access', color: 'bg-red-100 text-red-800' },
  { value: 'project_manager', label: 'Project Manager', description: 'Manage projects and users', color: 'bg-blue-100 text-blue-800' },
  { value: 'accountant', label: 'Accountant', description: 'Financial management access', color: 'bg-green-100 text-green-800' },
  { value: 'client', label: 'Client', description: 'View project progress', color: 'bg-purple-100 text-purple-800' },
  { value: 'subcontractor', label: 'Subcontractor', description: 'Bid on projects and manage tasks', color: 'bg-orange-100 text-orange-800' },
  { value: 'designer', label: 'Designer', description: 'Design and document management', color: 'bg-pink-100 text-pink-800' },
];

// User type definition
interface UserData {
  id: number;
  email: string;
  fullName: string | null;
  username: string | null;
  role: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface EditUserModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: UserData | null;
}

export function EditUserModal({ open, onOpenChange, user }: EditUserModalProps) {
  const [formData, setFormData] = useState({
    fullName: '',
    username: '',
    role: '',
    isActive: true,
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Initialize form data when user changes
  useEffect(() => {
    if (user) {
      setFormData({
        fullName: user.fullName || '',
        username: user.username || '',
        role: user.role,
        isActive: user.isActive,
      });
    }
  }, [user]);

  // Update user mutation
  const updateUserMutation = useMutation({
    mutationFn: async (updateData: Partial<typeof formData>) => {
      if (!user) throw new Error('No user selected');
      
      return apiRequest(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        body: JSON.stringify(updateData),
        headers: { 'Content-Type': 'application/json' },
      });
    },
    onSuccess: () => {
      toast({
        title: 'Success',
        description: 'User updated successfully',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
      handleClose();
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update user',
        variant: 'destructive',
      });
    },
  });

  // Update user role mutation (separate for specific role changes)
  const updateRoleMutation = useMutation({
    mutationFn: async (role: string) => {
      if (!user) throw new Error('No user selected');
      
      return apiRequest(`/api/admin/users/${user.id}/role`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
        headers: { 'Content-Type': 'application/json' },
      });
    },
    onSuccess: () => {
      toast({
        title: 'Success',
        description: 'User role updated successfully',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update user role',
        variant: 'destructive',
      });
    },
  });

  // Update user status mutation (separate for status changes)
  const updateStatusMutation = useMutation({
    mutationFn: async (isActive: boolean) => {
      if (!user) throw new Error('No user selected');
      
      return apiRequest(`/api/admin/users/${user.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive }),
        headers: { 'Content-Type': 'application/json' },
      });
    },
    onSuccess: (_, isActive) => {
      toast({
        title: 'Success',
        description: `User ${isActive ? 'activated' : 'deactivated'} successfully`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update user status',
        variant: 'destructive',
      });
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user) return;

    // Basic validation
    if (!formData.fullName || !formData.role) {
      toast({
        title: 'Validation Error',
        description: 'Please fill in all required fields',
        variant: 'destructive',
      });
      return;
    }

    // Prepare update data (only changed fields)
    const updateData: Partial<typeof formData> = {};
    
    if (formData.fullName !== (user.fullName || '')) {
      updateData.fullName = formData.fullName;
    }
    
    if (formData.username !== (user.username || '')) {
      updateData.username = formData.username || null;
    }

    // Update general fields if they changed
    if (Object.keys(updateData).length > 0) {
      updateUserMutation.mutate(updateData);
    }

    // Update role separately if changed
    if (formData.role !== user.role) {
      updateRoleMutation.mutate(formData.role);
    }

    // Update status separately if changed
    if (formData.isActive !== user.isActive) {
      updateStatusMutation.mutate(formData.isActive);
    }

    // If no changes, just close
    if (Object.keys(updateData).length === 0 && 
        formData.role === user.role && 
        formData.isActive === user.isActive) {
      handleClose();
    }
  };

  const handleClose = () => {
    onOpenChange(false);
  };

  const getRoleConfig = (role: string) => {
    return ROLES.find(r => r.value === role) || { 
      value: role, 
      label: role, 
      description: '', 
      color: 'bg-gray-100 text-gray-800' 
    };
  };

  if (!user) return null;

  const currentRoleConfig = getRoleConfig(user.role);
  const selectedRoleConfig = getRoleConfig(formData.role);
  const isSubmitting = updateUserMutation.isPending || updateRoleMutation.isPending || updateStatusMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Edit User</DialogTitle>
          <DialogDescription>
            Update user information, role, and permissions for {user.fullName || user.email}
          </DialogDescription>
        </DialogHeader>

        {/* User Info Card */}
        <Card className="bg-gray-50">
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center">
                  <User className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold">{user.fullName || 'Unnamed User'}</h3>
                  <div className="flex items-center space-x-2 text-sm text-gray-600">
                    <Mail className="w-3 h-3" />
                    <span>{user.email}</span>
                  </div>
                  {user.username && (
                    <div className="text-xs text-gray-500">@{user.username}</div>
                  )}
                </div>
              </div>
              <div className="text-right">
                <Badge className={currentRoleConfig.color}>
                  <Shield className="w-3 h-3 mr-1" />
                  {currentRoleConfig.label}
                </Badge>
                <div className="flex items-center space-x-2 text-xs text-gray-500 mt-1">
                  <Calendar className="w-3 h-3" />
                  <span>Joined {new Date(user.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Full Name */}
          <div className="space-y-2">
            <Label htmlFor="fullName">Full Name *</Label>
            <Input
              id="fullName"
              type="text"
              value={formData.fullName}
              onChange={(e) => setFormData(prev => ({ ...prev, fullName: e.target.value }))}
              placeholder="Enter full name"
              required
            />
          </div>

          {/* Username */}
          <div className="space-y-2">
            <Label htmlFor="username">Username (Optional)</Label>
            <Input
              id="username"
              type="text"
              value={formData.username}
              onChange={(e) => setFormData(prev => ({ ...prev, username: e.target.value }))}
              placeholder="Enter username"
            />
          </div>

          <Separator />

          {/* Role Selection */}
          <div className="space-y-2">
            <Label htmlFor="role">Role *</Label>
            <Select value={formData.role} onValueChange={(value) => setFormData(prev => ({ ...prev, role: value }))}>
              <SelectTrigger>
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map(role => (
                  <SelectItem key={role.value} value={role.value}>
                    <div className="flex flex-col">
                      <span>{role.label}</span>
                      <span className="text-xs text-gray-500">{role.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Role Change Warning */}
            {formData.role !== user.role && (
              <Card className="bg-yellow-50 border-yellow-200">
                <CardContent className="p-3">
                  <div className="text-sm">
                    <p className="font-medium text-yellow-800">Role Change</p>
                    <p className="text-yellow-700">
                      Changing from <strong>{currentRoleConfig.label}</strong> to <strong>{selectedRoleConfig.label}</strong>
                    </p>
                    <p className="text-xs text-yellow-600 mt-1">
                      This will affect the user's permissions and access to system features.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* New Role Preview */}
            {selectedRoleConfig && formData.role !== user.role && (
              <Card className="bg-blue-50">
                <CardContent className="p-3">
                  <h4 className="font-medium text-sm">{selectedRoleConfig.label}</h4>
                  <p className="text-xs text-gray-600 mt-1">{selectedRoleConfig.description}</p>
                </CardContent>
              </Card>
            )}
          </div>

          <Separator />

          {/* User Status */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="isActive">Account Status</Label>
                <p className="text-xs text-gray-500 mt-1">
                  {formData.isActive ? 'User can log in and access the system' : 'User is blocked from logging in'}
                </p>
              </div>
              <Switch
                id="isActive"
                checked={formData.isActive}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, isActive: checked }))}
              />
            </div>

            {/* Status Change Warning */}
            {formData.isActive !== user.isActive && (
              <Card className={formData.isActive ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}>
                <CardContent className="p-3">
                  <div className="text-sm">
                    <p className={`font-medium ${formData.isActive ? 'text-green-800' : 'text-red-800'}`}>
                      {formData.isActive ? 'Activating User' : 'Deactivating User'}
                    </p>
                    <p className={formData.isActive ? 'text-green-700' : 'text-red-700'}>
                      {formData.isActive 
                        ? 'User will be able to log in and access the system.'
                        : 'User will be logged out and unable to access the system.'}
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Submit Buttons */}
          <div className="flex justify-end space-x-2 pt-4">
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Updating...
                </>
              ) : (
                'Update User'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}