import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { useUserPreferences } from '@/contexts/UserPreferencesContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useToast } from '@/hooks/use-toast';
import {
  Settings,
  Eye,
  Bell,
  Accessibility,
  Hammer,
  RefreshCw,
  RotateCcw,
  Palette,
} from 'lucide-react';

interface UserPreferencesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function UserPreferencesDialog({ open, onOpenChange }: UserPreferencesDialogProps) {
  const { preferences, updatePreference, resetPreferences } = useUserPreferences();
  const { accentColor, setAccentColor } = useTheme();
  const { toast } = useToast();
  const [hasChanges, setHasChanges] = useState(false);

  const handleSave = () => {
    toast({
      title: 'Preferences saved',
      description: 'Your preferences have been saved successfully.',
    });
    setHasChanges(false);
    onOpenChange(false);
  };

  const handleReset = () => {
    resetPreferences();
    toast({
      title: 'Preferences reset',
      description: 'All preferences have been reset to defaults.',
    });
    setHasChanges(false);
  };

  const updatePref = <K extends keyof typeof preferences>(
    key: K,
    value: typeof preferences[K]
  ) => {
    updatePreference(key, value);
    setHasChanges(true);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            User Preferences
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="display" className="w-full">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="display" className="flex items-center gap-2">
              <Eye className="h-4 w-4" />
              Display
            </TabsTrigger>
            <TabsTrigger value="notifications" className="flex items-center gap-2">
              <Bell className="h-4 w-4" />
              Notifications
            </TabsTrigger>
            <TabsTrigger value="accessibility" className="flex items-center gap-2">
              <Accessibility className="h-4 w-4" />
              Accessibility
            </TabsTrigger>
            <TabsTrigger value="construction" className="flex items-center gap-2">
              <Hammer className="h-4 w-4" />
              Construction
            </TabsTrigger>
            <TabsTrigger value="advanced" className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Advanced
            </TabsTrigger>
          </TabsList>

          <div className="max-h-[60vh] overflow-y-auto mt-6">
            <TabsContent value="display" className="space-y-6">
              <div className="space-y-4">
                <h3 className="text-lg font-medium">Layout & Appearance</h3>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="sidebar-collapsed">Collapse sidebar by default</Label>
                    <Switch
                      id="sidebar-collapsed"
                      checked={preferences.sidebarCollapsed}
                      onCheckedChange={(checked) => updatePref('sidebarCollapsed', checked)}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <Label htmlFor="compact-mode">Compact mode</Label>
                    <Switch
                      id="compact-mode"
                      checked={preferences.compactMode}
                      onCheckedChange={(checked) => updatePref('compactMode', checked)}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <Label htmlFor="auto-refresh">Auto refresh data</Label>
                    <Switch
                      id="auto-refresh"
                      checked={preferences.autoRefresh}
                      onCheckedChange={(checked) => updatePref('autoRefresh', checked)}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <Label htmlFor="show-weather">Show weather widget</Label>
                    <Switch
                      id="show-weather"
                      checked={preferences.showWeather}
                      onCheckedChange={(checked) => updatePref('showWeather', checked)}
                    />
                  </div>
                </div>

                <Separator />

                <div className="space-y-4">
                  <h4 className="font-medium flex items-center gap-2">
                    <Palette className="h-4 w-4" />
                    Theme & Colors
                  </h4>
                  
                  <div className="space-y-4">
                    <div className="space-y-3">
                      <Label>Accent Color</Label>
                      <div className="flex items-center gap-3">
                        <div 
                          className="w-12 h-12 rounded-lg border-2 border-gray-200 shadow-sm cursor-pointer"
                          style={{ backgroundColor: accentColor }}
                          title="Current accent color"
                        />
                        <div className="flex flex-wrap gap-2">
                          {['#2F80ED', '#27AE60', '#E74C3C', '#F39C12', '#9B59B6', '#657179', '#c1b49f'].map((color) => (
                            <button
                              key={color}
                              onClick={() => {
                                setAccentColor(color);
                                setHasChanges(true);
                              }}
                              className="w-8 h-8 rounded-lg border-2 border-gray-200 hover:border-gray-400 transition-all focus:outline-none focus:ring-2 focus:ring-blue-500"
                              style={{ backgroundColor: color }}
                              title={`Set accent color to ${color}`}
                            />
                          ))}
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Choose an accent color for buttons, links, and highlights throughout the app.
                      </p>
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="space-y-4">
                  <h4 className="font-medium">Table & List Settings</h4>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="items-per-page">Items per page</Label>
                      <Select
                        value={preferences.itemsPerPage.toString()}
                        onValueChange={(value) => updatePref('itemsPerPage', parseInt(value))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="10">10</SelectItem>
                          <SelectItem value="25">25</SelectItem>
                          <SelectItem value="50">50</SelectItem>
                          <SelectItem value="100">100</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="default-view">Default view</Label>
                      <Select
                        value={preferences.defaultView}
                        onValueChange={(value: 'card' | 'table' | 'list') => updatePref('defaultView', value)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="table">Table</SelectItem>
                          <SelectItem value="card">Card</SelectItem>
                          <SelectItem value="list">List</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="notifications" className="space-y-6">
              <div className="space-y-4">
                <h3 className="text-lg font-medium">Notification Settings</h3>
                
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="email-notifications">Email notifications</Label>
                      <p className="text-sm text-muted-foreground">Receive updates via email</p>
                    </div>
                    <Switch
                      id="email-notifications"
                      checked={preferences.emailNotifications}
                      onCheckedChange={(checked) => updatePref('emailNotifications', checked)}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="sms-notifications">SMS notifications</Label>
                      <p className="text-sm text-muted-foreground">Receive critical updates via SMS</p>
                    </div>
                    <Switch
                      id="sms-notifications"
                      checked={preferences.smsNotifications}
                      onCheckedChange={(checked) => updatePref('smsNotifications', checked)}
                    />
                  </div>

                  <Separator />

                  <h4 className="font-medium">Notification Types</h4>
                  
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="project-updates">Project updates</Label>
                      <Switch
                        id="project-updates"
                        checked={preferences.projectUpdates}
                        onCheckedChange={(checked) => updatePref('projectUpdates', checked)}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <Label htmlFor="bid-alerts">Bid alerts</Label>
                      <Switch
                        id="bid-alerts"
                        checked={preferences.bidAlerts}
                        onCheckedChange={(checked) => updatePref('bidAlerts', checked)}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <Label htmlFor="schedule-changes">Schedule changes</Label>
                      <Switch
                        id="schedule-changes"
                        checked={preferences.scheduleChanges}
                        onCheckedChange={(checked) => updatePref('scheduleChanges', checked)}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="accessibility" className="space-y-6">
              <div className="space-y-4">
                <h3 className="text-lg font-medium">Accessibility Options</h3>
                
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="reduced-motion">Reduced motion</Label>
                      <p className="text-sm text-muted-foreground">Minimize animations and transitions</p>
                    </div>
                    <Switch
                      id="reduced-motion"
                      checked={preferences.reducedMotion}
                      onCheckedChange={(checked) => updatePref('reducedMotion', checked)}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="high-contrast">High contrast mode</Label>
                      <p className="text-sm text-muted-foreground">Increase contrast for better visibility</p>
                    </div>
                    <Switch
                      id="high-contrast"
                      checked={preferences.highContrast}
                      onCheckedChange={(checked) => updatePref('highContrast', checked)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="font-size">Font size</Label>
                    <Select
                      value={preferences.fontSize}
                      onValueChange={(value: 'small' | 'medium' | 'large') => updatePref('fontSize', value)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="small">Small</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="large">Large</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="construction" className="space-y-6">
              <div className="space-y-4">
                <h3 className="text-lg font-medium">Construction Preferences</h3>
                
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="default-project-view">Default project view</Label>
                    <Select
                      value={preferences.defaultProjectView}
                      onValueChange={(value: 'gantt' | 'calendar' | 'list') => updatePref('defaultProjectView', value)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="gantt">Gantt Chart</SelectItem>
                        <SelectItem value="calendar">Calendar</SelectItem>
                        <SelectItem value="list">List View</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center justify-between">
                    <Label htmlFor="show-critical-path">Show critical path</Label>
                    <Switch
                      id="show-critical-path"
                      checked={preferences.showCriticalPath}
                      onCheckedChange={(checked) => updatePref('showCriticalPath', checked)}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <Label htmlFor="show-weekends">Show weekends in schedule</Label>
                    <Switch
                      id="show-weekends"
                      checked={preferences.showWeekends}
                      onCheckedChange={(checked) => updatePref('showWeekends', checked)}
                    />
                  </div>

                  <Separator />

                  <h4 className="font-medium">Business Hours</h4>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="business-start">Start time</Label>
                      <Select
                        value={preferences.businessHoursStart.toString()}
                        onValueChange={(value) => updatePref('businessHoursStart', parseInt(value))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 24 }, (_, i) => (
                            <SelectItem key={i} value={i.toString()}>
                              {i.toString().padStart(2, '0')}:00
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="business-end">End time</Label>
                      <Select
                        value={preferences.businessHoursEnd.toString()}
                        onValueChange={(value) => updatePref('businessHoursEnd', parseInt(value))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 24 }, (_, i) => (
                            <SelectItem key={i} value={i.toString()}>
                              {i.toString().padStart(2, '0')}:00
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="advanced" className="space-y-6">
              <div className="space-y-4">
                <h3 className="text-lg font-medium">Advanced Settings</h3>
                
                <div className="space-y-4">
                  <div className="p-4 border rounded-lg bg-muted/30">
                    <h4 className="font-medium mb-2">Reset Preferences</h4>
                    <p className="text-sm text-muted-foreground mb-4">
                      This will reset all your preferences to their default values. This action cannot be undone.
                    </p>
                    <Button
                      variant="outline"
                      onClick={handleReset}
                      className="flex items-center gap-2"
                    >
                      <RotateCcw className="h-4 w-4" />
                      Reset to Defaults
                    </Button>
                  </div>

                  <div className="p-4 border rounded-lg">
                    <h4 className="font-medium mb-2">Data Sync</h4>
                    <p className="text-sm text-muted-foreground mb-4">
                      Preferences are automatically saved to your browser's local storage.
                    </p>
                    <Button
                      variant="outline"
                      className="flex items-center gap-2"
                      onClick={() => {
                        toast({
                          title: 'Preferences synced',
                          description: 'Your preferences are up to date.',
                        });
                      }}
                    >
                      <RefreshCw className="h-4 w-4" />
                      Sync Now
                    </Button>
                  </div>
                </div>
              </div>
            </TabsContent>
          </div>
        </Tabs>

        <div className="flex items-center justify-between pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!hasChanges}>
            Save Changes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}