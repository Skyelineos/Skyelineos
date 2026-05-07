import { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Trash2, Calculator, Download, Send, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EstimateItem {
  id: string;
  category: string;
  description: string;
  quantity: number;
  unit: string;
  unitCost: number;
  laborHours?: number;
  laborRate?: number;
  markup?: number;
  total: number;
}

interface EstimateBuilderProps {
  projectId?: string;
  initialEstimate?: Partial<EstimateItem>[];
  onSave?: (estimate: any) => void;
  onSend?: (estimate: any) => void;
  className?: string;
}

const CATEGORIES = [
  'Foundation', 'Framing', 'Roofing', 'Electrical', 'Plumbing', 
  'HVAC', 'Insulation', 'Drywall', 'Flooring', 'Painting',
  'Cabinetry', 'Countertops', 'Fixtures', 'Landscaping', 'Other'
];

const UNITS = [
  'sq ft', 'linear ft', 'cubic ft', 'each', 'hour', 'day', 'lot'
];

export function AdvancedEstimateBuilder({
  projectId,
  initialEstimate = [],
  onSave,
  onSend,
  className
}: EstimateBuilderProps) {
  const [estimate, setEstimate] = useState<EstimateItem[]>(
    initialEstimate.map((item, index) => ({
      id: item.id || `item-${index}`,
      category: item.category || 'Other',
      description: item.description || '',
      quantity: item.quantity || 1,
      unit: item.unit || 'each',
      unitCost: item.unitCost || 0,
      laborHours: item.laborHours || 0,
      laborRate: item.laborRate || 50,
      markup: item.markup || 15,
      total: 0
    }))
  );

  const [estimateInfo, setEstimateInfo] = useState({
    title: '',
    clientName: '',
    projectName: '',
    validUntil: '',
    notes: '',
    terms: 'Net 30'
  });

  const calculateItemTotal = useCallback((item: EstimateItem): number => {
    const materialCost = item.quantity * item.unitCost;
    const laborCost = (item.laborHours || 0) * (item.laborRate || 0);
    const subtotal = materialCost + laborCost;
    const markupAmount = subtotal * ((item.markup || 0) / 100);
    return subtotal + markupAmount;
  }, []);

  const updateItem = useCallback((id: string, updates: Partial<EstimateItem>) => {
    setEstimate(prev => prev.map(item => {
      if (item.id === id) {
        const updated = { ...item, ...updates };
        updated.total = calculateItemTotal(updated);
        return updated;
      }
      return item;
    }));
  }, [calculateItemTotal]);

  const addItem = useCallback(() => {
    const newItem: EstimateItem = {
      id: `item-${Date.now()}`,
      category: 'Other',
      description: '',
      quantity: 1,
      unit: 'each',
      unitCost: 0,
      laborHours: 0,
      laborRate: 50,
      markup: 15,
      total: 0
    };
    setEstimate(prev => [...prev, newItem]);
  }, []);

  const removeItem = useCallback((id: string) => {
    setEstimate(prev => prev.filter(item => item.id !== id));
  }, []);

  const duplicateItem = useCallback((id: string) => {
    const item = estimate.find(item => item.id === id);
    if (item) {
      const duplicate = {
        ...item,
        id: `item-${Date.now()}`,
        description: `${item.description} (Copy)`
      };
      setEstimate(prev => [...prev, duplicate]);
    }
  }, [estimate]);

  const calculateTotals = useCallback(() => {
    const subtotal = estimate.reduce((sum, item) => sum + item.total, 0);
    const tax = subtotal * 0.08; // 8% tax
    const total = subtotal + tax;
    
    return { subtotal, tax, total };
  }, [estimate]);

  const { subtotal, tax, total } = calculateTotals();

  const handleSave = () => {
    const estimateData = {
      ...estimateInfo,
      items: estimate,
      totals: { subtotal, tax, total },
      createdAt: new Date().toISOString(),
      projectId
    };
    onSave?.(estimateData);
  };

  const handleSend = () => {
    const estimateData = {
      ...estimateInfo,
      items: estimate,
      totals: { subtotal, tax, total },
      createdAt: new Date().toISOString(),
      projectId
    };
    onSend?.(estimateData);
  };

  return (
    <div className={cn('space-y-6', className)}>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Estimate Builder</span>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleSave}>
                <Download className="h-4 w-4 mr-2" />
                Save
              </Button>
              <Button onClick={handleSend}>
                <Send className="h-4 w-4 mr-2" />
                Send to Client
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="items" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="info">Estimate Info</TabsTrigger>
              <TabsTrigger value="items">Line Items</TabsTrigger>
              <TabsTrigger value="summary">Summary</TabsTrigger>
            </TabsList>

            <TabsContent value="info" className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Estimate Title</Label>
                  <Input
                    id="title"
                    value={estimateInfo.title}
                    onChange={(e) => setEstimateInfo(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="Kitchen Renovation Estimate"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="clientName">Client Name</Label>
                  <Input
                    id="clientName"
                    value={estimateInfo.clientName}
                    onChange={(e) => setEstimateInfo(prev => ({ ...prev, clientName: e.target.value }))}
                    placeholder="John & Jane Smith"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="projectName">Project Name</Label>
                  <Input
                    id="projectName"
                    value={estimateInfo.projectName}
                    onChange={(e) => setEstimateInfo(prev => ({ ...prev, projectName: e.target.value }))}
                    placeholder="123 Main St Kitchen"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="validUntil">Valid Until</Label>
                  <Input
                    id="validUntil"
                    type="date"
                    value={estimateInfo.validUntil}
                    onChange={(e) => setEstimateInfo(prev => ({ ...prev, validUntil: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={estimateInfo.notes}
                  onChange={(e) => setEstimateInfo(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Additional notes or specifications..."
                />
              </div>
            </TabsContent>

            <TabsContent value="items" className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-medium">Line Items</h3>
                <Button onClick={addItem}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Item
                </Button>
              </div>

              <div className="space-y-4">
                {estimate.map((item) => (
                  <Card key={item.id} className="p-4">
                    <div className="grid grid-cols-12 gap-3 items-start">
                      {/* Category */}
                      <div className="col-span-2">
                        <Label className="text-xs">Category</Label>
                        <Select
                          value={item.category}
                          onValueChange={(value) => updateItem(item.id, { category: value })}
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {CATEGORIES.map(cat => (
                              <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Description */}
                      <div className="col-span-3">
                        <Label className="text-xs">Description</Label>
                        <Input
                          value={item.description}
                          onChange={(e) => updateItem(item.id, { description: e.target.value })}
                          placeholder="Item description"
                          className="h-8"
                        />
                      </div>

                      {/* Quantity */}
                      <div className="col-span-1">
                        <Label className="text-xs">Qty</Label>
                        <Input
                          type="number"
                          value={item.quantity}
                          onChange={(e) => updateItem(item.id, { quantity: parseFloat(e.target.value) || 0 })}
                          className="h-8"
                        />
                      </div>

                      {/* Unit */}
                      <div className="col-span-1">
                        <Label className="text-xs">Unit</Label>
                        <Select
                          value={item.unit}
                          onValueChange={(value) => updateItem(item.id, { unit: value })}
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {UNITS.map(unit => (
                              <SelectItem key={unit} value={unit}>{unit}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Unit Cost */}
                      <div className="col-span-1">
                        <Label className="text-xs">Unit Cost</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={item.unitCost}
                          onChange={(e) => updateItem(item.id, { unitCost: parseFloat(e.target.value) || 0 })}
                          className="h-8"
                        />
                      </div>

                      {/* Labor Hours */}
                      <div className="col-span-1">
                        <Label className="text-xs">Labor Hrs</Label>
                        <Input
                          type="number"
                          step="0.5"
                          value={item.laborHours}
                          onChange={(e) => updateItem(item.id, { laborHours: parseFloat(e.target.value) || 0 })}
                          className="h-8"
                        />
                      </div>

                      {/* Labor Rate */}
                      <div className="col-span-1">
                        <Label className="text-xs">Rate</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={item.laborRate}
                          onChange={(e) => updateItem(item.id, { laborRate: parseFloat(e.target.value) || 0 })}
                          className="h-8"
                        />
                      </div>

                      {/* Markup % */}
                      <div className="col-span-1">
                        <Label className="text-xs">Markup %</Label>
                        <Input
                          type="number"
                          step="0.1"
                          value={item.markup}
                          onChange={(e) => updateItem(item.id, { markup: parseFloat(e.target.value) || 0 })}
                          className="h-8"
                        />
                      </div>

                      {/* Total */}
                      <div className="col-span-1">
                        <Label className="text-xs">Total</Label>
                        <div className="h-8 flex items-center text-sm font-medium">
                          ${item.total.toFixed(2)}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="col-span-1 flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => duplicateItem(item.id)}
                          className="h-8 w-8 p-0"
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeItem(item.id)}
                          className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="summary" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calculator className="h-5 w-5" />
                    Estimate Summary
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Category Breakdown */}
                  <div>
                    <h4 className="font-medium mb-3">By Category</h4>
                    <div className="space-y-2">
                      {CATEGORIES.map(category => {
                        const categoryItems = estimate.filter(item => item.category === category);
                        const categoryTotal = categoryItems.reduce((sum, item) => sum + item.total, 0);
                        
                        if (categoryTotal === 0) return null;
                        
                        return (
                          <div key={category} className="flex justify-between">
                            <span className="text-sm">{category}</span>
                            <Badge variant="secondary">
                              ${categoryTotal.toFixed(2)}
                            </Badge>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Totals */}
                  <div className="border-t pt-4 space-y-2">
                    <div className="flex justify-between">
                      <span>Subtotal:</span>
                      <span className="font-medium">${subtotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Tax (8%):</span>
                      <span className="font-medium">${tax.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-lg font-bold border-t pt-2">
                      <span>Total:</span>
                      <span>${total.toFixed(2)}</span>
                    </div>
                  </div>

                  {/* Additional Info */}
                  <div className="border-t pt-4 text-sm text-muted-foreground">
                    <p>Total Items: {estimate.length}</p>
                    <p>Total Labor Hours: {estimate.reduce((sum, item) => sum + (item.laborHours || 0), 0)}</p>
                    <p>Average Markup: {estimate.length > 0 ? (estimate.reduce((sum, item) => sum + (item.markup || 0), 0) / estimate.length).toFixed(1) : 0}%</p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}