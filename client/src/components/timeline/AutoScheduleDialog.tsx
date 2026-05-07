import React, { useState, useMemo } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { 
  Calendar as CalendarIcon, 
  Play, 
  Settings, 
  Info, 
  Clock, 
  Target,
  Building2,
  CheckCircle,
  AlertTriangle,
  Loader2
} from "lucide-react";
import { format } from "date-fns";
import { generateAutoSchedule, validateAutoScheduleInputs, getScheduleSummary } from "@/utils/autoScheduler";

interface AutoScheduleDialogProps {
  availableEstimates: any[];
  projectStartDate: Date;
  onGenerate: (scheduledTasks: any[]) => void;
  onCancel: () => void;
  isGenerating: boolean;
}

export function AutoScheduleDialog({
  availableEstimates,
  projectStartDate,
  onGenerate,
  onCancel,
  isGenerating
}: AutoScheduleDialogProps) {
  const [startDate, setStartDate] = useState<Date>(projectStartDate);
  const [includePendingItems, setIncludePendingItems] = useState(false);
  const [excludedTrades, setExcludedTrades] = useState<string[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [showCalendarPopover, setShowCalendarPopover] = useState(false);

  // Get unique trades from estimates
  const availableTrades = useMemo(() => {
    const trades = new Set<string>();
    availableEstimates.forEach(item => {
      if (item.trade || item.category) {
        trades.add(item.trade || item.category);
      }
    });
    return Array.from(trades).sort();
  }, [availableEstimates]);

  // Filter estimates based on current settings
  const filteredEstimates = useMemo(() => {
    return availableEstimates.filter(item => {
      const tradeName = item.trade || item.category || 'Other';
      const isApproved = item.status === 'approved';
      const isIncluded = isApproved || includePendingItems;
      const isNotExcluded = !excludedTrades.includes(tradeName);
      return isIncluded && isNotExcluded;
    });
  }, [availableEstimates, includePendingItems, excludedTrades]);

  // Generate preview schedule
  const previewSchedule = useMemo(() => {
    if (!showPreview || filteredEstimates.length === 0) return null;

    const validation = validateAutoScheduleInputs(filteredEstimates, {
      projectStartDate: startDate,
      includePendingItems,
      excludeTrades: excludedTrades
    });

    if (!validation.isValid) return null;

    return generateAutoSchedule(filteredEstimates, {
      projectStartDate: startDate,
      includePendingItems,
      excludeTrades: excludedTrades
    });
  }, [filteredEstimates, startDate, includePendingItems, excludedTrades, showPreview]);

  const scheduleSummary = previewSchedule ? getScheduleSummary(previewSchedule) : null;

  const handleGenerate = () => {
    if (!previewSchedule) return;
    onGenerate(previewSchedule);
  };

  const handleTradeToggle = (tradeName: string, excluded: boolean) => {
    if (excluded) {
      setExcludedTrades(prev => [...prev, tradeName]);
    } else {
      setExcludedTrades(prev => prev.filter(t => t !== tradeName));
    }
  };

  const approvedCount = availableEstimates.filter(item => item.status === 'approved').length;
  const pendingCount = availableEstimates.length - approvedCount;

  return (
    <div className="space-y-6">
      {/* Configuration Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Basic Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="w-4 h-4" />
              Schedule Settings
            </CardTitle>
            <CardDescription>
              Configure your auto-schedule generation
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Start Date */}
            <div className="space-y-2">
              <Label>Project Start Date</Label>
              <Popover open={showCalendarPopover} onOpenChange={setShowCalendarPopover}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-left font-normal"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(startDate, "PPP")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={startDate}
                    onSelect={(date) => {
                      if (date) {
                        setStartDate(date);
                        setShowCalendarPopover(false);
                      }
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Include Pending Items */}
            <div className="flex items-center space-x-2">
              <Checkbox
                id="includePending"
                checked={includePendingItems}
                onCheckedChange={(checked) => setIncludePendingItems(checked as boolean)}
              />
              <Label htmlFor="includePending" className="text-sm">
                Include pending estimate items ({pendingCount} items)
              </Label>
            </div>
          </CardContent>
        </Card>

        {/* Trade Selection */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="w-4 h-4" />
              Trade Selection
            </CardTitle>
            <CardDescription>
              Choose which trades to include in the schedule
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-48">
              <div className="space-y-2">
                {availableTrades.map(tradeName => {
                  const tradeItems = availableEstimates.filter(item => 
                    (item.trade || item.category) === tradeName
                  );
                  const isExcluded = excludedTrades.includes(tradeName);
                  
                  return (
                    <div key={tradeName} className="flex items-center justify-between py-1">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id={`trade-${tradeName}`}
                          checked={!isExcluded}
                          onCheckedChange={(checked) => 
                            handleTradeToggle(tradeName, !checked)
                          }
                        />
                        <Label htmlFor={`trade-${tradeName}`} className="text-sm">
                          {tradeName}
                        </Label>
                      </div>
                      <Badge variant="outline" className="text-xs">
                        {tradeItems.length}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Estimates Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="w-4 h-4" />
            Estimate Items Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-green-600">{approvedCount}</div>
              <div className="text-sm text-gray-500">Approved</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-yellow-600">{pendingCount}</div>
              <div className="text-sm text-gray-500">Pending</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-blue-600">{filteredEstimates.length}</div>
              <div className="text-sm text-gray-500">Selected</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Preview Section */}
      {showPreview && scheduleSummary && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="w-4 h-4" />
              Schedule Preview
            </CardTitle>
            <CardDescription>
              Generated schedule overview
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div>
                <div className="text-lg font-semibold">{scheduleSummary.totalTasks}</div>
                <div className="text-sm text-gray-500">Tasks</div>
              </div>
              <div>
                <div className="text-lg font-semibold">{scheduleSummary.tradeCount}</div>
                <div className="text-sm text-gray-500">Trades</div>
              </div>
              <div>
                <div className="text-lg font-semibold">{scheduleSummary.totalDuration}</div>
                <div className="text-sm text-gray-500">Days</div>
              </div>
              <div>
                <div className="text-lg font-semibold">
                  {scheduleSummary.endDate ? format(scheduleSummary.endDate, 'MMM dd') : 'N/A'}
                </div>
                <div className="text-sm text-gray-500">End Date</div>
              </div>
            </div>

            {previewSchedule && (
              <div className="mt-4">
                <Label className="text-sm font-medium">Generated Tasks:</Label>
                <ScrollArea className="h-32 mt-2">
                  <div className="space-y-1">
                    {previewSchedule.slice(0, 10).map((task, index) => (
                      <div key={index} className="flex items-center justify-between py-1 px-2 bg-gray-50 rounded">
                        <span className="text-sm">{task.title}</span>
                        <span className="text-xs text-gray-500">{task.duration}d</span>
                      </div>
                    ))}
                    {previewSchedule.length > 10 && (
                      <div className="text-xs text-gray-400 text-center py-1">
                        ... and {previewSchedule.length - 10} more tasks
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Validation Alerts */}
      {filteredEstimates.length === 0 && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            No estimate items selected. Please adjust your filters or include pending items.
          </AlertDescription>
        </Alert>
      )}

      {filteredEstimates.length > 0 && !showPreview && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            Ready to generate schedule with {filteredEstimates.length} estimate items. 
            Click "Preview Schedule" to see what will be created.
          </AlertDescription>
        </Alert>
      )}

      {/* Action Buttons */}
      <div className="flex items-center justify-between pt-4 border-t">
        <Button variant="outline" onClick={onCancel} disabled={isGenerating}>
          Cancel
        </Button>
        
        <div className="flex items-center gap-2">
          {!showPreview ? (
            <Button
              variant="outline"
              onClick={() => setShowPreview(true)}
              disabled={filteredEstimates.length === 0}
              className="flex items-center gap-2"
            >
              <Target className="w-4 h-4" />
              Preview Schedule
            </Button>
          ) : (
            <Button
              variant="outline"
              onClick={() => setShowPreview(false)}
            >
              Hide Preview
            </Button>
          )}
          
          <Button
            onClick={handleGenerate}
            disabled={!previewSchedule || isGenerating}
            className="flex items-center gap-2"
          >
            {isGenerating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            {isGenerating ? 'Generating...' : 'Generate Schedule'}
          </Button>
        </div>
      </div>
    </div>
  );
}