import { useState } from 'react';
import {
  collection, getDocs, orderBy, query as fsQuery,
  addDoc, serverTimestamp, deleteDoc, doc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import {
  Search, BookOpen, Star, ExternalLink, Plus, Trash2,
  Tag, X, Image as ImageIcon, ChevronDown, ChevronRight,
} from 'lucide-react';
import type { CatalogItem, SelectionCategory } from '@/types/selections';
import { SELECTION_CATEGORIES, AREAS_BY_CATEGORY } from '@/types/selections';

const STYLE_TAGS = [
  'Modern', 'Transitional', 'Traditional', 'Farmhouse', 'Contemporary',
  'Coastal', 'Industrial', 'Craftsman', 'Mediterranean', 'Scandinavian',
  'Eclectic', 'Luxury',
];

interface SelectionsCatalogProps {
  /** If provided, an "Add to Project" button appears. Calls back with the catalog item. */
  onAddToProject?: (item: CatalogItem) => void;
  /** Designer-only: show delete and management controls */
  allowManage?: boolean;
}

export default function SelectionsCatalog({ onAddToProject, allowManage }: SelectionsCatalogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterTag, setFilterTag] = useState<string>('all');
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [expandedItem, setExpandedItem] = useState<string | null>(null);

  // ── Data ─────────────────────────────────────────────────────────────────────

  const { data: items = [], isLoading } = useQuery<CatalogItem[]>({
    queryKey: ['selectionsCatalog'],
    queryFn: async () => {
      const snap = await getDocs(fsQuery(
        collection(db, 'selectionsCatalog'),
        orderBy('usedCount', 'desc'),
      ));
      return snap.docs.map(d => ({ id: d.id, ...d.data() } as CatalogItem));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (itemId: string) => {
      await deleteDoc(doc(db, 'selectionsCatalog', itemId));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['selectionsCatalog'] });
      toast({ title: 'Removed from catalog' });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  // ── Filtering ────────────────────────────────────────────────────────────────

  const filtered = items.filter(item => {
    const matchesSearch =
      !searchQuery ||
      item.productName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.vendor.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.room?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.area?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.tags?.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesCategory = filterCategory === 'all' || item.category === filterCategory;
    const matchesTag = filterTag === 'all' || item.tags?.includes(filterTag);

    return matchesSearch && matchesCategory && matchesTag;
  });

  // Group by category for display
  const grouped = filtered.reduce<Record<string, CatalogItem[]>>((acc, item) => {
    const key = item.category || 'Other';
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});

  const categories = Object.keys(grouped).sort();

  // ── Render helpers ────────────────────────────────────────────────────────────

  const formatCost = (item: CatalogItem) =>
    `$${item.costPerUnit.toLocaleString()} / ${item.unit}`;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
          <BookOpen className="h-5 w-5 text-white" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900">Previously Used Selections</h2>
          <p className="text-sm text-gray-500">
            Browse finish selections from past Skyeline builds — pull directly into your current project
          </p>
        </div>
        <Badge className="ml-auto bg-amber-100 text-amber-700 border-amber-200">
          {items.length} items
        </Badge>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search product, vendor, room..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {SELECTION_CATEGORIES.map(c => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterTag} onValueChange={setFilterTag}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All Styles" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Styles</SelectItem>
            {STYLE_TAGS.map(t => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {(searchQuery || filterCategory !== 'all' || filterTag !== 'all') && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setSearchQuery(''); setFilterCategory('all'); setFilterTag('all'); }}
          >
            <X className="h-4 w-4 mr-1" /> Clear
          </Button>
        )}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500" />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && items.length === 0 && (
        <Card>
          <CardContent className="py-16 text-center">
            <BookOpen className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-700 mb-1">Catalog is empty</h3>
            <p className="text-sm text-gray-400">
              Save items from project selections using the "Save to Catalog" option — they'll appear here for reuse.
            </p>
          </CardContent>
        </Card>
      )}

      {/* No results after filter */}
      {!isLoading && items.length > 0 && filtered.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <Search className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No catalog items match your filters.</p>
          </CardContent>
        </Card>
      )}

      {/* Results grouped by category */}
      {categories.map(category => (
        <div key={category}>
          <div className="flex items-center gap-2 mb-3">
            <h3 className="text-base font-semibold text-gray-800">{category}</h3>
            <Badge variant="outline" className="text-xs">{grouped[category].length}</Badge>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {grouped[category].map(item => (
              <CatalogCard
                key={item.id}
                item={item}
                expanded={expandedItem === item.id}
                onToggleExpand={() => setExpandedItem(prev => prev === item.id ? null : item.id)}
                onImageClick={setLightboxImage}
                onAddToProject={onAddToProject}
                onDelete={allowManage ? () => deleteMutation.mutate(item.id) : undefined}
              />
            ))}
          </div>
        </div>
      ))}

      {/* Lightbox */}
      <Dialog open={!!lightboxImage} onOpenChange={() => setLightboxImage(null)}>
        <DialogContent className="max-w-3xl p-2 bg-black border-0">
          {lightboxImage && (
            <img src={lightboxImage} alt="Product" className="w-full rounded-lg max-h-[80vh] object-contain" />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Catalog Card ──────────────────────────────────────────────────────────────

interface CatalogCardProps {
  item: CatalogItem;
  expanded: boolean;
  onToggleExpand: () => void;
  onImageClick: (url: string) => void;
  onAddToProject?: (item: CatalogItem) => void;
  onDelete?: () => void;
}

function CatalogCard({ item, expanded, onToggleExpand, onImageClick, onAddToProject, onDelete }: CatalogCardProps) {
  const mainImage = item.imageUrls?.[0];

  return (
    <Card className="overflow-hidden hover:shadow-md transition-shadow">
      {/* Product image */}
      {mainImage ? (
        <div
          className="h-40 bg-gray-100 cursor-pointer overflow-hidden"
          onClick={() => onImageClick(mainImage)}
        >
          <img src={mainImage} alt={item.productName} className="w-full h-full object-cover hover:scale-105 transition-transform" />
        </div>
      ) : (
        <div className="h-40 bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
          <ImageIcon className="h-10 w-10 text-gray-300" />
        </div>
      )}

      <CardContent className="p-4 space-y-3">
        {/* Title row */}
        <div>
          <p className="font-semibold text-gray-900 text-sm leading-snug">{item.productName}</p>
          <p className="text-xs text-gray-500 mt-0.5">{item.vendor}</p>
        </div>

        {/* Meta row */}
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>{item.room} · {item.area}</span>
          <span className="font-medium text-gray-800">{formatItemCost(item)}</span>
        </div>

        {/* Style tags */}
        {item.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {item.tags.map(tag => (
              <Badge key={tag} className="text-xs px-1.5 py-0 bg-orange-50 text-orange-700 border-orange-200">
                {tag}
              </Badge>
            ))}
          </div>
        )}

        {/* Expand details */}
        <button
          onClick={onToggleExpand}
          className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
        >
          {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          {expanded ? 'Hide details' : 'Show details'}
        </button>

        {expanded && (
          <div className="space-y-1.5 border-t pt-2 mt-1">
            {item.size && <DetailRow label="Size" value={item.size} />}
            {item.tileLayout && <DetailRow label="Layout" value={item.tileLayout} />}
            {item.trim && <DetailRow label="Trim" value={item.trim} />}
            {item.grout && <DetailRow label="Grout" value={item.grout} />}
            {item.notes && (
              <p className="text-xs text-gray-500 italic mt-1">{item.notes}</p>
            )}
            {item.productUrl && (
              <a
                href={item.productUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-xs text-blue-600 hover:underline mt-1"
              >
                <ExternalLink className="h-3 w-3" /> View product page
              </a>
            )}
            <p className="text-xs text-gray-400 mt-1">
              Used {item.usedCount}× · {item.projectNames?.slice(0, 2).join(', ')}
              {(item.projectNames?.length ?? 0) > 2 && ` +${(item.projectNames?.length ?? 0) - 2} more`}
            </p>

            {/* Additional images */}
            {item.imageUrls?.length > 1 && (
              <div className="flex gap-1.5 mt-1.5 flex-wrap">
                {item.imageUrls.slice(1).map((url, i) => (
                  <img
                    key={i}
                    src={url}
                    alt={`View ${i + 2}`}
                    className="w-12 h-12 object-cover rounded-md cursor-pointer border hover:opacity-80"
                    onClick={() => onImageClick(url)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Action row */}
        <div className="flex gap-2 pt-1">
          {onAddToProject && (
            <Button
              size="sm"
              className="flex-1 text-xs h-8"
              style={{ backgroundColor: '#C9A96E', color: '#141414' }}
              onClick={() => onAddToProject(item)}
            >
              <Plus className="h-3 w-3 mr-1" /> Add to Project
            </Button>
          )}
          {onDelete && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 px-2 text-red-500 hover:text-red-700 hover:border-red-300"
              onClick={onDelete}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-xs">
      <span className="text-gray-400">{label}</span>
      <span className="text-gray-700 font-medium">{value}</span>
    </div>
  );
}

function formatItemCost(item: CatalogItem) {
  return `$${item.costPerUnit.toLocaleString()} / ${item.unit}`;
}
