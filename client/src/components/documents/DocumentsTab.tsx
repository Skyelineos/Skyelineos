import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import {
  FileText,
  Upload,
  Download,
  Send,
  CheckCircle,
  XCircle,
  Clock,
  Plus,
  Filter,
  Search,
  Eye,
  Edit,
  Trash2,
  FilePlus,
  FileCheck,
  DollarSign,
  Calendar,
  User,
  Phone,
  Mail,
  Image,
  FileIcon,
  X,
  Paperclip,
  MoreVertical,
  Edit2,
  Save
} from 'lucide-react';
import type { ProjectDocument, PurchaseOrder, ChangeOrder, Invoice } from '@shared/schema';
import PurchaseOrdersSection from './PurchaseOrdersSection';
import { SubcontractorComboBox } from '@/components/ui/subcontractor-combobox';
import { TradeTypeComboBox } from '@/components/contacts/TradeTypeComboBox';

interface DocumentsTabProps {
  projectId: string;
}

export default function DocumentsTab({ projectId }: DocumentsTabProps) {
  const { user, hasRole } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Helper function to get proper status colors for PO badges
  const getStatusBadgeProps = (status: string) => {
    switch (status.toLowerCase()) {
      case 'draft': 
        return { 
          variant: "outline" as const, 
          className: "bg-gray-100 text-gray-800 border-gray-300" 
        };
      case 'sent': 
        return { 
          variant: "outline" as const, 
          className: "bg-blue-100 text-blue-800 border-blue-300" 
        };
      case 'signed': 
        return { 
          variant: "outline" as const, 
          className: "bg-green-100 text-green-800 border-green-300" 
        };
      case 'completed': 
        return { 
          variant: "outline" as const, 
          className: "bg-emerald-100 text-emerald-800 border-emerald-300" 
        };
      case 'cancelled': 
        return { 
          variant: "outline" as const, 
          className: "bg-red-100 text-red-800 border-red-300" 
        };
      default: 
        return { 
          variant: "secondary" as const, 
          className: "" 
        };
    }
  };
  
  const [activeTab, setActiveTab] = useState('build-plans');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [uploadType, setUploadType] = useState<'build_plan' | 'purchase_order' | 'change_order' | 'invoice'>('build_plan');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [uploadDescription, setUploadDescription] = useState('');
  
  // PO creation states
  const [createPOOpen, setCreatePOOpen] = useState(false);
  const [selectedEstimateItem, setSelectedEstimateItem] = useState<any>(null);
  const [selectedSubcontractor, setSelectedSubcontractor] = useState<any>(null);
  const [poStartDate, setPOStartDate] = useState('');
  const [poAmount, setPOAmount] = useState('');
  const [poDescription, setPODescription] = useState('');
  const [selectedPO, setSelectedPO] = useState<any>(null);
  const [poDetailsOpen, setPODetailsOpen] = useState(false);
  const [editingTerms, setEditingTerms] = useState(false);
  const [termsAndConditions, setTermsAndConditions] = useState('');
  
  // Invoice creation states
  const [createInvoiceOpen, setCreateInvoiceOpen] = useState(false);
  const [invoiceFormData, setInvoiceFormData] = useState({
    invoiceNumber: '',
    trade: '',
    contactId: '',
    amount: '',
    laborCost: '',
    materialCost: '',
    workPeriod: '',
    description: '',
    submittedDate: new Date().toISOString().split('T')[0],
  });

  // Document preview states
  const [previewDocument, setPreviewDocument] = useState<ProjectDocument | null>(null);
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);

  // Get vendor details for selected PO
  const { data: poVendorDetails } = useQuery({
    queryKey: ['/api/contacts', selectedPO?.subcontractorId],
    queryFn: () => fetch(`/api/contacts/${selectedPO.subcontractorId}`).then(res => res.json()),
    enabled: !!selectedPO?.subcontractorId,
  });

  // Fetch project documents
  const { data: documents = [], isLoading: documentsLoading } = useQuery({
    queryKey: ['/api/documents', projectId],
    queryFn: () => fetch(`/api/documents?projectId=${projectId}`).then(res => res.json()),
  });

  // Fetch purchase orders
  const { data: purchaseOrders = [], isLoading: posLoading } = useQuery({
    queryKey: ['/api/purchase-orders', projectId],
    queryFn: () => fetch(`/api/purchase-orders?projectId=${projectId}`).then(res => res.json()),
  });

  // Fetch change orders
  const { data: changeOrders = [], isLoading: changeOrdersLoading } = useQuery({
    queryKey: ['/api/change-orders', projectId],
    queryFn: () => fetch(`/api/change-orders?projectId=${projectId}`).then(res => res.json()),
  });

  // Fetch invoices
  const { data: invoices = [], isLoading: invoicesLoading } = useQuery({
    queryKey: ['/api/invoices', projectId],
    queryFn: () => fetch(`/api/invoices?projectId=${projectId}`).then(res => res.json()),
  });

  // Fetch approved estimate items
  const { data: approvedEstimateItems = [], isLoading: estimateItemsLoading } = useQuery({
    queryKey: ['/api/estimates/approved', projectId],
    queryFn: () => fetch(`/api/estimates/approved/${projectId}`).then(res => res.json()),
  });

  // Fetch contacts/subcontractors
  const { data: contacts = [] } = useQuery({
    queryKey: ['/api/contacts'],
  });

  // Fetch project tasks for schedule integration
  const { data: projectTasks = [] } = useQuery({
    queryKey: [`/api/projects/${projectId}/tasks`],
  });

  const subcontractors = Array.isArray(contacts) ? contacts.filter((contact: any) => contact.role === 'subcontractor') : [];

  // Create PO mutation
  const createPOMutation = useMutation({
    mutationFn: async (poData: any) => {
      return await apiRequest('/api/purchase-orders', 'POST', poData);
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Purchase order created successfully" });
      setCreatePOOpen(false);
      setSelectedEstimateItem(null);
      setSelectedSubcontractor(null);
      setPOStartDate('');
      setPOAmount('');
      setPODescription('');
      queryClient.invalidateQueries({ queryKey: ['/api/purchase-orders', projectId] });
    },
    onError: (error: any) => {
      // Check if it's a compliance error and show detailed message
      const errorMessage = error.message || "Failed to create purchase order";
      
      if (errorMessage.includes("missing:")) {
        toast({
          title: "Subcontractor Compliance Required",
          description: errorMessage,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error",
          description: errorMessage,
          variant: "destructive",
        });
      }
    },
  });

  const handleCreatePO = () => {
    // Prevent double submissions
    if (createPOMutation.isPending) {
      return;
    }

    if (!selectedEstimateItem || !selectedSubcontractor || !poStartDate || !poAmount) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    const poData = {
      projectId: parseInt(projectId),
      estimateItemId: selectedEstimateItem.id,
      contactId: selectedSubcontractor.id,
      trade: selectedEstimateItem.trade,
      amount: parseFloat(poAmount),
      description: poDescription || selectedEstimateItem.description,
      startDate: poStartDate,
      status: 'Draft',
    };

    createPOMutation.mutate(poData);
  };

  // Update PO terms and conditions
  const updatePOTermsMutation = useMutation({
    mutationFn: async (data: { id: number; termsAndConditions: string }) => {
      return await apiRequest(`/api/purchase-orders/${data.id}`, 'PATCH', { termsAndConditions: data.termsAndConditions });
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Terms and conditions updated successfully" });
      setEditingTerms(false);
      queryClient.invalidateQueries({ queryKey: ['/api/purchase-orders'] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update terms and conditions",
        variant: "destructive",
      });
    },
  });

  // Send PO to subcontractor
  const sendPOMutation = useMutation({
    mutationFn: async (poId: number) => {
      return await apiRequest(`/api/purchase-orders/${poId}/send`, 'POST');
    },
    onSuccess: (data: any) => {
      toast({ 
        title: "PO Sent Successfully", 
        description: `Purchase Order ${data.poNumber} has been sent to the subcontractor for electronic signing` 
      });
      queryClient.invalidateQueries({ queryKey: ['/api/purchase-orders'] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Send PO",
        description: error.message || "Unable to send purchase order to subcontractor",
        variant: "destructive",
      });
    },
  });

  const handleSaveTerms = () => {
    if (selectedPO) {
      updatePOTermsMutation.mutate({
        id: selectedPO.id,
        termsAndConditions,
      });
    }
  };

  // Delete PO mutation
  const deletePOMutation = useMutation({
    mutationFn: async (poId: number) => {
      return apiRequest(`/api/purchase-orders/${poId}`, 'DELETE');
    },
    onSuccess: () => {
      toast({
        title: "Purchase Order Deleted",
        description: "The purchase order has been successfully deleted.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/purchase-orders'] });
      setPODetailsOpen(false);
      setSelectedPO(null);
    },
    onError: (error) => {
      console.error('Error deleting PO:', error);
      toast({
        title: "Error",
        description: "Failed to delete purchase order. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Filter subcontractors by trade for the selected estimate item
  const filteredSubcontractors = selectedEstimateItem ? 
    subcontractors.filter((sub: any) => 
      sub.trade && sub.trade.toLowerCase() === selectedEstimateItem.trade.toLowerCase()
    ) : subcontractors;

  // File upload mutation
  const uploadMutation = useMutation({
    mutationFn: async (data: { files: File[], type: string, targetId?: string, description?: string }) => {
      const formData = new FormData();
      
      // Add all files to form data
      data.files.forEach((file, index) => {
        formData.append(`files`, file);
      });
      
      formData.append('projectId', projectId);
      formData.append('documentType', data.type);
      formData.append('description', data.description || '');
      formData.append('uploadedBy', user?.id?.toString() || '1');
      
      if (data.targetId) {
        formData.append('targetId', data.targetId);
      }

      const response = await fetch(`/api/documents/upload`, {
        method: 'POST',
        body: formData,
      });
      if (!response.ok) throw new Error('Upload failed');
      return response.json();
    },
    onSuccess: () => {
      // Invalidate all relevant queries
      queryClient.invalidateQueries({ queryKey: ['/api/documents', projectId] });
      queryClient.invalidateQueries({ queryKey: ['/api/purchase-orders', projectId] });
      queryClient.invalidateQueries({ queryKey: ['/api/change-orders', projectId] });
      queryClient.invalidateQueries({ queryKey: ['/api/invoices', projectId] });
      
      toast({
        title: "Success",
        description: `${selectedFiles.length} file(s) uploaded successfully`,
      });
      
      // Reset form
      setUploadDialogOpen(false);
      setSelectedFiles([]);
      setUploadDescription('');
      setTargetId(null);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to upload files",
        variant: "destructive",
      });
    },
  });

  // Generate PO mutation
  const generatePOMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest(`/api/purchase-orders`, 'POST', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/purchase-orders', projectId] });
      toast({
        title: "Success",
        description: "Purchase order generated successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to generate purchase order",
        variant: "destructive",
      });
    },
  });

  const deleteDocumentMutation = useMutation({
    mutationFn: async (documentId: number) => {
      return await apiRequest(`/api/documents/${documentId}`, 'DELETE');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/documents', projectId] });
      toast({
        title: 'Success',
        description: 'Document deleted successfully',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: 'Failed to delete document',
        variant: 'destructive',
      });
    },
  });

  // Create invoice mutation
  const createInvoiceMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest('POST', '/api/invoices', {
        ...data,
        projectId: parseInt(projectId),
        contactId: parseInt(data.contactId),
        amount: parseFloat(data.amount),
        laborCost: parseFloat(data.laborCost) || 0,
        materialCost: parseFloat(data.materialCost) || 0,
        submittedDate: new Date(data.submittedDate).toISOString(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/invoices', projectId] });
      toast({
        title: 'Success',
        description: 'Invoice created successfully',
      });
      setCreateInvoiceOpen(false);
      setInvoiceFormData({
        invoiceNumber: '',
        trade: '',
        contactId: '',
        amount: '',
        laborCost: '',
        materialCost: '',
        workPeriod: '',
        description: '',
        submittedDate: new Date().toISOString().split('T')[0],
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create invoice',
        variant: 'destructive',
      });
    },
  });

  // Approve invoice mutation
  const approveInvoiceMutation = useMutation({
    mutationFn: async (invoiceId: number) => {
      return await apiRequest('PATCH', `/api/invoices/${invoiceId}/approve`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/invoices', projectId] });
      toast({
        title: 'Success',
        description: 'Invoice approved successfully',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to approve invoice',
        variant: 'destructive',
      });
    },
  });

  // Mark invoice as paid mutation
  const markInvoicePaidMutation = useMutation({
    mutationFn: async (invoiceId: number) => {
      return await apiRequest('PATCH', `/api/invoices/${invoiceId}/mark-paid`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/invoices', projectId] });
      toast({
        title: 'Success',
        description: 'Invoice marked as paid',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to mark invoice as paid',
        variant: 'destructive',
      });
    },
  });

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files) {
      setSelectedFiles(Array.from(files));
    }
  };

  const removeFile = (index: number) => {
    setSelectedFiles(files => files.filter((_, i) => i !== index));
  };

  const handleFileUpload = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    
    if (selectedFiles.length === 0) {
      toast({
        title: "Error",
        description: "Please select at least one file to upload",
        variant: "destructive",
      });
      return;
    }
    
    uploadMutation.mutate({
      files: selectedFiles,
      type: uploadType,
      targetId: targetId || undefined,
      description: uploadDescription,
    });
  };

  const openUploadDialog = (type: 'build_plan' | 'purchase_order' | 'change_order' | 'invoice', id?: string) => {
    setUploadType(type);
    setTargetId(id || null);
    setSelectedFiles([]);
    setUploadDescription('');
    setUploadDialogOpen(true);
  };

  const handleCreateInvoice = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate required fields
    if (!invoiceFormData.invoiceNumber || !invoiceFormData.trade || !invoiceFormData.contactId || !invoiceFormData.amount) {
      toast({
        title: 'Error',
        description: 'Please fill in all required fields',
        variant: 'destructive',
      });
      return;
    }
    
    createInvoiceMutation.mutate(invoiceFormData);
  };

  const handleInvoiceFormChange = (field: string, value: string) => {
    setInvoiceFormData(prev => ({ ...prev, [field]: value }));
  };

  const getFileIcon = (fileName: string) => {
    const extension = fileName.split('.').pop()?.toLowerCase();
    switch (extension) {
      case 'pdf':
        return <FileText className="h-4 w-4 text-red-500" />;
      case 'jpg':
      case 'jpeg':
      case 'png':
      case 'gif':
        return <Image className="h-4 w-4 text-blue-500" />;
      case 'dwg':
      case 'dxf':
        return <FileIcon className="h-4 w-4 text-green-500" />;
      default:
        return <FileIcon className="h-4 w-4 text-gray-500" />;
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getAcceptedFileTypes = (type: string) => {
    switch (type) {
      case 'build_plan':
        return '.pdf,.jpg,.jpeg,.png,.dwg,.dxf';
      case 'purchase_order':
        return '.pdf,.jpg,.jpeg,.png';
      case 'change_order':
        return '.pdf,.jpg,.jpeg,.png,.doc,.docx';
      case 'invoice':
        return '.pdf,.jpg,.jpeg,.png';
      default:
        return '';
    }
  };

  const getStatusBadge = (status: string | undefined, type: 'po' | 'change' | 'invoice') => {
    if (!status) return <Badge variant="secondary">Unknown</Badge>;
    
    const variants = {
      po: {
        draft: 'secondary',
        sent: 'default',
        signed: 'success',
        completed: 'success',
      },
      change: {
        pending: 'warning',
        approved: 'success',
        rejected: 'destructive',
      },
      invoice: {
        pending: 'warning',
        approved: 'default',
        paid: 'success',
        disputed: 'destructive',
      },
    } as const;

    const statusLower = status.toLowerCase();
    const variant = variants[type][statusLower as keyof typeof variants[typeof type]] || 'secondary';

    return (
      <Badge variant={variant as any}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  const filteredDocuments = documents.filter((doc: ProjectDocument) => {
    const matchesSearch = (doc.originalFileName?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
                         (doc.description?.toLowerCase() || '').includes(searchTerm.toLowerCase());
    return matchesSearch;
  });

  const filteredPOs = purchaseOrders.filter((po: PurchaseOrder) => {
    const matchesSearch = (po.trade?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
                         (po.description?.toLowerCase() || '').includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || po.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const filteredChangeOrders = changeOrders.filter((co: ChangeOrder) => {
    const matchesSearch = (co.description?.toLowerCase() || '').includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || co.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const filteredInvoices = invoices.filter((invoice: Invoice) => {
    const matchesSearch = (invoice.trade?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
                         (invoice.description?.toLowerCase() || '').includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || invoice.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Handle document preview
  const handleDocumentPreview = (doc: ProjectDocument) => {
    setPreviewDocument(doc);
    setPreviewDialogOpen(true);
  };

  // Get file extension for preview type
  const getFileExtension = (filename: string) => {
    return filename?.split('.').pop()?.toLowerCase() || '';
  };

  // Check if file can be previewed inline
  const canPreviewInline = (filename: string) => {
    const ext = getFileExtension(filename);
    return ['pdf', 'jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(ext);
  };

  return (
    <div className="space-y-6">
      {/* Header with search and filters */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center space-x-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="Search documents..."
              className="pl-10 w-64"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="sent">Sent</SelectItem>
              <SelectItem value="signed">Signed</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {(hasRole('Admin') || hasRole('ProjectManager')) && (
          <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Upload Document
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle>Upload Document</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleFileUpload} className="space-y-6">
                <div>
                  <Label htmlFor="document-type">Document Type</Label>
                  <Select value={uploadType} onValueChange={(value: any) => setUploadType(value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="build_plan">📁 Build Plan</SelectItem>
                      <SelectItem value="purchase_order">📄 Purchase Order</SelectItem>
                      <SelectItem value="change_order">🔁 Change Order</SelectItem>
                      <SelectItem value="invoice">🧾 Invoice</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-sm text-gray-500 mt-1">
                    Accepted files: {getAcceptedFileTypes(uploadType)}
                  </p>
                </div>

                <div>
                  <Label htmlFor="files">Files</Label>
                  <div className="mt-2">
                    <div className="flex items-center justify-center w-full">
                      <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100">
                        <div className="flex flex-col items-center justify-center pt-5 pb-6">
                          <Upload className="w-8 h-8 mb-4 text-gray-500" />
                          <p className="mb-2 text-sm text-gray-500">
                            <span className="font-semibold">Click to upload</span> or drag and drop
                          </p>
                          <p className="text-xs text-gray-500">
                            Multiple files supported
                          </p>
                        </div>
                        <input
                          ref={fileInputRef}
                          type="file"
                          className="hidden"
                          multiple
                          accept={getAcceptedFileTypes(uploadType)}
                          onChange={handleFileSelect}
                        />
                      </label>
                    </div>
                  </div>

                  {/* Selected files display */}
                  {selectedFiles.length > 0 && (
                    <div className="mt-4 space-y-2">
                      <Label>Selected Files ({selectedFiles.length})</Label>
                      <div className="max-h-40 overflow-y-auto space-y-2">
                        {selectedFiles.map((file, index) => (
                          <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                            <div className="flex items-center space-x-3">
                              {getFileIcon(file.name)}
                              <div>
                                <p className="text-sm font-medium">{file.name}</p>
                                <p className="text-xs text-gray-500">{formatFileSize(file.size)}</p>
                              </div>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeFile(index)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <Label htmlFor="description">Description</Label>
                  <Textarea 
                    id="description" 
                    value={uploadDescription}
                    onChange={(e) => setUploadDescription(e.target.value)}
                    placeholder="Optional description or notes about these files"
                    className="mt-1"
                  />
                </div>

                <div className="flex justify-end space-x-2">
                  <Button type="button" variant="outline" onClick={() => setUploadDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={uploadMutation.isPending || selectedFiles.length === 0}>
                    {uploadMutation.isPending ? 'Uploading...' : `Upload ${selectedFiles.length} File(s)`}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Document tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="build-plans">Build Plans</TabsTrigger>
          <TabsTrigger value="purchase-orders">Purchase Orders</TabsTrigger>
          <TabsTrigger value="change-orders">Change Orders</TabsTrigger>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
        </TabsList>

        {/* Build Plans Tab */}
        <TabsContent value="build-plans" className="space-y-4">
          <Card className="bg-gray-50">
            <CardHeader>
              <CardTitle className="flex items-center">
                <FileText className="mr-2 h-5 w-5" />
                Build Plans
              </CardTitle>
            </CardHeader>
            <CardContent>
              {documentsLoading ? (
                <div className="text-center py-8">Loading documents...</div>
              ) : filteredDocuments.filter((doc: ProjectDocument) => doc.documentType === 'build_plan').length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <FileText className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                  <p>No build plans uploaded yet.</p>
                  <p className="text-sm mt-2">Upload PDFs, images, or CAD files to get started.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredDocuments
                    .filter((doc: ProjectDocument) => doc.documentType === 'build_plan')
                    .map((doc: ProjectDocument) => (
                      <div key={doc.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 cursor-pointer" onClick={() => handleDocumentPreview(doc)}>
                        <div className="flex items-center space-x-4">
                          {getFileIcon(doc.originalFileName)}
                          <div>
                            <p className="font-medium">{doc.originalFileName}</p>
                            <p className="text-sm text-gray-500">
                              {doc.createdAt ? new Date(doc.createdAt).toLocaleDateString() : 'No date'}
                              {doc.fileSize && ` • ${formatFileSize(doc.fileSize)}`}
                            </p>
                            {doc.description && (
                              <p className="text-sm text-gray-600 mt-1">{doc.description}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => window.open(doc.fileUrl, '_blank')}>
                                <Download className="mr-2 h-4 w-4" />
                                Download
                              </DropdownMenuItem>
                              {(hasRole('Admin') || hasRole('ProjectManager')) && (
                                <DropdownMenuItem onClick={() => openUploadDialog('build_plan', doc.id.toString())}>
                                  <Edit className="mr-2 h-4 w-4" />
                                  Replace
                                </DropdownMenuItem>
                              )}
                              {(hasRole('Admin') || hasRole('ProjectManager')) && (
                                <DropdownMenuItem 
                                  onClick={() => deleteDocumentMutation.mutate(doc.id)}
                                  className="text-red-600 focus:text-red-600"
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Delete
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Purchase Orders Tab */}
        <TabsContent value="purchase-orders" className="space-y-4">
          <Card className="bg-gray-50">
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle className="flex items-center">
                  <FileCheck className="mr-2 h-5 w-5" />
                  Purchase Orders
                </CardTitle>
                {(hasRole('Admin') || hasRole('ProjectManager')) && (
                  <Button 
                    onClick={() => setCreatePOOpen(true)}
                    className="flex items-center gap-2"
                  >
                    <Plus className="h-4 w-4" />
                    Create from Estimate
                  </Button>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                Manage purchase orders for approved work
              </p>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Purchase Orders List */}
                {posLoading ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                    <p className="text-muted-foreground mt-2">Loading purchase orders...</p>
                  </div>
                ) : purchaseOrders.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <p>No purchase orders found.</p>
                    <p className="text-sm mt-2">Create your first purchase order from an approved estimate.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {purchaseOrders.map((po: any) => (
                      <Card 
                        key={po.id} 
                        className="hover:shadow-md transition-shadow"
                      >
                        <CardContent className="p-4">
                          <div className="flex justify-between items-start">
                            <div 
                              className="flex-1 cursor-pointer"
                              onClick={() => {
                                setSelectedPO(po);
                                setTermsAndConditions(po.termsAndConditions || '');
                                setPODetailsOpen(true);
                              }}
                            >
                              <h4 className="font-semibold">{po.poNumber}</h4>
                              <p className="text-sm text-muted-foreground">
                                {po.trade} - ${po.amount?.toLocaleString()}
                              </p>
                              <p className="text-xs text-muted-foreground mt-1">
                                Click to view details
                              </p>
                            </div>
                            <div className="flex items-center space-x-2">
                              <Badge {...getStatusBadgeProps(po.status)}>{po.status}</Badge>
                              {(hasRole('Admin') || hasRole('ProjectManager')) && po.status === 'draft' && (
                                <Button
                                  size="sm"
                                  className="bg-theme-primary hover:bg-theme-primary-hover"
                                  disabled={sendPOMutation.isPending}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    sendPOMutation.mutate(po.id);
                                  }}
                                >
                                  <Send className="h-4 w-4 mr-1" />
                                  {sendPOMutation.isPending ? 'Sending...' : 'Send'}
                                </Button>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Change Orders Tab */}
        <TabsContent value="change-orders" className="space-y-4">
          <Card className="bg-gray-50">
            <CardHeader>
              <CardTitle className="flex items-center">
                <FileText className="mr-2 h-5 w-5" />
                Change Orders
              </CardTitle>
            </CardHeader>
            <CardContent>
              {changeOrdersLoading ? (
                <div className="text-center py-8">Loading change orders...</div>
              ) : filteredChangeOrders.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No change orders found.
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredChangeOrders.map((co: ChangeOrder) => {
                    const subcontractor = subcontractors.find((s: any) => s.id === co.contactId);
                    return (
                      <div key={co.id} className="border rounded-lg p-4 cursor-pointer hover:bg-gray-50" onClick={() => {
                        // Find the first document for this Change Order to preview
                        const coDoc = filteredDocuments.find((doc: ProjectDocument) => 
                          doc.documentType === 'change_order' && doc.targetId === co.id
                        );
                        if (coDoc) {
                          window.open(coDoc.fileUrl, '_blank');
                        }
                      }}>
                        <div className="flex justify-between items-start">
                          <div className="space-y-2">
                            <div className="flex items-center space-x-2">
                              <h3 className="font-medium">CO #{co.changeOrderNumber}</h3>
                              {getStatusBadge(co.status || 'pending', 'change')}
                            </div>
                            <div className="text-sm text-gray-600 space-y-1">
                              <p><strong>Subcontractor:</strong> {subcontractor?.name || 'Unknown'}</p>
                              <p><strong>Description:</strong> {co.description}</p>
                              <p className={`flex items-center ${co.costImpact >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                                <DollarSign className="mr-1 h-4 w-4" />
                                <strong>Cost Impact:</strong> {co.costImpact >= 0 ? '+' : ''}${co.costImpact.toLocaleString()}
                              </p>
                              {co.timeImpact !== null && co.timeImpact !== 0 && (
                                <p className={`flex items-center ${(co.timeImpact || 0) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                  <Calendar className="mr-1 h-4 w-4" />
                                  <strong>Time Impact:</strong> {(co.timeImpact || 0) > 0 ? '+' : ''}{co.timeImpact} days
                                </p>
                              )}
                              
                              {/* Display attached files */}
                              {filteredDocuments.filter((doc: ProjectDocument) => 
                                doc.documentType === 'change_order' && doc.targetId === co.id
                              ).length > 0 && (
                                <div className="mt-2 pt-2 border-t">
                                  <p className="text-xs font-medium text-gray-500 mb-2">Attached Files:</p>
                                  <div className="flex flex-wrap gap-2">
                                    {filteredDocuments
                                      .filter((doc: ProjectDocument) => 
                                        doc.documentType === 'change_order' && doc.targetId === co.id
                                      )
                                      .map((doc: ProjectDocument) => (
                                        <div key={doc.id} className="flex items-center space-x-1 bg-gray-100 px-2 py-1 rounded text-xs">
                                          {getFileIcon(doc.originalFileName)}
                                          <span className="truncate max-w-20">{doc.originalFileName}</span>
                                        </div>
                                      ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center space-x-2" onClick={(e) => e.stopPropagation()}>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm">
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => {
                                  const coDoc = filteredDocuments.find((doc: ProjectDocument) => 
                                    doc.documentType === 'change_order' && doc.targetId === co.id
                                  );
                                  if (coDoc) {
                                    window.open(coDoc.fileUrl, '_blank');
                                  }
                                }}>
                                  <Download className="mr-2 h-4 w-4" />
                                  Download
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => openUploadDialog('change_order', co.id.toString())}>
                                  <Edit className="mr-2 h-4 w-4" />
                                  Replace
                                </DropdownMenuItem>
                                {(hasRole('Admin') || hasRole('ProjectManager')) && (
                                  <DropdownMenuItem 
                                    onClick={() => {
                                      const coDoc = filteredDocuments.find((doc: ProjectDocument) => 
                                        doc.documentType === 'change_order' && doc.targetId === co.id
                                      );
                                      if (coDoc) {
                                        deleteDocumentMutation.mutate(coDoc.id);
                                      }
                                    }}
                                    className="text-red-600 focus:text-red-600"
                                  >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Delete
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                            {(hasRole('Admin') || hasRole('ProjectManager')) && (
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => openUploadDialog('change_order', co.id.toString())}
                              >
                                <Paperclip className="mr-2 h-4 w-4" />
                                Attach Files
                              </Button>
                            )}
                            {co.status === 'pending' && (hasRole('Admin') || hasRole('ProjectManager')) && (
                              <>
                                <Button variant="outline" size="sm" className="text-green-600">
                                  <CheckCircle className="mr-2 h-4 w-4" />
                                  Approve
                                </Button>
                                <Button variant="outline" size="sm" className="text-red-600">
                                  <XCircle className="mr-2 h-4 w-4" />
                                  Reject
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Invoices Tab */}
        <TabsContent value="invoices" className="space-y-4">
          <Card className="bg-gray-50">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center">
                  <FileText className="mr-2 h-5 w-5" />
                  Subcontractor Invoices
                </CardTitle>
                {(hasRole('Admin') || hasRole('ProjectManager')) && (
                  <Button onClick={() => setCreateInvoiceOpen(true)} className="bg-theme-primary hover:bg-theme-primary-hover">
                    <Plus className="mr-2 h-4 w-4" />
                    Create Invoice
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {invoicesLoading ? (
                <div className="text-center py-8">Loading invoices...</div>
              ) : filteredInvoices.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No invoices found.
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredInvoices.map((invoice: Invoice) => {
                    const subcontractor = subcontractors.find((s: any) => s.id === invoice.contactId);
                    return (
                      <div key={invoice.id} className="border rounded-lg p-4 cursor-pointer hover:bg-gray-50" onClick={() => {
                        // Find the first document for this Invoice to preview
                        const invoiceDoc = filteredDocuments.find((doc: ProjectDocument) => 
                          doc.documentType === 'invoice' && doc.targetId === invoice.id
                        );
                        if (invoiceDoc) {
                          window.open(invoiceDoc.fileUrl, '_blank');
                        }
                      }}>
                        <div className="flex justify-between items-start">
                          <div className="space-y-2">
                            <div className="flex items-center space-x-2">
                              <h3 className="font-medium">Invoice #{invoice.invoiceNumber}</h3>
                              {getStatusBadge(invoice.status || 'pending', 'invoice')}
                            </div>
                            <div className="text-sm text-gray-600 space-y-1">
                              <p><strong>Subcontractor:</strong> {subcontractor?.name || 'Unknown'}</p>
                              <p><strong>Trade:</strong> {invoice.trade}</p>
                              <p><strong>Amount:</strong> ${invoice.amount.toLocaleString()}</p>
                              <p><strong>Date:</strong> {invoice.submittedDate ? new Date(invoice.submittedDate).toLocaleDateString() : 'No date'}</p>
                              {invoice.workPeriod && (
                                <p><strong>Work Period:</strong> {invoice.workPeriod}</p>
                              )}
                              {invoice.description && (
                                <p><strong>Description:</strong> {invoice.description}</p>
                              )}
                              
                              {/* Display attached files */}
                              {filteredDocuments.filter((doc: ProjectDocument) => 
                                doc.documentType === 'invoice' && doc.targetId === invoice.id
                              ).length > 0 && (
                                <div className="mt-2 pt-2 border-t">
                                  <p className="text-xs font-medium text-gray-500 mb-2">Attached Files:</p>
                                  <div className="flex flex-wrap gap-2">
                                    {filteredDocuments
                                      .filter((doc: ProjectDocument) => 
                                        doc.documentType === 'invoice' && doc.targetId === invoice.id
                                      )
                                      .map((doc: ProjectDocument) => (
                                        <div key={doc.id} className="flex items-center space-x-1 bg-gray-100 px-2 py-1 rounded text-xs">
                                          {getFileIcon(doc.originalFileName)}
                                          <span className="truncate max-w-20">{doc.originalFileName}</span>
                                        </div>
                                      ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center space-x-2" onClick={(e) => e.stopPropagation()}>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm">
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => {
                                  const invoiceDoc = filteredDocuments.find((doc: ProjectDocument) => 
                                    doc.documentType === 'invoice' && doc.targetId === invoice.id
                                  );
                                  if (invoiceDoc) {
                                    window.open(invoiceDoc.fileUrl, '_blank');
                                  }
                                }}>
                                  <Download className="mr-2 h-4 w-4" />
                                  Download
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => openUploadDialog('invoice', invoice.id.toString())}>
                                  <Edit className="mr-2 h-4 w-4" />
                                  Replace
                                </DropdownMenuItem>
                                {(hasRole('Admin') || hasRole('ProjectManager')) && (
                                  <DropdownMenuItem 
                                    onClick={() => {
                                      const invoiceDoc = filteredDocuments.find((doc: ProjectDocument) => 
                                        doc.documentType === 'invoice' && doc.targetId === invoice.id
                                      );
                                      if (invoiceDoc) {
                                        deleteDocumentMutation.mutate(invoiceDoc.id);
                                      }
                                    }}
                                    className="text-red-600 focus:text-red-600"
                                  >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Delete
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => openUploadDialog('invoice', invoice.id.toString())}
                            >
                              <Paperclip className="mr-2 h-4 w-4" />
                              Attach Files
                            </Button>
                            {invoice.status === 'pending' && (hasRole('Admin') || hasRole('ProjectManager')) && (
                              <Button 
                                variant="outline" 
                                size="sm" 
                                className="text-green-600 hover:text-green-700 hover:bg-green-50"
                                onClick={() => approveInvoiceMutation.mutate(invoice.id)}
                                disabled={approveInvoiceMutation.isPending}
                              >
                                <CheckCircle className="mr-2 h-4 w-4" />
                                {approveInvoiceMutation.isPending ? 'Approving...' : 'Approve'}
                              </Button>
                            )}
                            {invoice.status === 'approved' && (hasRole('Admin')) && (
                              <Button 
                                variant="outline" 
                                size="sm" 
                                className="text-theme-primary hover:text-theme-primary hover:bg-blue-50"
                                onClick={() => markInvoicePaidMutation.mutate(invoice.id)}
                                disabled={markInvoicePaidMutation.isPending}
                              >
                                <DollarSign className="mr-2 h-4 w-4" />
                                {markInvoicePaidMutation.isPending ? 'Processing...' : 'Mark Paid'}
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>


      </Tabs>

      {/* Purchase Order Creation Dialog */}
      <Dialog open={createPOOpen} onOpenChange={setCreatePOOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create Purchase Order from Estimate</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Select Approved Estimate Item</Label>
              <Select
                value={selectedEstimateItem?.id?.toString()}
                onValueChange={(value) => {
                  const item = approvedEstimateItems.find((i: any) => i.id.toString() === value);
                  setSelectedEstimateItem(item);
                  setPOAmount(item?.estimatedCost?.toString() || '');
                  setPODescription(item?.description || '');
                  
                  // Auto-populate start date from schedule
                  // Development logging removed
                  // Development logging removed
                  
                  const matchingTask = Array.isArray(projectTasks) ? projectTasks.find((task: any) => 
                    task.trade?.toLowerCase() === item?.trade?.toLowerCase() ||
                    task.estimateItemId === item?.id
                  ) : null;
                  
                  // Development logging removed
                  
                  if (matchingTask?.startDate) {
                    const formattedDate = new Date(matchingTask.startDate).toISOString().split('T')[0];
                    setPOStartDate(formattedDate);
                  } else {
                    // If no schedule exists, offer to create one or use default date
                    const today = new Date().toISOString().split('T')[0];
                    setPOStartDate(today);
                  }

                  // Auto-select vendor/subcontractor if they match
                  if (item?.vendor && subcontractors.length > 0) {
                    const matchingSubcontractor = subcontractors.find(sub => {
                      // Try exact company name match first
                      if (sub.company && sub.company.toLowerCase() === item.vendor.toLowerCase()) {
                        return true;
                      }
                      // Try exact name match
                      if (sub.name && sub.name.toLowerCase() === item.vendor.toLowerCase()) {
                        return true;
                      }
                      // Try partial match
                      if (sub.company && sub.company.toLowerCase().includes(item.vendor.toLowerCase())) {
                        return true;
                      }
                      if (sub.name && sub.name.toLowerCase().includes(item.vendor.toLowerCase())) {
                        return true;
                      }
                      // Try trade match as fallback
                      if (sub.trade && item.trade) {
                        return sub.trade.toLowerCase() === item.trade.toLowerCase();
                      }
                      return false;
                    });
                    
                    setSelectedSubcontractor(matchingSubcontractor || null);
                  } else {
                    setSelectedSubcontractor(null);
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select an approved estimate item" />
                </SelectTrigger>
                <SelectContent>
                  {approvedEstimateItems.map((item: any) => (
                    <SelectItem key={item.id} value={item.id.toString()}>
                      {item.trade} - ${item.estimatedCost?.toLocaleString()} ({item.vendor})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedEstimateItem && (
              <div>
                <Label>Select Subcontractor</Label>
                <SubcontractorComboBox
                  subcontractors={filteredSubcontractors}
                  value={selectedSubcontractor?.id?.toString()}
                  onValueChange={(value) => {
                    const sub = filteredSubcontractors.find(s => s.id.toString() === value);
                    setSelectedSubcontractor(sub);
                  }}
                  placeholder="Select a subcontractor"
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Amount</Label>
                <Input
                  type="number"
                  value={poAmount}
                  onChange={(e) => setPOAmount(e.target.value)}
                  placeholder="Enter amount"
                />
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <Label>
                    Start Date 
                    {Array.isArray(projectTasks) && projectTasks.find((task: any) => 
                      task.trade?.toLowerCase() === selectedEstimateItem?.trade?.toLowerCase() ||
                      task.estimateItemId === selectedEstimateItem?.id
                    ) ? ' (from Schedule)' : ' (default: today)'}
                  </Label>
                  {selectedEstimateItem && (!Array.isArray(projectTasks) || !projectTasks.find((task: any) => 
                    task.trade?.toLowerCase() === selectedEstimateItem?.trade?.toLowerCase() ||
                    task.estimateItemId === selectedEstimateItem?.id
                  )) && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        // Create a quick schedule task for this estimate item
                        const taskData = {
                          projectId: parseInt(projectId),
                          title: `${selectedEstimateItem.trade} Work`,
                          trade: selectedEstimateItem.trade,
                          contactId: selectedSubcontractor?.id,
                          estimateItemId: selectedEstimateItem.id,
                          startDate: poStartDate,
                          endDate: poStartDate, // Same day for now
                          duration: 1,
                          status: 'Scheduled',
                          description: selectedEstimateItem.description || `${selectedEstimateItem.trade} work`,
                          isAutoGenerated: false,
                          createdBy: user?.id || 1
                        };
                        
                        fetch(`/api/projects/${projectId}/tasks`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify(taskData)
                        }).then(() => {
                          // Refresh tasks data
                          queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/tasks`] });
                          toast({
                            title: "Schedule Task Created",
                            description: `Added ${selectedEstimateItem.trade} to project schedule`,
                          });
                        });
                      }}
                    >
                      Add to Schedule
                    </Button>
                  )}
                </div>
                <Input
                  type="date"
                  value={poStartDate}
                  onChange={(e) => setPOStartDate(e.target.value)}
                  className={poStartDate ? "bg-blue-50 border-blue-300" : ""}
                />
              </div>
            </div>

            <div>
              <Label>Description</Label>
              <Textarea
                value={poDescription}
                onChange={(e) => setPODescription(e.target.value)}
                placeholder="Enter work description"
                rows={3}
              />
            </div>

            {selectedEstimateItem && (
              <div className="bg-blue-50 border border-blue-200 p-4 rounded">
                <h4 className="font-medium mb-2 text-blue-800">Selected Estimate Details</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-gray-600">Trade</p>
                    <p className="font-medium">{selectedEstimateItem.trade}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Subcontractor</p>
                    <p className="font-medium">{selectedEstimateItem.vendor}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Amount</p>
                    <p className="font-medium text-green-600">${selectedEstimateItem.estimatedCost?.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Status</p>
                    <p className="font-medium text-theme-primary">{selectedEstimateItem.status}</p>
                  </div>
                </div>
                {selectedEstimateItem.description && (
                  <div className="mt-3 pt-3 border-t border-blue-200">
                    <p className="text-gray-600 text-sm">Description</p>
                    <p className="text-sm">{selectedEstimateItem.description}</p>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => setCreatePOOpen(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleCreatePO}
                disabled={createPOMutation.isPending || !selectedEstimateItem || !selectedSubcontractor || !poStartDate || !poAmount}
              >
                {createPOMutation.isPending ? 'Creating...' : 'Create Purchase Order'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Purchase Order Details Modal */}
      <Dialog open={poDetailsOpen} onOpenChange={setPODetailsOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              Purchase Order Details - {selectedPO?.poNumber}
              <Badge variant="secondary">{selectedPO?.status}</Badge>
            </DialogTitle>
          </DialogHeader>
          
          {selectedPO && (
            <div className="space-y-6">
              {/* PO Overview */}
              <div className="grid grid-cols-2 gap-6">
                <Card className="bg-gray-50">
                  <CardHeader>
                    <CardTitle className="text-lg">Purchase Order Information</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <Label className="text-sm font-medium text-gray-600">PO Number</Label>
                      <p className="text-lg font-semibold">{selectedPO.poNumber}</p>
                    </div>
                    <div>
                      <Label className="text-sm font-medium text-gray-600">Trade</Label>
                      <p>{selectedPO.trade}</p>
                    </div>
                    <div>
                      <Label className="text-sm font-medium text-gray-600">Amount</Label>
                      <p className="text-lg font-semibold text-green-600">
                        ${selectedPO.amount?.toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <Label className="text-sm font-medium text-gray-600">Start Date</Label>
                      <p>{selectedPO.startDate ? new Date(selectedPO.startDate).toLocaleDateString() : 'Not set'}</p>
                    </div>
                    <div>
                      <Label className="text-sm font-medium text-gray-600">Description</Label>
                      <p className="text-sm">{selectedPO.description}</p>
                    </div>
                  </CardContent>
                </Card>

                {/* Vendor Information */}
                <Card className="bg-gray-50">
                  <CardHeader>
                    <CardTitle className="text-lg">Vendor Information</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {poVendorDetails ? (
                      <>
                        <div>
                          <Label className="text-sm font-medium text-gray-600">Company</Label>
                          <p className="font-semibold">{poVendorDetails.company || poVendorDetails.name}</p>
                        </div>
                        <div>
                          <Label className="text-sm font-medium text-gray-600">Contact</Label>
                          <p>{poVendorDetails.name}</p>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Mail className="h-4 w-4 text-gray-500" />
                          <p className="text-sm">{poVendorDetails.email}</p>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Phone className="h-4 w-4 text-gray-500" />
                          <p className="text-sm">{poVendorDetails.phone}</p>
                        </div>
                        <div>
                          <Label className="text-sm font-medium text-gray-600">Trade Specialization</Label>
                          <p>{poVendorDetails.trade}</p>
                        </div>
                        {poVendorDetails.insurance_expiry_date && (
                          <div>
                            <Label className="text-sm font-medium text-gray-600">Insurance Expires</Label>
                            <p className={`text-sm ${new Date(poVendorDetails.insurance_expiry_date) < new Date() ? 'text-red-600' : 'text-green-600'}`}>
                              {new Date(poVendorDetails.insurance_expiry_date).toLocaleDateString()}
                            </p>
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="text-gray-500">Loading vendor details...</p>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Status History */}
              {selectedPO.statusHistory && (
                <Card className="bg-gray-50">
                  <CardHeader>
                    <CardTitle className="text-lg">Status History</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {(typeof selectedPO.statusHistory === 'string' 
                        ? JSON.parse(selectedPO.statusHistory) 
                        : selectedPO.statusHistory || []
                      ).map((history: any, index: number) => (
                        <div key={index} className="flex items-center space-x-3 border-l-2 border-blue-200 pl-4">
                          <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                          <div className="flex-1">
                            <div className="flex justify-between items-center">
                              <span className="font-medium capitalize">{history.status}</span>
                              <span className="text-sm text-gray-500">
                                {new Date(history.date).toLocaleDateString()}
                              </span>
                            </div>
                            {history.note && <p className="text-sm text-gray-600">{history.note}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Terms and Conditions */}
              <Card className="bg-gray-50">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center justify-between">
                    Terms and Conditions
                    {(hasRole('Admin') || hasRole('ProjectManager')) && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (editingTerms) {
                            handleSaveTerms();
                          } else {
                            setEditingTerms(true);
                          }
                        }}
                        disabled={updatePOTermsMutation.isPending}
                      >
                        {editingTerms ? (
                          <>
                            <Save className="h-4 w-4 mr-2" />
                            {updatePOTermsMutation.isPending ? 'Saving...' : 'Save'}
                          </>
                        ) : (
                          <>
                            <Edit2 className="h-4 w-4 mr-2" />
                            Edit
                          </>
                        )}
                      </Button>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {editingTerms ? (
                    <div className="space-y-3">
                      <Textarea
                        value={termsAndConditions}
                        onChange={(e) => setTermsAndConditions(e.target.value)}
                        placeholder="Enter terms and conditions for this purchase order..."
                        rows={8}
                        className="w-full"
                      />
                      <div className="flex justify-end space-x-2">
                        <Button
                          variant="outline"
                          onClick={() => {
                            setEditingTerms(false);
                            setTermsAndConditions(selectedPO.termsAndConditions || '');
                          }}
                        >
                          <X className="h-4 w-4 mr-2" />
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="min-h-[100px] p-4 bg-gray-50 rounded border">
                      {termsAndConditions ? (
                        <pre className="whitespace-pre-wrap text-sm">{termsAndConditions}</pre>
                      ) : (
                        <p className="text-gray-500 italic">No terms and conditions specified</p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Action Buttons */}
              <div className="flex justify-between items-center pt-4 border-t">
                <div>
                  {(hasRole('Admin') || hasRole('ProjectManager')) && (
                    <Button
                      variant="destructive"
                      onClick={() => {
                        if (confirm(`Are you sure you want to delete ${selectedPO.poNumber}? This action cannot be undone.`)) {
                          deletePOMutation.mutate(selectedPO.id);
                        }
                      }}
                      disabled={deletePOMutation.isPending}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      {deletePOMutation.isPending ? 'Deleting...' : 'Delete PO'}
                    </Button>
                  )}
                </div>
                
                <div className="flex space-x-3">
                  <Button variant="outline" onClick={() => setPODetailsOpen(false)}>
                    Close
                  </Button>
                  {(hasRole('Admin') || hasRole('ProjectManager')) && selectedPO.status === 'draft' && (
                    <Button className="bg-theme-primary hover:bg-theme-primary-hover">
                      <Send className="h-4 w-4 mr-2" />
                      Send to Subcontractor
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Invoice Creation Dialog */}
      <Dialog open={createInvoiceOpen} onOpenChange={setCreateInvoiceOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create New Invoice</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateInvoice} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="invoice-number">Invoice Number *</Label>
                <Input
                  id="invoice-number"
                  value={invoiceFormData.invoiceNumber}
                  onChange={(e) => handleInvoiceFormChange('invoiceNumber', e.target.value)}
                  placeholder="INV-2025-001"
                  required
                />
              </div>
              <div>
                <Label htmlFor="trade">Trade *</Label>
                <TradeTypeComboBox
                  value={invoiceFormData.trade}
                  onValueChange={(value) => handleInvoiceFormChange('trade', value)}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="subcontractor">Subcontractor *</Label>
              <SubcontractorComboBox
                subcontractors={subcontractors}
                value={invoiceFormData.contactId}
                onValueChange={(value) => handleInvoiceFormChange('contactId', value)}
                placeholder="Select subcontractor"
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label htmlFor="amount">Total Amount *</Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  value={invoiceFormData.amount}
                  onChange={(e) => handleInvoiceFormChange('amount', e.target.value)}
                  placeholder="0.00"
                  required
                />
              </div>
              <div>
                <Label htmlFor="labor-cost">Labor Cost</Label>
                <Input
                  id="labor-cost"
                  type="number"
                  step="0.01"
                  value={invoiceFormData.laborCost}
                  onChange={(e) => handleInvoiceFormChange('laborCost', e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div>
                <Label htmlFor="material-cost">Material Cost</Label>
                <Input
                  id="material-cost"
                  type="number"
                  step="0.01"
                  value={invoiceFormData.materialCost}
                  onChange={(e) => handleInvoiceFormChange('materialCost', e.target.value)}
                  placeholder="0.00"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="work-period">Work Period</Label>
                <Input
                  id="work-period"
                  value={invoiceFormData.workPeriod}
                  onChange={(e) => handleInvoiceFormChange('workPeriod', e.target.value)}
                  placeholder="e.g., Jan 1-15, 2025"
                />
              </div>
              <div>
                <Label htmlFor="submitted-date">Submitted Date</Label>
                <Input
                  id="submitted-date"
                  type="date"
                  value={invoiceFormData.submittedDate}
                  onChange={(e) => handleInvoiceFormChange('submittedDate', e.target.value)}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={invoiceFormData.description}
                onChange={(e) => handleInvoiceFormChange('description', e.target.value)}
                placeholder="Enter detailed description of work performed..."
                rows={3}
              />
            </div>

            <div className="flex justify-end space-x-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateInvoiceOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createInvoiceMutation.isPending}
                className="bg-theme-primary hover:bg-theme-primary-hover"
              >
                {createInvoiceMutation.isPending ? 'Creating...' : 'Create Invoice'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Document Preview Dialog */}
      <Dialog open={previewDialogOpen} onOpenChange={setPreviewDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Document Preview: {previewDocument?.originalFileName}
            </DialogTitle>
          </DialogHeader>
          
          <div className="flex-1 overflow-hidden">
            {previewDocument && (
              <div className="h-[70vh] w-full">
                {canPreviewInline(previewDocument.originalFileName) ? (
                  <div className="h-full w-full">
                    {getFileExtension(previewDocument.originalFileName) === 'pdf' ? (
                      <div className="h-full w-full flex flex-col">
                        <div className="flex-1 bg-gray-100 rounded border flex items-center justify-center">
                          <div className="text-center space-y-4">
                            <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
                              <FileText className="h-8 w-8 text-red-600" />
                            </div>
                            <div>
                              <h3 className="text-lg font-medium text-gray-900 mb-2">PDF Document Preview</h3>
                              <p className="text-sm text-gray-600 mb-4">
                                {previewDocument.originalFileName}
                              </p>
                              <div className="space-y-2">
                                <Button
                                  onClick={() => window.open(previewDocument.fileUrl, '_blank')}
                                  className="bg-blue-600 hover:bg-blue-700 text-white"
                                >
                                  <Eye className="mr-2 h-4 w-4" />
                                  Open in New Tab
                                </Button>
                                <Button
                                  variant="outline"
                                  onClick={() => {
                                    const link = document.createElement('a');
                                    link.href = previewDocument.fileUrl;
                                    link.download = previewDocument.originalFileName;
                                    document.body.appendChild(link);
                                    link.click();
                                    document.body.removeChild(link);
                                  }}
                                >
                                  <Download className="mr-2 h-4 w-4" />
                                  Download PDF
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="h-full w-full flex items-center justify-center bg-gray-50 rounded">
                        <img
                          src={previewDocument.fileUrl}
                          alt={previewDocument.originalFileName}
                          className="max-w-full max-h-full object-contain"
                        />
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="h-full w-full flex flex-col items-center justify-center bg-gray-50 rounded">
                    <FileIcon className="h-16 w-16 text-gray-400 mb-4" />
                    <p className="text-lg font-medium text-gray-600 mb-2">
                      Preview not available
                    </p>
                    <p className="text-sm text-gray-500 mb-4">
                      This file type cannot be previewed inline
                    </p>
                    <Button
                      onClick={() => window.open(previewDocument.fileUrl, '_blank')}
                      className="bg-theme-primary hover:bg-theme-primary-hover"
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Download to View
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between pt-4 border-t">
            <div className="flex items-center gap-4 text-sm text-gray-600">
              <span>File size: {previewDocument?.fileSize ? formatFileSize(previewDocument.fileSize) : 'Unknown'}</span>
              <span>•</span>
              <span>Uploaded: {previewDocument?.createdAt ? new Date(previewDocument.createdAt).toLocaleDateString() : 'Unknown'}</span>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => window.open(previewDocument?.fileUrl, '_blank')}
              >
                <Download className="mr-2 h-4 w-4" />
                Download
              </Button>
              <Button
                variant="outline"
                onClick={() => setPreviewDialogOpen(false)}
              >
                Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}