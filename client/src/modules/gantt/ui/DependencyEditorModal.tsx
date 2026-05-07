// Dependency Editor Modal - Edit Link Properties
import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useGantt } from '../state';
import type { WbsTask, Link, LinkType } from '../types';
import { useToast } from '@/hooks/use-toast';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Trash2, Link2, Clock, ArrowRight } from 'lucide-react';

// Form validation schema
const dependencySchema = z.object({
  type: z.enum(['FS', 'SS', 'FF', 'SF']),
  lagDays: z.number().min(-365, 'Lag too negative').max(365, 'Lag too large'),
});

type DependencyForm = z.infer<typeof dependencySchema>;

interface DependencyEditorModalProps {
  open: boolean;
  onClose: () => void;
  link: Link | null;
  sourceTask: WbsTask | null;
  targetTask: WbsTask | null;
}

export function DependencyEditorModal({ 
  open, 
  onClose, 
  link, 
  sourceTask, 
  targetTask 
}: DependencyEditorModalProps) {
  const { tasks, setTasks } = useGantt();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const form = useForm<DependencyForm>({
    resolver: zodResolver(dependencySchema),
    defaultValues: {
      type: link?.type || 'FS',
      lagDays: link?.lagDays || 0,
    },
  });

  // Reset form when link changes
  React.useEffect(() => {
    if (link) {
      form.reset({
        type: link.type,
        lagDays: link.lagDays || 0,
      });
    }
  }, [link, form]);

  // Get link type descriptions
  const getLinkTypeDescription = (type: LinkType): string => {
    switch (type) {
      case 'FS':
        return 'Finish-to-Start: Task B starts when Task A finishes';
      case 'SS':
        return 'Start-to-Start: Task B starts when Task A starts';
      case 'FF':
        return 'Finish-to-Finish: Task B finishes when Task A finishes';
      case 'SF':
        return 'Start-to-Finish: Task B finishes when Task A starts';
      default:
        return '';
    }
  };

  // Update dependency in nested task structure
  const updateDependencyInTasks = (
    taskList: WbsTask[],
    targetId: string,
    oldLink: Link,
    newLink: Link
  ): WbsTask[] => {
    return taskList.map(task => {
      if (task.id === targetId && task.predecessors) {
        return {
          ...task,
          predecessors: task.predecessors.map(pred => 
            pred.sourceId === oldLink.sourceId && pred.targetId === oldLink.targetId
              ? newLink
              : pred
          )
        };
      }
      if (task.children) {
        return {
          ...task,
          children: updateDependencyInTasks(task.children, targetId, oldLink, newLink)
        };
      }
      return task;
    });
  };

  // Remove dependency from nested task structure
  const removeDependencyFromTasks = (
    taskList: WbsTask[],
    targetId: string,
    linkToRemove: Link
  ): WbsTask[] => {
    return taskList.map(task => {
      if (task.id === targetId && task.predecessors) {
        const updatedPredecessors = task.predecessors.filter(pred => 
          !(pred.sourceId === linkToRemove.sourceId && pred.targetId === linkToRemove.targetId)
        );
        return {
          ...task,
          predecessors: updatedPredecessors.length > 0 ? updatedPredecessors : undefined
        };
      }
      if (task.children) {
        return {
          ...task,
          children: removeDependencyFromTasks(task.children, targetId, linkToRemove)
        };
      }
      return task;
    });
  };

  const onSubmit = async (data: DependencyForm) => {
    if (!link || !sourceTask || !targetTask) return;

    setIsSubmitting(true);
    try {
      const updatedLink: Link = {
        ...link,
        type: data.type,
        lagDays: data.lagDays,
      };

      const updatedTasks = updateDependencyInTasks(tasks, targetTask.id, link, updatedLink);
      setTasks(updatedTasks);

      toast({
        title: 'Dependency Updated',
        description: `Changed to ${data.type} with ${data.lagDays} day lag.`,
      });

      onClose();
    } catch (error) {
      toast({
        title: 'Error',
        description: `Failed to update dependency: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!link || !targetTask) return;

    setIsDeleting(true);
    try {
      const updatedTasks = removeDependencyFromTasks(tasks, targetTask.id, link);
      setTasks(updatedTasks);

      toast({
        title: 'Dependency Deleted',
        description: `Removed dependency between "${sourceTask?.name}" and "${targetTask.name}".`,
      });

      onClose();
    } catch (error) {
      toast({
        title: 'Error',
        description: `Failed to delete dependency: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  if (!link || !sourceTask || !targetTask) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Edit Dependency
          </DialogTitle>
          <DialogDescription>
            Modify the relationship between tasks or remove it entirely.
          </DialogDescription>
        </DialogHeader>

        {/* Task Relationship Display */}
        <div className="bg-gray-50 p-4 rounded-lg">
          <div className="flex items-center gap-2 text-sm">
            <Badge variant="outline" className="font-mono">
              {sourceTask.id}
            </Badge>
            <span className="font-medium truncate max-w-[120px]">
              {sourceTask.name}
            </span>
            <ArrowRight className="h-4 w-4 text-gray-400" />
            <Badge variant="outline" className="font-mono">
              {targetTask.id}
            </Badge>
            <span className="font-medium truncate max-w-[120px]">
              {targetTask.name}
            </span>
          </div>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Link Type */}
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Dependency Type</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="FS">FS - Finish to Start</SelectItem>
                      <SelectItem value="SS">SS - Start to Start</SelectItem>
                      <SelectItem value="FF">FF - Finish to Finish</SelectItem>
                      <SelectItem value="SF">SF - Start to Finish</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    {getLinkTypeDescription(field.value as LinkType)}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Lag Days */}
            <FormField
              control={form.control}
              name="lagDays"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Lag Days
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min="-365"
                      max="365"
                      {...field}
                      onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                    />
                  </FormControl>
                  <FormDescription>
                    Positive values add delay, negative values create overlap
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Form Actions */}
            <div className="flex justify-between pt-4">
              <Button 
                type="button" 
                variant="destructive" 
                onClick={handleDelete}
                disabled={isDeleting || isSubmitting}
                className="flex items-center gap-2"
              >
                <Trash2 className="h-4 w-4" />
                {isDeleting ? 'Deleting...' : 'Delete'}
              </Button>
              
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={onClose}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting || isDeleting}>
                  {isSubmitting ? 'Updating...' : 'Update'}
                </Button>
              </div>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}