import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface SimpleEditFormProps {
  project: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SimpleEditForm({ project, open, onOpenChange }: SimpleEditFormProps) {
  const [name, setName] = useState(project?.name || '');
  const [description, setDescription] = useState(project?.description || '');
  
  const handleSave = () => {
    // Development logging removed
    // Just close for now - we're testing input functionality
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Simple Edit Test</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div>
            <label className="block text-sm font-medium mb-2">Project Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full p-3 border-2 border-gray-300 rounded-lg focus:border-theme-primary focus:outline-none"
              placeholder="Enter project name"
            />
            <p className="text-xs text-gray-500 mt-1">Current value: "{name}"</p>
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-2">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full p-3 border-2 border-gray-300 rounded-lg focus:border-theme-primary focus:outline-none"
              placeholder="Enter description"
              rows={3}
            />
            <p className="text-xs text-gray-500 mt-1">Current value: "{description}"</p>
          </div>
        </div>
        
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}