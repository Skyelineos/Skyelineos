// Add Task Modal with Smart Dependency Linking
import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format, addDays } from 'date-fns';
import { useGantt } from '../state';
import type { WbsTask, Link } from '../types';
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
import { Checkbox } from '@/components/ui/checkbox';

// Form validation schema
const addTaskSchema = z.object({
  name: z.string().min(1, 'Task name is required').max(100, 'Name too long'),
  durationDays: z.number().min(1, 'Duration must be at least 1 day').max(365, 'Duration too long'),
  startDate: z.string().min(1, 'Start date is required'),
  progress: z.number().min(0).max(100).default(0),
  parentId: z.string().optional(),
  createDependencies: z.boolean().default(true),
  locked: z.boolean().default(false),
});

type AddTaskForm = z.infer<typeof addTaskSchema>;

interface AddTaskModalProps {
  open: boolean;
  onClose: () => void;
  selectedTaskIds?: string[];
}

export function AddTaskModal({ open, onClose, selectedTaskIds = [] }: AddTaskModalProps) {
  const { tasks, setTasks } = useGantt();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<AddTaskForm>({
    resolver: zodResolver(addTaskSchema),
    defaultValues: {
      name: '',
      durationDays: 1,
      startDate: format(new Date(), 'yyyy-MM-dd'),
      progress: 0,
      createDependencies: true,
      locked: false,
    },
  });

  // Get all tasks in flat structure for parent selection
  const getAllTasks = (tasks: WbsTask[]): WbsTask[] => {
    const result: WbsTask[] = [];
    const traverse = (taskList: WbsTask[]) => {
      taskList.forEach(task => {
        result.push(task);
        if (task.children) {
          traverse(task.children);
        }
      });
    };
    traverse(tasks);
    return result;
  };

  const allTasks = getAllTasks(tasks);

  // Generate unique task ID
  const generateTaskId = (): string => {
    const existingIds = new Set(allTasks.map(t => t.id));
    let counter = 1;
    let newId = `task_${counter}`;
    while (existingIds.has(newId)) {
      counter++;
      newId = `task_${counter}`;
    }
    return newId;
  };

  // Calculate smart start date based on selected tasks
  const getSmartStartDate = (): string => {
    if (selectedTaskIds.length === 0) {
      return format(new Date(), 'yyyy-MM-dd');
    }

    // Find the latest end date among selected tasks
    const selectedTasks = allTasks.filter(t => selectedTaskIds.includes(t.id));
    if (selectedTasks.length === 0) {
      return format(new Date(), 'yyyy-MM-dd');
    }

    const latestEndDate = selectedTasks.reduce((latest, task) => {
      return task.endDate > latest ? task.endDate : latest;
    }, selectedTasks[0].endDate);

    // Add 1 day for FS dependency
    const nextDay = addDays(new Date(latestEndDate), 1);
    return format(nextDay, 'yyyy-MM-dd');
  };

  // Update start date when dependencies are enabled/disabled
  React.useEffect(() => {
    if (form.watch('createDependencies') && selectedTaskIds.length > 0) {
      form.setValue('startDate', getSmartStartDate());
    }
  }, [form.watch('createDependencies'), selectedTaskIds]);

  const onSubmit = async (data: AddTaskForm) => {
    setIsSubmitting(true);
    try {
      const taskId = generateTaskId();
      const endDate = addDays(new Date(data.startDate), data.durationDays - 1);

      // Create predecessors if dependencies are enabled
      const predecessors: Link[] = [];
      if (data.createDependencies && selectedTaskIds.length > 0) {
        selectedTaskIds.forEach(sourceId => {
          predecessors.push({
            sourceId,
            targetId: taskId,
            type: 'FS', // Finish-to-Start
            lagDays: 0,
          });
        });
      }

      // Create new task
      const newTask: WbsTask = {
        id: taskId,
        name: data.name,
        startDate: data.startDate,
        endDate: format(endDate, 'yyyy-MM-dd'),
        durationDays: data.durationDays,
        progress: data.progress,
        locked: data.locked,
        predecessors: predecessors.length > 0 ? predecessors : undefined,
      };

      // Add task to the appropriate location
      const updatedTasks = [...tasks];
      
      if (data.parentId) {
        // Add as child of specified parent
        const addToParent = (taskList: WbsTask[]): boolean => {
          for (const task of taskList) {
            if (task.id === data.parentId) {
              if (!task.children) {
                task.children = [];
              }
              task.children.push(newTask);
              return true;
            }
            if (task.children && addToParent(task.children)) {
              return true;
            }
          }
          return false;
        };
        
        if (!addToParent(updatedTasks)) {
          // Parent not found, add to root
          updatedTasks.push(newTask);
        }
      } else {
        // Add to root level
        updatedTasks.push(newTask);
      }

      // Update state
      setTasks(updatedTasks);

      // Show success message
      toast({
        title: 'Task Added',
        description: `"${data.name}" has been added successfully${
          predecessors.length > 0 ? ` with ${predecessors.length} dependency(ies)` : ''
        }.`,
      });

      // Close modal and reset form
      onClose();
      form.reset();
      
    } catch (error) {
      toast({
        title: 'Error',
        description: `Failed to add task: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Add New Task</DialogTitle>
          <DialogDescription>
            Create a new task{selectedTaskIds.length > 0 && ' with smart dependency linking'}.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Task Name */}
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Task Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter task name..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Duration and Start Date */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="durationDays"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Duration (Days)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="1"
                        max="365"
                        {...field}
                        onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="startDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Progress */}
            <FormField
              control={form.control}
              name="progress"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Progress (%)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      {...field}
                      onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Parent Task Selection */}
            {allTasks.length > 0 && (
              <FormField
                control={form.control}
                name="parentId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Parent Task (Optional)</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select parent task..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="">No Parent (Root Level)</SelectItem>
                        {allTasks.map((task) => (
                          <SelectItem key={task.id} value={task.id}>
                            {task.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Smart Dependencies */}
            {selectedTaskIds.length > 0 && (
              <FormField
                control={form.control}
                name="createDependencies"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>
                        Create Dependencies
                      </FormLabel>
                      <FormDescription>
                        Automatically create Finish-to-Start links from {selectedTaskIds.length} selected task(s)
                      </FormDescription>
                    </div>
                  </FormItem>
                )}
              />
            )}

            {/* Lock Task */}
            <FormField
              control={form.control}
              name="locked"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>
                      Lock Task
                    </FormLabel>
                    <FormDescription>
                      Prevent this task from being moved during auto-scheduling
                    </FormDescription>
                  </div>
                </FormItem>
              )}
            />

            {/* Form Actions */}
            <div className="flex justify-end space-x-2 pt-4">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Adding...' : 'Add Task'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}