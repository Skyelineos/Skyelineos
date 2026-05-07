import React, { useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Upload, FileText, Trash2 } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

export default function DefaultAgreementUpload() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Query to get current default agreement
  const { data: defaultAgreement, isLoading } = useQuery({
    queryKey: ['/api/system-settings/default_subcontractor_agreement'],
    select: (data: any) => data?.settingValue || null
  });

  // Mutation to upload new default agreement
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('settingKey', 'default_subcontractor_agreement');
      formData.append('description', 'Default subcontractor agreement template');
      
      return await apiRequest('POST', '/api/system-settings/file-upload', formData);
    },
    onSuccess: () => {
      toast({
        title: 'Default Agreement Updated',
        description: 'The default subcontractor agreement has been uploaded successfully.',
      });
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      queryClient.invalidateQueries({ queryKey: ['/api/system-settings/default_subcontractor_agreement'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Upload Failed',
        description: error.message || 'Failed to upload the default agreement.',
        variant: 'destructive',
      });
    }
  });

  // Mutation to remove default agreement
  const removeMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('DELETE', '/api/system-settings/default_subcontractor_agreement');
    },
    onSuccess: () => {
      toast({
        title: 'Default Agreement Removed',
        description: 'The default subcontractor agreement has been removed.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/system-settings/default_subcontractor_agreement'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Removal Failed',
        description: error.message || 'Failed to remove the default agreement.',
        variant: 'destructive',
      });
    }
  });

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.type !== 'application/pdf') {
        toast({
          title: 'Invalid File Type',
          description: 'Please select a PDF file.',
          variant: 'destructive',
        });
        return;
      }
      if (file.size > 10 * 1024 * 1024) { // 10MB limit
        toast({
          title: 'File Too Large',
          description: 'Please select a file smaller than 10MB.',
          variant: 'destructive',
        });
        return;
      }
      setSelectedFile(file);
    }
  };

  const handleUpload = () => {
    if (selectedFile) {
      uploadMutation.mutate(selectedFile);
    }
  };

  const handleRemove = () => {
    removeMutation.mutate();
  };

  if (isLoading) {
    return (
      <Card className="bg-gray-50">
        <CardHeader>
          <CardTitle>Default Subcontractor Agreement</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-gray-50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Default Subcontractor Agreement
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-gray-600">
          Upload a default agreement that will be presented to all new subcontractors. 
          You can also set custom agreements for individual subcontractors in their contact profiles.
        </p>

        {defaultAgreement ? (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-green-600" />
                <span className="text-sm font-medium text-green-800">
                  Default agreement is active
                </span>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(defaultAgreement, '_blank')}
                >
                  View Agreement
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleRemove}
                  disabled={removeMutation.isPending}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <p className="text-sm text-yellow-800">
              No default agreement is currently set. Subcontractors will be prompted to sign 
              individual agreements if available in their contact profiles.
            </p>
          </div>
        )}

        <div className="space-y-4">
          <Label htmlFor="agreement-file">
            {defaultAgreement ? 'Replace Default Agreement' : 'Upload Default Agreement'}
          </Label>
          
          <div className="flex items-center gap-4">
            <input
              ref={fileInputRef}
              id="agreement-file"
              type="file"
              accept=".pdf"
              onChange={handleFileSelect}
              className="hidden"
            />
            
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2"
            >
              <Upload className="h-4 w-4" />
              Select PDF File
            </Button>

            {selectedFile && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">
                  {selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
                </span>
                <Button
                  onClick={handleUpload}
                  disabled={uploadMutation.isPending}
                  size="sm"
                >
                  {uploadMutation.isPending ? 'Uploading...' : 'Upload'}
                </Button>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}