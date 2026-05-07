import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { 
  DollarSign, 
  Calendar, 
  FileText, 
  Building2, 
  User, 
  Phone, 
  Mail, 
  Clock,
  CheckCircle2,
  Award,
  ExternalLink,
  Download,
  Eye
} from 'lucide-react';
import { format } from 'date-fns';

interface BidSubmissionDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  bidResponseId: number | null;
}

export function BidSubmissionDetailsModal({ 
  isOpen, 
  onClose, 
  bidResponseId 
}: BidSubmissionDetailsModalProps) {
  const { toast } = useToast();
  const [bidDetails, setBidDetails] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && bidResponseId) {
      fetchBidDetails();
    }
  }, [isOpen, bidResponseId]);

  const fetchBidDetails = async () => {
    if (!bidResponseId) return;
    
    setLoading(true);
    try {
      const response = await fetch(`/api/bid-responses/${bidResponseId}/details`);
      if (!response.ok) {
        throw new Error('Failed to fetch bid details');
      }
      const data = await response.json();
      setBidDetails(data);
    } catch (error) {
      console.error('Error fetching bid details:', error);
      toast({
        title: "Error",
        description: "Failed to load bid submission details",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'awarded':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'declined':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'submitted':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'awarded':
        return <Award className="w-4 h-4" />;
      case 'submitted':
        return <CheckCircle2 className="w-4 h-4" />;
      default:
        return <Clock className="w-4 h-4" />;
    }
  };

  const handleFilePreview = (filename: string) => {
    // Open file in new tab for preview
    window.open(`/uploads/${filename}`, '_blank');
  };

  const handleFileDownload = (filename: string) => {
    // Trigger download
    const link = document.createElement('a');
    link.href = `/uploads/${filename}`;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!bidDetails && !loading) {
    return null;
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Bid Submission Details
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-theme-primary"></div>
            <span className="ml-3">Loading bid details...</span>
          </div>
        ) : bidDetails ? (
          <div className="space-y-6">
            {/* Contractor Information */}
            <Card className="bg-gray-50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="w-5 h-5" />
                  Contractor Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <User className="w-4 h-4 text-gray-500" />
                      <div>
                        <p className="text-sm text-gray-600">Contact Person</p>
                        <p className="font-semibold">{bidDetails.contractor.name}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Building2 className="w-4 h-4 text-gray-500" />
                      <div>
                        <p className="text-sm text-gray-600">Company</p>
                        <p className="font-semibold">{bidDetails.contractor.company}</p>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <Mail className="w-4 h-4 text-gray-500" />
                      <div>
                        <p className="text-sm text-gray-600">Email</p>
                        <p className="font-semibold">{bidDetails.contractor.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Phone className="w-4 h-4 text-gray-500" />
                      <div>
                        <p className="text-sm text-gray-600">Phone</p>
                        <p className="font-semibold">{bidDetails.contractor.phone}</p>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-theme-primary border-blue-200">
                    {bidDetails.contractor.trade}
                  </Badge>
                </div>
              </CardContent>
            </Card>

            {/* Project & Trade Information */}
            <Card className="bg-gray-50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  Project & Trade Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-600">Project</p>
                    <p className="font-semibold">{bidDetails.project.name}</p>
                    <p className="text-sm text-gray-500">{bidDetails.project.clientName}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Trade Work</p>
                    <p className="font-semibold">{bidDetails.estimateItem.trade}</p>
                    {bidDetails.estimateItem.description && (
                      <p className="text-sm text-gray-500">{bidDetails.estimateItem.description}</p>
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Original Estimate</p>
                  <p className="font-semibold text-gray-900">{formatCurrency(bidDetails.estimateItem.estimatedCost)}</p>
                </div>
              </CardContent>
            </Card>

            {/* Bid Submission Details */}
            <Card className="bg-gray-50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="w-5 h-5" />
                  Bid Submission
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center p-4 bg-green-50 rounded-lg border border-green-200">
                    <DollarSign className="w-6 h-6 text-green-600 mx-auto mb-2" />
                    <p className="text-sm text-gray-600">Bid Amount</p>
                    <p className="text-2xl font-bold text-green-600">{formatCurrency(bidDetails.bidAmount)}</p>
                  </div>
                  <div className="text-center p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <Calendar className="w-6 h-6 text-theme-primary mx-auto mb-2" />
                    <p className="text-sm text-gray-600">Timeline</p>
                    <p className="text-2xl font-bold text-theme-primary">{bidDetails.timeline}</p>
                    <p className="text-xs text-gray-500">days</p>
                  </div>
                  <div className="text-center p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <div className="mx-auto mb-2">{getStatusIcon(bidDetails.status)}</div>
                    <p className="text-sm text-gray-600">Status</p>
                    <Badge className={getStatusColor(bidDetails.status)}>
                      {bidDetails.status.charAt(0).toUpperCase() + bidDetails.status.slice(1)}
                    </Badge>
                  </div>
                </div>

                {/* Submission Timeline */}
                <div className="border-t pt-4">
                  <div className="flex items-center gap-4 text-sm text-gray-600">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      <span>Submitted: {format(new Date(bidDetails.submittedAt), 'MMM d, yyyy h:mm a')}</span>
                    </div>
                    {bidDetails.awardedAt && (
                      <div className="flex items-center gap-2">
                        <Award className="w-4 h-4 text-green-600" />
                        <span>Awarded: {format(new Date(bidDetails.awardedAt), 'MMM d, yyyy h:mm a')}</span>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Notes Section */}
            {bidDetails.notes && (
              <Card className="bg-gray-50">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="w-5 h-5" />
                    Bid Notes & Comments
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <p className="text-gray-800 whitespace-pre-wrap">{bidDetails.notes}</p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Attachments Section */}
            {bidDetails.attachments && bidDetails.attachments.length > 0 && (
              <Card className="bg-gray-50">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="w-5 h-5" />
                    Submitted Documents ({bidDetails.attachments.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {bidDetails.attachments.map((attachment: any, index: number) => {
                      // Handle both string and object attachment formats
                      const filename = typeof attachment === 'string' ? attachment : attachment.filename;
                      const originalName = typeof attachment === 'string' ? attachment : (attachment.originalName || attachment.filename);
                      const fileSize = typeof attachment === 'object' ? attachment.size : null;
                      
                      return (
                        <div 
                          key={index}
                          className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50"
                        >
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <FileText className="w-5 h-5 text-theme-primary flex-shrink-0" />
                            <div className="min-w-0 flex-1">
                              <p className="font-medium text-gray-900 truncate">{originalName}</p>
                              <p className="text-xs text-gray-500">
                                {fileSize ? `Document • ${(fileSize / 1024 / 1024).toFixed(2)} MB` : 'Document'}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleFilePreview(filename)}
                              className="h-8 w-8 p-0"
                              title="Preview file"
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleFileDownload(filename)}
                              className="h-8 w-8 p-0"
                              title="Download file"
                            >
                              <Download className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Cost Comparison */}
            <Card className="bg-gray-50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="w-5 h-5" />
                  Cost Analysis
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Original Estimate:</span>
                    <span className="font-semibold">{formatCurrency(bidDetails.estimateItem.estimatedCost)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Submitted Bid:</span>
                    <span className="font-semibold">{formatCurrency(bidDetails.bidAmount)}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between items-center">
                    <span className="font-semibold">Difference:</span>
                    <span className={`font-bold ${
                      bidDetails.bidAmount > bidDetails.estimateItem.estimatedCost ? 'text-red-600' : 'text-green-600'
                    }`}>
                      {bidDetails.bidAmount > bidDetails.estimateItem.estimatedCost ? '+' : ''}
                      {formatCurrency(bidDetails.bidAmount - bidDetails.estimateItem.estimatedCost)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-500">Percentage:</span>
                    <span className={`font-medium ${
                      bidDetails.bidAmount > bidDetails.estimateItem.estimatedCost ? 'text-red-600' : 'text-green-600'
                    }`}>
                      {bidDetails.bidAmount > bidDetails.estimateItem.estimatedCost ? '+' : ''}
                      {(((bidDetails.bidAmount - bidDetails.estimateItem.estimatedCost) / bidDetails.estimateItem.estimatedCost) * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="text-center py-8">
            <p className="text-gray-500">No bid details available</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}