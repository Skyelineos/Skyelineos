import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Eye, FileText, Download, CheckCircle, Clock, Send } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

interface PurchaseOrder {
  id: string;
  poId: string;
  projectId: number;
  subcontractorId: number;
  trade: string;
  amount: number;
  description: string;
  status: 'draft' | 'sent' | 'signed';
  createdAt: string;
  sentToSubAt?: string;
  signedBySubAt?: string;
  projectInfo?: {
    name: string;
    address: string;
  };
  subcontractorInfo?: {
    company: string;
    contact: string;
    email: string;
    phone: string;
  };
}

interface PurchaseOrdersSectionProps {
  projectId: number;
}

export default function PurchaseOrdersSection({ projectId }: PurchaseOrdersSectionProps) {
  const [viewMode, setViewMode] = useState<'project' | 'all'>('project');

  // Fetch POs for the project
  const { data: projectPOs = [], isLoading: isLoadingProject, refetch: refetchProject } = useQuery({
    queryKey: ['/api/purchase-orders/project', projectId],
    queryFn: async () => {
      const response = await fetch(`/api/purchase-orders/project/${projectId}`);
      if (!response.ok) throw new Error('Failed to fetch project purchase orders');
      return response.json();
    }
  });

  // Fetch all POs (admin view)
  const { data: allPOs = [], isLoading: isLoadingAll, refetch: refetchAll } = useQuery({
    queryKey: ['/api/purchase-orders'],
    queryFn: async () => {
      const response = await fetch('/api/purchase-orders');
      if (!response.ok) throw new Error('Failed to fetch all purchase orders');
      return response.json();
    },
    enabled: viewMode === 'all'
  });

  const displayPOs = viewMode === 'project' ? projectPOs : allPOs;
  const isLoading = viewMode === 'project' ? isLoadingProject : isLoadingAll;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'draft':
        return <Badge variant="secondary" className="bg-gray-100 text-gray-800"><Clock className="w-3 h-3 mr-1" />Draft</Badge>;
      case 'sent':
        return <Badge variant="default" className="bg-blue-100 text-blue-800"><Send className="w-3 h-3 mr-1" />Sent</Badge>;
      case 'signed':
        return <Badge variant="default" className="bg-green-100 text-green-800"><CheckCircle className="w-3 h-3 mr-1" />Signed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Purchase Orders</h2>
          <p className="text-gray-600">Manage and track purchase orders for subcontractors</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={viewMode === 'project' ? 'accent' : 'outline'}
            onClick={() => setViewMode('project')}
          >
            Project POs ({projectPOs.length})
          </Button>
          <Button
            variant={viewMode === 'all' ? 'accent' : 'outline'}
            onClick={() => setViewMode('all')}
          >
            All POs
          </Button>
        </div>
      </div>

      {displayPOs.length === 0 ? (
        <Card className="bg-gray-50">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-12 w-12 text-gray-400 mb-4" />
            <p className="text-gray-500 text-center">
              {viewMode === 'project' 
                ? 'No purchase orders found for this project. POs are automatically generated when estimates are approved.'
                : 'No purchase orders found. POs are created when estimates are approved by clients.'
              }
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {displayPOs.map((po: PurchaseOrder) => (
            <Card key={po.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div>
                      <CardTitle className="text-lg">{po.poId}</CardTitle>
                      <p className="text-sm text-gray-600">
                        {po.trade} • {formatCurrency(po.amount)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {getStatusBadge(po.status)}
                  </div>
                </div>
              </CardHeader>
              
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-medium text-gray-900 mb-2">Project Details</h4>
                    <div className="space-y-1 text-sm">
                      <p><span className="font-medium">Project:</span> {po.projectInfo?.name || `Project ${po.projectId}`}</p>
                      <p><span className="font-medium">Address:</span> {po.projectInfo?.address || 'N/A'}</p>
                      <p><span className="font-medium">Description:</span> {po.description}</p>
                    </div>
                  </div>
                  
                  <div>
                    <h4 className="font-medium text-gray-900 mb-2">Subcontractor</h4>
                    <div className="space-y-1 text-sm">
                      <p><span className="font-medium">Company:</span> {po.subcontractorInfo?.company || 'N/A'}</p>
                      <p><span className="font-medium">Contact:</span> {po.subcontractorInfo?.contact || 'N/A'}</p>
                      <p><span className="font-medium">Email:</span> {po.subcontractorInfo?.email || 'N/A'}</p>
                      <p><span className="font-medium">Phone:</span> {po.subcontractorInfo?.phone || 'N/A'}</p>
                    </div>
                  </div>
                </div>

                <div className="border-t pt-4">
                  <div className="flex justify-between items-center text-sm">
                    <div className="flex gap-4">
                      <span><span className="font-medium">Created:</span> {formatDate(po.createdAt)}</span>
                      {po.sentToSubAt && (
                        <span><span className="font-medium">Sent:</span> {formatDate(po.sentToSubAt)}</span>
                      )}
                      {po.signedBySubAt && (
                        <span><span className="font-medium">Signed:</span> {formatDate(po.signedBySubAt)}</span>
                      )}
                    </div>
                    
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline">
                        <Eye className="w-4 h-4 mr-1" />
                        View
                      </Button>
                      <Button size="sm" variant="outline">
                        <Download className="w-4 h-4 mr-1" />
                        Download
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {viewMode === 'project' && displayPOs.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <CheckCircle className="h-5 w-5 text-theme-primary mt-0.5" />
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-blue-800">
                Automatic PO Generation Active
              </h3>
              <p className="text-sm text-theme-primary mt-1">
                Purchase Orders are automatically created when clients approve estimates. 
                POs are immediately sent to subcontractors and visible in their portals.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}