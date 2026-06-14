import React, { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { useToast } from '../../hooks/use-toast';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { 
  useCreateScheduleFromCSV, 
  useAutoGenerateSchedule, 
  useCopySchedule, 
  useApplyTemplate 
} from '../../hooks/schedule';
import { 
  Upload, 
  Wand2, 
  Copy, 
  Template,
  FileSpreadsheet,
  Sparkles,
  Building2,
  Layout
} from 'lucide-react';

interface GenerateScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: number;
  onSuccess: () => void;
}

type GenerationMode = 'csv' | 'estimates' | 'copy' | 'template';

export function GenerateScheduleModal({ 
  isOpen, 
  onClose, 
  projectId, 
  onSuccess 
}: GenerateScheduleModalProps) {
  const [mode, setMode] = useState<GenerationMode>('estimates');
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const { toast } = useToast();

  // Hooks for different generation methods
  const csvCreate = useCreateScheduleFromCSV(projectId);
  const autoGen = useAutoGenerateSchedule(projectId.toString());
  const copySchedule = useCopySchedule(projectId);
  const applyTemplate = useApplyTemplate(projectId);

  // Fetch data for copy and template options
  const { data: projects = [] } = useQuery({
    queryKey: ['/api/projects'],
    enabled: mode === 'copy',
  });

  const { data: templates = [] } = useQuery({
    queryKey: ['/api/schedule-templates'],
    enabled: mode === 'template',
  });

  // Get current project to show start date
  const { data: currentProject } = useQuery({
    queryKey: [`/api/projects/${projectId}`],
  });

  // Filter projects (exclude current project)
  const copyableProjects = projects.filter((p: any) => p.id !== projectId);

  const isLoading = csvCreate.isPending || autoGen.isPending || copySchedule.isPending || applyTemplate.isPending;

  const handleSubmit = async () => {
    try {
      if (mode === 'csv' && csvFile) {
        await csvCreate.mutateAsync(csvFile);
      } else if (mode === 'estimates') {
        await autoGen.mutateAsync();
      } else if (mode === 'copy' && selectedProjectId) {
        await copySchedule.mutateAsync({ sourceProjectId: parseInt(selectedProjectId) });
      } else if (mode === 'template' && selectedTemplateId) {
        await applyTemplate.mutateAsync({ templateId: selectedTemplateId });
      } else {
        toast({
          title: "Validation Error",
          description: "Please complete all required fields.",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Schedule Generated",
        description: `Successfully generated schedule using ${
          mode === 'csv' ? 'CSV import' :
          mode === 'estimates' ? 'approved estimates' :
          mode === 'copy' ? 'project copy' :
          'template'
        }.`,
      });

      onSuccess();
    } catch (error: any) {
      toast({
        title: "Generation Failed",
        description: error.message || "Failed to generate schedule. Please try again.",
        variant: "destructive",
      });
    }
  };

  const modeOptions = [
    {
      id: 'estimates' as const,
      title: 'From Estimates',
      description: 'Generate tasks from approved estimate items',
      icon: Sparkles,
      color: 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100',
    },
    {
      id: 'csv' as const,
      title: 'Import CSV',
      description: 'Upload a CSV file with task data',
      icon: FileSpreadsheet,
      color: 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100',
    },
    {
      id: 'copy' as const,
      title: 'Copy from Project',
      description: 'Duplicate schedule from another project',
      icon: Building2,
      color: 'bg-purple-50 border-purple-200 text-purple-700 hover:bg-purple-100',
    },
    {
      id: 'template' as const,
      title: 'Apply Template',
      description: 'Use a predefined schedule template',
      icon: Layout,
      color: 'bg-orange-50 border-orange-200 text-orange-700 hover:bg-orange-100',
    },
  ];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5" />
            Generate Schedule
          </DialogTitle>
          <DialogDescription>
            Create a project schedule using one of the methods below. 
            {currentProject?.startDate && (
              <>
                {' '}All tasks will be scheduled starting from{' '}
                <strong>{format(new Date(currentProject.startDate), 'MMM d, yyyy')}</strong>.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Mode Selection */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {modeOptions.map((option) => {
              const Icon = option.icon;
              return (
                <button
                  key={option.id}
                  onClick={() => setMode(option.id)}
                  className={`p-4 border rounded-lg text-left transition-all ${
                    mode === option.id 
                      ? option.color + ' ring-2 ring-offset-2 ring-current'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className="h-5 w-5" />
                    <div>
                      <div className="font-medium">{option.title}</div>
                      <div className="text-sm opacity-75">{option.description}</div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Mode-specific content */}
          <div className="border-t pt-4">
            {mode === 'csv' && (
              <div className="space-y-3">
                <Label htmlFor="csv-file">Upload CSV File</Label>
                <Input
                  id="csv-file"
                  type="file"
                  accept=".csv"
                  onChange={(e) => setCsvFile(e.target.files?.[0] || null)}
                  className="file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
                <p className="text-sm text-gray-600">
                  CSV should include columns: Task Name, Duration, Trade, Dependencies (optional)
                </p>
              </div>
            )}

            {mode === 'estimates' && (
              <div className="bg-blue-50 p-4 rounded-lg">
                <h4 className="font-medium text-blue-900 mb-2">Automatic Generation</h4>
                <p className="text-blue-800 text-sm">
                  This will create tasks from all approved estimate items in your project, 
                  applying standard construction trade sequencing and realistic durations.
                </p>
              </div>
            )}

            {mode === 'copy' && (
              <div className="space-y-3">
                <Label htmlFor="source-project">Source Project</Label>
                <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a project to copy from" />
                  </SelectTrigger>
                  <SelectContent>
                    {copyableProjects.map((project: any) => (
                      <SelectItem key={project.id} value={project.id.toString()}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-sm text-gray-600">
                  Task durations and dependencies will be preserved, but dates will be adjusted 
                  to start from this project's start date.
                </p>
              </div>
            )}

            {mode === 'template' && (
              <div className="space-y-3">
                <Label htmlFor="template">Schedule Template</Label>
                <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a template to apply" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((template: any) => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-sm text-gray-600">
                  Templates provide pre-configured task sequences for common project types.
                </p>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={
              isLoading ||
              (mode === 'csv' && !csvFile) ||
              (mode === 'copy' && !selectedProjectId) ||
              (mode === 'template' && !selectedTemplateId)
            }
          >
            {isLoading ? (
              <>
                <Wand2 className="h-4 w-4 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Wand2 className="h-4 w-4 mr-2" />
                Generate Schedule
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}