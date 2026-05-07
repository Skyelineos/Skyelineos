import React from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { MessagingModule } from '@/components/messaging/MessagingModule';
import { useAuth } from '@/hooks/use-auth';

export default function Messages() {
  const { user } = useAuth();
  
  // Development logging removed

  // Mock current user - in real app this would come from auth context
  const currentUser = {
    id: String(user?.id || '1'),
    name: user?.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : 'Admin User',
    role: (user?.role || 'admin') as 'admin' | 'client' | 'subcontractor' | 'designer' | 'project_manager'
  };

  // For demo purposes, using project ID 5 (Giboney Home)
  const projectId = 5;

  return (
    <AppLayout>
      <div className="h-full">
        <div className="mb-6">
          <h1 className="text-3xl font-bold font-heading text-brand-black">Messages</h1>
          <p className="text-brand-dark-gray-blue">Project Communications</p>
        </div>
        <div className="h-full">
          <MessagingModule 
            projectId={projectId}
            currentUser={currentUser}
          />
        </div>
      </div>
    </AppLayout>
  );
}