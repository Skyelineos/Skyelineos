import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Settings as SettingsIcon,
  User,
  Bell,
  Shield,
  Building,
  Save,
  Moon,
  Sun,
  MapPin,
  Cloud,
  Plus,
  X,
  Upload,
  Image,
  Trash2
} from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { ThemeSettings } from '@/components/settings/ThemeSettings';
import DefaultAgreementUpload from '@/components/admin/DefaultAgreementUpload';
import { useBranding } from '@/contexts/BrandingContext';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { WeatherLocation, InsertWeatherLocation } from "@shared/schema";

export default function Settings() {
  const { accentColor } = useTheme();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { logoUrl, isLoading: brandingLoading, uploadLogo, removeLogo } = useBranding();
  
  // Weather location management state
  const [newLocation, setNewLocation] = useState({ name: '', city: '', state: '', zipCode: '' });
  const [isAddingLocation, setIsAddingLocation] = useState(false);
  
  // Logo upload state
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  
  // User preferences state
  const [preferences, setPreferences] = useState({
    timezone: localStorage.getItem('userTimezone') || 'est',
    dateFormat: localStorage.getItem('userDateFormat') || 'mm-dd-yyyy',
    sessionTimeout: localStorage.getItem('userSessionTimeout') || '30'
  });
  const [hasUnsavedPreferences, setHasUnsavedPreferences] = useState(false);

  // API queries and mutations
  const { data: weatherLocations = [], isLoading } = useQuery<WeatherLocation[]>({
    queryKey: ['/api/weather/locations'],
  });

  const createLocationMutation = useMutation({
    mutationFn: async (data: InsertWeatherLocation) => {
      return apiRequest('POST', '/api/weather/locations', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/weather/locations'] });
      setNewLocation({ name: '', city: '', state: '', zipCode: '' });
      setIsAddingLocation(false);
      toast({
        title: "Location Added",
        description: "Weather location has been added successfully"
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add weather location",
        variant: "destructive"
      });
    }
  });

  const deleteLocationMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest('DELETE', `/api/weather/locations/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/weather/locations'] });
      toast({
        title: "Location Removed",
        description: "Weather location has been removed successfully"
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to remove weather location",
        variant: "destructive"
      });
    }
  });

  const setDefaultMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest('POST', `/api/weather/locations/${id}/set-default`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/weather/locations'] });
      // Also invalidate weather forecast cache so dashboard updates immediately
      queryClient.invalidateQueries({ queryKey: ['weather-forecast'] });
      toast({
        title: "Default Updated",
        description: "Default weather location has been updated"
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to set default weather location",
        variant: "destructive"
      });
    }
  });

  const handleAddLocation = () => {
    if (!newLocation.name || !newLocation.city || !newLocation.state || !newLocation.zipCode) {
      toast({
        title: "Incomplete Information",
        description: "Please fill in all location fields",
        variant: "destructive"
      });
      return;
    }

    createLocationMutation.mutate({
      ...newLocation,
      isDefault: false
    });
  };

  const handleRemoveLocation = (id: number) => {
    const locationToRemove = weatherLocations.find(loc => loc.id === id);
    if (locationToRemove?.isDefault) {
      toast({
        title: "Cannot Remove Default",
        description: "You cannot remove the default weather location",
        variant: "destructive"
      });
      return;
    }

    deleteLocationMutation.mutate(id);
  };

  const handleSetDefault = (id: number) => {
    setDefaultMutation.mutate(id);
  };

  // Preferences handlers
  const handlePreferenceChange = (key: string, value: string) => {
    setPreferences(prev => ({ ...prev, [key]: value }));
    setHasUnsavedPreferences(true);
  };

  const savePreferences = () => {
    try {
      localStorage.setItem('userTimezone', preferences.timezone);
      localStorage.setItem('userDateFormat', preferences.dateFormat);
      localStorage.setItem('userSessionTimeout', preferences.sessionTimeout);
      setHasUnsavedPreferences(false);
      toast({
        title: "Preferences Saved",
        description: "Your preferences have been updated successfully"
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save preferences",
        variant: "destructive"
      });
    }
  };

  const discardPreferences = () => {
    setPreferences({
      timezone: localStorage.getItem('userTimezone') || 'est',
      dateFormat: localStorage.getItem('userDateFormat') || 'mm-dd-yyyy',
      sessionTimeout: localStorage.getItem('userSessionTimeout') || '30'
    });
    setHasUnsavedPreferences(false);
  };

  // Logo upload handlers
  const handleLogoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({
        title: "Invalid File Type",
        description: "Please select an image file (PNG, JPG, GIF, etc.)",
        variant: "destructive"
      });
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "File Too Large",
        description: "Logo file must be smaller than 5MB",
        variant: "destructive"
      });
      return;
    }

    try {
      setIsUploadingLogo(true);
      await uploadLogo(file);
      toast({
        title: "Logo Uploaded",
        description: "Company logo has been updated successfully"
      });
    } catch (error: any) {
      toast({
        title: "Upload Failed",
        description: error.message || "Failed to upload logo",
        variant: "destructive"
      });
    } finally {
      setIsUploadingLogo(false);
      // Reset the input
      if (event.target) {
        event.target.value = '';
      }
    }
  };

  const handleLogoRemove = async () => {
    try {
      await removeLogo();
      toast({
        title: "Logo Removed",
        description: "Company logo has been removed successfully"
      });
    } catch (error: any) {
      toast({
        title: "Remove Failed",
        description: error.message || "Failed to remove logo",
        variant: "destructive"
      });
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
          <p className="mt-2 text-gray-600">
            Manage your account, preferences, and system configuration
          </p>
        </div>

        {/* Settings Tabs */}
        <Tabs defaultValue="profile" className="space-y-4">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="theme">Theme</TabsTrigger>
            <TabsTrigger value="notifications">Notifications</TabsTrigger>
            <TabsTrigger value="company">Company</TabsTrigger>
            <TabsTrigger value="security">Security</TabsTrigger>
          </TabsList>

          {/* Profile Settings */}
          <TabsContent value="profile" className="space-y-6">
            <Card className="bg-gray-50">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <User className="mr-2 h-5 w-5" />
                  Profile Information
                </CardTitle>
                <CardDescription>
                  Update your personal information and preferences
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First Name</Label>
                    <Input id="firstName" defaultValue="Admin" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Last Name</Label>
                    <Input id="lastName" defaultValue="User" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <Input id="email" type="email" defaultValue="admin@skyeline.com" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number</Label>
                  <Input id="phone" type="tel" defaultValue="(555) 123-4567" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role">Role</Label>
                  <Select defaultValue="admin">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Administrator</SelectItem>
                      <SelectItem value="project_manager">Project Manager</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Separator />
                <Button>
                  <Save className="mr-2 h-4 w-4" />
                  Save Changes
                </Button>
              </CardContent>
            </Card>

            <Card className="bg-gray-50">
              <CardHeader>
                <CardTitle>Preferences</CardTitle>
                <CardDescription>
                  Customize your application experience
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="timezone">Timezone</Label>
                  <Select 
                    value={preferences.timezone} 
                    onValueChange={(value) => handlePreferenceChange('timezone', value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="est">Eastern Standard Time</SelectItem>
                      <SelectItem value="cst">Central Standard Time</SelectItem>
                      <SelectItem value="mst">Mountain Standard Time</SelectItem>
                      <SelectItem value="pst">Pacific Standard Time</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dateFormat">Date Format</Label>
                  <Select 
                    value={preferences.dateFormat} 
                    onValueChange={(value) => handlePreferenceChange('dateFormat', value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mm-dd-yyyy">MM/DD/YYYY</SelectItem>
                      <SelectItem value="dd-mm-yyyy">DD/MM/YYYY</SelectItem>
                      <SelectItem value="yyyy-mm-dd">YYYY-MM-DD</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5 flex items-center">
                    <div 
                      className="mr-2 h-4 w-4 rounded-full"
                      style={{ backgroundColor: accentColor }}
                    />
                    <div>
                      <Label>Accent Color</Label>
                      <p className="text-sm text-gray-500">
                        Current theme color: {accentColor}
                      </p>
                    </div>
                  </div>
                </div>
                
                <Separator />
                
                {/* Save/Discard Preferences */}
                {hasUnsavedPreferences && (
                  <>
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium text-blue-900">Unsaved Changes</h4>
                          <p className="text-sm text-theme-primary">
                            You have unsaved preference changes.
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={discardPreferences}
                            className="text-gray-600"
                          >
                            Discard
                          </Button>
                          <Button
                            size="sm"
                            onClick={savePreferences}
                            className="bg-theme-primary hover:bg-theme-primary-hover text-white"
                          >
                            Save Changes
                          </Button>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Theme Settings */}
          <TabsContent value="theme" className="space-y-6">
            <ThemeSettings />
          </TabsContent>

          {/* Notification Settings */}
          <TabsContent value="notifications" className="space-y-6">
            <Card className="bg-gray-50">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Bell className="mr-2 h-5 w-5" />
                  Notification Preferences
                </CardTitle>
                <CardDescription>
                  Choose how and when you want to be notified
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Email Notifications</Label>
                      <p className="text-sm text-gray-500">Receive updates via email</p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Project Updates</Label>
                      <p className="text-sm text-gray-500">Get notified about project progress</p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Payment Reminders</Label>
                      <p className="text-sm text-gray-500">Alerts for payment due dates</p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Schedule Changes</Label>
                      <p className="text-sm text-gray-500">Notify when schedules are modified</p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Team Messages</Label>
                      <p className="text-sm text-gray-500">Internal team communication</p>
                    </div>
                    <Switch />
                  </div>
                </div>
                <Separator />
                <div className="space-y-2">
                  <Label>Notification Frequency</Label>
                  <Select defaultValue="immediate">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="immediate">Immediate</SelectItem>
                      <SelectItem value="hourly">Hourly Digest</SelectItem>
                      <SelectItem value="daily">Daily Summary</SelectItem>
                      <SelectItem value="weekly">Weekly Report</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Company Settings */}
          <TabsContent value="company" className="space-y-6">
            <Card className="bg-gray-50">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Building className="mr-2 h-5 w-5" />
                  Company Information
                </CardTitle>
                <CardDescription>
                  Manage your company details and branding
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="companyName">Company Name</Label>
                  <Input id="companyName" defaultValue="Skyeline Homes" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="companyPhone">Phone</Label>
                    <Input id="companyPhone" defaultValue="(555) 123-4567" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="companyEmail">Email</Label>
                    <Input id="companyEmail" defaultValue="info@skyeline.com" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="companyAddress">Address</Label>
                  <Input id="companyAddress" defaultValue="123 Construction Ave, Builder City, BC 12345" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="website">Website</Label>
                  <Input id="website" defaultValue="https://skyeline.com" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="license">License Number</Label>
                  <Input id="license" defaultValue="GC-2024-001234" />
                </div>
                <Separator />
                <Button>
                  <Save className="mr-2 h-4 w-4" />
                  Update Company Info
                </Button>
              </CardContent>
            </Card>

            {/* Company Logo Section */}
            <Card className="bg-gray-50">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Image className="mr-2 h-5 w-5" />
                  Company Logo
                </CardTitle>
                <CardDescription>
                  Upload and manage your company logo that appears in the navigation and documents
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {brandingLoading ? (
                  <div className="animate-pulse flex items-center space-x-4">
                    <div className="h-20 w-20 bg-gray-300 rounded-lg"></div>
                    <div className="space-y-2">
                      <div className="h-4 w-24 bg-gray-300 rounded"></div>
                      <div className="h-3 w-32 bg-gray-300 rounded"></div>
                    </div>
                  </div>
                ) : (
                  <>
                    {logoUrl ? (
                      <div className="flex items-start space-x-4">
                        <div className="relative">
                          <img
                            src={logoUrl}
                            alt="Company Logo"
                            className="h-20 w-20 object-contain rounded-lg border border-gray-200 bg-white p-2"
                          />
                        </div>
                        <div className="flex-1 space-y-2">
                          <div>
                            <p className="font-medium text-gray-900">Current Logo</p>
                            <p className="text-sm text-gray-500">Logo is displayed in navigation and documents</p>
                          </div>
                          <div className="flex items-center space-x-2">
                            <div>
                              <Input
                                type="file"
                                accept="image/*"
                                onChange={handleLogoUpload}
                                disabled={isUploadingLogo}
                                className="hidden"
                                id="logo-upload"
                              />
                              <Label
                                htmlFor="logo-upload"
                                className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                <Upload className="mr-2 h-4 w-4" />
                                {isUploadingLogo ? 'Uploading...' : 'Replace Logo'}
                              </Label>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={handleLogoRemove}
                              disabled={isUploadingLogo}
                              className="text-red-600 border-red-300 hover:bg-red-50"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Remove
                            </Button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-6 border-2 border-dashed border-gray-300 rounded-lg">
                        <Image className="mx-auto h-12 w-12 text-gray-400" />
                        <div className="mt-4">
                          <p className="text-sm font-medium text-gray-900">No logo uploaded</p>
                          <p className="text-sm text-gray-500">Upload your company logo to personalize the application</p>
                        </div>
                        <div className="mt-4">
                          <Input
                            type="file"
                            accept="image/*"
                            onChange={handleLogoUpload}
                            disabled={isUploadingLogo}
                            className="hidden"
                            id="logo-upload-empty"
                          />
                          <Label
                            htmlFor="logo-upload-empty"
                            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-theme-primary hover:bg-theme-primary-hover cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <Upload className="mr-2 h-4 w-4" />
                            {isUploadingLogo ? 'Uploading...' : 'Upload Logo'}
                          </Label>
                        </div>
                        <p className="mt-2 text-xs text-gray-500">
                          PNG, JPG, GIF up to 5MB
                        </p>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            <Card className="bg-gray-50">
              <CardHeader>
                <CardTitle>Business Settings</CardTitle>
                <CardDescription>
                  Configure business-specific preferences
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="defaultMarkup">Default Markup (%)</Label>
                    <Input id="defaultMarkup" type="number" defaultValue="10" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="contingency">Default Contingency (%)</Label>
                    <Input id="contingency" type="number" defaultValue="5" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="currency">Currency</Label>
                  <Select defaultValue="usd">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="usd">USD ($)</SelectItem>
                      <SelectItem value="cad">CAD ($)</SelectItem>
                      <SelectItem value="eur">EUR (€)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gray-50">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Cloud className="mr-2 h-5 w-5" />
                  Weather Location Management
                </CardTitle>
                <CardDescription>
                  Manage weather locations for project planning and site monitoring
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {isLoading ? (
                  <div className="space-y-4">
                    {[1, 2, 3].map((n) => (
                      <div key={n} className="animate-pulse flex items-center justify-between p-4 border rounded-lg bg-gray-50">
                        <div className="flex items-center space-x-3">
                          <div className="h-4 w-4 bg-gray-300 rounded"></div>
                          <div className="space-y-2">
                            <div className="h-4 w-24 bg-gray-300 rounded"></div>
                            <div className="h-3 w-32 bg-gray-300 rounded"></div>
                          </div>
                        </div>
                        <div className="h-8 w-20 bg-gray-300 rounded"></div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {weatherLocations.map((location) => (
                    <div key={location.id} className="flex items-center justify-between p-4 border rounded-lg bg-gray-50 border-gray-200">
                      <div className="flex items-center space-x-3">
                        <MapPin className="h-4 w-4 text-gray-500" />
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="font-medium text-gray-900">{location.name}</span>
                            {location.isDefault && (
                              <Badge variant="default" className="text-xs">Default</Badge>
                            )}
                          </div>
                          <p className="text-sm text-gray-600">
                            {location.city}, {location.state} {location.zipCode}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        {!location.isDefault && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleSetDefault(location.id)}
                          >
                            Set Default
                          </Button>
                        )}
                        {!location.isDefault && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveLocation(location.id)}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                  </div>
                )}

                {isAddingLocation ? (
                  <div className="space-y-4 p-4 border rounded-lg bg-blue-50 border-blue-200">
                    <h4 className="font-medium text-blue-900">Add New Weather Location</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="locationName">Location Name</Label>
                        <Input
                          id="locationName"
                          placeholder="e.g., South Project Area"
                          value={newLocation.name}
                          onChange={(e) => setNewLocation({ ...newLocation, name: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="locationCity">City</Label>
                        <Input
                          id="locationCity"
                          placeholder="e.g., Downtown"
                          value={newLocation.city}
                          onChange={(e) => setNewLocation({ ...newLocation, city: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="locationState">State</Label>
                        <Input
                          id="locationState"
                          placeholder="e.g., CA"
                          value={newLocation.state}
                          onChange={(e) => setNewLocation({ ...newLocation, state: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="locationZip">ZIP Code</Label>
                        <Input
                          id="locationZip"
                          placeholder="e.g., 90210"
                          value={newLocation.zipCode}
                          onChange={(e) => setNewLocation({ ...newLocation, zipCode: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className="flex space-x-2">
                      <Button onClick={handleAddLocation} size="sm">
                        Add Location
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setIsAddingLocation(false);
                          setNewLocation({ name: '', city: '', state: '', zipCode: '' });
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsAddingLocation(true)}
                    className="w-full flex items-center justify-center space-x-2"
                  >
                    <Plus className="h-4 w-4" />
                    <span>Add Weather Location</span>
                  </Button>
                )}

                <Separator />
                <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                  <div className="flex items-start space-x-3">
                    <MapPin className="h-5 w-5 text-theme-primary mt-0.5" />
                    <div>
                      <h4 className="font-medium text-blue-900 mb-2">Weather Location Benefits</h4>
                      <ul className="text-sm text-blue-800 space-y-1">
                        <li>• Plan work schedules around weather conditions</li>
                        <li>• Monitor multiple project site locations</li>
                        <li>• Receive weather alerts for construction activities</li>
                        <li>• Optimize material deliveries based on forecasts</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Default Subcontractor Agreement Management */}
            <DefaultAgreementUpload />
          </TabsContent>

          {/* Security Settings */}
          <TabsContent value="security" className="space-y-6">
            <Card className="bg-gray-50">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Shield className="mr-2 h-5 w-5" />
                  Security Settings
                </CardTitle>
                <CardDescription>
                  Manage your account security and access controls
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="currentPassword">Current Password</Label>
                  <Input id="currentPassword" type="password" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="newPassword">New Password</Label>
                  <Input id="newPassword" type="password" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm New Password</Label>
                  <Input id="confirmPassword" type="password" />
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Two-Factor Authentication</Label>
                    <p className="text-sm text-gray-500">Add an extra layer of security</p>
                  </div>
                  <Switch />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Session Timeout</Label>
                    <p className="text-sm text-gray-500">Auto-logout after inactivity</p>
                  </div>
                  <Select 
                    value={preferences.sessionTimeout} 
                    onValueChange={(value) => handlePreferenceChange('sessionTimeout', value)}
                  >
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="15">15 min</SelectItem>
                      <SelectItem value="30">30 min</SelectItem>
                      <SelectItem value="60">1 hour</SelectItem>
                      <SelectItem value="120">2 hours</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                {/* Save/Discard Security Preferences */}
                {hasUnsavedPreferences && (
                  <>
                    <Separator />
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium text-blue-900">Unsaved Security Changes</h4>
                          <p className="text-sm text-theme-primary">
                            You have unsaved session timeout changes.
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={discardPreferences}
                            className="text-gray-600"
                          >
                            Discard
                          </Button>
                          <Button
                            size="sm"
                            onClick={savePreferences}
                            className="bg-theme-primary hover:bg-theme-primary-hover text-white"
                          >
                            <Save className="mr-2 h-4 w-4" />
                            Save Changes
                          </Button>
                        </div>
                      </div>
                    </div>
                  </>
                )}
                
                <Separator />
                
                <Button>
                  <Save className="mr-2 h-4 w-4" />
                  Update Password
                </Button>
              </CardContent>
            </Card>

            <Card className="bg-gray-50">
              <CardHeader>
                <CardTitle>Active Sessions</CardTitle>
                <CardDescription>
                  Manage your active login sessions
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <div className="font-medium">Current Session</div>
                      <div className="text-sm text-gray-500">Chrome on Windows • Boston, MA</div>
                    </div>
                    <Badge variant="outline">Active</Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <div className="font-medium">Mobile App</div>
                      <div className="text-sm text-gray-500">iPhone • Last active 2 hours ago</div>
                    </div>
                    <Button variant="outline" size="sm">Revoke</Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}