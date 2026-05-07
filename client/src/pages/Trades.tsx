import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Trash2, Edit, Plus, Settings, Wrench, Building, Package, Palette, ArrowUpDown } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

interface Trade {
  id: number;
  name: string;
  description: string;
  category: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface TradeFormData {
  name: string;
  description: string;
  category: string;
  isActive: boolean;
}

const TRADE_CATEGORIES = [
  'Construction',
  'Site Work', 
  'Structural',
  'Exterior',
  'MEP',
  'Interior',
  'Finishes'
];

const getCategoryIcon = (category: string) => {
  switch (category) {
    case 'Construction': return Building;
    case 'Site Work': return Package;
    case 'Structural': return Building;
    case 'Exterior': return Building;
    case 'MEP': return Settings;
    case 'Interior': return Package;
    case 'Finishes': return Palette;
    default: return Wrench;
  }
};

const getCategoryColor = (category: string) => {
  switch (category) {
    case 'Construction': return 'bg-blue-100 text-blue-800';
    case 'Site Work': return 'bg-brown-100 text-brown-800';
    case 'Structural': return 'bg-gray-100 text-gray-800';
    case 'Exterior': return 'bg-green-100 text-green-800';
    case 'MEP': return 'bg-orange-100 text-orange-800';
    case 'Interior': return 'bg-purple-100 text-purple-800';
    case 'Finishes': return 'bg-pink-100 text-pink-800';
    default: return 'bg-gray-100 text-gray-800';
  }
};

export default function Trades() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('name-asc');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTrade, setEditingTrade] = useState<Trade | null>(null);
  const [formData, setFormData] = useState<TradeFormData>({
    name: '',
    description: '',
    category: 'Construction',
    isActive: true
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch trades
  const { data: trades = [], isLoading } = useQuery({
    queryKey: ['/api/trades'],
    staleTime: 5 * 60 * 1000 // 5 minutes
  });

  // Fetch categories
  const { data: categories = [] } = useQuery({
    queryKey: ['/api/trades/categories'],
    staleTime: 10 * 60 * 1000 // 10 minutes
  });

  // Create trade mutation
  const createTradeMutation = useMutation({
    mutationFn: (data: TradeFormData) => apiRequest('/api/trades', { method: 'POST', body: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/trades'] });
      queryClient.invalidateQueries({ queryKey: ['/api/trades/categories'] });
      toast({
        title: "Success",
        description: "Trade created successfully."
      });
      handleCloseDialog();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create trade. Please try again.",
        variant: "destructive"
      });
    }
  });

  // Update trade mutation
  const updateTradeMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: TradeFormData }) => 
      apiRequest(`/api/trades/${id}`, { method: 'PUT', body: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/trades'] });
      queryClient.invalidateQueries({ queryKey: ['/api/trades/categories'] });
      toast({
        title: "Success",
        description: "Trade updated successfully."
      });
      handleCloseDialog();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update trade. Please try again.",
        variant: "destructive"
      });
    }
  });

  // Delete trade mutation
  const deleteTradeMutation = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/trades/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/trades'] });
      queryClient.invalidateQueries({ queryKey: ['/api/trades/categories'] });
      toast({
        title: "Success",
        description: "Trade deleted successfully."
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete trade. Please try again.",
        variant: "destructive"
      });
    }
  });

  const filteredAndSortedTrades = trades
    .filter((trade: Trade) => {
      const matchesSearch = trade.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           trade.description.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = selectedCategory === 'all' || trade.category === selectedCategory;
      return matchesSearch && matchesCategory;
    })
    .sort((a: Trade, b: Trade) => {
      switch (sortBy) {
        case 'name-asc':
          return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
        case 'name-desc':
          return b.name.toLowerCase().localeCompare(a.name.toLowerCase());
        case 'category-asc':
          return a.category.toLowerCase().localeCompare(b.category.toLowerCase());
        case 'category-desc':
          return b.category.toLowerCase().localeCompare(a.category.toLowerCase());
        case 'status-active':
          return a.isActive === b.isActive ? 0 : a.isActive ? -1 : 1;
        case 'status-inactive':
          return a.isActive === b.isActive ? 0 : a.isActive ? 1 : -1;
        case 'recent':
          return new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime();
        case 'oldest':
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        default:
          return 0;
      }
    });

  const handleOpenDialog = (trade?: Trade) => {
    if (trade) {
      setEditingTrade(trade);
      setFormData({
        name: trade.name,
        description: trade.description,
        category: trade.category,
        isActive: trade.isActive
      });
    } else {
      setEditingTrade(null);
      setFormData({
        name: '',
        description: '',
        category: 'Construction',
        isActive: true
      });
    }
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingTrade(null);
    setFormData({
      name: '',
      description: '',
      category: 'Construction',
      isActive: true
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (editingTrade) {
      // For updates, check if name conflicts with other trades (excluding current one)
      const duplicateExists = (trades as Trade[]).some((trade: Trade) => 
        trade.id !== editingTrade.id && 
        trade.name.toLowerCase().trim() === formData.name.toLowerCase().trim()
      );
      
      if (duplicateExists) {
        toast({
          title: "Duplicate Trade",
          description: `A trade named "${formData.name}" already exists. Please choose a different name.`,
          variant: "destructive"
        });
        return;
      }
      
      updateTradeMutation.mutate({ id: editingTrade.id, data: formData });
    } else {
      // For new trades, check if name already exists
      const duplicateExists = (trades as Trade[]).some((trade: Trade) => 
        trade.name.toLowerCase().trim() === formData.name.toLowerCase().trim()
      );
      
      if (duplicateExists) {
        toast({
          title: "Duplicate Trade",
          description: `A trade named "${formData.name}" already exists. Please choose a different name.`,
          variant: "destructive"
        });
        return;
      }
      
      createTradeMutation.mutate(formData);
    }
  };

  const handleDelete = (trade: Trade) => {
    if (confirm(`Are you sure you want to delete "${trade.name}"? This action cannot be undone.`)) {
      deleteTradeMutation.mutate(trade.id);
    }
  };

  const groupedTrades = filteredAndSortedTrades.reduce((groups: Record<string, Trade[]>, trade: Trade) => {
    const category = trade.category;
    if (!groups[category]) {
      groups[category] = [];
    }
    groups[category].push(trade);
    return groups;
  }, {});

  const isLoading_ = createTradeMutation.isPending || updateTradeMutation.isPending || deleteTradeMutation.isPending;
  
  // Check for duplicate trade name
  const isDuplicateName = editingTrade 
    ? (trades as Trade[]).some((trade: Trade) => 
        trade.id !== editingTrade.id && 
        trade.name.toLowerCase().trim() === formData.name.toLowerCase().trim()
      )
    : (trades as Trade[]).some((trade: Trade) => 
        trade.name.toLowerCase().trim() === formData.name.toLowerCase().trim()
      );

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Trades Management</h1>
            <p className="text-muted-foreground">
              Manage construction trades and categories for your projects
            </p>
          </div>
          
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button 
                onClick={() => handleOpenDialog()} 
                className="shrink-0 text-white"
                style={{ 
                  backgroundColor: 'var(--accent-color)',
                  borderColor: 'var(--accent-color)'
                }}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Trade
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>
                  {editingTrade ? 'Edit Trade' : 'Add New Trade'}
                </DialogTitle>
                <DialogDescription>
                  {editingTrade ? 'Update trade information' : 'Create a new construction trade'}
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Trade Name</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g. Electrical, Plumbing"
                    required
                  />
                  {formData.name && isDuplicateName && (
                    <p className="text-sm text-destructive">
                      A trade with this name already exists
                    </p>
                  )}
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Brief description of this trade..."
                    rows={3}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="category">Category</Label>
                  <Select 
                    value={formData.category} 
                    onValueChange={(value) => setFormData(prev => ({ ...prev, category: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a category" />
                    </SelectTrigger>
                    <SelectContent>
                      {TRADE_CATEGORIES.map((category) => (
                        <SelectItem key={category} value={category}>
                          {category}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Switch 
                    id="isActive"
                    checked={formData.isActive}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, isActive: checked }))}
                  />
                  <Label htmlFor="isActive">Active</Label>
                </div>
                
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={handleCloseDialog}>
                    Cancel
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={isLoading_ || isDuplicateName || !formData.name.trim()}
                    className="text-white"
                    style={{ 
                      backgroundColor: 'var(--accent-color)',
                      borderColor: 'var(--accent-color)'
                    }}
                  >
                    {editingTrade ? 'Update Trade' : 'Create Trade'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Search, Filter, and Sort */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ArrowUpDown className="h-4 w-4" />
              Search, Filter & Sort
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4">
              {/* Search Bar */}
              <div className="flex-1">
                <Input
                  placeholder="Search trades by name or description..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full"
                />
              </div>
              
              {/* Filter and Sort Row */}
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="w-full sm:w-48">
                  <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                    <SelectTrigger>
                      <SelectValue placeholder="Filter by category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Categories</SelectItem>
                      {TRADE_CATEGORIES.map((category) => (
                        <SelectItem key={category} value={category}>
                          {category}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="w-full sm:w-56">
                  <Select value={sortBy} onValueChange={setSortBy}>
                    <SelectTrigger>
                      <SelectValue placeholder="Sort by..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="name-asc">Name (A-Z)</SelectItem>
                      <SelectItem value="name-desc">Name (Z-A)</SelectItem>
                      <SelectItem value="category-asc">Category (A-Z)</SelectItem>
                      <SelectItem value="category-desc">Category (Z-A)</SelectItem>
                      <SelectItem value="status-active">Status (Active First)</SelectItem>
                      <SelectItem value="status-inactive">Status (Inactive First)</SelectItem>
                      <SelectItem value="recent">Most Recently Updated</SelectItem>
                      <SelectItem value="oldest">Oldest First</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              {/* Results Summary */}
              {(searchTerm || selectedCategory !== 'all') && (
                <div className="text-sm text-muted-foreground">
                  Showing {filteredAndSortedTrades.length} of {trades.length} trades
                  {searchTerm && ` matching "${searchTerm}"`}
                  {selectedCategory !== 'all' && ` in ${selectedCategory}`}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Trades List */}
        {isLoading ? (
          <Card>
            <CardContent className="p-6">
              <div className="text-center">Loading trades...</div>
            </CardContent>
          </Card>
        ) : filteredAndSortedTrades.length === 0 ? (
          <Card>
            <CardContent className="p-6">
              <div className="text-center text-muted-foreground">
                {searchTerm || selectedCategory !== 'all' 
                  ? 'No trades match your search criteria.'
                  : 'No trades configured yet. Add your first trade to get started.'
                }
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedTrades).map(([category, categoryTrades]) => {
              const CategoryIcon = getCategoryIcon(category);
              return (
                <Card key={category}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <CategoryIcon className="h-5 w-5" />
                      {category}
                      <Badge variant="secondary" className="ml-2">
                        {categoryTrades.length}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Trade Name</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="w-[100px]">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {categoryTrades.map((trade) => (
                            <TableRow key={trade.id}>
                              <TableCell className="font-medium">
                                {trade.name}
                              </TableCell>
                              <TableCell className="text-muted-foreground">
                                {trade.description || 'No description'}
                              </TableCell>
                              <TableCell>
                                <Badge variant={trade.isActive ? 'default' : 'secondary'}>
                                  {trade.isActive ? 'Active' : 'Inactive'}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleOpenDialog(trade)}
                                    disabled={isLoading_}
                                  >
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleDelete(trade)}
                                    disabled={isLoading_}
                                    className="text-destructive hover:text-destructive"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}