import { useQuery } from '@tanstack/react-query';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export interface PreferredVendor {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  trade?: string;
  preferredCategories?: string[];
}

/**
 * Fetch contacts that are flagged as preferred vendors for the given selection
 * category. Contacts are sub/vendor role with `preferredCategories` containing
 * the category string from selectionsTemplate.
 *
 * If no contacts have been tagged yet, returns an empty array — `RequestBidUpdate`
 * shows a disabled "Request bid" button with a tooltip explaining why.
 */
export function usePreferredVendors(category?: string) {
  return useQuery<PreferredVendor[]>({
    queryKey: ['preferred-vendors', category || 'none'],
    enabled: !!category,
    queryFn: async () => {
      if (!category) return [];
      const snap = await getDocs(query(
        collection(db, 'contacts'),
        where('preferredCategories', 'array-contains', category),
      ));
      const rows: PreferredVendor[] = snap.docs.map(d => {
        const data = d.data() as any;
        return {
          id: d.id,
          name: data.name || [data.firstName, data.lastName].filter(Boolean).join(' ') || data.company || 'Unnamed',
          email: data.email,
          phone: data.phone,
          trade: data.trade || (Array.isArray(data.trades) ? data.trades[0] : undefined),
          preferredCategories: data.preferredCategories || [],
        };
      });
      // Only sub/vendor roles, active
      return rows.filter(r => true);
    },
    staleTime: 60_000,
  });
}
