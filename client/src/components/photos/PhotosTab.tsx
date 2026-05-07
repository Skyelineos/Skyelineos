import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { 
  Camera, 
  Upload, 
  Filter, 
  MoreVertical, 
  Eye, 
  EyeOff, 
  Check, 
  X, 
  Download,
  Calendar,
  User,
  Tag,
  Grid,
  List,
  Maximize,
  Minimize,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

interface ProjectPhoto {
  id: number;
  projectId: number;
  url: string;
  uploadedBy: number;
  role: string;
  caption?: string;
  category?: string;
  visibleToClient: boolean;
  approvedByAdmin: boolean;
  fileName: string;
  fileSize: number;
  createdAt: string;
}

interface PhotosTabProps {
  projectId: string;
}

// Mock current user for role-based functionality
const getCurrentUser = () => ({
  id: 1,
  role: 'Admin' // This would come from auth context in real app
});

const PHOTO_CATEGORIES = [
  'Progress',
  'Framing', 
  'Foundation',
  'Roofing',
  'Electrical',
  'Plumbing',
  'HVAC',
  'Drywall',
  'Flooring',
  'Kitchen',
  'Bathroom',
  'Exterior',
  'Landscaping',
  'Punchlist',
  'Inspection',
  'Before/After',
  'Other'
];

export default function PhotosTab({ projectId }: PhotosTabProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const currentUser = getCurrentUser();

  // State for upload form
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadCaption, setUploadCaption] = useState('');
  const [uploadCategory, setUploadCategory] = useState('');
  const [visibleToClient, setVisibleToClient] = useState(true);

  // State for filters
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterUploader, setFilterUploader] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedPhotos, setSelectedPhotos] = useState<number[]>([]);
  const [expandedPhoto, setExpandedPhoto] = useState<ProjectPhoto | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);

  // Fetch photos based on current user role
  const { data: photos = [], isLoading } = useQuery({
    queryKey: [`/api/projects/${projectId}/photos`, currentUser.role],
    queryFn: () => apiRequest(`/api/projects/${projectId}/photos?role=${currentUser.role}`, 'GET'),
  });

  // Upload photo mutation
  const uploadPhotoMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const response = await fetch(`/api/projects/${projectId}/photos`, {
        method: 'POST',
        body: formData,
      });
      if (!response.ok) {
        throw new Error('Failed to upload photo');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/photos`] });
      setUploadDialogOpen(false);
      setSelectedFile(null);
      setUploadCaption('');
      setUploadCategory('');
      setVisibleToClient(true);
      toast({
        title: "Photo Uploaded",
        description: "Your photo has been uploaded successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Upload Failed",
        description: error.message || "Failed to upload photo",
        variant: "destructive",
      });
    },
  });

  // Toggle photo visibility mutation
  const toggleVisibilityMutation = useMutation({
    mutationFn: async ({ photoId, visible }: { photoId: number; visible: boolean }) => {
      return apiRequest(`/api/photos/${photoId}/visibility`, 'PATCH', { visibleToClient: visible });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/photos`] });
      toast({
        title: "Visibility Updated",
        description: "Photo visibility has been updated.",
      });
    },
  });

  // Approve photo mutation
  const approvePhotoMutation = useMutation({
    mutationFn: async (photoId: number) => {
      return apiRequest(`/api/photos/${photoId}/approve`, 'PATCH', { approvedBy: currentUser.id });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/photos`] });
      toast({
        title: "Photo Approved",
        description: "Photo has been approved.",
      });
    },
  });

  // Delete photo mutation
  const deletePhotoMutation = useMutation({
    mutationFn: async (photoId: number) => {
      return apiRequest(`/api/photos/${photoId}`, 'DELETE');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/photos`] });
      toast({
        title: "Photo Deleted",
        description: "Photo has been deleted.",
      });
    },
  });

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        toast({
          title: "Invalid File",
          description: "Please select an image file.",
          variant: "destructive",
        });
        return;
      }
      
      // Validate file size (10MB max)
      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: "File Too Large",
          description: "Please select a file smaller than 10MB.",
          variant: "destructive",
        });
        return;
      }

      setSelectedFile(file);
    }
  };

  const handleUpload = () => {
    if (!selectedFile) {
      toast({
        title: "No File Selected",
        description: "Please select a photo to upload.",
        variant: "destructive",
      });
      return;
    }

    const formData = new FormData();
    formData.append('photo', selectedFile);
    formData.append('caption', uploadCaption);
    formData.append('category', uploadCategory);
    formData.append('role', currentUser.role);
    formData.append('uploadedBy', currentUser.id.toString());
    
    // Only Admin/PM can set visibility, others default based on role
    if (currentUser.role === 'Admin' || currentUser.role === 'ProjectManager') {
      formData.append('visibleToClient', visibleToClient.toString());
    }

    uploadPhotoMutation.mutate(formData);
  };

  // Get filtered photos
  const filteredPhotos = photos.filter((photo: ProjectPhoto) => {
    const categoryMatch = filterCategory === 'all' || photo.category === filterCategory;
    const uploaderMatch = filterUploader === 'all' || photo.role === filterUploader;
    const statusMatch = filterStatus === 'all' || 
      (filterStatus === 'visible' && photo.visibleToClient) ||
      (filterStatus === 'hidden' && !photo.visibleToClient) ||
      (filterStatus === 'approved' && photo.approvedByAdmin) ||
      (filterStatus === 'pending' && !photo.approvedByAdmin);
    
    return categoryMatch && uploaderMatch && statusMatch;
  });

  // Navigation functions
  const navigateToPhoto = (direction: 'prev' | 'next') => {
    if (!filteredPhotos.length) return;
    
    let newIndex;
    if (direction === 'prev') {
      newIndex = currentPhotoIndex > 0 ? currentPhotoIndex - 1 : filteredPhotos.length - 1;
    } else {
      newIndex = currentPhotoIndex < filteredPhotos.length - 1 ? currentPhotoIndex + 1 : 0;
    }
    
    setCurrentPhotoIndex(newIndex);
    setExpandedPhoto(filteredPhotos[newIndex]);
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!expandedPhoto) return;
      
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        navigateToPhoto('prev');
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        navigateToPhoto('next');
      } else if (event.key === 'Escape') {
        event.preventDefault();
        setExpandedPhoto(null);
        setIsFullscreen(false);
      }
    };

    if (expandedPhoto) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [expandedPhoto]);

  // Update current photo when expanded photo changes
  useEffect(() => {
    if (expandedPhoto) {
      const index = filteredPhotos.findIndex((p: ProjectPhoto) => p.id === expandedPhoto.id);
      if (index !== -1 && index !== currentPhotoIndex) {
        setCurrentPhotoIndex(index);
      }
    }
  }, [expandedPhoto]);


  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'Admin': return 'bg-red-100 text-red-800';
      case 'ProjectManager': return 'bg-blue-100 text-blue-800';
      case 'Client': return 'bg-green-100 text-green-800';
      case 'Subcontractor': return 'bg-orange-100 text-orange-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const canEditPhoto = (photo: ProjectPhoto) => {
    if (currentUser.role === 'Admin') return true;
    if (currentUser.role === 'ProjectManager') return true;
    if (currentUser.role === 'Subcontractor' && photo.uploadedBy === currentUser.id) return false; // Subs can't edit
    return false;
  };

  const canDeletePhoto = (photo: ProjectPhoto) => {
    if (currentUser.role === 'Admin') return true;
    if (currentUser.role === 'ProjectManager') return true;
    return false;
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
      {/* Header with Upload Button and Filters */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold">Project Photos</h2>
          <p className="text-muted-foreground">
            Upload and manage construction progress photos
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* View Mode Toggle */}
          <div className="flex rounded-md border">
            <Button
              variant={viewMode === 'grid' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('grid')}
            >
              <Grid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'list' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('list')}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>

          {/* Upload Button */}
          <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Camera className="mr-2 h-4 w-4" />
                Upload Photo
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Upload Photo</DialogTitle>
                <DialogDescription>
                  Add a new photo to this project
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Photo File</Label>
                  <div 
                    className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-gray-400 transition-colors"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                    {selectedFile ? (
                      <div className="space-y-2">
                        <img 
                          src={URL.createObjectURL(selectedFile)} 
                          alt="Preview" 
                          className="mx-auto h-32 w-32 object-cover rounded-lg"
                        />
                        <p className="text-sm font-medium">{selectedFile.name}</p>
                        <p className="text-xs text-muted-foreground">{formatFileSize(selectedFile.size)}</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Upload className="mx-auto h-8 w-8 text-gray-400" />
                        <p className="text-sm text-gray-600">Click to select a photo</p>
                        <p className="text-xs text-gray-500">JPG, PNG, GIF up to 10MB</p>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <Label>Caption (Optional)</Label>
                  <Textarea
                    value={uploadCaption}
                    onChange={(e) => setUploadCaption(e.target.value)}
                    placeholder="Add a description for this photo..."
                    rows={3}
                  />
                </div>

                <div>
                  <Label>Category</Label>
                  <Select value={uploadCategory} onValueChange={setUploadCategory}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a category" />
                    </SelectTrigger>
                    <SelectContent>
                      {PHOTO_CATEGORIES.map((category) => (
                        <SelectItem key={category} value={category}>
                          {category}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Visibility checkbox for Admin/PM only */}
                {(currentUser.role === 'Admin' || currentUser.role === 'ProjectManager') && (
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="visibleToClient"
                      checked={visibleToClient}
                      onCheckedChange={(checked) => setVisibleToClient(checked === true)}
                    />
                    <Label htmlFor="visibleToClient">Visible to Client</Label>
                  </div>
                )}

                <div className="flex gap-2">
                  <Button 
                    onClick={handleUpload} 
                    disabled={!selectedFile || uploadPhotoMutation.isPending}
                    className="flex-1"
                  >
                    {uploadPhotoMutation.isPending ? 'Uploading...' : 'Upload Photo'}
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={() => setUploadDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Filters */}
      <Card className="bg-gray-50">
        <CardHeader>
          <CardTitle className="flex items-center text-lg">
            <Filter className="mr-2 h-5 w-5" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <Label>Category</Label>
              <Select value={filterCategory} onValueChange={setFilterCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {PHOTO_CATEGORIES.map((category) => (
                    <SelectItem key={category} value={category}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Uploaded By</Label>
              <Select value={filterUploader} onValueChange={setFilterUploader}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Users</SelectItem>
                  <SelectItem value="Admin">Admin</SelectItem>
                  <SelectItem value="ProjectManager">Project Manager</SelectItem>
                  <SelectItem value="Client">Client</SelectItem>
                  <SelectItem value="Subcontractor">Subcontractor</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Status</Label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="pending">Pending Approval</SelectItem>
                  <SelectItem value="visible">Visible to Client</SelectItem>
                  <SelectItem value="hidden">Hidden from Client</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-end">
              <Button 
                variant="outline" 
                onClick={() => {
                  setFilterCategory('all');
                  setFilterUploader('all');
                  setFilterStatus('all');
                }}
                className="w-full"
              >
                Clear Filters
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Photos Grid/List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {filteredPhotos.length} of {photos.length} photos
          </p>
        </div>

        {filteredPhotos.length === 0 ? (
          <Card className="bg-gray-50">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Camera className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No Photos Found</h3>
              <p className="text-muted-foreground text-center mb-4">
                {photos.length === 0 
                  ? "Upload your first project photo to get started."
                  : "No photos match your current filters."
                }
              </p>
              {photos.length === 0 && (
                <Button onClick={() => setUploadDialogOpen(true)}>
                  <Camera className="mr-2 h-4 w-4" />
                  Upload First Photo
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className={viewMode === 'grid' 
            ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
            : "space-y-4"
          }>
            {filteredPhotos.map((photo: ProjectPhoto) => (
              <Card key={photo.id} className={viewMode === 'list' ? "flex" : ""}>
                {viewMode === 'grid' ? (
                  <div>
                    <div className="relative">
                      <img
                        src={photo.url}
                        alt={photo.caption || 'Project photo'}
                        className="w-full h-48 object-cover rounded-t-lg cursor-pointer hover:opacity-90 transition-opacity"
                        onClick={() => {
                          setExpandedPhoto(photo);
                          setCurrentPhotoIndex(filteredPhotos.findIndex((p: ProjectPhoto) => p.id === photo.id));
                        }}
                      />
                      
                      {/* Admin/PM Controls Overlay */}
                      {(currentUser.role === 'Admin' || currentUser.role === 'ProjectManager') && (
                        <div className="absolute top-2 right-2">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="secondary" size="sm" className="h-8 w-8 p-0">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => toggleVisibilityMutation.mutate({
                                  photoId: photo.id,
                                  visible: !photo.visibleToClient
                                })}
                              >
                                {photo.visibleToClient ? (
                                  <>
                                    <EyeOff className="mr-2 h-4 w-4" />
                                    Hide from Client
                                  </>
                                ) : (
                                  <>
                                    <Eye className="mr-2 h-4 w-4" />
                                    Show to Client
                                  </>
                                )}
                              </DropdownMenuItem>
                              
                              {!photo.approvedByAdmin && (
                                <DropdownMenuItem
                                  onClick={() => approvePhotoMutation.mutate(photo.id)}
                                >
                                  <Check className="mr-2 h-4 w-4" />
                                  Approve Photo
                                </DropdownMenuItem>
                              )}
                              
                              <DropdownMenuItem
                                onClick={() => window.open(photo.url, '_blank')}
                              >
                                <Download className="mr-2 h-4 w-4" />
                                Download
                              </DropdownMenuItem>
                              
                              {canDeletePhoto(photo) && (
                                <DropdownMenuItem
                                  onClick={() => deletePhotoMutation.mutate(photo.id)}
                                  className="text-red-600"
                                >
                                  <X className="mr-2 h-4 w-4" />
                                  Delete
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      )}

                      {/* Status Badges */}
                      <div className="absolute bottom-2 left-2 flex gap-1">
                        {!photo.visibleToClient && (
                          <Badge variant="secondary" className="text-xs">
                            <EyeOff className="mr-1 h-3 w-3" />
                            Hidden
                          </Badge>
                        )}
                        {!photo.approvedByAdmin && photo.role === 'Subcontractor' && (
                          <Badge variant="outline" className="text-xs bg-yellow-50 text-yellow-700">
                            Pending
                          </Badge>
                        )}
                      </div>
                    </div>

                    <CardContent className="p-4">
                      <div className="space-y-2">
                        {photo.caption && (
                          <p className="text-sm text-gray-700 line-clamp-2">{photo.caption}</p>
                        )}
                        
                        <div className="flex items-center justify-between">
                          {photo.category && (
                            <Badge variant="outline" className="text-xs">
                              <Tag className="mr-1 h-3 w-3" />
                              {photo.category}
                            </Badge>
                          )}
                          <Badge className={`text-xs ${getRoleBadgeColor(photo.role)}`}>
                            {photo.role}
                          </Badge>
                        </div>

                        <div className="text-xs text-muted-foreground flex items-center justify-between">
                          <span className="flex items-center">
                            <Calendar className="mr-1 h-3 w-3" />
                            {formatDate(photo.createdAt)}
                          </span>
                          <span>{formatFileSize(photo.fileSize)}</span>
                        </div>
                      </div>
                    </CardContent>
                  </div>
                ) : (
                  <div className="flex w-full">
                    <img
                      src={photo.url}
                      alt={photo.caption || 'Project photo'}
                      className="w-24 h-24 object-cover rounded-l-lg flex-shrink-0 cursor-pointer hover:opacity-90 transition-opacity"
                      onClick={() => {
                        setExpandedPhoto(photo);
                        setCurrentPhotoIndex(filteredPhotos.findIndex((p: ProjectPhoto) => p.id === photo.id));
                      }}
                    />
                    <CardContent className="flex-1 p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge className={`text-xs ${getRoleBadgeColor(photo.role)}`}>
                              {photo.role}
                            </Badge>
                            {photo.category && (
                              <Badge variant="outline" className="text-xs">
                                {photo.category}
                              </Badge>
                            )}
                            {!photo.visibleToClient && (
                              <Badge variant="secondary" className="text-xs">
                                Hidden
                              </Badge>
                            )}
                          </div>
                          
                          {photo.caption && (
                            <p className="text-sm text-gray-700 mb-2">{photo.caption}</p>
                          )}
                          
                          <div className="text-xs text-muted-foreground">
                            {formatDate(photo.createdAt)} • {formatFileSize(photo.fileSize)}
                          </div>
                        </div>

                        {(currentUser.role === 'Admin' || currentUser.role === 'ProjectManager') && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => toggleVisibilityMutation.mutate({
                                  photoId: photo.id,
                                  visible: !photo.visibleToClient
                                })}
                              >
                                {photo.visibleToClient ? (
                                  <>
                                    <EyeOff className="mr-2 h-4 w-4" />
                                    Hide from Client
                                  </>
                                ) : (
                                  <>
                                    <Eye className="mr-2 h-4 w-4" />
                                    Show to Client
                                  </>
                                )}
                              </DropdownMenuItem>
                              
                              {!photo.approvedByAdmin && (
                                <DropdownMenuItem
                                  onClick={() => approvePhotoMutation.mutate(photo.id)}
                                >
                                  <Check className="mr-2 h-4 w-4" />
                                  Approve Photo
                                </DropdownMenuItem>
                              )}
                              
                              <DropdownMenuItem
                                onClick={() => window.open(photo.url, '_blank')}
                              >
                                <Download className="mr-2 h-4 w-4" />
                                Download
                              </DropdownMenuItem>
                              
                              {canDeletePhoto(photo) && (
                                <DropdownMenuItem
                                  onClick={() => deletePhotoMutation.mutate(photo.id)}
                                  className="text-red-600"
                                >
                                  <X className="mr-2 h-4 w-4" />
                                  Delete
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    </CardContent>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Expanded Photo Modal */}
      <Dialog open={!!expandedPhoto} onOpenChange={() => {
        setExpandedPhoto(null);
        setIsFullscreen(false);
      }}>
        <DialogContent className={`${isFullscreen ? 'max-w-[100vw] max-h-[100vh] w-full h-full' : 'max-w-4xl max-h-[90vh]'} p-0`}>
          {expandedPhoto && (
            <div className="flex flex-col h-full">
              {/* Header */}
              <div className="flex items-center justify-between p-4 pr-12 border-b">
                <div className="flex items-center gap-3">
                  <Badge className={`${getRoleBadgeColor(expandedPhoto.role)}`}>
                    {expandedPhoto.role}
                  </Badge>
                  {expandedPhoto.category && (
                    <Badge variant="outline">
                      <Tag className="mr-1 h-3 w-3" />
                      {expandedPhoto.category}
                    </Badge>
                  )}
                  {!expandedPhoto.visibleToClient && (
                    <Badge variant="secondary">
                      <EyeOff className="mr-1 h-3 w-3" />
                      Hidden from Client
                    </Badge>
                  )}
                  {!expandedPhoto.approvedByAdmin && expandedPhoto.role === 'Subcontractor' && (
                    <Badge variant="outline" className="bg-yellow-50 text-yellow-700">
                      Pending Approval
                    </Badge>
                  )}
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Fullscreen toggle - available to all users */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsFullscreen(!isFullscreen)}
                  >
                    {isFullscreen ? (
                      <>
                        <Minimize className="mr-2 h-4 w-4" />
                        Exit Fullscreen
                      </>
                    ) : (
                      <>
                        <Maximize className="mr-2 h-4 w-4" />
                        Fullscreen
                      </>
                    )}
                  </Button>

                  {/* Admin/PM specific actions */}
                  {(currentUser.role === 'Admin' || currentUser.role === 'ProjectManager') && (
                    <>
                      {!expandedPhoto.approvedByAdmin && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => approvePhotoMutation.mutate(expandedPhoto.id)}
                        >
                          <Check className="mr-2 h-4 w-4" />
                          Approve
                        </Button>
                      )}

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(expandedPhoto.url, '_blank')}
                      >
                        <Download className="mr-2 h-4 w-4" />
                        Download
                      </Button>

                      {/* Dropdown menu for destructive actions */}
                      {canDeletePhoto(expandedPhoto) && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => {
                                deletePhotoMutation.mutate(expandedPhoto.id);
                                setExpandedPhoto(null);
                              }}
                              className="text-red-600 hover:text-red-700 focus:text-red-700"
                            >
                              <X className="mr-2 h-4 w-4" />
                              Delete Photo
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Image with Navigation */}
              <div className={`flex-1 flex items-center justify-center bg-gray-50 ${isFullscreen ? 'p-0' : 'p-4'} relative`}>
                {/* Previous Button */}
                {filteredPhotos.length > 1 && (
                  <Button
                    variant="outline"
                    size="icon"
                    className="absolute left-4 top-1/2 transform -translate-y-1/2 z-10 bg-white/90 hover:bg-white"
                    onClick={() => navigateToPhoto('prev')}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                )}

                <img
                  src={expandedPhoto.url}
                  alt={expandedPhoto.caption || 'Project photo'}
                  className={`${isFullscreen ? 'w-full h-full object-contain' : 'max-w-full max-h-full object-contain rounded-lg shadow-lg'}`}
                />

                {/* Next Button */}
                {filteredPhotos.length > 1 && (
                  <Button
                    variant="outline"
                    size="icon"
                    className="absolute right-4 top-1/2 transform -translate-y-1/2 z-10 bg-white/90 hover:bg-white"
                    onClick={() => navigateToPhoto('next')}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                )}

                {/* Photo Counter */}
                {filteredPhotos.length > 1 && (
                  <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-black/60 text-white px-3 py-1 rounded-full text-sm">
                    {currentPhotoIndex + 1} of {filteredPhotos.length}
                  </div>
                )}
              </div>

              {/* Footer with details - hidden in fullscreen */}
              {!isFullscreen && (
                <div className="p-4 border-t bg-white">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <h3 className="font-semibold text-lg">Photo Details</h3>
                    {expandedPhoto.caption && (
                      <div>
                        <Label className="text-sm font-medium text-muted-foreground">Caption</Label>
                        <p className="text-sm">{expandedPhoto.caption}</p>
                      </div>
                    )}
                    
                    <div>
                      <Label className="text-sm font-medium text-muted-foreground">File Name</Label>
                      <p className="text-sm font-mono">{expandedPhoto.fileName}</p>
                    </div>

                    <div>
                      <Label className="text-sm font-medium text-muted-foreground">File Size</Label>
                      <p className="text-sm">{formatFileSize(expandedPhoto.fileSize)}</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h3 className="font-semibold text-lg">Upload Information</h3>
                    
                    <div>
                      <Label className="text-sm font-medium text-muted-foreground">Uploaded By</Label>
                      <p className="text-sm">{expandedPhoto.role} (ID: {expandedPhoto.uploadedBy})</p>
                    </div>

                    <div>
                      <Label className="text-sm font-medium text-muted-foreground">Upload Date</Label>
                      <p className="text-sm flex items-center">
                        <Calendar className="mr-1 h-3 w-3" />
                        {formatDate(expandedPhoto.createdAt)}
                      </p>
                    </div>

                    <div>
                      <Label className="text-sm font-medium text-muted-foreground">Visibility Status</Label>
                      <div className="flex items-center gap-2 mt-1">
                        {expandedPhoto.visibleToClient ? (
                          <Badge variant="outline" className="bg-green-50 text-green-700">
                            <Eye className="mr-1 h-3 w-3" />
                            Visible to Client
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-red-50 text-red-700">
                            <EyeOff className="mr-1 h-3 w-3" />
                            Hidden from Client
                          </Badge>
                        )}
                        
                        {expandedPhoto.approvedByAdmin ? (
                          <Badge variant="outline" className="bg-green-50 text-green-700">
                            <Check className="mr-1 h-3 w-3" />
                            Approved
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-yellow-50 text-yellow-700">
                            Pending Approval
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}