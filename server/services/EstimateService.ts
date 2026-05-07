import { db } from '../db';
import { estimates, projects, users } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { sendEmail } from '../utils/email';
import { logger } from '../logger';
import { AppError } from '../middleware/errorHandler';
import { eventBus } from '../events/eventBus';

export interface SendEstimateOptions {
  projectId: number;
  estimateId: number;
  userId: number;
  customMessage?: string;
}

export interface ApproveEstimateOptions {
  projectId: number;
  estimateId: number;
  userId: number;
  clientMessage?: string;
}

export interface RejectEstimateOptions {
  projectId: number;
  estimateId: number;
  userId: number;
  rejectionReason: string;
  clientMessage?: string;
}

export const EstimateService = {
  /**
   * Send estimate to client for approval
   */
  async sendEstimate({ projectId, estimateId, userId, customMessage }: SendEstimateOptions) {
    try {
      // Get the estimate and project details
      const [estimate] = await db
        .select()
        .from(estimates)
        .where(and(
          eq(estimates.id, estimateId),
          eq(estimates.projectId, projectId)
        ))
        .limit(1);

      if (!estimate) {
        throw new AppError('Estimate not found', 404);
      }

      if (estimate.status !== 'draft') {
        throw new AppError(`Cannot send estimate with status: ${estimate.status}`, 400);
      }

      const [project] = await db
        .select()
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);

      if (!project) {
        throw new AppError('Project not found', 404);
      }

      if (!project.clientEmail) {
        throw new AppError('Project has no client email configured', 400);
      }

      // Update estimate status and timestamp
      await db
        .update(estimates)
        .set({ 
          status: 'sent', 
          sentAt: new Date(),
          updatedAt: new Date()
        })
        .where(eq(estimates.id, estimateId));

      // Generate approval link
      const approvalUrl = `${process.env.FRONTEND_URL || 'http://localhost:5000'}/client-portal/projects/${projectId}/estimates/${estimateId}`;

      // Send email to client
      await sendEmail({
        to: project.clientEmail,
        subject: `Estimate Ready for Approval - ${project.name}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2F80ED;">Your Estimate is Ready for Review</h2>
            
            <p>Dear ${project.clientName},</p>
            
            <p>Your estimate for <strong>${project.name}</strong> is ready for your review and approval.</p>
            
            <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin-top: 0; color: #333;">Estimate Details:</h3>
              <p><strong>Estimate:</strong> ${estimate.name}</p>
              <p><strong>Description:</strong> ${estimate.description || 'N/A'}</p>
              <p><strong>Total Cost:</strong> $${estimate.totalCost?.toLocaleString() || '0'}</p>
              <p><strong>Duration:</strong> ${estimate.totalDuration || 0} days</p>
            </div>
            
            ${customMessage ? `
              <div style="background-color: #e3f2fd; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <p><strong>Message from your project manager:</strong></p>
                <p style="font-style: italic;">${customMessage}</p>
              </div>
            ` : ''}
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${approvalUrl}" 
                 style="background-color: #2F80ED; color: white; padding: 12px 30px; 
                        text-decoration: none; border-radius: 5px; font-weight: bold;
                        display: inline-block;">
                Review & Approve Estimate
              </a>
            </div>
            
            <p style="color: #666; font-size: 14px;">
              You can review the complete estimate details, ask questions, and approve or request changes 
              by clicking the link above. If you have any questions, please don't hesitate to contact us.
            </p>
            
            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
            
            <p style="color: #666; font-size: 12px;">
              This is an automated message from BuildFlow. Please do not reply directly to this email.
            </p>
          </div>
        `,
        text: `
Your estimate for ${project.name} is ready for review and approval.

Estimate: ${estimate.name}
Total Cost: $${estimate.totalCost?.toLocaleString() || '0'}
Duration: ${estimate.totalDuration || 0} days

${customMessage ? `Message: ${customMessage}\n\n` : ''}

Please visit: ${approvalUrl}

If you have any questions, please contact us.
        `
      });

      // Emit event for real-time updates
      eventBus.publish('EstimateSent', {
        projectId,
        estimateId,
        clientEmail: project.clientEmail,
        sentBy: userId
      });

      logger.info('Estimate sent to client', {
        estimateId,
        projectId,
        clientEmail: project.clientEmail,
        sentBy: userId
      });

      return estimate;
    } catch (error) {
      logger.error('Failed to send estimate to client', {
        error: error instanceof Error ? error.message : 'Unknown error',
        estimateId,
        projectId,
        userId
      });
      throw error;
    }
  },

  /**
   * Client approves the estimate
   */
  async approveEstimate({ projectId, estimateId, userId, clientMessage }: ApproveEstimateOptions) {
    try {
      const [estimate] = await db
        .select()
        .from(estimates)
        .where(and(
          eq(estimates.id, estimateId),
          eq(estimates.projectId, projectId)
        ))
        .limit(1);

      if (!estimate) {
        throw new AppError('Estimate not found', 404);
      }

      if (estimate.status !== 'sent') {
        throw new AppError(`Cannot approve estimate with status: ${estimate.status}`, 400);
      }

      // Update estimate status
      const [updatedEstimate] = await db
        .update(estimates)
        .set({ 
          status: 'approved',
          approvedAt: new Date(),
          approvedBy: userId,
          clientMessage: clientMessage || null,
          updatedAt: new Date()
        })
        .where(eq(estimates.id, estimateId))
        .returning();

      // Get project details for notifications
      const [project] = await db
        .select()
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);

      if (project) {
        // Emit event for real-time updates and workflow triggers
        eventBus.publish('EstimateApproved', {
          projectId,
          estimateId,
          approvedBy: userId,
          clientMessage,
          projectName: project.name,
          estimateName: estimate.name,
          totalCost: estimate.totalCost
        });

        logger.info('Estimate approved by client', {
          estimateId,
          projectId,
          approvedBy: userId,
          clientMessage: clientMessage || 'No message'
        });
      }

      return updatedEstimate;
    } catch (error) {
      logger.error('Failed to approve estimate', {
        error: error instanceof Error ? error.message : 'Unknown error',
        estimateId,
        projectId,
        userId
      });
      throw error;
    }
  },

  /**
   * Client rejects the estimate
   */
  async rejectEstimate({ projectId, estimateId, userId, rejectionReason, clientMessage }: RejectEstimateOptions) {
    try {
      const [estimate] = await db
        .select()
        .from(estimates)
        .where(and(
          eq(estimates.id, estimateId),
          eq(estimates.projectId, projectId)
        ))
        .limit(1);

      if (!estimate) {
        throw new AppError('Estimate not found', 404);
      }

      if (estimate.status !== 'sent') {
        throw new AppError(`Cannot reject estimate with status: ${estimate.status}`, 400);
      }

      // Update estimate status
      const [updatedEstimate] = await db
        .update(estimates)
        .set({ 
          status: 'rejected',
          rejectedAt: new Date(),
          rejectedBy: userId,
          rejectionReason,
          clientMessage: clientMessage || null,
          updatedAt: new Date()
        })
        .where(eq(estimates.id, estimateId))
        .returning();

      // Get project details for notifications
      const [project] = await db
        .select()
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);

      if (project) {
        // Emit event for notifications
        eventBus.publish('EstimateRejected', {
          projectId,
          estimateId,
          rejectedBy: userId,
          rejectionReason,
          clientMessage,
          projectName: project.name,
          estimateName: estimate.name
        });

        logger.info('Estimate rejected by client', {
          estimateId,
          projectId,
          rejectedBy: userId,
          rejectionReason,
          clientMessage: clientMessage || 'No message'
        });
      }

      return updatedEstimate;
    } catch (error) {
      logger.error('Failed to reject estimate', {
        error: error instanceof Error ? error.message : 'Unknown error',
        estimateId,
        projectId,
        userId
      });
      throw error;
    }
  },

  /**
   * Get estimate with approval details
   */
  async getEstimateWithApprovalDetails(projectId: number, estimateId: number) {
    try {
      const [estimate] = await db
        .select({
          id: estimates.id,
          projectId: estimates.projectId,
          name: estimates.name,
          description: estimates.description,
          totalCost: estimates.totalCost,
          totalDuration: estimates.totalDuration,
          status: estimates.status,
          sentAt: estimates.sentAt,
          approvedAt: estimates.approvedAt,
          approvedBy: estimates.approvedBy,
          rejectedAt: estimates.rejectedAt,
          rejectedBy: estimates.rejectedBy,
          rejectionReason: estimates.rejectionReason,
          clientMessage: estimates.clientMessage,
          createdAt: estimates.createdAt,
          updatedAt: estimates.updatedAt,
          // Join with users table to get approver/rejecter details
          approverName: users.fullName,
        })
        .from(estimates)
        .leftJoin(users, eq(estimates.approvedBy, users.id))
        .where(and(
          eq(estimates.id, estimateId),
          eq(estimates.projectId, projectId)
        ))
        .limit(1);

      return estimate;
    } catch (error) {
      logger.error('Failed to get estimate with approval details', {
        error: error instanceof Error ? error.message : 'Unknown error',
        estimateId,
        projectId
      });
      throw error;
    }
  }
};