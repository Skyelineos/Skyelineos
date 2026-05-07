import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { 
  Building2, 
  Phone, 
  Mail, 
  MessageSquare, 
  Download, 
  Calendar, 
  CheckCircle, 
  XCircle,
  FileText,
  AlertTriangle,
  Clock,
  User,
  CheckSquare,
  Square
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface AwardedJobViewProps {
  jobItem: {
    id: string;
    trade: string;
    description: string;
    estimatedCost: number;
    status: string;
    projectId: string;
    awardedSubcontractor?: {
      id: string;
      name: string;
      company: string;
      email?: string;
      phone?: string;
      avatar?: string;
    };
    contractTotal?: number;
    agreementSigned?: boolean;
    startDate?: string;
    duration?: number;
    scheduleStatus?: 'not_started' | 'in_progress' | 'completed' | 'delayed';
    bidDocuments?: Array<{
      filename: string;
      originalName: string;
      size: number;
      mimetype: string;
      path: string;
    }>;
  };
  onClose: () => void;
}

interface RequiredDocument {
  id: string;
  name: string;
  uploaded: boolean;
  required: boolean;
  uploadedAt?: string;
  filename?: string;
}

interface RequiredInput {
  id: string;
  name: string;
  completed: boolean;
  required: boolean;
  completedAt?: string;
}

export function AwardedJobView({ jobItem, onClose }: AwardedJobViewProps) {
  const { toast } = useToast();
  const [showScheduleEdit, setShowScheduleEdit] = useState(false);
  
  // Mock data for required documents - in real app, this would come from API
  const [requiredDocs, setRequiredDocs] = useState<RequiredDocument[]>([
    { id: 'signed_bid', name: 'Signed Bid', uploaded: true, required: true, uploadedAt: '2025-01-28', filename: 'signed_bid.pdf' },
    { id: 'w9', name: 'W-9 Form', uploaded: true, required: true, uploadedAt: '2025-01-27', filename: 'w9_form.pdf' },
    { id: 'insurance', name: 'Insurance Certificate', uploaded: true, required: true, uploadedAt: '2025-01-26', filename: 'insurance_cert.pdf' },
    { id: 'custom_agreement', name: 'Custom Subcontractor Agreement', uploaded: false, required: true }
  ]);

  // Mock data for required inputs - in real app, this would come from API
  const [requiredInputs, setRequiredInputs] = useState<RequiredInput[]>([
    { id: 'signed_agreement', name: 'Signed Agreement', completed: false, required: true },
    { id: 'w9_upload', name: 'W-9', completed: true, required: true, completedAt: '2025-01-27' },
    { id: 'insurance_upload', name: 'Insurance Certificate', completed: true, required: true, completedAt: '2025-01-26' },
    { id: 'schedule_confirmation', name: 'Submit Schedule Confirmation', completed: false, required: true },
    { id: 'materials_ordered', name: 'Confirm Materials Ordered', completed: false, required: true }
  ]);

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Not set';
    return new Date(dateString).toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });
  };

  const getScheduleStatusColor = (status?: string) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-800';
      case 'in_progress': return 'bg-blue-100 text-blue-800';
      case 'delayed': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getScheduleStatusText = (status?: string) => {
    switch (status) {
      case 'completed': return 'Completed';
      case 'in_progress': return 'In Progress';
      case 'delayed': return 'Delayed';
      default: return 'Not Started';
    }
  };

  const handleDownloadDocument = (doc: RequiredDocument) => {
    if (!doc.uploaded) return;
    
    toast({
      title: "Download Started",
      description: `Downloading ${doc.name}...`,
    });
  };

  const handleMessageSubcontractor = () => {
    toast({
      title: "Opening Messages",
      description: `Starting conversation with ${jobItem.awardedSubcontractor?.name}...`,
    });
  };

  const toggleRequiredInput = (inputId: string) => {
    setRequiredInputs(prev => prev.map(input => 
      input.id === inputId 
        ? { 
            ...input, 
            completed: !input.completed,
            completedAt: !input.completed ? new Date().toISOString() : undefined
          }
        : input
    ));
  };

  const completedInputs = requiredInputs.filter(input => input.completed).length;
  const completionPercentage = (completedInputs / requiredInputs.length) * 100;

  if (!jobItem.awardedSubcontractor) {
    return (
      <div className="p-6 text-center">
        <AlertTriangle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
        <h3 className="text-lg font-semibold mb-2">No Subcontractor Awarded</h3>
        <p className="text-gray-600">This job hasn't been awarded to a subcontractor yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header: Trade & Sub Info */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <Avatar className="w-16 h-16">
            <AvatarFallback className="text-lg font-semibold bg-blue-100 text-theme-primary">
              {jobItem.awardedSubcontractor.name.split(' ').map(n => n[0]).join('')}
            </AvatarFallback>
          </Avatar>
          
          <div className="space-y-2">
            <div className="flex items-center gap-4">
              <h2 className="text-xl font-bold">{jobItem.trade}</h2>
              <Badge variant="outline" className="text-sm">
                {jobItem.awardedSubcontractor.company}
              </Badge>
            </div>
            
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">Contract Total:</span>
                <span className="font-bold text-lg text-green-700">
                  ${(jobItem.contractTotal || jobItem.estimatedCost).toLocaleString()}
                </span>
              </div>
              
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">Agreement Signed:</span>
                {jobItem.agreementSigned ? (
                  <CheckCircle className="w-5 h-5 text-green-600" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-600" />
                )}
              </div>
            </div>
            
            <div className="flex items-center gap-4 text-sm">
              {jobItem.awardedSubcontractor.phone && (
                <Button variant="ghost" size="sm" className="h-8 px-2">
                  <Phone className="w-4 h-4 mr-1" />
                  {jobItem.awardedSubcontractor.phone}
                </Button>
              )}
              
              {jobItem.awardedSubcontractor.email && (
                <Button variant="ghost" size="sm" className="h-8 px-2">
                  <Mail className="w-4 h-4 mr-1" />
                  {jobItem.awardedSubcontractor.email}
                </Button>
              )}
              
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleMessageSubcontractor}
                className="h-8"
              >
                <MessageSquare className="w-4 h-4 mr-1" />
                Message Sub
              </Button>
            </div>
          </div>
        </div>
        
        <Button variant="ghost" size="sm" onClick={onClose}>
          <XCircle className="w-4 h-4" />
        </Button>
      </div>

      <Separator />

      {/* Agreement & Docs Panel */}
      <Card className="bg-gray-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Documents
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Bid Documents Section */}
          {jobItem.bidDocuments && jobItem.bidDocuments.length > 0 && (
            <div className="mb-6">
              <h4 className="font-semibold mb-3 text-green-800">📎 Documents Submitted with Winning Bid</h4>
              <div className="grid grid-cols-1 gap-3">
                {jobItem.bidDocuments.map((doc, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg">
                    <div className="flex items-center gap-3">
                      <CheckCircle className="w-5 h-5 text-green-600" />
                      <div>
                        <p className="font-medium text-green-800">{doc.originalName}</p>
                        <p className="text-xs text-green-600">
                          {(doc.size / 1024).toFixed(1)} KB • {doc.mimetype}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex gap-2">
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => window.open(`/uploads/${doc.filename}`, '_blank')}
                        title="Preview document"
                      >
                        👁️
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => {
                          const link = document.createElement('a');
                          link.href = `/uploads/${doc.filename}`;
                          link.download = doc.originalName;
                          link.click();
                        }}
                        title="Download document"
                      >
                        <Download className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Required Documents Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {requiredDocs.map((doc) => (
              <div key={doc.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  {doc.uploaded ? (
                    <CheckCircle className="w-5 h-5 text-green-600" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-red-600" />
                  )}
                  <div>
                    <p className="font-medium">{doc.name}</p>
                    {doc.uploaded && doc.uploadedAt && (
                      <p className="text-xs text-gray-500">Uploaded {formatDate(doc.uploadedAt)}</p>
                    )}
                  </div>
                </div>
                
                {doc.uploaded ? (
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => handleDownloadDocument(doc)}
                  >
                    <Download className="w-4 h-4" />
                  </Button>
                ) : (
                  <Badge variant="destructive" className="text-xs">
                    Missing
                  </Badge>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Assigned Schedule Block */}
      <Card className="bg-gray-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Schedule
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-6">
              <div>
                <p className="text-sm text-gray-600">Start Date</p>
                <p className="font-semibold">{formatDate(jobItem.startDate)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Duration</p>
                <p className="font-semibold">{jobItem.duration || 'TBD'} days</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Status</p>
                <Badge className={getScheduleStatusColor(jobItem.scheduleStatus)}>
                  {getScheduleStatusText(jobItem.scheduleStatus)}
                </Badge>
              </div>
            </div>
            
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setShowScheduleEdit(!showScheduleEdit)}
            >
              <Clock className="w-4 h-4 mr-1" />
              Adjust Schedule
            </Button>
          </div>
          
          {showScheduleEdit && (
            <div className="border-t pt-4 text-sm text-gray-600">
              <p>Schedule adjustment feature would open here to modify start date and update the Gantt chart.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Required Inputs from Sub */}
      <Card className="bg-gray-50">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckSquare className="w-5 h-5" />
              Required Inputs from Subcontractor
            </div>
            <div className="flex items-center gap-2">
              <Progress value={completionPercentage} className="w-24" />
              <span className="text-sm font-medium">{completedInputs}/{requiredInputs.length}</span>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {requiredInputs.map((input) => (
              <div key={input.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleRequiredInput(input.id)}
                    className="p-0 h-auto"
                  >
                    {input.completed ? (
                      <CheckSquare className="w-5 h-5 text-green-600" />
                    ) : (
                      <Square className="w-5 h-5 text-gray-400" />
                    )}
                  </Button>
                  
                  <div>
                    <p className={`font-medium ${input.completed ? 'line-through text-gray-500' : ''}`}>
                      {input.name}
                    </p>
                    {input.completed && input.completedAt && (
                      <p className="text-xs text-gray-500">
                        Completed {formatDate(input.completedAt)}
                      </p>
                    )}
                  </div>
                </div>
                
                {input.required && !input.completed && (
                  <Badge variant="outline" className="text-xs">
                    Required
                  </Badge>
                )}
              </div>
            ))}
          </div>
          
          {completionPercentage < 100 && (
            <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-yellow-600" />
                <p className="text-sm text-yellow-800">
                  {requiredInputs.filter(i => i.required && !i.completed).length} required items remaining before work can begin.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}