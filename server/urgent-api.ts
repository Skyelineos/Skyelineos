import { storage } from './storage';

export interface UrgentItem {
  id: string;
  type: 'estimate' | 'po' | 'photos' | 'invoice' | 'schedule' | 'change_order' | 'message' | 'docs';
  title: string;
  message: string;
  projectId: number;
  projectName: string;
  priority: 'critical' | 'high' | 'medium';
  daysOverdue: number;
  relatedId?: string;
}

export async function getUrgentItems(): Promise<UrgentItem[]> {
  const urgentItems: UrgentItem[] = [];
  
  try {
    // Get all projects to check for urgent items
    const projects = await storage.getProjects();
    const contacts = await storage.getAllContacts();
    
    for (const project of projects) {
      const projectName = project.name;
      const projectId = project.id;
      
      // 1. Check for estimates pending client approval > 48 hours
      try {
        const estimates = await storage.getAllEstimates().then(est => est.filter(e => e.projectId === projectId));
        for (const estimate of estimates) {
          // Check estimate items waiting for approval - only if not client approved
          if (!estimate.clientApproved) {
            try {
              const categories = typeof estimate.notes === 'string' ? JSON.parse(estimate.notes || '[]') : (estimate.notes || []);
              for (const category of categories) {
                if (category.items && Array.isArray(category.items)) {
                  for (const item of category.items) {
                    if (item.status === 'Waiting Approval') {
                      const estimateDate = estimate.updatedAt ? new Date(estimate.updatedAt) : new Date(estimate.createdAt);
                      const daysSinceUpdate = Math.floor((Date.now() - estimateDate.getTime()) / (1000 * 60 * 60 * 24));
                      if (daysSinceUpdate >= 2) {
                        urgentItems.push({
                          id: `est_${estimate.id}_${item.id || 'item'}`,
                          type: 'estimate',
                          title: 'Client Approval Overdue',
                          message: `${item.trade || 'Trade item'} estimate pending client approval for ${daysSinceUpdate} days`,
                          projectId,
                          projectName,
                          priority: daysSinceUpdate >= 5 ? 'critical' : 'high',
                          daysOverdue: daysSinceUpdate - 2,
                          relatedId: estimate.id.toString()
                        });
                      }
                    }
                  }
                }
              }
            } catch (error) {
              console.error('Error parsing estimate notes for urgent items:', error);
              // Continue processing other estimates
            }
          }
        }
      } catch (error) {
        console.error('Error processing estimates for urgent items:', error);
      }
      
      // 2. Check for POs not signed after 3 business days
      try {
        const purchaseOrders = await storage.getPurchaseOrdersByProject(projectId);
        for (const po of purchaseOrders) {
          if (po.status === 'sent' || po.status === 'pending') {
            const poDate = po.createdAt ? new Date(po.createdAt) : new Date();
            const daysSinceSent = Math.floor((Date.now() - poDate.getTime()) / (1000 * 60 * 60 * 24));
            if (daysSinceSent >= 3) {
              const contractor = contacts.find(c => c.id === po.contactId);
              urgentItems.push({
                id: `po_${po.id}`,
                type: 'po',
                title: 'PO Signature Pending',
                message: `${contractor?.company || 'Subcontractor'} PO awaiting signature for ${daysSinceSent} business days`,
                projectId,
                projectName,
                priority: daysSinceSent >= 7 ? 'critical' : 'high',
                daysOverdue: daysSinceSent - 3,
                relatedId: po.id.toString()
              });
            }
          }
        }
      } catch (error) {
        console.error('Error processing purchase orders for urgent items:', error);
      }
    }
    
    // Sort by priority and days overdue
    urgentItems.sort((a, b) => {
      const priorityOrder = { critical: 3, high: 2, medium: 1 };
      if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
        return priorityOrder[b.priority] - priorityOrder[a.priority];
      }
      return b.daysOverdue - a.daysOverdue;
    });
    
    return urgentItems;
    
  } catch (error) {
    console.error('Error getting urgent items:', error);
    return [];
  }
}