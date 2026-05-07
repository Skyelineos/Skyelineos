import React, { useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Upload, FileText, CheckCircle, AlertCircle, Eye, Trash2, Shield } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Badge } from '@/components/ui/badge';
import type { Contact } from '@shared/schema';

interface SubcontractorDocumentsProps {
  contact: Contact;
  onUpdate?: () => void;
}

type DocumentType = 'w9' | 'insurance' | 'agreement';

interface DocumentUpload {
  type: DocumentType;
  label: string;
  description: string;
  required: boolean;
}

const documentTypes: DocumentUpload[] = [
  {
    type: 'w9',
    label: 'W-9 Tax Form',
    description: 'Required for tax reporting and 1099 issuance',
    required: true
  },
  {
    type: 'insurance',
    label: 'Insurance Certificate',
    description: 'General liability and workers compensation insurance',
    required: true
  },
  {
    type: 'agreement',
    label: 'Custom Subcontractor Agreement',
    description: 'Custom agreement specific to this subcontractor (optional if default exists)',
    required: false
  }
];

export default function SubcontractorDocuments({ contact, onUpdate }: SubcontractorDocumentsProps) {
  const [uploadingDoc, setUploadingDoc] = useState<DocumentType | null>(null);
  const fileInputRefs = useRef<{ [key in DocumentType]: HTMLInputElement | null }>({
    w9: null,
    insurance: null,
    agreement: null
  });
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Query to get document status
  const { data: documentStatus, isLoading } = useQuery({
    queryKey: ['/api/contacts', contact.id, 'documents'],
    select: (data: any) => ({
      w9Uploaded: data?.w9Uploaded || false,
      insuranceUploaded: data?.insuranceUploaded || false,
      agreementSigned: data?.agreementSigned || false,
      w9FileUrl: data?.w9FileUrl,
      insuranceFileUrl: data?.insuranceFileUrl,
      customAgreementUrl: data?.customAgreementUrl,
      documentationCompletedAt: data?.documentationCompletedAt
    })
  });

  // Mutation to upload document
  const uploadMutation = useMutation({
    mutationFn: async ({ file, type }: { file: File; type: DocumentType }) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('documentType', type);
      
      return await apiRequest(`/api/contacts/${contact.id}/documents`, 'POST', formData);
    },
    onSuccess: (data, variables) => {
      toast({
        title: 'Document Uploaded',
        description: `${documentTypes.find(d => d.type === variables.type)?.label} has been uploaded successfully.`,
      });
      setUploadingDoc(null);
      
      // Clear file input
      const input = fileInputRefs.current[variables.type];
      if (input) input.value = '';
      
      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: ['/api/contacts', contact.id, 'documents'] });
      queryClient.invalidateQueries({ queryKey: ['/api/contacts'] });
      onUpdate?.();
    },
    onError: (error: any, variables) => {
      toast({
        title: 'Upload Failed',
        description: error.message || `Failed to upload ${documentTypes.find(d => d.type === variables.type)?.label}.`,
        variant: 'destructive',
      });
      setUploadingDoc(null);
    }
  });

  // Mutation to remove document
  const removeMutation = useMutation({
    mutationFn: async (type: DocumentType) => {
      return await apiRequest(`/api/contacts/${contact.id}/documents/${type}`, 'DELETE');
    },
    onSuccess: (data, type) => {
      toast({
        title: 'Document Removed',
        description: `${documentTypes.find(d => d.type === type)?.label} has been removed.`,
      });
      
      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: ['/api/contacts', contact.id, 'documents'] });
      queryClient.invalidateQueries({ queryKey: ['/api/contacts'] });
      onUpdate?.();
    },
    onError: (error: any) => {
      toast({
        title: 'Removal Failed',
        description: error.message || 'Failed to remove document.',
        variant: 'destructive',
      });
    }
  });

  const handleFileSelect = (type: DocumentType) => (event: React.ChangeEvent<HTMLInputElement>) => {
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
      
      setUploadingDoc(type);
      uploadMutation.mutate({ file, type });
    }
  };

  const getStatusIcon = (type: DocumentType) => {
    const isUploaded = type === 'w9' ? documentStatus?.w9Uploaded :
                      type === 'insurance' ? documentStatus?.insuranceUploaded :
                      documentStatus?.agreementSigned;
    
    return isUploaded ? (
      <CheckCircle className="h-4 w-4 text-green-600" />
    ) : (
      <AlertCircle className="h-4 w-4 text-yellow-600" />
    );
  };

  const getStatusBadge = (type: DocumentType) => {
    const isUploaded = type === 'w9' ? documentStatus?.w9Uploaded :
                      type === 'insurance' ? documentStatus?.insuranceUploaded :
                      documentStatus?.agreementSigned;
    
    return isUploaded ? (
      <Badge variant="accent" className="bg-green-100 text-green-800">
        Uploaded
      </Badge>
    ) : (
      <Badge variant="outline" className="border-yellow-500 text-yellow-700">
        Required
      </Badge>
    );
  };

  const getDocumentUrl = (type: DocumentType) => {
    return type === 'w9' ? documentStatus?.w9FileUrl :
           type === 'insurance' ? documentStatus?.insuranceFileUrl :
           documentStatus?.customAgreementUrl;
  };

  const getComplianceStatus = () => {
    if (!documentStatus) return { status: 'unknown', message: 'Loading...' };
    
    const w9Complete = documentStatus.w9Uploaded;
    const insuranceComplete = documentStatus.insuranceUploaded;
    const agreementComplete = documentStatus.agreementSigned;
    
    if (w9Complete && insuranceComplete && agreementComplete) {
      return { 
        status: 'complete', 
        message: `Documentation completed on ${documentStatus.documentationCompletedAt ? new Date(documentStatus.documentationCompletedAt).toLocaleDateString() : 'recently'}` 
      };
    }
    
    const missing = [];
    if (!w9Complete) missing.push('W-9');
    if (!insuranceComplete) missing.push('Insurance');
    if (!agreementComplete) missing.push('Agreement');
    
    return { 
      status: 'incomplete', 
      message: `Missing: ${missing.join(', ')}` 
    };
  };

  if (contact.role !== 'subcontractor') {
    return null;
  }

  if (isLoading) {
    return (
      <Card className="bg-gray-50">
        <CardHeader>
          <CardTitle>Subcontractor Documentation</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
            <div className="h-4 bg-gray-200 rounded w-2/3"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const complianceStatus = getComplianceStatus();

  return (
    <Card className="bg-gray-50">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Subcontractor Documentation
          </span>
          <Badge 
            variant={complianceStatus.status === 'complete' ? 'default' : 'outline'}
            className={complianceStatus.status === 'complete' ? 'bg-green-100 text-green-800' : 'border-yellow-500 text-yellow-700'}
          >
            {complianceStatus.status === 'complete' ? 'Compliant' : 'Incomplete'}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Combined Document Upload Section */}
        <div className="border rounded-lg p-4 space-y-4">
          {documentTypes.map((docType) => {
            const isUploaded = docType.type === 'w9' ? documentStatus?.w9Uploaded :
                              docType.type === 'insurance' ? documentStatus?.insuranceUploaded :
                              documentStatus?.agreementSigned;
            const documentUrl = getDocumentUrl(docType.type);
            const isUploading = uploadingDoc === docType.type;
            
            return (
              <div key={docType.type} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 border rounded-lg">
                <div className="flex items-start gap-3 flex-1">
                  {getStatusIcon(docType.type)}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <h4 className="font-medium text-sm sm:text-base">{docType.label}</h4>
                      {getStatusBadge(docType.type)}
                    </div>
                    <p className="text-xs sm:text-sm text-gray-600 leading-tight">{docType.description}</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-2 sm:flex-shrink-0">
                  {!isUploaded ? (
                    <>
                      <input
                        ref={(el) => fileInputRefs.current[docType.type] = el}
                        type="file"
                        accept=".pdf"
                        onChange={handleFileSelect(docType.type)}
                        className="hidden"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => fileInputRefs.current[docType.type]?.click()}
                        disabled={isUploading}
                        className="flex items-center gap-2 text-xs sm:text-sm px-3 py-2 h-8 sm:h-9"
                      >
                        <Upload className="h-3 w-3 sm:h-4 sm:w-4" />
                        <span className="hidden sm:inline">Upload {docType.label}</span>
                        <span className="sm:hidden">Upload</span>
                      </Button>
                    </>
                  ) : (
                    <>
                      {documentUrl && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => window.open(documentUrl, '_blank')}
                          className="h-8 w-8 sm:h-9 sm:w-9 p-0"
                        >
                          <Eye className="h-3 w-3 sm:h-4 sm:w-4" />
                        </Button>
                      )}
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => removeMutation.mutate(docType.type)}
                        disabled={removeMutation.isPending}
                        className="h-8 w-8 sm:h-9 sm:w-9 p-0"
                      >
                        <Trash2 className="h-3 w-3 sm:h-4 sm:w-4" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Status Section */}
        <div className="border rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              <h4 className="font-medium">Status</h4>
            </div>
            <div className="flex items-center gap-2">
              <Badge 
                variant={complianceStatus.status === 'complete' ? 'default' : 'outline'}
                className={`${complianceStatus.status === 'complete' 
                  ? 'bg-green-100 text-green-800' 
                  : 'bg-red-100 text-red-800 border-red-200'
                }`}
              >
                {complianceStatus.status === 'complete' ? 'Active' : 'Insurance Expired'}
              </Badge>
              {documentStatus?.w9Uploaded && (
                <Badge className="bg-green-100 text-green-800">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  W-9 Complete
                </Badge>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}