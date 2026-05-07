import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { useTheme } from '@/contexts/ThemeContext';
import { Palette, Check, RotateCcw, Cloud, CloudOff } from 'lucide-react';
import { SketchPicker } from 'react-color';

// Brand colors for easy selection
const brandColors = [
  '#657179', // Brand dark gray-blue
  '#c1b49f', // Brand beige  
  '#bfcacc', // Brand light gray-blue
  '#1b1b1b', // Brand black
  '#ffffff', // Brand white
];

// Quick access colors for easy selection (brand colors + common options)
const QUICK_COLORS = [...brandColors, '#2F80ED', '#27AE60', '#E74C3C'];

export function ThemeSettings() {
  const { accentColor, setAccentColor, isLoading, hasCloudSync } = useTheme();
  
  const [customColor, setCustomColor] = useState(accentColor);
  const [pendingColor, setPendingColor] = useState(accentColor);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Update local state when theme context changes
  React.useEffect(() => {
    setCustomColor(accentColor);
    setPendingColor(accentColor);
    setHasUnsavedChanges(false);
  }, [accentColor]);

  const handleColorWheelChange = (colorResult: any) => {
    const color = colorResult.hex;
    setCustomColor(color);
    setPendingColor(color);
    setHasUnsavedChanges(color !== accentColor);
  };

  const handleQuickColor = (color: string) => {
    setCustomColor(color);
    setPendingColor(color);
    setHasUnsavedChanges(color !== accentColor);
  };

  const saveChanges = () => {
    setAccentColor(pendingColor);
    setHasUnsavedChanges(false);
  };

  const discardChanges = () => {
    setCustomColor(accentColor);
    setPendingColor(accentColor);
    setHasUnsavedChanges(false);
  };

  const resetToDefault = () => {
    const defaultColor = '#2F80ED';
    setPendingColor(defaultColor);
    setCustomColor(defaultColor);
    setHasUnsavedChanges(defaultColor !== accentColor);
  };

  if (isLoading) {
    return (
      <Card className="bg-gray-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5" />
            Theme Settings
          </CardTitle>
          <CardDescription>
            Customize your application's appearance and branding
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div>
              <Skeleton className="h-4 w-32 mb-2" />
              <Skeleton className="h-20 w-full" />
            </div>
            <div>
              <Skeleton className="h-4 w-24 mb-2" />
              <Skeleton className="h-10 w-32" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-gray-50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Palette className="h-5 w-5" />
          Theme Settings
          {hasCloudSync && (
            <Badge variant="secondary" className="ml-auto flex items-center gap-1">
              <Cloud className="h-3 w-3" />
              Cloud Sync
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          Customize your application's appearance and branding
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Current Color Preview */}
        <div>
          <h4 className="font-medium mb-3">Current Accent Color</h4>
          <div className="flex items-center gap-3">
            <div 
              className="w-16 h-16 rounded-lg border-2 border-gray-200 shadow-sm"
              style={{ backgroundColor: accentColor }}
            />
            <div>
              <p className="font-medium text-gray-900">{accentColor.toUpperCase()}</p>
              <p className="text-sm text-gray-500">Active accent color</p>
            </div>
          </div>
        </div>

        <Separator />

        {/* Brand Colors Section */}
        <div>
          <h4 className="font-medium mb-3">Brand Colors</h4>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {brandColors.map((color, index) => {
              const labels = ['Dark Gray-Blue', 'Beige', 'Light Gray-Blue', 'Black', 'White'];
              return (
                <button
                  key={color}
                  onClick={() => handleQuickColor(color)}
                  className="group flex flex-col items-center p-3 rounded-lg border-2 border-gray-200 hover:border-gray-400 transition-all focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <div 
                    className="w-12 h-12 rounded-lg border border-gray-300 shadow-sm mb-2"
                    style={{ backgroundColor: color }}
                  />
                  <span className="text-xs text-gray-600 text-center">
                    {labels[index]}
                  </span>
                  <span className="text-xs font-mono text-gray-500">
                    {color.toUpperCase()}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <Separator />

        {/* Color Wheel Picker */}
        <div>
          <h4 className="font-medium mb-3">Choose Color</h4>
          <div className="flex flex-col lg:flex-row gap-6">
            {/* Color Wheel */}
            <div className="flex-shrink-0">
              <SketchPicker
                color={pendingColor}
                onChange={handleColorWheelChange}
                disableAlpha={true}
                presetColors={QUICK_COLORS}
                width="240px"
              />
            </div>
            
            {/* Color Info and Preview */}
            <div className="flex-1 space-y-4">
              <div>
                <h5 className="font-medium mb-2">Selected Color</h5>
                <div className="flex items-center gap-3">
                  <div 
                    className="w-20 h-20 rounded-lg border-2 border-gray-200 shadow-sm"
                    style={{ backgroundColor: pendingColor }}
                  />
                  <div>
                    <p className="font-mono text-lg font-medium text-gray-900">
                      {pendingColor?.toUpperCase?.() || pendingColor || '#000000'}
                    </p>
                    <p className="text-sm text-gray-500">
                      Hex color code
                    </p>
                  </div>
                </div>
              </div>
              
              {/* Quick Access Colors */}
              <div>
                <h5 className="font-medium mb-2">Quick Colors</h5>
                <div className="flex flex-wrap gap-2">
                  {QUICK_COLORS.map((color) => (
                    <button
                      key={color}
                      onClick={() => handleQuickColor(color)}
                      className="w-8 h-8 rounded border-2 border-gray-200 hover:border-gray-400 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                      style={{ backgroundColor: color }}
                      title={color}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <Separator />

        {/* Manual Hex Input */}
        <div>
          <h4 className="font-medium mb-3">Manual Color Input</h4>
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={customColor}
              onChange={(e) => {
                const color = e.target.value;
                setCustomColor(color);
                setPendingColor(color);
                setHasUnsavedChanges(color !== accentColor);
              }}
              className="flex-1 px-3 py-2 border border-gray-200 rounded-md bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
              placeholder="#2F80ED"
            />
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Enter a hex color code or use the color picker
          </p>
        </div>

        <Separator />

        {/* Preview */}
        <div>
          <h4 className="font-medium mb-3">Preview</h4>
          <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Button 
                variant="accent"
                style={hasUnsavedChanges ? { backgroundColor: pendingColor, borderColor: pendingColor } : undefined}
              >
                Accent Button
              </Button>
              <Button 
                variant="accent-outline"
                style={hasUnsavedChanges ? { borderColor: pendingColor, color: pendingColor } : undefined}
              >
                Accent Outline
              </Button>
              <Badge 
                variant="accent"
                style={hasUnsavedChanges ? { backgroundColor: pendingColor } : undefined}
              >
                Accent Badge
              </Badge>
              <Badge 
                variant="accent-outline"
                style={hasUnsavedChanges ? { borderColor: pendingColor, color: pendingColor } : undefined}
              >
                Outlined Badge
              </Badge>
            </div>
            <div className="mt-2 text-xs text-gray-500 space-y-1">
              <p>• Buttons: <code>variant="accent"</code> and <code>variant="accent-outline"</code></p>
              <p>• Badges: <code>variant="accent"</code> and <code>variant="accent-outline"</code></p>
              <p>• Utility class: <code>text-accent-custom</code>, <code>bg-accent-custom</code>, <code>border-accent-custom</code></p>
            </div>
            <p className="text-sm text-gray-600">
              This preview shows how your accent color will appear throughout the application
            </p>
          </div>
        </div>

        <Separator />

        {/* Save/Discard Actions */}
        {hasUnsavedChanges && (
          <>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium text-blue-900">Unsaved Changes</h4>
                  <p className="text-sm text-theme-primary">
                    You have unsaved theme changes. Save them to apply across the entire application.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={discardChanges}
                    className="text-gray-600"
                  >
                    Discard
                  </Button>
                  <Button
                    size="sm"
                    onClick={saveChanges}
                    className="bg-theme-primary hover:bg-theme-primary-hover text-white"
                  >
                    Save Changes
                  </Button>
                </div>
              </div>
            </div>
            <Separator />
          </>
        )}

        {/* Reset Option */}
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-medium">Reset to Default</h4>
            <p className="text-sm text-gray-500">
              Restore the original Skyeline Homes blue color
            </p>
          </div>
          <Button
            variant="outline"
            onClick={resetToDefault}
            className="flex items-center gap-2"
          >
            <RotateCcw className="h-4 w-4" />
            Reset
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}