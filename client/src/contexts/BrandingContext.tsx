import { createContext, useContext, useCallback, useMemo, ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

interface BrandingContextType {
  logoUrl?: string;
  isLoading: boolean;
  uploadLogo: (file: File) => Promise<void>;
  removeLogo: () => Promise<void>;
}

const BrandingContext = createContext<BrandingContextType | undefined>(undefined);

export function BrandingProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const { data: branding, isLoading } = useQuery({
    queryKey: ['/api/branding'],
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('logo', file);
      return apiRequest('POST', '/api/branding/logo', formData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/branding'] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('DELETE', '/api/branding/logo');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/branding'] });
    },
  });

  const uploadLogo = useCallback(async (file: File) => {
    await uploadMutation.mutateAsync(file);
  }, [uploadMutation]);

  const removeLogo = useCallback(async () => {
    await removeMutation.mutateAsync();
  }, [removeMutation]);

  const value = useMemo(() => ({
    logoUrl: (branding as { logoUrl?: string } | undefined)?.logoUrl,
    isLoading,
    uploadLogo,
    removeLogo,
  }), [branding, isLoading, uploadLogo, removeLogo]);

  return (
    <BrandingContext.Provider value={value}>
      {children}
    </BrandingContext.Provider>
  );
}

export function useBranding() {
  const context = useContext(BrandingContext);
  if (context === undefined) {
    throw new Error('useBranding must be used within a BrandingProvider');
  }
  return context;
}