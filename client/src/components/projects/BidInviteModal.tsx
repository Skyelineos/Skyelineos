import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { Upload, X, FileText, Calendar, MessageSquare } from 'lucide-react';
import { format } from 'date-fns';

interface BidInviteModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: number;
  estimateId?: number;
}

export default function BidInviteModal({ 
  isOpen, 
  onOpenChange, 
  projectId, 
  estimateId 
}: BidInviteModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Form state
  const [dueDate, setDueDate] = useState('');
  const [note, setNote] = useState('');
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  
  // Set default due date to 7 days from now
  useState(() => {
    const defaultDate = new Date();
    defaultDate.setDate(defaultDate.getDate() + 7);
    setDueDate(format(defaultDate, 'yyyy-MM-dd'));
  });

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Check file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: "File Too Large",
          description: "Please select a file smaller than 10MB.",
          variant: "destructive",
        });
        return;
      }
      setAttachedFile(file);
    }
  };

  const removeFile = () => {
    setAttachedFile(null);
    // Reset file input
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    if (fileInput) fileInput.value = '';
  };

  const sendInvitesMutation = useMutation({
    mutationFn: async () => {
      const formData = new FormData();
      formData.append('projectId', projectId.toString());
      if (estimateId) {
        formData.append('estimateId', estimateId.toString());
      }
      formData.append('dueDate', dueDate);
      formData.append('note', note);
      
      // Add file if present
      if (attachedFile) {
        formData.append('bidDocuments', attachedFile);
      }

      return apiRequest('/api/auto-bid-with-details', 'POST', formData);
    },
    onSuccess: (response) => {
      toast({
        title: "Bid Invitations Sent",
        description: `Successfully sent ${response.invitations || 0} bid invitations with your custom details.`,
      });
      
      // Reset form
      setDueDate('');
      setNote('');
      setAttachedFile(null);
      onOpenChange(false);
      
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ['/api/bid-processes'] });
      queryClient.invalidateQueries({ queryKey: ['/api/bid-invitations'] });
      queryClient.invalidateQueries({ queryKey: ['/api/estimates'] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Send Invitations",
        description: error.message || "There was an error sending bid invitations. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSendInvites = () => {
    if (!dueDate) {
      toast({
        title: "Due Date Required",
        description: "Please select a due date for the bid submissions.",
        variant: "destructive",
      });
      return;
    }

    // Check if due date is in the future
    const selectedDate = new Date(dueDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (selectedDate <= today) {
      toast({
        title: "Invalid Due Date",
        description: "Due date must be in the future.",
        variant: "destructive",
      });
      return;
    }

    sendInvitesMutation.mutate();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5" />
            Send Bid Invitations
          </DialogTitle>
          <DialogDescription>
            Set your bid due date, attach files, and include a message for all subcontractors.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Due Date */}
          <div className="space-y-2">
            <Label htmlFor="dueDate" className="flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              Bid Due Date *
            </Label>
            <Input
              id="dueDate"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              min={format(new Date(), 'yyyy-MM-dd')}
              required
            />
          </div>

          {/* File Upload */}
          <div className="space-y-2">
            <Label htmlFor="fileUpload" className="flex items-center gap-2">
              <Upload className="w-4 h-4" />
              Attach Documents (optional)
            </Label>
            {!attachedFile ? (
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-4">
                <div className="text-center">
                  <Upload className="mx-auto h-8 w-8 text-gray-400 mb-2" />
                  <label htmlFor="fileUpload" className="cursor-pointer">
                    <span className="text-sm text-theme-primary hover:text-blue-500">
                      Click to upload files
                    </span>
                    <input
                      id="fileUpload"
                      type="file"
                      className="hidden"
                      accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.dwg,.dxf"
                      onChange={handleFileUpload}
                    />
                  </label>
                  <p className="text-xs text-gray-500 mt-1">
                    PDF, DOC, XLS, images, or CAD files up to 10MB
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border">
                <div className="flex items-center gap-3">
                  <FileText className="w-5 h-5 text-theme-primary" />
                  <div>
                    <p className="text-sm font-medium">{attachedFile.name}</p>
                    <p className="text-xs text-gray-500">
                      {(attachedFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={removeFile}
                  className="h-8 w-8 p-0"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>

          {/* Custom Message */}
          <div className="space-y-2">
            <Label htmlFor="note" className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4" />
              Message to Subcontractors
            </Label>
            <Textarea
              id="note"
              placeholder="Write a custom message to include with the bid invitations..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={4}
              className="resize-none"
            />
            <p className="text-xs text-gray-500">
              This message will be included with all bid invitations sent to subcontractors.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleSendInvites}
            disabled={sendInvitesMutation.isPending || !dueDate}
            className="bg-theme-primary hover:bg-theme-primary-hover text-white"
          >
            {sendInvitesMutation.isPending ? 'Sending...' : 'Send Invitations'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}