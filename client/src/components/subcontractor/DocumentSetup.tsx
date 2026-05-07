import React, { useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Upload, FileText, CheckCircle, AlertCircle, Download } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';

interface DocumentSetupProps {
  contactId: number;
  onCompleted?: () => void;
}

export default function DocumentSetup({ contactId, onCompleted }: DocumentSetupProps) {
  const [selectedFiles, setSelectedFiles] = useState<{ [key: string]: File | null }>({
    w9: null,
    insurance: null
  });
  const [agreementAccepted, setAgreementAccepted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const fileInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({
    w9: null,
    insurance: null
  });
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Query to get current document status
  const { data: documentStatus, isLoading } = useQuery({
    queryKey: ['/api/contacts', contactId, 'documents'],
    select: (data: any) => ({
      w9Uploaded: data?.w9Uploaded || false,
      insuranceUploaded: data?.insuranceUploaded || false,
      agreementSigned: data?.agreementSigned || false,
      isFirstLogin: data?.isFirstLogin !== false // Default to true if not set
    })
  });

  // Query to get default agreement
  const { data: defaultAgreement } = useQuery({
    queryKey: ['/api/system-settings/default_subcontractor_agreement'],
    select: (data: any) => data?.settingValue || null
  });

  // Query to get custom agreement for this contact
  const { data: customAgreement } = useQuery({
    queryKey: ['/api/contacts', contactId, 'custom-agreement'],
    select: (data: any) => data?.customAgreementUrl || null
  });

  // Mutation to upload documents and complete setup
  const setupMutation = useMutation({
    mutationFn: async () => {
      const formData = new FormData();
      
      // Add files
      if (selectedFiles.w9) {
        formData.append('w9', selectedFiles.w9);
      }
      if (selectedFiles.insurance) {
        formData.append('insurance', selectedFiles.insurance);
      }
      
      // Add agreement acceptance
      formData.append('agreementAccepted', agreementAccepted.toString());
      
      return await apiRequest(`/api/contacts/${contactId}/setup`, 'POST', formData);
    },
    onSuccess: () => {
      toast({
        title: 'Setup Complete!',
        description: 'Your documentation has been uploaded and you can now access the full subcontractor portal.',
      });
      
      // Clear form
      setSelectedFiles({ w9: null, insurance: null });
      setAgreementAccepted(false);
      
      // Clear file inputs
      Object.values(fileInputRefs.current).forEach(input => {
        if (input) input.value = '';
      });
      
      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: ['/api/contacts', contactId, 'documents'] });
      
      // Call completion callback
      onCompleted?.();
    },
    onError: (error: any) => {
      toast({
        title: 'Setup Failed',
        description: error.message || 'Failed to complete setup. Please try again.',
        variant: 'destructive',
      });
    }
  });

  const handleFileSelect = (type: string) => (event: React.ChangeEvent<HTMLInputElement>) => {
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
      
      setSelectedFiles(prev => ({ ...prev, [type]: file }));
    }
  };

  const handleSubmit = () => {
    // Validate required documents
    if (!documentStatus?.w9Uploaded && !selectedFiles.w9) {
      toast({
        title: 'W-9 Required',
        description: 'Please upload your W-9 tax form.',
        variant: 'destructive',
      });
      return;
    }
    
    if (!documentStatus?.insuranceUploaded && !selectedFiles.insurance) {
      toast({
        title: 'Insurance Required',
        description: 'Please upload your insurance certificate.',
        variant: 'destructive',
      });
      return;
    }
    
    // Check if agreement is available and accepted
    const hasAgreement = defaultAgreement || customAgreement;
    if (hasAgreement && !documentStatus?.agreementSigned && !agreementAccepted) {
      toast({
        title: 'Agreement Required',
        description: 'Please read and accept the subcontractor agreement.',
        variant: 'destructive',
      });
      return;
    }
    
    setIsSubmitting(true);
    setupMutation.mutate();
  };

  const isSetupComplete = () => {
    return documentStatus?.w9Uploaded && 
           documentStatus?.insuranceUploaded && 
           (documentStatus?.agreementSigned || !defaultAgreement && !customAgreement);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="w-full max-w-2xl">
          <CardContent className="p-8">
            <div className="animate-pulse space-y-4">
              <div className="h-6 bg-gray-200 rounded w-3/4"></div>
              <div className="h-4 bg-gray-200 rounded w-1/2"></div>
              <div className="h-4 bg-gray-200 rounded w-2/3"></div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isSetupComplete()) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="w-full max-w-2xl">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <CheckCircle className="h-16 w-16 text-green-600" />
            </div>
            <CardTitle className="text-2xl text-green-800">Setup Complete!</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-gray-600">
              Your documentation has been successfully uploaded and verified. 
              You can now access the full subcontractor portal.
            </p>
            <Button onClick={onCompleted} size="lg">
              Continue to Portal
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const agreementUrl = customAgreement || defaultAgreement;

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Welcome to the Subcontractor Portal!</CardTitle>
          <p className="text-gray-600 mt-2">
            Before you begin, please upload your required documents and review our agreement.
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* W-9 Upload */}
          <div className="border rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2">
              {documentStatus?.w9Uploaded ? (
                <CheckCircle className="h-5 w-5 text-green-600" />
              ) : (
                <AlertCircle className="h-5 w-5 text-yellow-600" />
              )}
              <h3 className="font-medium">W-9 Tax Form</h3>
              {documentStatus?.w9Uploaded ? (
                <Badge className="bg-green-100 text-green-800">Uploaded</Badge>
              ) : (
                <Badge variant="outline" className="border-red-500 text-red-700">Required</Badge>
              )}
            </div>
            <p className="text-sm text-gray-600">
              Required for tax reporting and 1099 issuance at year-end.
            </p>
            
            {!documentStatus?.w9Uploaded && (
              <div className="flex items-center gap-4">
                <input
                  ref={(el) => fileInputRefs.current.w9 = el}
                  type="file"
                  accept=".pdf"
                  onChange={handleFileSelect('w9')}
                  className="hidden"
                />
                <Button
                  variant="outline"
                  onClick={() => fileInputRefs.current.w9?.click()}
                  className="flex items-center gap-2"
                >
                  <Upload className="h-4 w-4" />
                  Select W-9 PDF
                </Button>
                {selectedFiles.w9 && (
                  <span className="text-sm text-green-600">
                    ✓ {selectedFiles.w9.name}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Insurance Upload */}
          <div className="border rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2">
              {documentStatus?.insuranceUploaded ? (
                <CheckCircle className="h-5 w-5 text-green-600" />
              ) : (
                <AlertCircle className="h-5 w-5 text-yellow-600" />
              )}
              <h3 className="font-medium">Insurance Certificate</h3>
              {documentStatus?.insuranceUploaded ? (
                <Badge className="bg-green-100 text-green-800">Uploaded</Badge>
              ) : (
                <Badge variant="outline" className="border-red-500 text-red-700">Required</Badge>
              )}
            </div>
            <p className="text-sm text-gray-600">
              General liability and workers compensation insurance documentation.
            </p>
            
            {!documentStatus?.insuranceUploaded && (
              <div className="flex items-center gap-4">
                <input
                  ref={(el) => fileInputRefs.current.insurance = el}
                  type="file"
                  accept=".pdf"
                  onChange={handleFileSelect('insurance')}
                  className="hidden"
                />
                <Button
                  variant="outline"
                  onClick={() => fileInputRefs.current.insurance?.click()}
                  className="flex items-center gap-2"
                >
                  <Upload className="h-4 w-4" />
                  Select Insurance PDF
                </Button>
                {selectedFiles.insurance && (
                  <span className="text-sm text-green-600">
                    ✓ {selectedFiles.insurance.name}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Agreement Section */}
          {agreementUrl && !documentStatus?.agreementSigned && (
            <div className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-theme-primary" />
                <h3 className="font-medium">Subcontractor Agreement</h3>
                <Badge variant="outline" className="border-theme-accent text-theme-primary">Required</Badge>
              </div>
              <p className="text-sm text-gray-600">
                Please review and accept our subcontractor agreement before continuing.
              </p>
              
              <div className="flex items-center gap-4">
                <Button
                  variant="outline"
                  onClick={() => window.open(agreementUrl, '_blank')}
                  className="flex items-center gap-2"
                >
                  <Download className="h-4 w-4" />
                  View Agreement
                </Button>
              </div>
              
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="agreement"
                  checked={agreementAccepted}
                  onCheckedChange={(checked) => setAgreementAccepted(checked as boolean)}
                />
                <label
                  htmlFor="agreement"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  I have read and agree to the terms of the subcontractor agreement
                </label>
              </div>
            </div>
          )}

          {/* Submit Button */}
          <div className="flex justify-center pt-6">
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting || setupMutation.isPending}
              size="lg"
              className="w-full sm:w-auto"
            >
              {isSubmitting || setupMutation.isPending ? 'Completing Setup...' : 'Complete Setup'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}