import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useQuery } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { Info, Wand2 } from 'lucide-react';

interface AutoGenerateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: (data: { projectStartDate: string; createdBy: number }) => void;
  projectId: number;
  isLoading: boolean;
}

export default function AutoGenerateModal({ 
  isOpen, 
  onClose, 
  onGenerate, 
  projectId, 
  isLoading 
}: AutoGenerateModalProps) {
  const [projectStartDate, setProjectStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const { toast } = useToast();

  // Fetch approved estimate items to show preview
  const { data: estimates = [] } = useQuery({
    queryKey: ['/api/estimates'],
  });

  // Filter estimates for this project and get approved items
  const projectEstimates = estimates.filter((estimate: any) => estimate.projectId === projectId);
  const approvedItems = projectEstimates.flatMap((estimate: any) => 
    (estimate.items || []).filter((item: any) => item.status === 'Approved')
  );

  // Group approved items by trade
  const tradeGroups = approvedItems.reduce((acc: any, item: any) => {
    if (!acc[item.trade]) {
      acc[item.trade] = [];
    }
    acc[item.trade].push(item);
    return acc;
  }, {});

  const tradeNames = Object.keys(tradeGroups).sort();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!projectStartDate) {
      toast({
        title: "Validation Error",
        description: "Project start date is required.",
        variant: "destructive",
      });
      return;
    }

    if (approvedItems.length === 0) {
      toast({
        title: "No Approved Items",
        description: "There are no approved estimate items to generate a schedule from.",
        variant: "destructive",
      });
      return;
    }

    onGenerate({
      projectStartDate,
      createdBy: 1,
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wand2 className="h-5 w-5" />
              Auto-Generate Schedule
            </DialogTitle>
            <DialogDescription>
              Generate project tasks automatically from approved estimate items using conventional trade sequencing.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {/* Project Start Date */}
            <div className="grid gap-2">
              <Label htmlFor="startDate">Project Start Date *</Label>
              <Input
                id="startDate"
                type="date"
                value={projectStartDate}
                onChange={(e) => setProjectStartDate(e.target.value)}
              />
            </div>

            {/* Preview Information */}
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                <div className="space-y-2">
                  <p className="font-medium">Schedule Generation Preview:</p>
                  {approvedItems.length > 0 ? (
                    <>
                      <p className="text-sm">
                        Found <strong>{approvedItems.length}</strong> approved estimate items across <strong>{tradeNames.length}</strong> trades:
                      </p>
                      <div className="text-sm space-y-1 max-h-32 overflow-y-auto">
                        {tradeNames.map(trade => {
                          const items = tradeGroups[trade];
                          const totalDuration = items.reduce((sum: number, item: any) => sum + (item.duration || 1), 0);
                          return (
                            <div key={trade} className="flex justify-between">
                              <span>{trade}</span>
                              <span className="text-gray-600">{items.length} items, {totalDuration} days</span>
                            </div>
                          );
                        })}
                      </div>
                      <p className="text-sm text-gray-600 mt-2">
                        Tasks will be sequenced automatically using construction industry standards.
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-amber-600">
                      No approved estimate items found. Please approve some estimate items before generating a schedule.
                    </p>
                  )}
                </div>
              </AlertDescription>
            </Alert>

            {/* Trade Sequence Information */}
            {approvedItems.length > 0 && (
              <Alert>
                <AlertDescription>
                  <div className="space-y-2">
                    <p className="font-medium text-sm">Conventional Trade Sequence:</p>
                    <p className="text-xs text-gray-600">
                      Excavation → Foundation → Framing → Plumbing → Electrical → HVAC → 
                      Insulation → Drywall → Flooring → Cabinets → Painting → Final Inspection
                    </p>
                    <p className="text-xs text-gray-500">
                      Tasks will be scheduled with 1-day buffers between trades for coordination.
                    </p>
                  </div>
                </AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={isLoading || approvedItems.length === 0}
              className="flex items-center gap-2"
            >
              {isLoading ? (
                'Generating...'
              ) : (
                <>
                  <Wand2 className="h-4 w-4" />
                  Generate Schedule
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}