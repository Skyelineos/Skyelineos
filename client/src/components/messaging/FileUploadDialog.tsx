import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Upload, File, X, AlertCircle, CheckCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface FileUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFilesUploaded: (files: UploadedFile[]) => void;
  maxFiles?: number;
  maxFileSize?: number; // in MB
  allowedTypes?: string[];
}

interface UploadedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string;
}

interface FileUploadState {
  file: File;
  progress: number;
  status: 'uploading' | 'completed' | 'error';
  error?: string;
  uploadedFile?: UploadedFile;
}

export function FileUploadDialog({
  open,
  onOpenChange,
  onFilesUploaded,
  maxFiles = 5,
  maxFileSize = 10,
  allowedTypes = ['image/*', 'application/pdf', '.doc', '.docx', '.txt']
}: FileUploadDialogProps) {
  const [uploadStates, setUploadStates] = useState<FileUploadState[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileSelect = (files: FileList | null) => {
    if (!files) return;

    const validFiles: File[] = [];
    const errors: string[] = [];

    Array.from(files).forEach((file) => {
      // Check file size
      if (file.size > maxFileSize * 1024 * 1024) {
        errors.push(`${file.name} is too large (max ${maxFileSize}MB)`);
        return;
      }

      // Check file type
      const isValidType = allowedTypes.some(type => {
        if (type.includes('*')) {
          return file.type.startsWith(type.replace('*', ''));
        }
        return file.type === type || file.name.toLowerCase().endsWith(type);
      });

      if (!isValidType) {
        errors.push(`${file.name} is not a supported file type`);
        return;
      }

      validFiles.push(file);
    });

    // Check total file count
    if (uploadStates.length + validFiles.length > maxFiles) {
      errors.push(`Cannot upload more than ${maxFiles} files`);
      return;
    }

    if (errors.length > 0) {
      toast({
        title: 'Upload Error',
        description: errors.join(', '),
        variant: 'destructive'
      });
      return;
    }

    // Start uploads
    validFiles.forEach(uploadFile);
  };

  const uploadFile = async (file: File) => {
    const uploadId = Math.random().toString(36).substr(2, 9);
    
    // Add to upload states
    setUploadStates(prev => [...prev, {
      file,
      progress: 0,
      status: 'uploading'
    }]);

    try {
      // Create form data
      const formData = new FormData();
      formData.append('files', file);

      // Upload with progress tracking
      const xhr = new XMLHttpRequest();
      
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const progress = Math.round((e.loaded / e.total) * 100);
          setUploadStates(prev => prev.map(state => 
            state.file === file ? { ...state, progress } : state
          ));
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status === 200) {
          const response = JSON.parse(xhr.responseText);
          const uploadedFile: UploadedFile = {
            id: uploadId,
            name: file.name,
            size: file.size,
            type: file.type,
            url: response.url || response.files?.[0]?.url
          };

          setUploadStates(prev => prev.map(state => 
            state.file === file 
              ? { ...state, status: 'completed', uploadedFile }
              : state
          ));
        } else {
          throw new Error(`Upload failed: ${xhr.statusText}`);
        }
      });

      xhr.addEventListener('error', () => {
        setUploadStates(prev => prev.map(state => 
          state.file === file 
            ? { ...state, status: 'error', error: 'Upload failed' }
            : state
        ));
      });

      xhr.open('POST', '/api/messaging/upload');
      
      // Add auth header if available
      const token = localStorage.getItem('accessToken');
      if (token) {
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      }
      
      xhr.send(formData);

    } catch (error) {
      setUploadStates(prev => prev.map(state => 
        state.file === file 
          ? { ...state, status: 'error', error: error instanceof Error ? error.message : 'Upload failed' }
          : state
      ));
    }
  };

  const removeFile = (file: File) => {
    setUploadStates(prev => prev.filter(state => state.file !== file));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    handleFileSelect(e.dataTransfer.files);
  };

  const handleComplete = () => {
    const completedFiles = uploadStates
      .filter(state => state.status === 'completed' && state.uploadedFile)
      .map(state => state.uploadedFile!);
    
    if (completedFiles.length > 0) {
      onFilesUploaded(completedFiles);
    }
    
    setUploadStates([]);
    onOpenChange(false);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const completedCount = uploadStates.filter(s => s.status === 'completed').length;
  const allCompleted = uploadStates.length > 0 && uploadStates.every(s => s.status === 'completed');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Upload Files</DialogTitle>
          <DialogDescription>
            Upload files to share in this conversation
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Upload Area */}
          <div
            className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
              isDragOver 
                ? 'border-blue-500 bg-blue-50' 
                : 'border-gray-300 hover:border-gray-400'
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <Upload className="h-8 w-8 mx-auto mb-2 text-gray-400" />
            <p className="text-sm text-gray-600 mb-2">
              Drag and drop files here, or{' '}
              <button
                type="button"
                className="text-blue-600 hover:text-blue-700 underline"
                onClick={() => fileInputRef.current?.click()}
              >
                browse
              </button>
            </p>
            <p className="text-xs text-gray-400">
              Max {maxFiles} files, {maxFileSize}MB each
            </p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              accept={allowedTypes.join(',')}
              onChange={(e) => handleFileSelect(e.target.files)}
            />
          </div>

          {/* Upload Progress */}
          {uploadStates.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Uploading Files</span>
                <Badge variant="secondary">
                  {completedCount}/{uploadStates.length}
                </Badge>
              </div>
              
              {uploadStates.map((state, index) => (
                <div key={index} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <File className="h-4 w-4" />
                      <span className="text-sm truncate">{state.file.name}</span>
                      <span className="text-xs text-gray-500">
                        {formatFileSize(state.file.size)}
                      </span>
                    </div>
                    <div className="flex items-center space-x-2">
                      {state.status === 'completed' && (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      )}
                      {state.status === 'error' && (
                        <AlertCircle className="h-4 w-4 text-red-500" />
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeFile(state.file)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  
                  {state.status === 'uploading' && (
                    <Progress value={state.progress} className="h-2" />
                  )}
                  
                  {state.status === 'error' && (
                    <p className="text-xs text-red-500">{state.error}</p>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end space-x-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            {uploadStates.length > 0 && (
              <Button 
                onClick={handleComplete}
                disabled={!allCompleted}
                className="bg-[var(--accent-color)] hover:bg-[var(--accent-color)]/90"
              >
                Add Files ({completedCount})
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}