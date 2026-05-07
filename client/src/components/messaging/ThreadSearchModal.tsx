import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Settings, Archive, Trash2, Users, Tag } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

interface Thread {
  id: number;
  title: string;
  description?: string;
  isArchived: boolean;
  participants?: Array<{
    id: number;
    userId: number;
    role: string;
    user?: {
      firstName: string;
      lastName: string;
      email: string;
    };
  }>;
}

interface ThreadSettingsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  thread: Thread;
  projectId: number;
  currentUserId: string;
  onThreadUpdated?: () => void;
  onThreadDeleted?: () => void;
}

export function ThreadSettings({
  open,
  onOpenChange,
  thread,
  projectId,
  currentUserId,
  onThreadUpdated,
  onThreadDeleted
}: ThreadSettingsProps) {
  const [title, setTitle] = useState(thread.title);
  const [description, setDescription] = useState(thread.description || '');
  const [notifications, setNotifications] = useState(true);
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Update thread mutation
  const updateThreadMutation = useMutation({
    mutationFn: (updates: Partial<Thread>) =>
      apiRequest(`/api/messaging/threads/${thread.id}`, 'PUT', updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/messaging/threads/project/${projectId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/messaging/threads/${thread.id}/messages`] });
      toast({
        title: 'Thread updated',
        description: 'Thread settings have been saved successfully.'
      });
      onThreadUpdated?.();
      onOpenChange(false);
    },
    onError: (error) => {
      toast({
        title: 'Update failed',
        description: error instanceof Error ? error.message : 'Failed to update thread settings',
        variant: 'destructive'
      });
    }
  });

  // Archive thread mutation
  const archiveThreadMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/api/messaging/threads/${thread.id}/archive`, 'POST', {
        userId: parseInt(currentUserId)
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/messaging/threads/project/${projectId}`] });
      toast({
        title: 'Thread archived',
        description: 'Thread has been archived successfully.'
      });
      onThreadUpdated?.();
      onOpenChange(false);
    }
  });

  // Delete thread mutation
  const deleteThreadMutation = useMutation({
    mutationFn: () => apiRequest(`/api/messaging/threads/${thread.id}`, 'DELETE'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/messaging/threads/project/${projectId}`] });
      toast({
        title: 'Thread deleted',
        description: 'Thread has been deleted successfully.'
      });
      onThreadDeleted?.();
      onOpenChange(false);
    },
    onError: (error) => {
      toast({
        title: 'Delete failed',
        description: error instanceof Error ? error.message : 'Failed to delete thread',
        variant: 'destructive'
      });
    }
  });

  const handleSave = () => {
    updateThreadMutation.mutate({
      title: title.trim(),
      description: description.trim() || undefined
    });
  };

  const handleArchive = () => {
    if (window.confirm('Are you sure you want to archive this conversation?')) {
      archiveThreadMutation.mutate();
    }
  };

  const handleDelete = () => {
    if (window.confirm('Are you sure you want to delete this conversation? This action cannot be undone.')) {
      deleteThreadMutation.mutate();
    }
  };

  const addTag = () => {
    if (newTag.trim() && !tags.includes(newTag.trim())) {
      setTags([...tags, newTag.trim()]);
      setNewTag('');
    }
  };

  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
  };

  const isOwner = thread.participants?.some(
    p => p.userId === parseInt(currentUserId) && p.role === 'owner'
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <Settings className="h-5 w-5" />
            <span>Thread Settings</span>
          </DialogTitle>
          <DialogDescription>
            Manage this conversation's settings and preferences
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Basic Settings */}
          <div className="space-y-4">
            <h3 className="font-medium">Basic Information</h3>
            
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Conversation title"
                disabled={!isOwner}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description"
                className="min-h-[80px]"
                disabled={!isOwner}
              />
            </div>
          </div>

          <Separator />

          {/* Notification Settings */}
          <div className="space-y-4">
            <h3 className="font-medium">Notifications</h3>
            
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Push Notifications</Label>
                <p className="text-sm text-muted-foreground">
                  Receive notifications for new messages
                </p>
              </div>
              <Switch
                checked={notifications}
                onCheckedChange={setNotifications}
              />
            </div>
          </div>

          <Separator />

          {/* Tags */}
          <div className="space-y-4">
            <h3 className="font-medium">Tags</h3>
            
            <div className="space-y-2">
              <div className="flex space-x-2">
                <Input
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  placeholder="Add a tag"
                  onKeyPress={(e) => e.key === 'Enter' && addTag()}
                />
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={addTag}
                  disabled={!newTag.trim()}
                >
                  <Tag className="h-4 w-4" />
                </Button>
              </div>
              
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="cursor-pointer">
                      {tag}
                      <button
                        onClick={() => removeTag(tag)}
                        className="ml-1 hover:text-red-600"
                      >
                        ×
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>

          <Separator />

          {/* Participants */}
          {thread.participants && thread.participants.length > 0 && (
            <>
              <div className="space-y-4">
                <h3 className="font-medium flex items-center space-x-2">
                  <Users className="h-4 w-4" />
                  <span>Participants ({thread.participants.length})</span>
                </h3>
                
                <div className="space-y-2">
                  {thread.participants.map((participant) => (
                    <div key={participant.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                      <div>
                        <p className="text-sm font-medium">
                          {participant.user?.firstName} {participant.user?.lastName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {participant.user?.email}
                        </p>
                      </div>
                      <Badge variant="outline" className="text-xs">
                        {participant.role}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
              
              <Separator />
            </>
          )}

          {/* Actions */}
          <div className="space-y-4">
            <h3 className="font-medium">Actions</h3>
            
            <div className="space-y-2">
              {!thread.isArchived && (
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={handleArchive}
                  disabled={archiveThreadMutation.isPending}
                >
                  <Archive className="h-4 w-4 mr-2" />
                  Archive Conversation
                </Button>
              )}
              
              {isOwner && (
                <Button
                  variant="outline"
                  className="w-full justify-start text-red-600 hover:text-red-700 hover:bg-red-50"
                  onClick={handleDelete}
                  disabled={deleteThreadMutation.isPending}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Conversation
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex justify-end space-x-2 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleSave}
            disabled={updateThreadMutation.isPending || !title.trim()}
            className="bg-[var(--accent-color)] hover:bg-[var(--accent-color)]/90"
          >
            {updateThreadMutation.isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}