import { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

interface Contact {
  id: number;
  name: string;
  email: string;
  phone?: string;
  company?: string;
  role: string;
  trade?: string;
  isActive: boolean;
}

interface ContactsPerformanceWrapperProps {
  children: (props: {
    contacts: Contact[];
    isLoading: boolean;
    error: any;
    filteredContacts: Contact[];
    searchTerm: string;
    setSearchTerm: (term: string) => void;
    roleFilter: string;
    setRoleFilter: (role: string) => void;
    handleDeleteContact: (contactId: number) => Promise<void>;
  }) => React.ReactNode;
}

export function ContactsPerformanceWrapper({ children }: ContactsPerformanceWrapperProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Optimized contacts query with aggressive caching
  const { data: contacts = [], isLoading, error } = useQuery({
    queryKey: ['/api/contacts'],
    select: (data) => Array.isArray(data) ? data : [],
    staleTime: 15 * 60 * 1000, // 15 minutes - contacts don't change frequently
    gcTime: 30 * 60 * 1000, // 30 minutes cache
    refetchOnWindowFocus: false,
    refetchOnMount: false, // Use cache when available
    // Enable background refetch for better UX
    refetchOnReconnect: true,
    // Optimize for slow networks
    retry: (failureCount, error) => {
      // Don't retry too aggressively for slow networks
      return failureCount < 2;
    },
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 5000),
  });

  // Memoized filtered contacts for performance
  const filteredContacts = useMemo(() => {
    if (!contacts.length) return [];

    let filtered = contacts;

    // Filter by search term
    if (searchTerm.trim()) {
      const search = searchTerm.toLowerCase().trim();
      filtered = filtered.filter(contact =>
        contact.name?.toLowerCase()?.includes(search) ||
        contact.email?.toLowerCase()?.includes(search) ||
        contact.company?.toLowerCase()?.includes(search) ||
        contact.phone?.includes(search)
      );
    }

    // Filter by role
    if (roleFilter !== 'all') {
      filtered = filtered.filter(contact => contact.role === roleFilter);
    }

    return filtered;
  }, [contacts, searchTerm, roleFilter]);

  // Optimized delete handler
  const handleDeleteContact = useCallback(async (contactId: number) => {
    try {
      await apiRequest(`/api/contacts/${contactId}`, { method: 'DELETE' });
      
      // Optimistic update - remove from cache immediately
      queryClient.setQueryData(['/api/contacts'], (oldData: Contact[] | undefined) => 
        oldData ? oldData.filter(contact => contact.id !== contactId) : []
      );
      
      toast({
        title: "Success",
        description: "Contact deleted successfully",
      });
    } catch (error) {
      // Revert optimistic update on error
      queryClient.invalidateQueries({ queryKey: ['/api/contacts'] });
      toast({
        title: "Error",
        description: "Failed to delete contact",
        variant: "destructive"
      });
    }
  }, [queryClient, toast]);

  return (
    <>
      {children({
        contacts,
        isLoading,
        error,
        filteredContacts,
        searchTerm,
        setSearchTerm,
        roleFilter,
        setRoleFilter,
        handleDeleteContact,
      })}
    </>
  );
}