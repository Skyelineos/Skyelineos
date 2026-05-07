import sgMail from '@sendgrid/mail';
import { logger } from '../logger';

// Initialize SendGrid if API key is available
if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
} else {
  logger.warn('SENDGRID_API_KEY not configured, email functionality disabled');
}

export interface EmailOptions {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  from?: string;
}

export async function sendEmail(options: EmailOptions): Promise<boolean> {
  try {
    if (!process.env.SENDGRID_API_KEY) {
      logger.warn('Email not sent - SENDGRID_API_KEY not configured', {
        to: options.to,
        subject: options.subject
      });
      
      // In development, log the email content instead of sending
      if (process.env.NODE_ENV === 'development') {
        logger.info('Development email content:', {
          to: options.to,
          subject: options.subject,
          text: options.text?.substring(0, 200) + '...',
          html: options.html ? 'HTML content provided' : 'No HTML'
        });
      }
      return false;
    }

    const msg = {
      to: options.to,
      from: options.from || process.env.FROM_EMAIL || 'noreply@skyeline.com',
      subject: options.subject,
      ...(options.text && { text: options.text }),
      ...(options.html && { html: options.html }),
    };

    await sgMail.send(msg);
    
    logger.info('Email sent successfully', {
      to: options.to,
      subject: options.subject
    });
    
    return true;
  } catch (error) {
    logger.error('Failed to send email', {
      error: error instanceof Error ? error.message : 'Unknown error',
      to: options.to,
      subject: options.subject
    });
    throw error;
  }
}

// Helper function for estimate approval emails
export function generateEstimateEmailTemplate(data: {
  clientName: string;
  projectName: string;
  estimateName: string;
  description?: string;
  totalCost?: number;
  totalDuration?: number;
  approvalUrl: string;
  customMessage?: string;
}) {
  return {
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #2F80ED; color: white; padding: 20px; text-align: center;">
          <h1 style="margin: 0;">Skyeline Homes</h1>
          <p style="margin: 5px 0 0 0; opacity: 0.9;">Custom Home Building</p>
        </div>
        
        <div style="padding: 30px 20px;">
          <h2 style="color: #2F80ED; margin-top: 0;">Your Estimate is Ready for Review</h2>
          
          <p>Dear ${data.clientName},</p>
          
          <p>Your estimate for <strong>${data.projectName}</strong> is ready for your review and approval.</p>
          
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #2F80ED;">
            <h3 style="margin-top: 0; color: #333;">Estimate Details</h3>
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; font-weight: bold; color: #555;">Estimate Name:</td>
                <td style="padding: 8px 0;">${data.estimateName}</td>
              </tr>
              ${data.description ? `
              <tr>
                <td style="padding: 8px 0; font-weight: bold; color: #555;">Description:</td>
                <td style="padding: 8px 0;">${data.description}</td>
              </tr>
              ` : ''}
              <tr>
                <td style="padding: 8px 0; font-weight: bold; color: #555;">Total Cost:</td>
                <td style="padding: 8px 0; font-size: 18px; font-weight: bold; color: #2F80ED;">
                  $${data.totalCost?.toLocaleString() || '0'}
                </td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: bold; color: #555;">Timeline:</td>
                <td style="padding: 8px 0;">${data.totalDuration || 0} days</td>
              </tr>
            </table>
          </div>
          
          ${data.customMessage ? `
            <div style="background-color: #e3f2fd; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 0 0 10px 0; font-weight: bold; color: #1565C0;">Message from your project manager:</p>
              <p style="margin: 0; font-style: italic; color: #333;">${data.customMessage}</p>
            </div>
          ` : ''}
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${data.approvalUrl}" 
               style="background-color: #2F80ED; color: white; padding: 15px 30px; 
                      text-decoration: none; border-radius: 5px; font-weight: bold;
                      display: inline-block; font-size: 16px;">
              Review & Approve Estimate
            </a>
          </div>
          
          <p style="color: #666; font-size: 14px; line-height: 1.5;">
            You can review the complete estimate details, ask questions, and approve or request changes 
            by clicking the button above. If you have any questions or need clarification on any aspect 
            of the estimate, please don't hesitate to contact us.
          </p>
          
          <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; border-radius: 8px; padding: 15px; margin: 20px 0;">
            <p style="margin: 0; color: #856404;">
              <strong>Next Steps:</strong> Once you approve this estimate, we'll begin scheduling and 
              coordinating with our subcontractors to start your project.
            </p>
          </div>
        </div>
        
        <div style="background-color: #f8f9fa; padding: 20px; border-top: 1px solid #eee;">
          <p style="margin: 0; color: #666; font-size: 12px; text-align: center;">
            This is an automated message from Skyeline Homes BuildFlow system. 
            Please do not reply directly to this email.
          </p>
          <p style="margin: 10px 0 0 0; color: #666; font-size: 12px; text-align: center;">
            If you need assistance, please contact us at your project manager directly.
          </p>
        </div>
      </div>
    `,
    text: `
Your estimate for ${data.projectName} is ready for review and approval.

Estimate Details:
- Name: ${data.estimateName}
${data.description ? `- Description: ${data.description}\n` : ''}
- Total Cost: $${data.totalCost?.toLocaleString() || '0'}
- Timeline: ${data.totalDuration || 0} days

${data.customMessage ? `Message from your project manager:\n${data.customMessage}\n\n` : ''}

Please visit the following link to review and approve your estimate:
${data.approvalUrl}

If you have any questions, please contact us directly.

Thank you,
Skyeline Homes
    `
  };
}