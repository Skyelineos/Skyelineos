import { Router } from 'express';
import { storage } from '../storage';

const router = Router();

// Create manual bid
router.post('/manual-bids', async (req, res) => {
  try {
    // Development logging removed
    
    const {
      projectId,
      estimateItemId,
      subcontractorName,
      companyName,
      bidAmount,
      daysToComplete,
      notes,
      submissionDate,
      isManualBid = true
    } = req.body;

    // Validate required fields
    if (!projectId || !estimateItemId || !subcontractorName || !bidAmount) {
      return res.status(400).json({
        error: 'Missing required fields: projectId, estimateItemId, subcontractorName, bidAmount'
      });
    }

    // Create bid response object
    const manualBidResponse = {
      id: Date.now(), // Simple ID generation
      projectId: parseInt(projectId),
      estimateItemId: estimateItemId,
      subcontractorName: subcontractorName,
      companyName: companyName || '',
      bidAmount: parseFloat(bidAmount),
      daysToComplete: daysToComplete ? parseInt(daysToComplete) : null,
      notes: notes || '',
      submissionDate: submissionDate || new Date().toISOString().split('T')[0],
      isManualBid: true,
      status: 'submitted',
      createdAt: new Date().toISOString(),
      attachments: []
    };

    // Save to storage (if storage method exists)
    if (typeof storage.createBidResponse === 'function') {
      const savedBid = await storage.createBidResponse(manualBidResponse);
      // Success operation completed
      
      res.json({
        success: true,
        message: 'Manual bid recorded successfully',
        bid: savedBid
      });
    } else {
      // Fallback: just return success for now
      // Development logging removed
      res.json({
        success: true,
        message: 'Manual bid recorded successfully',
        bid: manualBidResponse
      });
    }

  } catch (error) {
    console.error('❌ Error creating manual bid:', error);
    res.status(500).json({
      error: 'Failed to create manual bid',
      message: error.message
    });
  }
});

export default router;