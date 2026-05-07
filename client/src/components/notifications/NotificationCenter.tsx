import { useState } from 'react';
import { Bell, X, CheckCircle, AlertCircle, Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface Notification {
  id: string;
  type: 'info' | 'warning' | 'success' | 'error';
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
}

interface NotificationCenterProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export function NotificationCenter({ isOpen = false, onClose }: NotificationCenterProps) {
  if (!isOpen) return null;
  const [notifications] = useState<Notification[]>([]);

  const getIcon = (type: Notification['type']) => {
    switch (type) {
      case 'success':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'warning':
      case 'error':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Info className="h-4 w-4 text-blue-500" />;
    }
  };

  return (
    <Card className="w-80">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Bell className="h-5 w-5" />
            <span>Notifications</span>
          </div>
          <Badge variant="secondary">{notifications.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {notifications.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No notifications
          </p>
        ) : (
          <div className="space-y-3">
            {notifications.map((notification) => (
              <div
                key={notification.id}
                className="flex items-start space-x-3 p-3 rounded-lg border"
              >
                {getIcon(notification.type)}
                <div className="flex-1 space-y-1">
                  <p className="text-sm font-medium">{notification.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {notification.message}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {notification.timestamp}
                  </p>
                </div>
                <Button variant="ghost" size="sm">
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}