import React, { useState, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
// import { Progress } from "@/components/ui/progress";
import { 
  Upload, 
  FileText, 
  CheckCircle, 
  AlertTriangle, 
  X,
  Download,
  Calendar,
  Clock,
  Link2,
  Users,
  Loader2
} from "lucide-react";
import Papa from 'papaparse';
import { format, parseISO, addDays, isValid } from 'date-fns';

interface CsvRow {
  'Task Name': string;
  'Trade': string;
  'Start Date': string;
  'Duration': string;
  'Dependencies': string;
  'Assigned To': string;
  'Estimate Item IDs': string;
  'Description': string;
}

interface ParsedTask {
  id: string;
  title: string;
  trade: string;
  startDate: Date | null;
  duration: number;
  dependencies: string[];
  assignedTo: string | null;
  estimateItemIds: string[];
  description: string;
  orderIndex: number;
}

interface ValidationError {
  row: number;
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

interface CsvImportDialogProps {
  onImport: (tasks: ParsedTask[]) => void;
  onCancel: () => void;
  isImporting: boolean;
  projectStartDate: Date;
}

export function CsvImportDialog({
  onImport,
  onCancel,
  isImporting,
  projectStartDate
}: CsvImportDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [csvData, setCsvData] = useState<CsvRow[]>([]);
  const [parsedTasks, setParsedTasks] = useState<ParsedTask[]>([]);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [step, setStep] = useState<'upload' | 'validate' | 'preview'>('upload');

  const handleFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile && selectedFile.type === 'text/csv') {
      setFile(selectedFile);
      parseCsvFile(selectedFile);
    }
  }, []);

  const parseCsvFile = useCallback((file: File) => {
    setIsProcessing(true);
    
    Papa.parse(file, {
      header: true,
      complete: (results) => {
        const data = results.data as CsvRow[];
        setCsvData(data);
        validateAndProcessData(data);
        setIsProcessing(false);
      },
      error: (error) => {
        console.error('CSV parsing error:', error);
        setValidationErrors([{
          row: 0,
          field: 'file',
          message: `Failed to parse CSV file: ${error.message}`,
          severity: 'error'
        }]);
        setIsProcessing(false);
      }
    });
  }, []);

  const validateAndProcessData = useCallback((data: CsvRow[]) => {
    const errors: ValidationError[] = [];
    const tasks: ParsedTask[] = [];
    const taskNameMap = new Map<string, number>();

    // First pass: basic validation and task creation
    data.forEach((row, index) => {
      if (!row['Task Name']?.trim()) {
        errors.push({
          row: index + 1,
          field: 'Task Name',
          message: 'Task name is required',
          severity: 'error'
        });
        return;
      }

      const taskName = row['Task Name'].trim();
      const duration = parseInt(row['Duration']?.trim() || '1');
      
      if (isNaN(duration) || duration <= 0) {
        errors.push({
          row: index + 1,
          field: 'Duration',
          message: 'Duration must be a positive number',
          severity: 'error'
        });
      }

      // Check for duplicate task names
      if (taskNameMap.has(taskName.toLowerCase())) {
        errors.push({
          row: index + 1,
          field: 'Task Name',
          message: `Duplicate task name: "${taskName}"`,
          severity: 'error'
        });
      } else {
        taskNameMap.set(taskName.toLowerCase(), index);
      }

      // Parse start date if provided
      let startDate: Date | null = null;
      if (row['Start Date']?.trim()) {
        const parsedDate = parseISO(row['Start Date'].trim());
        if (isValid(parsedDate)) {
          startDate = parsedDate;
        } else {
          errors.push({
            row: index + 1,
            field: 'Start Date',
            message: 'Invalid date format. Use YYYY-MM-DD',
            severity: 'warning'
          });
        }
      }

      // Parse dependencies
      const dependencies = row['Dependencies']?.trim()
        ? row['Dependencies'].split(',').map(dep => dep.trim()).filter(Boolean)
        : [];

      // Parse estimate item IDs
      const estimateItemIds = row['Estimate Item IDs']?.trim()
        ? row['Estimate Item IDs'].split(',').map(id => id.trim()).filter(Boolean)
        : [];

      const task: ParsedTask = {
        id: generateTaskId(taskName),
        title: taskName,
        trade: row['Trade']?.trim() || 'General',
        startDate,
        duration,
        dependencies,
        assignedTo: row['Assigned To']?.trim() || null,
        estimateItemIds,
        description: row['Description']?.trim() || '',
        orderIndex: index
      };

      tasks.push(task);
    });

    // Second pass: validate dependencies
    tasks.forEach((task, index) => {
      task.dependencies.forEach(depName => {
        const depExists = tasks.some(t => t.title.toLowerCase() === depName.toLowerCase());
        if (!depExists) {
          errors.push({
            row: index + 1,
            field: 'Dependencies',
            message: `Dependency "${depName}" not found in task list`,
            severity: 'warning'
          });
        }
      });
    });

    // Third pass: calculate start dates for tasks without them
    const tasksWithCalculatedDates = calculateStartDates(tasks, projectStartDate);

    setValidationErrors(errors);
    setParsedTasks(tasksWithCalculatedDates);
    setStep(errors.some(e => e.severity === 'error') ? 'validate' : 'preview');
  }, [projectStartDate]);

  const calculateStartDates = useCallback((tasks: ParsedTask[], defaultStart: Date): ParsedTask[] => {
    const taskMap = new Map(tasks.map(t => [t.title.toLowerCase(), t]));
    const calculatedTasks = [...tasks];
    
    // Sort by dependencies (tasks with no dependencies first)
    calculatedTasks.sort((a, b) => a.dependencies.length - b.dependencies.length);
    
    calculatedTasks.forEach(task => {
      if (!task.startDate) {
        if (task.dependencies.length === 0) {
          // No dependencies, use project start date
          task.startDate = defaultStart;
        } else {
          // Calculate based on dependencies
          let latestEndDate = defaultStart;
          
          task.dependencies.forEach(depName => {
            const depTask = taskMap.get(depName.toLowerCase());
            if (depTask && depTask.startDate) {
              const depEndDate = addDays(depTask.startDate, depTask.duration);
              if (depEndDate > latestEndDate) {
                latestEndDate = depEndDate;
              }
            }
          });
          
          task.startDate = latestEndDate;
        }
      }
    });
    
    return calculatedTasks;
  }, []);

  const generateTaskId = (taskName: string): string => {
    return taskName.toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '-')
      .substring(0, 50);
  };

  const downloadTemplate = useCallback(() => {
    const templateData = [
      {
        'Task Name': 'Excavation Work',
        'Trade': 'Excavation',
        'Start Date': format(new Date(), 'yyyy-MM-dd'),
        'Duration': '5',
        'Dependencies': '',
        'Assigned To': 'Excavation Sub',
        'Estimate Item IDs': 'est-001, est-002',
        'Description': 'Site excavation and preparation'
      },
      {
        'Task Name': 'Foundation Footings',
        'Trade': 'Concrete',
        'Start Date': '',
        'Duration': '7',
        'Dependencies': 'Excavation Work',
        'Assigned To': 'Concrete Sub',
        'Estimate Item IDs': 'est-003',
        'Description': 'Pour foundation footings'
      },
      {
        'Task Name': 'Framing Work',
        'Trade': 'Framing',
        'Start Date': '',
        'Duration': '10',
        'Dependencies': 'Foundation Footings',
        'Assigned To': 'Framing Crew',
        'Estimate Item IDs': 'est-004, est-005',
        'Description': 'Frame walls and roof structure'
      }
    ];

    const csv = Papa.unparse(templateData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'schedule_template.csv');
    if (link.style) {
      link.style.visibility = 'hidden';
    }
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, []);

  const handleImport = useCallback(() => {
    if (parsedTasks.length > 0) {
      onImport(parsedTasks);
    }
  }, [parsedTasks, onImport]);

  const errorCount = validationErrors.filter(e => e.severity === 'error').length;
  const warningCount = validationErrors.filter(e => e.severity === 'warning').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Import Schedule from CSV</h3>
          <p className="text-sm text-gray-500">
            Upload a CSV file to create schedule tasks with dependencies
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={downloadTemplate}>
          <Download className="w-4 h-4 mr-2" />
          Download Template
        </Button>
      </div>

      {/* Step 1: File Upload */}
      {step === 'upload' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="w-4 h-4" />
              Upload CSV File
            </CardTitle>
            <CardDescription>
              Select a CSV file with your schedule data. Required columns: Task Name, Duration
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <Label htmlFor="csv-file">Choose CSV File</Label>
                <Input
                  id="csv-file"
                  type="file"
                  accept=".csv"
                  onChange={handleFileChange}
                  disabled={isProcessing}
                />
              </div>
              
              {isProcessing && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Processing CSV file...
                </div>
              )}

              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="font-medium mb-2">Expected CSV Format:</h4>
                <div className="text-sm text-gray-600 space-y-1">
                  <div><strong>Task Name</strong> - Required, unique name for each task</div>
                  <div><strong>Trade</strong> - Optional, trade category</div>
                  <div><strong>Start Date</strong> - Optional, YYYY-MM-DD format</div>
                  <div><strong>Duration</strong> - Required, number of days</div>
                  <div><strong>Dependencies</strong> - Optional, comma-separated task names</div>
                  <div><strong>Assigned To</strong> - Optional, assigned contact</div>
                  <div><strong>Estimate Item IDs</strong> - Optional, comma-separated IDs</div>
                  <div><strong>Description</strong> - Optional, task description</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Validation Errors */}
      {step === 'validate' && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-500" />
                Validation Issues
              </CardTitle>
              <CardDescription>
                Please fix the following issues before importing
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-64">
                <div className="space-y-2">
                  {validationErrors.map((error, index) => (
                    <Alert key={index} variant={error.severity === 'error' ? 'destructive' : 'default'}>
                      <AlertDescription>
                        <strong>Row {error.row}, {error.field}:</strong> {error.message}
                      </AlertDescription>
                    </Alert>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setStep('upload')}>
              Back to Upload
            </Button>
            {errorCount === 0 && (
              <Button onClick={() => setStep('preview')}>
                Continue to Preview
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Step 3: Preview */}
      {step === 'preview' && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-500" />
                Import Preview
              </CardTitle>
              <CardDescription>
                {parsedTasks.length} tasks ready to import
                {warningCount > 0 && ` (${warningCount} warnings)`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Summary Stats */}
              <div className="grid grid-cols-4 gap-4 mb-4">
                <div className="text-center">
                  <div className="text-2xl font-bold">{parsedTasks.length}</div>
                  <div className="text-sm text-gray-500">Tasks</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold">
                    {new Set(parsedTasks.map(t => t.trade)).size}
                  </div>
                  <div className="text-sm text-gray-500">Trades</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold">
                    {parsedTasks.reduce((sum, t) => sum + t.duration, 0)}
                  </div>
                  <div className="text-sm text-gray-500">Total Days</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold">
                    {parsedTasks.filter(t => t.dependencies.length > 0).length}
                  </div>
                  <div className="text-sm text-gray-500">With Dependencies</div>
                </div>
              </div>

              <Separator className="my-4" />

              {/* Task List */}
              <ScrollArea className="h-64">
                <div className="space-y-2">
                  {parsedTasks.map((task, index) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium">{task.title}</h4>
                          <Badge variant="outline">{task.trade}</Badge>
                        </div>
                        <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {task.startDate ? format(task.startDate, 'MMM dd') : 'TBD'}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {task.duration}d
                          </span>
                          {task.dependencies.length > 0 && (
                            <span className="flex items-center gap-1">
                              <Link2 className="w-3 h-3" />
                              {task.dependencies.length} deps
                            </span>
                          )}
                          {task.assignedTo && (
                            <span className="flex items-center gap-1">
                              <Users className="w-3 h-3" />
                              {task.assignedTo}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Warnings */}
          {warningCount > 0 && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                {warningCount} warnings detected. Tasks will still be imported, but please review:
                <ScrollArea className="h-20 mt-2">
                  <div className="space-y-1">
                    {validationErrors
                      .filter(e => e.severity === 'warning')
                      .map((warning, index) => (
                        <div key={index} className="text-xs">
                          Row {warning.row}: {warning.message}
                        </div>
                      ))}
                  </div>
                </ScrollArea>
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex items-center justify-between pt-4 border-t">
        <Button variant="outline" onClick={onCancel} disabled={isImporting}>
          Cancel
        </Button>
        
        <div className="flex items-center gap-2">
          {step === 'preview' && (
            <>
              <Button variant="outline" onClick={() => setStep('upload')}>
                Upload Different File
              </Button>
              <Button
                onClick={handleImport}
                disabled={isImporting || parsedTasks.length === 0}
                className="flex items-center gap-2"
              >
                {isImporting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4" />
                )}
                {isImporting ? 'Importing...' : `Import ${parsedTasks.length} Tasks`}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}