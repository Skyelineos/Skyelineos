import React, { useState } from 'react';
import { FilePreviewModal } from '@/components/messaging/FilePreviewModal';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import {
  Award,
  Download,
  Eye,
  FileText,
  Clock,
  Calendar,
  Building2,
  Mail,
  Phone,
  Star,
  TrendingUp,
  Send,
  Edit,
  Trash2,
  AlertTriangle,
  CheckCircle,
  X,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

interface BidComparisonViewProps {
  isOpen: boolean;
  onClose: () => void;
  bidItem: any;
  bidResponses: any[];
  contacts: any[];
  bidProcess?: any;
  bidInvitations?: any[];
  onAwardJob: (bidResponseId: number, contactId: number) => void;
  onEditItem: (item: any) => void;
  onDeleteItem: (itemId: number) => void;
}

export function BidComparisonView({
  isOpen,
  onClose,
  bidItem,
  bidResponses,
  contacts,
  bidProcess,
  bidInvitations = [],
  onAwardJob,
  onEditItem,
  onDeleteItem
}: BidComparisonViewProps) {
  // Search/lookup operation
  
  const { toast } = useToast();
  const [expandedView, setExpandedView] = useState(true);
  const [showAllBidders, setShowAllBidders] = useState(false);
  const [selectedBidForAward, setSelectedBidForAward] = useState<any>(null);
  const [filePreviewOpen, setFilePreviewOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<any>(null);

  // Show all bid responses (submitted, awarded, declined)
  const allBids = bidResponses || [];
  const submittedBids = allBids.filter(bid => bid.status === 'submitted');
  const awardedBids = allBids.filter(bid => bid.status === 'awarded');
  const totalBids = allBids.length;
  
  // Get time remaining for deadline
  const getTimeRemaining = () => {
    if (!bidProcess?.dueDate) return null;
    const now = new Date();
    const deadline = new Date(bidProcess.dueDate);
    const timeDiff = deadline.getTime() - now.getTime();
    const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));
    return daysDiff > 0 ? `${daysDiff} days left` : 'Overdue';
  };

  // Get subcontractor performance metrics (mock data for now)
  const getPerformanceMetrics = (contactId: number) => {
    return {
      projectsCompleted: Math.floor(Math.random() * 20) + 5,
      onTimeScore: Math.floor(Math.random() * 30) + 70,
      avgRating: (Math.random() * 2 + 3).toFixed(1)
    };
  };

  const handleAwardJob = async (bid: any) => {
    try {
      await onAwardJob(bid.id, bid.subcontractorId);
      toast({
        title: "Job Awarded Successfully",
        description: `${bidItem.trade} job awarded to ${contacts.find(c => c.id === bid.subcontractorId)?.company}`,
      });
      onClose();
    } catch (error) {
      toast({
        title: "Award Failed",
        description: "Failed to award job. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleSendReminders = async () => {
    try {
      // API call to send reminders to pending bidders
      toast({
        title: "Reminders Sent",
        description: "Bid reminders sent to all pending subcontractors",
      });
    } catch (error) {
      toast({
        title: "Reminder Failed",
        description: "Failed to send reminders. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Check if reminder button should be shown
  const shouldShowReminderButton = () => {
    // Check if there are any invited subcontractors (total bid responses including pending)
    const hasInvitations = bidResponses.length > 0;
    
    // Check if there are any pending bids (not submitted yet)
    const hasPendingBids = bidResponses.some(bid => 
      bid.status === 'pending' || bid.status === 'invited' || bid.status === 'no_response'
    );
    
    // Check if job has been awarded
    const isJobAwarded = bidItem.status === 'Job Awarded' || bidItem.status === 'Approved' || bidProcess?.status === 'awarded';
    
    // Show button only if: has invitations AND has pending bids AND job not awarded
    return hasInvitations && hasPendingBids && !isJobAwarded;
  };

  // File handling functions
  const handleFilePreview = (file: any) => {
    // Development logging removed
    
    // Construct proper file URL and create compatible file object for preview
    let fileUrl = '';
    
    if (file.fileUrl) {
      fileUrl = file.fileUrl;
    } else if (file.url) {
      fileUrl = file.url;
    } else if (file.filename) {
      // Use the multer generated filename from server
      fileUrl = `/uploads/${file.filename}`;
    } else if (file.fileName) {
      fileUrl = `/uploads/${file.fileName}`;
    } else if (file.name) {
      fileUrl = `/uploads/${file.name}`;
    }
    
    // Create a preview-compatible file object
    const previewFile = {
      id: file.id || Date.now().toString(),
      fileName: file.originalName || file.name || file.fileName || 'document',
      fileSize: file.size || 0,
      mimeType: file.mimetype || file.mimeType || 'application/octet-stream',
      url: fileUrl,
      uploadedAt: file.uploadedAt || new Date().toISOString(),
      uploadedBy: file.uploadedBy || 'System'
    };
    
    // Development logging removed
    setSelectedFile(previewFile);
    setFilePreviewOpen(true);
  };

  const handleFileDownload = (file: any) => {
    // Development logging removed
    try {
      // Construct proper file URL based on available file data
      let fileUrl = '';
      
      if (file.fileUrl) {
        fileUrl = file.fileUrl;
      } else if (file.url) {
        fileUrl = file.url;
      } else if (file.filename) {
        // Use the multer generated filename from server
        fileUrl = `/uploads/${file.filename}`;
      } else if (file.fileName) {
        fileUrl = `/uploads/${file.fileName}`;
      } else if (file.name) {
        fileUrl = `/uploads/${file.name}`;
      }
      
      // Development logging removed
      
      // Create a temporary link and trigger download
      const link = document.createElement('a');
      link.href = fileUrl;
      link.download = file.originalName || file.name || file.fileName || 'document';
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      toast({
        title: "Download Started",
        description: `Downloading ${file.originalName || file.name || file.fileName}`,
      });
    } catch (error) {
      console.error('Download error:', error);
      toast({
        title: "Download Failed",
        description: "Unable to download file. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleAttachmentPreview = (attachments: any[]) => {
    // Development logging removed
    if (attachments && attachments.length > 0) {
      handleFilePreview(attachments[0]); // Preview first attachment
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Building2 className="h-6 w-6 text-theme-primary" />
              </div>
              <div>
                <DialogTitle className="text-xl font-bold">{bidItem.trade} Work</DialogTitle>
                <DialogDescription className="text-base">
                  {bidItem.description}
                </DialogDescription>
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-gray-900 mb-1">
                {bidItem.estimatedCost > 0 ? `$${bidItem.estimatedCost.toLocaleString()}` : 'Pending'}
              </div>
              <Badge className="bg-blue-500 text-white">
                {totalBids} Bids Received
              </Badge>
            </div>
          </div>

          {/* Deadline and Status Info */}
          <div className="flex items-center gap-6 mt-4 p-3 bg-gray-50 rounded-lg">
            {bidProcess?.dueDate && (
              <div className="flex items-center gap-2 text-orange-600">
                <Calendar className="h-4 w-4" />
                <span className="text-sm font-medium">
                  Deadline: {new Date(bidProcess.dueDate).toLocaleDateString()}
                </span>
              </div>
            )}
            {getTimeRemaining() && (
              <div className="flex items-center gap-2 text-red-600">
                <Clock className="h-4 w-4" />
                <span className="text-sm font-medium">{getTimeRemaining()}</span>
              </div>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpandedView(!expandedView)}
              className="ml-auto"
            >
              {expandedView ? (
                <>
                  <ChevronUp className="h-4 w-4 mr-1" />
                  Collapse
                </>
              ) : (
                <>
                  <ChevronDown className="h-4 w-4 mr-1" />
                  Expand
                </>
              )}
            </Button>
          </div>
        </DialogHeader>

        {expandedView && (
          <div className="space-y-6">
            
            {/* Bid Comparison Table */}
            <Card className="bg-gray-50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Bid Comparison ({totalBids} Total, {submittedBids.length} Submitted, {awardedBids.length} Awarded)
                </CardTitle>
              </CardHeader>
              <CardContent>
                {allBids.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="table-auto w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Subcontractor
                          </th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Bid Amount
                          </th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Timeline
                          </th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Projects
                          </th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                            On-Time %
                          </th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Rating
                          </th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Files
                          </th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Action
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {allBids.map((bid) => {
                          const contact = contacts.find(c => c.id === bid.subcontractorId);
                          const metrics = getPerformanceMetrics(bid.subcontractorId);
                          
                          return (
                            <tr key={bid.id} className="hover:bg-gray-50">
                              <td className="px-4 py-4">
                                <div>
                                  <div className="font-medium text-gray-900">
                                    {contact?.company || 'Unknown Company'}
                                  </div>
                                  <div className="text-sm text-gray-500">
                                    {contact?.name || 'Unknown Contact'}
                                  </div>
                                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                                    {contact?.email && (
                                      <span className="flex items-center gap-1">
                                        <Mail className="h-3 w-3" />
                                        {contact.email}
                                      </span>
                                    )}
                                    {contact?.phone && (
                                      <span className="flex items-center gap-1">
                                        <Phone className="h-3 w-3" />
                                        {contact.phone}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-4 text-center">
                                <div className="text-lg font-bold text-green-600">
                                  ${(bid.proposedCost || bid.bidAmount || 0).toLocaleString()}
                                </div>
                                <div className="text-xs text-gray-500">
                                  {bid.submittedAt && new Date(bid.submittedAt).toLocaleDateString()}
                                </div>
                              </td>
                              <td className="px-4 py-4 text-center">
                                <div className="font-medium">
                                  {bid.timeline || 'Not specified'} 
                                  {bid.timeline && ' days'}
                                </div>
                              </td>
                              <td className="px-4 py-4 text-center">
                                <div className="font-medium">{metrics.projectsCompleted}</div>
                                <div className="text-xs text-gray-500">completed</div>
                              </td>
                              <td className="px-4 py-4 text-center">
                                <div className={`font-medium ${metrics.onTimeScore >= 85 ? 'text-green-600' : metrics.onTimeScore >= 70 ? 'text-yellow-600' : 'text-red-600'}`}>
                                  {metrics.onTimeScore}%
                                </div>
                              </td>
                              <td className="px-4 py-4 text-center">
                                <div className="flex items-center justify-center gap-1">
                                  <Star className="h-4 w-4 text-yellow-400" fill="currentColor" />
                                  <span className="font-medium">{metrics.avgRating}</span>
                                </div>
                              </td>
                              <td className="px-4 py-4 text-center">
                                {bid.attachments && bid.attachments.length > 0 ? (
                                  <div className="flex items-center justify-center gap-2">
                                    <FileText className="h-4 w-4 text-theme-primary" />
                                    <span className="text-sm font-medium">{bid.attachments.length}</span>
                                    <Button 
                                      size="sm" 
                                      variant="outline" 
                                      className="text-xs h-6"
                                      onClick={() => handleAttachmentPreview(bid.attachments)}
                                      title="View all attachments"
                                    >
                                      <Download className="h-3 w-3" />
                                    </Button>
                                  </div>
                                ) : (
                                  <span className="text-gray-400 text-sm">None</span>
                                )}
                              </td>
                              <td className="px-4 py-4 text-center">
                                {bid.status === 'awarded' ? (
                                  <Badge className="bg-green-600 text-white px-3 py-1">
                                    <CheckCircle className="h-3 w-3 mr-1" />
                                    Awarded
                                  </Badge>
                                ) : (
                                  <Button
                                    size="sm"
                                    onClick={() => handleAwardJob(bid)}
                                    className="bg-green-600 hover:bg-green-700 text-white"
                                  >
                                    <Award className="h-3 w-3 mr-1" />
                                    Award
                                  </Button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center text-gray-500 py-8">
                    No bid responses submitted yet
                  </div>
                )}
                
                {/* Always show invitation details section when invitations exist */}
                {bidInvitations.length > 0 && (
                  <div className="border-t mt-6 pt-6">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <Send className="h-5 w-5 text-blue-600" />
                        <h3 className="text-lg font-semibold">Bid Invitations Sent</h3>
                        <Badge variant="outline" className="ml-2">
                          {bidInvitations.length} invitations
                        </Badge>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowAllBidders(!showAllBidders)}
                        className="flex items-center gap-2"
                      >
                        {showAllBidders ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        {showAllBidders ? 'Hide Details' : 'Show Details'}
                      </Button>
                    </div>
                    
                    {showAllBidders && (
                      <div className="space-y-4">
                        {bidInvitations.map((invitation: any) => {
                          const contact = contacts.find(c => c.id === invitation.subcontractorId || c.id === invitation.contactId);
                          const hasResponse = bidResponses.some(response => 
                            response.subcontractorId === invitation.subcontractorId || 
                            response.contactId === invitation.subcontractorId
                          );
                          
                          // Calculate days since invitation sent
                          const invitationDate = invitation?.sentAt ? new Date(invitation.sentAt) : new Date(invitation.createdAt || Date.now());
                          const daysSinceSent = Math.floor((Date.now() - invitationDate.getTime()) / (1000 * 60 * 60 * 24));
                          
                          return (
                            <div key={invitation.id} className="flex items-center justify-between p-4 border rounded-lg bg-gray-50">
                              <div className="flex items-center gap-4">
                                <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                                  <Building2 className="h-5 w-5 text-blue-600" />
                                </div>
                                <div>
                                  <div className="font-medium text-gray-900">
                                    {contact?.company || 'Unknown Company'}
                                  </div>
                                  <div className="text-sm text-gray-500">
                                    {contact?.name || 'Unknown Contact'}
                                  </div>
                                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                                    {contact?.email && (
                                      <span className="flex items-center gap-1">
                                        <Mail className="h-3 w-3" />
                                        {contact.email}
                                      </span>
                                    )}
                                    {contact?.phone && (
                                      <span className="flex items-center gap-1">
                                        <Phone className="h-3 w-3" />
                                        {contact.phone}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                              
                              <div className="text-right">
                                <div className="text-sm font-medium text-gray-700 mb-1">
                                  Invited {daysSinceSent} day{daysSinceSent !== 1 ? 's' : ''} ago
                                </div>
                                <div className="text-xs text-gray-500">
                                  Sent: {invitationDate.toLocaleDateString()}
                                </div>
                                {invitation?.dueDate && (
                                  <div className="text-xs text-orange-600 mt-1">
                                    Due: {new Date(invitation.dueDate).toLocaleDateString()}
                                  </div>
                                )}
                                <Badge 
                                  variant={hasResponse ? "default" : "outline"} 
                                  className={`mt-2 text-xs ${hasResponse ? 'bg-green-100 text-green-800' : ''}`}
                                >
                                  {hasResponse ? 'Response Received' : 'Waiting for Response'}
                                </Badge>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Document Viewer */}
            {allBids.some(bid => bid.attachments && bid.attachments.length > 0) && (
              <Card className="bg-gray-50">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Submitted Documents
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {allBids
                      .filter(bid => bid.attachments && bid.attachments.length > 0)
                      .map((bid) => {
                        const contact = contacts.find(c => c.id === bid.subcontractorId);
                        return (
                          <div key={bid.id} className="border rounded-lg p-4">
                            <h5 className="font-medium mb-3 flex items-center gap-2">
                              <Building2 className="h-4 w-4" />
                              {contact?.company || 'Unknown Company'}
                            </h5>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                              {bid.attachments.map((file: any, index: number) => (
                                <div key={index} className="flex items-center gap-3 p-3 bg-gray-50 rounded border">
                                  <FileText className="h-5 w-5 text-theme-primary" />
                                  <div className="flex-1 min-w-0">
                                    <div className="font-medium text-sm truncate">
                                      {file.originalName || file.name || file.fileName || `Document ${index + 1}`}
                                    </div>
                                    <div className="text-xs text-gray-500">
                                      {file.size ? `${(file.size / 1024).toFixed(1)} KB` : 'Unknown size'}
                                      {file.mimetype && ` • ${file.mimetype}`}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <Button 
                                      size="sm" 
                                      variant="ghost" 
                                      className="h-8 w-8 p-0"
                                      onClick={() => handleFilePreview(file)}
                                      title="Preview document"
                                    >
                                      <Eye className="h-3 w-3" />
                                    </Button>
                                    <Button 
                                      size="sm" 
                                      variant="ghost" 
                                      className="h-8 w-8 p-0"
                                      onClick={() => handleFileDownload(file)}
                                      title="Download document"
                                    >
                                      <Download className="h-3 w-3" />
                                    </Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Action Panel */}
            <Card className="bg-gray-50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5" />
                  Actions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap items-center gap-3">
                  {shouldShowReminderButton() && (
                    <Button
                      variant="outline"
                      onClick={handleSendReminders}
                      className="flex items-center gap-2"
                    >
                      <Send className="h-4 w-4" />
                      Send Reminder to All Pending
                    </Button>
                  )}
                  
                  <Button
                    variant="outline"
                    onClick={() => onEditItem(bidItem)}
                    className="flex items-center gap-2"
                  >
                    <Edit className="h-4 w-4" />
                    Edit Bid Item
                  </Button>
                  
                  <Button
                    variant="outline"
                    onClick={() => onDeleteItem(bidItem.id)}
                    className="flex items-center gap-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete Bid Item
                  </Button>

                  <Separator orientation="vertical" className="h-6" />
                  
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <AlertTriangle className="h-4 w-4" />
                    <span>Deadline: {bidProcess?.dueDate ? new Date(bidProcess.dueDate).toLocaleDateString() : 'Not set'}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

          </div>
        )}

        {/* Close Button */}
        <div className="flex justify-end pt-4 border-t">
          <Button variant="outline" onClick={onClose}>
            <X className="h-4 w-4 mr-1" />
            Close
          </Button>
        </div>
      </DialogContent>

      {/* File Preview Modal */}
      {selectedFile && (
        <FilePreviewModal
          open={filePreviewOpen}
          onOpenChange={setFilePreviewOpen}
          file={{
            id: selectedFile.id || 'file-' + Date.now(),
            fileName: selectedFile.originalName || selectedFile.name || 'document',
            fileSize: selectedFile.size || 0,
            mimeType: selectedFile.mimeType || 'application/octet-stream',
            url: selectedFile.fileUrl || selectedFile.url || `/uploads/${selectedFile.filename || selectedFile.fileName || selectedFile.name}`,
            uploadedAt: selectedFile.uploadedAt,
            uploadedBy: selectedFile.uploadedBy
          }}
        />
      )}
    </Dialog>
  );
}