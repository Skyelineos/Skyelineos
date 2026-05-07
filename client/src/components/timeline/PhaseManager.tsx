import React, { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Plus, Edit, Trash2, GripVertical } from 'lucide-react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';

export interface Phase {
  id: string;
  name: string;
  color: string;
  order: number;
}

interface PhaseManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  phases: Phase[];
  onPhasesChange: (phases: Phase[]) => void;
}

const PHASE_COLORS = [
  '#3b82f6', // Blue
  '#10b981', // Green
  '#f59e0b', // Yellow
  '#ef4444', // Red
  '#8b5cf6', // Purple
  '#06b6d4', // Cyan
  '#f97316', // Orange
  '#ec4899', // Pink
  '#84cc16', // Lime
  '#6366f1', // Indigo
];

export function PhaseManager({ open, onOpenChange, phases, onPhasesChange }: PhaseManagerProps) {
  const [editingPhase, setEditingPhase] = useState<Phase | null>(null);
  const [newPhaseName, setNewPhaseName] = useState('');
  const [isAddingPhase, setIsAddingPhase] = useState(false);

  const handleAddPhase = () => {
    if (!newPhaseName.trim()) return;
    
    const newPhase: Phase = {
      id: `phase-${Date.now()}`,
      name: newPhaseName.trim(),
      color: PHASE_COLORS[phases.length % PHASE_COLORS.length],
      order: phases.length
    };
    
    onPhasesChange([...phases, newPhase]);
    setNewPhaseName('');
    setIsAddingPhase(false);
  };

  const handleEditPhase = (phase: Phase, newName: string) => {
    if (!newName.trim()) return;
    
    const updatedPhases = phases.map(p => 
      p.id === phase.id ? { ...p, name: newName.trim() } : p
    );
    onPhasesChange(updatedPhases);
    setEditingPhase(null);
  };

  const handleDeletePhase = (phaseId: string) => {
    if (phases.length <= 1) {
      alert('You must have at least one phase');
      return;
    }
    
    const updatedPhases = phases.filter(p => p.id !== phaseId);
    onPhasesChange(updatedPhases);
  };

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;

    const items = Array.from(phases);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    // Update order values
    const updatedPhases = items.map((phase, index) => ({
      ...phase,
      order: index
    }));

    onPhasesChange(updatedPhases);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Manage Phases</DialogTitle>
          <DialogDescription>
            Add, edit, or reorder your project phases. Drag to reorder phases.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Phase List */}
          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId="phases">
              {(provided) => (
                <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-2">
                  {phases.map((phase, index) => (
                    <Draggable key={phase.id} draggableId={phase.id} index={index}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          className={`flex items-center gap-2 p-3 border rounded-lg ${
                            snapshot.isDragging ? 'shadow-lg' : ''
                          }`}
                        >
                          <div {...provided.dragHandleProps}>
                            <GripVertical className="w-4 h-4 text-gray-400" />
                          </div>
                          
                          <Badge 
                            variant="outline" 
                            className="shrink-0"
                            style={{ 
                              backgroundColor: phase.color + '20',
                              borderColor: phase.color,
                              color: phase.color
                            }}
                          >
                            {index + 1}
                          </Badge>
                          
                          {editingPhase?.id === phase.id ? (
                            <div className="flex-1 flex items-center gap-2">
                              <Input
                                defaultValue={phase.name}
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    handleEditPhase(phase, e.currentTarget.value);
                                  } else if (e.key === 'Escape') {
                                    setEditingPhase(null);
                                  }
                                }}
                                onBlur={(e) => handleEditPhase(phase, e.target.value)}
                              />
                            </div>
                          ) : (
                            <div className="flex-1 font-medium">{phase.name}</div>
                          )}
                          
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setEditingPhase(phase)}
                            >
                              <Edit className="w-3 h-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeletePhase(phase.id)}
                              disabled={phases.length <= 1}
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>

          {/* Add New Phase */}
          {isAddingPhase ? (
            <div className="flex items-center gap-2 p-3 border rounded-lg border-dashed">
              <Input
                placeholder="Enter phase name"
                value={newPhaseName}
                onChange={(e) => setNewPhaseName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleAddPhase();
                  } else if (e.key === 'Escape') {
                    setIsAddingPhase(false);
                    setNewPhaseName('');
                  }
                }}
                autoFocus
              />
              <Button size="sm" onClick={handleAddPhase}>
                Add
              </Button>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => {
                  setIsAddingPhase(false);
                  setNewPhaseName('');
                }}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <Button
              variant="outline"
              onClick={() => setIsAddingPhase(true)}
              className="w-full border-dashed"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Phase
            </Button>
          )}
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}