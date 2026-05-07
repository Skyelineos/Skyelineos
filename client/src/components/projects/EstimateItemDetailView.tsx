import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { X, DollarSign, Calendar, User, FileText, Clock, Building2, Edit, Eye, Download, Paperclip } from 'lucide-react';

interface EstimateItemDetailViewProps {
  item: any;
  isOpen: boolean;
  onClose: () => void;
  onEdit?: (item: any) => void;
  canEdit?: boolean;
}

export function EstimateItemDetailView({ item, isOpen, onClose, onEdit, canEdit = false }: EstimateItemDetailViewProps) {
  if (!isOpen || !item) return null;
  
  // Search/lookup operation

  const getStatusBadge = (status: string) => {
    const statusLower = status?.toLowerCase() || 'not started';
    
    switch (statusLower) {
      case 'approved':
        return { className: 'bg-green-100 text-green-800 border-green-200' };
      case 'job awarded':
        return { className: 'bg-green-100 text-green-800 border-green-200' };
      case 'waiting approval':
        return { className: 'bg-blue-100 text-blue-800 border-blue-200' };
      case 'actively bidding':
        return { className: 'bg-orange-100 text-orange-800 border-orange-200' };
      case 'bids received':
        return { className: 'bg-purple-100 text-purple-800 border-purple-200' };
      case 'not started':
        return { className: 'bg-gray-100 text-gray-600 border-gray-200' };
      default:
        return { className: 'bg-gray-100 text-gray-600 border-gray-200' };
    }
  };

  const formatCurrency = (amount: number | undefined) => {
    if (!amount && amount !== 0) return 'N/A';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const calculateTotalCost = () => {
    const baseCost = item.cost || item.estimatedCost || item.baseCost || 0;
    const markup = item.markup || 0;
    const contingency = item.contingency || 0;
    const withMarkup = baseCost * (1 + markup / 100);
    const total = withMarkup * (1 + contingency / 100);
    return total;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getFileIcon = (fileName: string) => {
    const extension = fileName.split('.').pop()?.toLowerCase();
    return <FileText className="h-4 w-4 text-blue-500" />;
  };

  const statusConfig = getStatusBadge(item.status);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center gap-4">
            <h2 className="text-2xl font-semibold">{item.title || item.trade || 'Estimate Item'}</h2>
            <Badge className={statusConfig.className}>
              {item.status || 'Not Started'}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            {canEdit && onEdit && (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => onEdit(item)}
                className="flex items-center gap-2"
              >
                <Edit className="h-4 w-4" />
                Edit Item
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Basic Information */}
          <Card className="bg-gray-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Basic Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-500">Trade Type</label>
                  <p className="text-base font-medium">{item.trade || 'N/A'}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Item Title</label>
                  <p className="text-base font-medium">{item.title || 'No title specified'}</p>
                </div>
              </div>
              
              {item.description && (
                <div>
                  <label className="text-sm font-medium text-gray-500">Description</label>
                  <p className="text-base mt-1">{item.description}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Financial Information */}
          <Card className="bg-gray-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Financial Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-500">Base Cost</label>
                  <p className="text-lg font-semibold text-green-600">
                    {formatCurrency(item.cost || item.estimatedCost || item.baseCost)}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Markup</label>
                  <p className="text-base font-medium">
                    {item.markup ? `${item.markup}%` : 'N/A'}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Total Cost</label>
                  <p className="text-lg font-semibold text-blue-600">
                    {formatCurrency(calculateTotalCost())}
                  </p>
                </div>
              </div>

              {item.contingency && (
                <div>
                  <label className="text-sm font-medium text-gray-500">Contingency</label>
                  <p className="text-base font-medium">{item.contingency}%</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Vendor & Timeline Information */}
          <Card className="bg-gray-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Vendor & Timeline
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-500">Assigned Vendor</label>
                  <p className="text-base font-medium flex items-center gap-2">
                    <Building2 className="h-4 w-4" />
                    {item.vendor || item.assignedVendor || 'Not assigned'}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Duration</label>
                  <p className="text-base font-medium flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    {item.duration ? `${item.duration} days` : 'Not specified'}
                  </p>
                </div>
              </div>

              {item.startDate && (
                <div>
                  <label className="text-sm font-medium text-gray-500">Scheduled Start Date</label>
                  <p className="text-base font-medium flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    {new Date(item.startDate).toLocaleDateString()}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Additional Details */}
          {(item.notes || item.specifications || item.materials) && (
            <Card className="bg-gray-50">
              <CardHeader>
                <CardTitle>Additional Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {item.notes && (
                  <div>
                    <label className="text-sm font-medium text-gray-500">Notes</label>
                    <p className="text-base mt-1">{item.notes}</p>
                  </div>
                )}
                
                {item.specifications && (
                  <div>
                    <label className="text-sm font-medium text-gray-500">Specifications</label>
                    <p className="text-base mt-1">{item.specifications}</p>
                  </div>
                )}

                {item.materials && (
                  <div>
                    <label className="text-sm font-medium text-gray-500">Materials</label>
                    <p className="text-base mt-1">{item.materials}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* File Attachments */}
          {(item.files && item.files.length > 0) && (
            <Card className="bg-gray-50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Paperclip className="h-5 w-5" />
                  Attached Files
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3">
                  {item.files.map((file: any, index: number) => (
                    <div key={file.id || index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border">
                      <div className="flex items-center gap-3">
                        {getFileIcon(file.originalFileName || file.filename || file.name)}
                        <div>
                          <p className="text-sm font-medium">
                            {file.originalFileName || file.filename || file.name}
                          </p>
                          {file.fileSize && (
                            <p className="text-xs text-gray-500">{formatFileSize(file.fileSize || file.size)}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            const fileUrl = file.fileUrl || file.path || file.url || `/uploads/${file.filename}` || `/uploads/${file.name}`;
                            window.open(fileUrl, '_blank');
                          }}
                          className="text-blue-600 hover:text-theme-primary"
                          title="Preview document"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            const fileUrl = file.fileUrl || file.path || file.url || `/uploads/${file.filename}` || `/uploads/${file.name}`;
                            const fileName = file.originalFileName || file.filename || file.name || 'document';
                            
                            // Create download link
                            const link = document.createElement('a');
                            link.href = fileUrl;
                            link.download = fileName;
                            link.target = '_blank';
                            document.body.appendChild(link);
                            link.click();
                            document.body.removeChild(link);
                          }}
                          className="text-gray-600 hover:text-gray-700"
                          title="Download document"
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Bid Information (if applicable) */}
          {item.bidAmount && (
            <Card className="bg-gray-50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-green-500" />
                  Winning Bid Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-500">Bid Amount</label>
                    <p className="text-lg font-semibold text-green-600">
                      {formatCurrency(item.bidAmount)}
                    </p>
                  </div>
                  {item.bidDuration && (
                    <div>
                      <label className="text-sm font-medium text-gray-500">Bid Duration</label>
                      <p className="text-base font-medium">{item.bidDuration} days</p>
                    </div>
                  )}
                </div>

                {item.bidNotes && (
                  <div>
                    <label className="text-sm font-medium text-gray-500">Bid Notes</label>
                    <p className="text-base mt-1">{item.bidNotes}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center gap-3 p-6 border-t">
          <div className="text-sm text-gray-500">
            Item ID: {item.id}
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}