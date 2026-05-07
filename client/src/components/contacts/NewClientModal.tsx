import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X, User, Mail, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

const clientSchema = z.object({
  name: z.string().min(1, 'Full name is required'),
  email: z.string().email('Please enter a valid email address'),
  phone: z.string().optional(),
});

type ClientFormData = z.infer<typeof clientSchema>;

interface NewClientModalProps {
  isOpen: boolean;
  onClose: () => void;
  onClientCreated: (client: any) => void;
  defaultName?: string;
  defaultEmail?: string;
}

export function NewClientModal({ 
  isOpen, 
  onClose, 
  onClientCreated, 
  defaultName = '', 
  defaultEmail = '' 
}: NewClientModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ClientFormData>({
    resolver: zodResolver(clientSchema),
    defaultValues: {
      name: defaultName,
      email: defaultEmail,
      phone: '',
    },
  });

  const createClientMutation = useMutation({
    mutationFn: async (clientData: ClientFormData) => {
      const contactData = {
        name: clientData.name,
        email: clientData.email,
        phone: clientData.phone || '',
        type: 'client',
        role: 'client',
        company: '',
        trade: '',
        associatedProjects: [],
        notes: '',
        avatarUrl: '',
        rating: 0,
        tags: [],
        isActive: true,
        address: '',
        city: '',
        state: '',
        zipCode: '',
        lastContact: null,
        insuranceProvider: '',
        insurancePolicyNumber: '',
        insuranceExpirationDate: null,
        insuranceFileUrl: '',
        w9FileUrl: '',
      };

      return await apiRequest('/api/contacts', {
        method: 'POST',
        body: JSON.stringify(contactData),
      });
    },
    onSuccess: (newClient) => {
      toast({
        title: 'Client Created',
        description: `${newClient.name} has been added as a new client.`,
      });
      
      // Invalidate contacts query to refresh the list
      queryClient.invalidateQueries({ queryKey: ['/api/contacts'] });
      
      // Call the callback with the new client data
      onClientCreated(newClient);
      
      // Close modal and reset form
      handleClose();
    },
    onError: (error: any) => {
      console.error('Error creating client:', error);
      toast({
        title: 'Error Creating Client',
        description: error.message || 'An unexpected error occurred.',
        variant: 'destructive',
      });
    },
  });

  const onSubmit = async (data: ClientFormData) => {
    setIsSubmitting(true);
    try {
      await createClientMutation.mutateAsync(data);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      reset();
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Add New Client
          </DialogTitle>
          <DialogDescription>
            Create a new client contact that will be linked to this project.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <Label htmlFor="name">Full Name *</Label>
            <Input
              id="name"
              {...register('name')}
              placeholder="Client's full name"
              className="mt-1"
            />
            {errors.name && (
              <p className="text-sm text-red-600 mt-1">{errors.name.message}</p>
            )}
          </div>

          <div>
            <Label htmlFor="email">Email Address *</Label>
            <Input
              id="email"
              type="email"
              {...register('email')}
              placeholder="client@example.com"
              className="mt-1"
            />
            {errors.email && (
              <p className="text-sm text-red-600 mt-1">{errors.email.message}</p>
            )}
          </div>

          <div>
            <Label htmlFor="phone">Phone Number</Label>
            <Input
              id="phone"
              {...register('phone')}
              placeholder="(555) 123-4567"
              className="mt-1"
            />
            {errors.phone && (
              <p className="text-sm text-red-600 mt-1">{errors.phone.message}</p>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Creating Client...' : 'Create Client'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}