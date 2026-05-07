import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent } from '@/components/ui/card';
import { CalendarDays, Clock, DollarSign, User } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';

interface EstimateItem {
  id: number;
  trade: string;
  vendor?: string;
  duration: number;
  description?: string;
  cost: number;
  status: string;
}

interface EstimateSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: number;
  onGenerate: (selectedEstimateIds: number[]) => void;
}

export function EstimateSelectionModal({ 
  isOpen, 
  onClose, 
  projectId, 
  onGenerate 
}: EstimateSelectionModalProps) {
  const [selectedEstimateIds, setSelectedEstimateIds] = useState<number[]>([]);
  const { toast } = useToast();

  const { data: approvedEstimates = [], isLoading } = useQuery({
    queryKey: [`/api/projects/${projectId}/estimates/approved`],
    enabled: isOpen && !!projectId,
  });

  const typedEstimates: EstimateItem[] = Array.isArray(approvedEstimates) ? approvedEstimates : [];

  const handleEstimateToggle = (estimateId: number) => {
    setSelectedEstimateIds(prev => 
      prev.includes(estimateId) 
        ? prev.filter(id => id !== estimateId)
        : [...prev, estimateId]
    );
  };

  const handleSelectAll = () => {
    if (selectedEstimateIds.length === typedEstimates.length) {
      setSelectedEstimateIds([]);
    } else {
      setSelectedEstimateIds(typedEstimates.map((item) => item.id));
    }
  };

  const handleGenerate = () => {
    if (selectedEstimateIds.length === 0) {
      toast({
        title: "No Estimates Selected",
        description: "Please select at least one approved estimate to generate a schedule.",
        variant: "destructive",
      });
      return;
    }

    onGenerate(selectedEstimateIds);
    onClose();
    setSelectedEstimateIds([]);
  };

  const totalDuration = typedEstimates
    .filter((item) => selectedEstimateIds.includes(item.id))
    .reduce((sum, item) => sum + (item.duration || 0), 0);

  const totalCost = typedEstimates
    .filter((item) => selectedEstimateIds.includes(item.id))
    .reduce((sum, item) => sum + (item.cost || 0), 0);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarDays className="w-5 h-5" />
            Select Estimates for Auto-Schedule Generation
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Summary Stats */}
          {selectedEstimateIds.length > 0 && (
            <div className="grid grid-cols-3 gap-4">
              <Card className="bg-gray-50">
                <CardContent className="p-4 text-center">
                  <div className="text-2xl font-bold text-theme-primary">{selectedEstimateIds.length}</div>
                  <div className="text-sm text-gray-500">Estimates Selected</div>
                </CardContent>
              </Card>
              <Card className="bg-gray-50">
                <CardContent className="p-4 text-center">
                  <div className="text-2xl font-bold text-green-600">{totalDuration}</div>
                  <div className="text-sm text-gray-500">Total Days</div>
                </CardContent>
              </Card>
              <Card className="bg-gray-50">
                <CardContent className="p-4 text-center">
                  <div className="text-2xl font-bold text-purple-600">${(totalCost || 0).toLocaleString()}</div>
                  <div className="text-sm text-gray-500">Total Cost</div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Select All Controls */}
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-2">
              <Checkbox
                checked={selectedEstimateIds.length === typedEstimates.length && typedEstimates.length > 0}
                onCheckedChange={handleSelectAll}
              />
              <span className="font-medium">
                Select All ({typedEstimates.length} approved estimates)
              </span>
            </div>
            <Badge variant="outline">
              {selectedEstimateIds.length} of {typedEstimates.length} selected
            </Badge>
          </div>

          {/* Estimates List */}
          <ScrollArea className="h-96">
            {isLoading ? (
              <div className="text-center py-8">Loading approved estimates...</div>
            ) : typedEstimates.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No approved estimates found for this project.
                <br />
                Approve some estimates first to use auto-schedule generation.
              </div>
            ) : (
              <div className="space-y-3">
                {typedEstimates.map((estimate) => (
                  <Card 
                    key={estimate.id}
                    className={`cursor-pointer transition-all ${
                      selectedEstimateIds.includes(estimate.id) 
                        ? 'ring-2 ring-blue-500 bg-blue-50' 
                        : 'hover:bg-gray-50'
                    }`}
                    onClick={() => handleEstimateToggle(estimate.id)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3">
                        <Checkbox
                          checked={selectedEstimateIds.includes(estimate.id)}
                          onChange={() => {}} // Handled by card click
                        />
                        
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="font-medium text-lg">{estimate.trade}</h4>
                            <Badge variant="outline" className="text-green-600 border-green-200">
                              {estimate.status}
                            </Badge>
                          </div>
                          
                          {estimate.description && (
                            <p className="text-sm text-gray-600 mb-2">{estimate.description}</p>
                          )}
                          
                          <div className="flex items-center gap-4 text-sm text-gray-500">
                            {estimate.vendor && (
                              <div className="flex items-center gap-1">
                                <User className="w-4 h-4" />
                                {estimate.vendor}
                              </div>
                            )}
                            <div className="flex items-center gap-1">
                              <Clock className="w-4 h-4" />
                              {estimate.duration || 0} days
                            </div>
                            <div className="flex items-center gap-1">
                              <DollarSign className="w-4 h-4" />
                              ${(estimate.cost || 0).toLocaleString()}
                            </div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button 
            onClick={handleGenerate}
            disabled={selectedEstimateIds.length === 0}
            className="bg-theme-primary hover:bg-theme-primary-hover"
          >
            Generate Schedule ({selectedEstimateIds.length} estimates)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}