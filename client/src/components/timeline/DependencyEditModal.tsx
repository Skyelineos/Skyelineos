import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Trash2, AlertTriangle } from "lucide-react";

interface Task {
  id: number;
  title: string;
  trade: string;
}

interface DependencyArrow {
  fromTaskId: number;
  toTaskId: number;
  type: 'FS' | 'SS' | 'FF' | 'SF';
  lag: number;
}

interface DependencyEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  dependency: DependencyArrow | null;
  tasks: Task[];
  onSave: (dependency: DependencyArrow) => void;
  onDelete: (fromTaskId: number, toTaskId: number) => void;
}

const dependencyTypes = [
  { value: 'FS', label: 'Finish-to-Start (FS)', description: 'Predecessor must finish before successor starts' },
  { value: 'SS', label: 'Start-to-Start (SS)', description: 'Both tasks start at the same time' },
  { value: 'FF', label: 'Finish-to-Finish (FF)', description: 'Both tasks finish at the same time' },
  { value: 'SF', label: 'Start-to-Finish (SF)', description: 'Predecessor starts before successor finishes' },
];

export const DependencyEditModal: React.FC<DependencyEditModalProps> = ({
  isOpen,
  onClose,
  dependency,
  tasks,
  onSave,
  onDelete,
}) => {
  const [type, setType] = useState<'FS' | 'SS' | 'FF' | 'SF'>('FS');
  const [lag, setLag] = useState<number>(0);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (dependency) {
      setType(dependency.type);
      setLag(dependency.lag);
    } else {
      setType('FS');
      setLag(0);
    }
    setShowDeleteConfirm(false);
  }, [dependency, isOpen]);

  if (!dependency) return null;

  const fromTask = tasks.find(t => t.id === dependency.fromTaskId);
  const toTask = tasks.find(t => t.id === dependency.toTaskId);

  if (!fromTask || !toTask) return null;

  const handleSave = () => {
    onSave({
      fromTaskId: dependency.fromTaskId,
      toTaskId: dependency.toTaskId,
      type,
      lag,
    });
    onClose();
  };

  const handleDelete = () => {
    if (showDeleteConfirm) {
      onDelete(dependency.fromTaskId, dependency.toTaskId);
      onClose();
    } else {
      setShowDeleteConfirm(true);
    }
  };

  const selectedType = dependencyTypes.find(dt => dt.value === type);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="w-3 h-3 bg-blue-500 rounded-full" />
            Edit Dependency
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Dependency Flow Visualization */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="text-sm font-medium text-gray-900">{fromTask.title}</div>
                <div className="text-xs text-gray-500">{fromTask.trade}</div>
              </div>
              
              <div className="flex items-center gap-2 px-3">
                <div className="w-8 h-0.5 bg-gray-400"></div>
                <div className="w-2 h-2 border-r-2 border-b-2 border-gray-400 transform rotate-[-45deg]"></div>
              </div>
              
              <div className="flex-1 text-right">
                <div className="text-sm font-medium text-gray-900">{toTask.title}</div>
                <div className="text-xs text-gray-500">{toTask.trade}</div>
              </div>
            </div>
          </div>

          {/* Dependency Type */}
          <div className="space-y-2">
            <Label htmlFor="dependency-type">Dependency Type</Label>
            <Select value={type} onValueChange={(value: 'FS' | 'SS' | 'FF' | 'SF') => setType(value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {dependencyTypes.map((depType) => (
                  <SelectItem key={depType.value} value={depType.value}>
                    <div>
                      <div className="font-medium">{depType.label}</div>
                      <div className="text-xs text-gray-500">{depType.description}</div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedType && (
              <p className="text-xs text-gray-600 mt-1">{selectedType.description}</p>
            )}
          </div>

          {/* Lag Time */}
          <div className="space-y-2">
            <Label htmlFor="lag-time">Lag Time (days)</Label>
            <div className="flex items-center gap-2">
              <Input
                id="lag-time"
                type="number"
                value={lag}
                onChange={(e) => setLag(parseInt(e.target.value) || 0)}
                className="flex-1"
                placeholder="0"
              />
              <div className="text-sm text-gray-500 min-w-0 flex-1">
                {lag > 0 && `Delay: ${lag} day${lag !== 1 ? 's' : ''} after predecessor`}
                {lag < 0 && `Overlap: ${Math.abs(lag)} day${Math.abs(lag) !== 1 ? 's' : ''} before predecessor completes`}
                {lag === 0 && 'No delay'}
              </div>
            </div>
          </div>

          {/* Warning for unusual configurations */}
          {(type === 'SF' || lag < -5) && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm">
                <div className="font-medium text-amber-800">Unusual Configuration</div>
                <div className="text-amber-700">
                  {type === 'SF' && 'Start-to-Finish dependencies are rarely used and may cause scheduling issues.'}
                  {lag < -5 && 'Large negative lag times can create tight scheduling constraints.'}
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex justify-between">
          <Button
            variant="destructive"
            size="sm"
            onClick={handleDelete}
            className="flex items-center gap-2"
          >
            <Trash2 className="w-4 h-4" />
            {showDeleteConfirm ? 'Confirm Delete' : 'Delete'}
          </Button>
          
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleSave}>
              Save Changes
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default DependencyEditModal;