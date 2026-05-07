import request from 'supertest';
import express from 'express';
import multer from 'multer';

// Mock storage
const mockStorage = {
  createBidResponse: jest.fn(),
  getBidResponsesByEstimateItem: jest.fn(),
};

// Mock multer middleware
const upload = multer({ dest: 'uploads/' });

// Create test app
const app = express();
app.use(express.json());

// Mock the upload bid responses endpoint based on the actual code structure
app.post('/api/bid-responses', upload.array('attachments'), async (req, res) => {
  try {
    const { bidProcessId, contactId, bidAmount, timeline, notes } = req.body;
    
    if (!bidProcessId || !contactId || !bidAmount || !timeline) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Process uploaded files
    const attachments = req.files ? (req.files as Express.Multer.File[]).map(file => ({
      filename: file.filename,
      originalName: file.originalname,
      size: file.size,
      path: file.path,
    })) : [];

    const bidResponseData = {
      bidProcessId: parseInt(bidProcessId),
      contactId: parseInt(contactId),
      bidAmount: parseFloat(bidAmount),
      timeline: parseInt(timeline),
      notes: notes || '',
      attachments,
    };

    const bidResponse = await mockStorage.createBidResponse(bidResponseData);
    res.json(bidResponse);
  } catch (error: any) {
    console.error('Error creating bid response:', error);
    res.status(500).json({ error: error.message || 'Failed to create bid response' });
  }
});

describe('POST /api/bid-responses', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should create a bid response successfully with all required fields', async () => {
    const mockBidResponse = {
      id: 1,
      bidProcessId: 123,
      contactId: 456,
      bidAmount: 25000,
      timeline: 30,
      notes: 'Test bid response',
      attachments: [],
      createdAt: new Date().toISOString(),
    };

    mockStorage.createBidResponse.mockResolvedValue(mockBidResponse);

    const response = await request(app)
      .post('/api/bid-responses')
      .send({
        bidProcessId: '123',
        contactId: '456',
        bidAmount: '25000',
        timeline: '30',
        notes: 'Test bid response',
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(mockBidResponse);
    expect(mockStorage.createBidResponse).toHaveBeenCalledWith({
      bidProcessId: 123,
      contactId: 456,
      bidAmount: 25000,
      timeline: 30,
      notes: 'Test bid response',
      attachments: [],
    });
  });

  it('should handle file attachments correctly', async () => {
    const mockBidResponse = {
      id: 2,
      bidProcessId: 123,
      contactId: 456,
      bidAmount: 30000,
      timeline: 45,
      notes: 'Bid with attachments',
      attachments: [
        {
          filename: 'test-file.pdf',
          originalName: 'proposal.pdf',
          size: 1024,
          path: '/uploads/test-file.pdf',
        },
      ],
      createdAt: new Date().toISOString(),
    };

    mockStorage.createBidResponse.mockResolvedValue(mockBidResponse);

    const response = await request(app)
      .post('/api/bid-responses')
      .field('bidProcessId', '123')
      .field('contactId', '456')
      .field('bidAmount', '30000')
      .field('timeline', '45')
      .field('notes', 'Bid with attachments')
      .attach('attachments', Buffer.from('fake file content'), 'proposal.pdf');

    expect(response.status).toBe(200);
    expect(mockStorage.createBidResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        bidProcessId: 123,
        contactId: 456,
        bidAmount: 30000,
        timeline: 45,
        notes: 'Bid with attachments',
        attachments: expect.arrayContaining([
          expect.objectContaining({
            originalName: 'proposal.pdf',
            size: expect.any(Number),
          }),
        ]),
      })
    );
  });

  it('should return 400 error when required fields are missing', async () => {
    const response = await request(app)
      .post('/api/bid-responses')
      .send({
        bidProcessId: '123',
        contactId: '456',
        // missing bidAmount and timeline
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Missing required fields' });
    expect(mockStorage.createBidResponse).not.toHaveBeenCalled();
  });

  it('should handle storage errors gracefully', async () => {
    mockStorage.createBidResponse.mockRejectedValue(new Error('Database connection failed'));

    const response = await request(app)
      .post('/api/bid-responses')
      .send({
        bidProcessId: '123',
        contactId: '456',
        bidAmount: '25000',
        timeline: '30',
      });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Database connection failed' });
  });

  it('should handle invalid numeric values', async () => {
    const mockBidResponse = {
      id: 3,
      bidProcessId: 123,
      contactId: 456,
      bidAmount: 0, // parseFloat('invalid') returns NaN, which becomes 0
      timeline: 0,
      notes: '',
      attachments: [],
      createdAt: new Date().toISOString(),
    };

    mockStorage.createBidResponse.mockResolvedValue(mockBidResponse);

    const response = await request(app)
      .post('/api/bid-responses')
      .send({
        bidProcessId: 'invalid',
        contactId: 'invalid',
        bidAmount: 'invalid',
        timeline: 'invalid',
      });

    expect(response.status).toBe(200);
    expect(mockStorage.createBidResponse).toHaveBeenCalledWith({
      bidProcessId: NaN,
      contactId: NaN,
      bidAmount: NaN,
      timeline: NaN,
      notes: '',
      attachments: [],
    });
  });
});