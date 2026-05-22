import { useState } from 'react';
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
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { RefreshCw, Info, Copy, Check } from 'lucide-react';

// Role configuration
const ROLES = [
  { value: 'admin', label: 'Administrator', description: 'Full system access' },
  { value: 'project_manager', label: 'Project Manager', description: 'Manage projects and users' },
  { value: 'accountant', label: 'Accountant', description: 'Financial management access' },
  { value: 'client', label: 'Client', description: 'View project progress' },
  { value: 'subcontractor', label: 'Subcontractor', description: 'Bid on projects and manage tasks' },
  { value: 'designer', label: 'Designer', description: 'Design and document management' },
];

interface CreateUserModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateUserModal({ open, onOpenChange }: CreateUserModalProps) {
  const [formData, setFormData] = useState({
    email: '',
    fullName: '',
    username: '',
    role: '',
  });
  
  const [createdUser, setCreatedUser] = useState<any>(null);
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [passwordCopied, setPasswordCopied] = useState(false);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Secure create user mutation using server endpoint
  const createUserMutation = useMutation({
    mutationFn: async (userData: typeof formData) => {
      const response = await apiRequest('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          email: userData.email,
          fullName: userData.fullName,
          username: userData.username || null,
          role: userData.role,
        }),
        headers: { 'Content-Type': 'application/json' },
      });
      return response;
    },
    onSuccess: (data) => {
      setCreatedUser(data);
      setTemporaryPassword(data.temporaryPassword || '');
      
      toast({
        title: 'Success',
        description: 'User created successfully with secure authentication',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create user',
        variant: 'destructive',
      });
    },
  });

  const copyPassword = async () => {
    if (temporaryPassword) {
      try {
        await navigator.clipboard.writeText(temporaryPassword);
        setPasswordCopied(true);
        setTimeout(() => setPasswordCopied(false), 2000);
        toast({
          title: 'Copied',
          description: 'Temporary password copied to clipboard',
        });
      } catch (error) {
        toast({
          title: 'Error',
          description: 'Failed to copy password to clipboard',
          variant: 'destructive',
        });
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Basic validation
    if (!formData.email || !formData.fullName || !formData.role) {
      toast({
        title: 'Validation Error',
        description: 'Please fill in all required fields',
        variant: 'destructive',
      });
      return;
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      toast({
        title: 'Validation Error',
        description: 'Please enter a valid email address',
        variant: 'destructive',
      });
      return;
    }

    createUserMutation.mutate(formData);
  };

  const handleClose = () => {
    setFormData({
      email: '',
      fullName: '',
      username: '',
      role: '',
    });
    setCreatedUser(null);
    setTemporaryPassword('');
    setPasswordCopied(false);
    onOpenChange(false);
  };

  const selectedRole = ROLES.find(r => r.value === formData.role);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {createdUser ? 'User Created Successfully' : 'Create New User'}
          </DialogTitle>
          <DialogDescription>
            {createdUser 
              ? 'The user has been created with secure authentication. Share the temporary password securely.'
              : 'Add a new user to the Skyelineos system. They will be created with secure server-side authentication.'
            }
          </DialogDescription>
        </DialogHeader>

        {createdUser ? (
          /* Success State - Show created user and temporary password */
          <div className="space-y-4">
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                User created successfully! The system has generated a secure temporary password.
              </AlertDescription>
            </Alert>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <Label className="text-xs font-medium text-gray-500">Full Name</Label>
                  <p className="font-medium">{createdUser.fullName}</p>
                </div>
                <div>
                  <Label className="text-xs font-medium text-gray-500">Email</Label>
                  <p className="font-medium">{createdUser.email}</p>
                </div>
                <div>
                  <Label className="text-xs font-medium text-gray-500">Role</Label>
                  <p className="font-medium capitalize">{createdUser.role.replace('_', ' ')}</p>
                </div>
                <div>
                  <Label className="text-xs font-medium text-gray-500">Username</Label>
                  <p className="font-medium">{createdUser.username || 'Not set'}</p>
                </div>
              </div>

              {temporaryPassword && (
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-gray-500">Temporary Password</Label>
                  <div className="flex space-x-2">
                    <Input 
                      value={temporaryPassword}
                      readOnly
                      className="font-mono text-sm bg-gray-50"
                      type="text"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={copyPassword}
                      className="flex-shrink-0"
                    >
                      {passwordCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                  <p className="text-xs text-orange-600">
                    ⚠️ Please share this password securely with the user. They will need to reset it on first login.
                  </p>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-4">
              <Button onClick={handleClose}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          /* Form State - Create new user */
          <form onSubmit={handleSubmit} className="space-y-4">
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                Users will be created with secure server-side authentication. A temporary password will be generated automatically.
              </AlertDescription>
            </Alert>

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
                disabled={createUserMutation.isPending}
              />
            </div>

            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="email">Email Address *</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                placeholder="Enter email address"
                required
                disabled={createUserMutation.isPending}
              />
            </div>

            {/* Username (optional) */}
            <div className="space-y-2">
              <Label htmlFor="username">Username (Optional)</Label>
              <Input
                id="username"
                type="text"
                value={formData.username}
                onChange={(e) => setFormData(prev => ({ ...prev, username: e.target.value }))}
                placeholder="Enter username"
                disabled={createUserMutation.isPending}
              />
            </div>

            {/* Role Selection */}
            <div className="space-y-2">
              <Label htmlFor="role">Role *</Label>
              <Select 
                value={formData.role} 
                onValueChange={(value) => setFormData(prev => ({ ...prev, role: value }))}
                disabled={createUserMutation.isPending}
              >
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
            </div>

            {/* Role Preview */}
            {selectedRole && (
              <Card className="bg-blue-50">
                <CardContent className="p-3">
                  <h4 className="font-medium text-sm">{selectedRole.label}</h4>
                  <p className="text-xs text-gray-600 mt-1">{selectedRole.description}</p>
                </CardContent>
              </Card>
            )}

            {/* Submit Buttons */}
            <div className="flex justify-end space-x-2 pt-4">
              <Button 
                type="button" 
                variant="outline" 
                onClick={handleClose}
                disabled={createUserMutation.isPending}
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={createUserMutation.isPending}
              >
                {createUserMutation.isPending ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Creating User...
                  </>
                ) : (
                  'Create User'
                )}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}