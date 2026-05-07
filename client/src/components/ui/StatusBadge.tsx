import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface StatusBadgeProps {
  status: string;
  className?: string;
}

interface ApprovalStatusBadgeProps {
  approvalStatus: 'Pending' | 'Approved' | 'Rejected';
  className?: string;
}

const statusStyles = {
  // Bid Process statuses
  'Not Started': 'bg-slate-100 text-slate-800 hover:bg-slate-200',
  'Estimating': 'bg-slate-100 text-slate-800 hover:bg-slate-200',
  'Actively Bidding': 'bg-amber-100 text-amber-800 hover:bg-amber-200',
  'Bids Received': 'bg-blue-100 text-blue-800 hover:bg-blue-200',
  'Jobs Awarded': 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200',
  
  // Legacy Estimate statuses (for backward compatibility)
  'Bidding': 'bg-amber-100 text-amber-800 hover:bg-amber-200',
  'Waiting Approval': 'bg-indigo-100 text-indigo-800 hover:bg-indigo-200',
  'Awarded Job': 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200',
  'Job Awarded': 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200',
  'Approved': 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200',
  'Rejected': 'bg-rose-100 text-rose-800 hover:bg-rose-200',
  
  // Client Approval Workflow statuses
  'Sent to Client': 'bg-purple-100 text-purple-800 hover:bg-purple-200',
  'Client Signed': 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200',
  
  // Project statuses
  'planning': 'bg-blue-100 text-blue-800 hover:bg-blue-200',
  'active': 'bg-green-100 text-green-800 hover:bg-green-200',
  'on_hold': 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200',
  'completed': 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200',
  'cancelled': 'bg-gray-100 text-gray-800 hover:bg-gray-200',
  
  // Bid statuses
  'pending': 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200',
  'accepted': 'bg-green-100 text-green-800 hover:bg-green-200',
  'declined': 'bg-red-100 text-red-800 hover:bg-red-200',
  
  // Task statuses
  'Scheduled': 'bg-blue-100 text-blue-800 hover:bg-blue-200',
  'In Progress': 'bg-orange-100 text-orange-800 hover:bg-orange-200',
  'Complete': 'bg-green-100 text-green-800 hover:bg-green-200',
  'Cancelled': 'bg-gray-100 text-gray-800 hover:bg-gray-200',
  
  // Default fallback
  'default': 'bg-gray-100 text-gray-800 hover:bg-gray-200'
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const statusClass = statusStyles[status as keyof typeof statusStyles] || statusStyles.default;
  
  return (
    <Badge 
      variant="secondary" 
      className={cn(statusClass, className)}
    >
      {status}
    </Badge>
  );
}

export function ApprovalStatusBadge({ approvalStatus, className }: ApprovalStatusBadgeProps) {
  const approvalColors = {
    'Pending': 'bg-slate-100 text-slate-800 hover:bg-slate-200',
    'Approved': 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200',
    'Rejected': 'bg-rose-100 text-rose-800 hover:bg-rose-200',
  };
  
  const statusClass = approvalColors[approvalStatus];
  
  return (
    <Badge 
      variant="secondary" 
      className={cn(statusClass, className)}
    >
      {approvalStatus}
    </Badge>
  );
}