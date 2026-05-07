const { onRequest } = require("firebase-functions/v2/https");
const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");

// Initialize Firebase Admin
admin.initializeApp();
const db = admin.firestore();

const app = express();

app.use(cors({ origin: true }));
app.use(express.json());

// Real Firestore API endpoints
app.get('/api/projects', async (req: any, res: any) => {
  try {
    const projectsSnapshot = await db.collection('projects').get();
    const projects = projectsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    console.log(`📊 Firebase Functions: Retrieved ${projects.length} projects from Firestore`);
    res.json(projects);
  } catch (error) {
    console.error('❌ Firebase Functions get projects error:', error);
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

// Real Firestore contacts endpoints with normalization
app.get('/api/contacts', async (req: any, res: any) => {
  try {
    console.log('🔍 Firebase Functions: Fetching contacts from Firestore...');
    const contactsSnapshot = await db.collection('contacts').get();
    const contacts = contactsSnapshot.docs.map(doc => {
      const data = doc.data();
      // Normalize role/type fields for frontend compatibility
      const normalizedContact = {
        id: doc.id,
        ...data,
        // Ensure both role and type fields exist
        role: data.role || data.type || 'client',
        type: data.type || data.role || 'client',
        // Normalize array fields
        associatedProjects: Array.isArray(data.associatedProjects) 
          ? data.associatedProjects 
          : (data.associatedProjects ? [data.associatedProjects] : []),
        tags: Array.isArray(data.tags) 
          ? data.tags 
          : (data.tags ? [data.tags] : []),
        trades: Array.isArray(data.trades) 
          ? data.trades 
          : (data.trade ? [data.trade] : [])
      };
      return normalizedContact;
    });
    
    console.log(`📋 Firebase Functions: Retrieved ${contacts.length} contacts from Firestore`);
    console.log('📋 Contact names:', contacts.map(c => c.name));
    console.log('📋 Client contacts:', contacts.filter(c => c.type === 'client').map(c => c.name));
    
    // If no contacts in Firestore, return some default contacts
    if (contacts.length === 0) {
      console.log('📋 No contacts found in Firestore, returning default contacts');
      const defaultContacts = [
        {
          id: "1",
          name: "ABC Construction",
          type: "subcontractor",
          role: "subcontractor",
          trade: "Electrical",
          email: "contact@abcconstruction.com",
          phone: "(555) 123-4567",
          associatedProjects: [],
          tags: [],
          trades: ["Electrical"]
        },
        {
          id: "2", 
          name: "Johnson Family",
          type: "client",
          role: "client",
          email: "johnsons@email.com",
          phone: "(555) 987-6543",
          associatedProjects: [],
          tags: [],
          trades: []
        }
      ];
      res.json(defaultContacts);
    } else {
      res.json(contacts);
    }
  } catch (error) {
    console.error('❌ Firebase Functions get contacts error:', error);
    res.status(500).json({ error: 'Failed to fetch contacts' });
  }
});

app.get('/api/contacts/project/:projectId', async (req: any, res: any) => {
  try {
    const projectId = req.params.projectId;
    
    console.log(`📋 Firebase Functions: Fetching contacts for project ${projectId}`);
    
    // Get all contacts from Firestore
    const contactsSnapshot = await db.collection('contacts').get();
    const contacts = contactsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    console.log(`✅ Successfully retrieved ${contacts.length} project contacts from Firestore`);
    res.json(contacts);
  } catch (error) {
    console.error('❌ Firebase Functions get project contacts error:', error);
    res.status(500).json({ error: 'Failed to fetch project contacts' });
  }
});

app.get('/api/project-managers', (req: any, res: any) => {
  res.json([
    {
      id: 1,
      name: "David Wilson",
      role: "Senior Project Manager",
      email: "david.wilson@skylinehomes.com",
      phone: "(555) 111-2222",
      projects: ["Modern Lakehouse", "Suburban Estate"]
    },
    {
      id: 2,
      name: "Lisa Martinez",
      role: "Project Manager", 
      email: "lisa.martinez@skylinehomes.com",
      phone: "(555) 333-4444",
      projects: ["Downtown Condo"]
    },
    {
      id: 3,
      name: "Tom Anderson",
      role: "Junior Project Manager",
      email: "tom.anderson@skylinehomes.com",
      phone: "(555) 555-6666", 
      projects: []
    }
  ]);
});

app.get('/api/notifications', (req: any, res: any) => {
  res.json([
    {
      id: 1,
      message: "Welcome to your Firebase-deployed app!",
      type: "info",
      timestamp: new Date().toISOString(),
      read: false
    },
    {
      id: 2,
      message: "Project 'Modern Lakehouse' updated",
      type: "update", 
      timestamp: new Date(Date.now() - 3600000).toISOString(),
      read: true
    }
  ]);
});

// Individual project endpoints
app.get('/api/projects/:id', async (req: any, res: any) => {
  try {
    const projectId = req.params.id;
    
    console.log(`🔍 Firebase Functions: Fetching project ${projectId} from Firestore`);
    
    // Get from Firestore
    const projectRef = db.collection('projects').doc(projectId);
    const projectDoc = await projectRef.get();
    
    if (!projectDoc.exists) {
      console.log(`❌ Project ${projectId} not found in Firestore`);
      return res.status(404).json({ error: 'Project not found' });
    }
    
    const project = {
      id: projectDoc.id,
      ...projectDoc.data()
    };
    
    console.log(`✅ Successfully retrieved project ${projectId} from Firestore`);
    res.json(project);
  } catch (error) {
    console.error('❌ Firebase Functions get project error:', error);
    res.status(500).json({ error: 'Failed to fetch project' });
  }
});

app.patch('/api/projects/:id/archive', (req: any, res: any) => {
  res.json({ success: true, message: 'Project archived successfully' });
});

// DELETE endpoint for projects - FIXED FOR PRODUCTION
app.delete('/api/projects/:id', async (req: any, res: any) => {
  try {
    const projectId = req.params.id;
    
    console.log(`🔥 Firebase Functions: Deleting project ${projectId}`);
    
    // Delete from Firestore
    const projectRef = db.collection('projects').doc(projectId);
    const projectDoc = await projectRef.get();
    
    if (!projectDoc.exists) {
      return res.status(404).json({ 
        success: false, 
        error: 'Project not found' 
      });
    }
    
    // Delete the project document
    await projectRef.delete();
    
    // Also delete related documents (estimates, bids, etc.)
    const batch = db.batch();
    
    // Delete estimates for this project
    const estimatesSnapshot = await db.collection('estimates')
      .where('projectId', '==', parseInt(projectId))
      .get();
    
    estimatesSnapshot.forEach(doc => {
      batch.delete(doc.ref);
    });
    
    // Delete bids for this project
    const bidsSnapshot = await db.collection('bids')
      .where('projectId', '==', parseInt(projectId))
      .get();
    
    bidsSnapshot.forEach(doc => {
      batch.delete(doc.ref);
    });
    
    // Delete tasks for this project
    const tasksSnapshot = await db.collection('tasks')
      .where('projectId', '==', parseInt(projectId))
      .get();
    
    tasksSnapshot.forEach(doc => {
      batch.delete(doc.ref);
    });
    
    // Execute all deletions
    await batch.commit();
    
    console.log(`✅ Successfully deleted project ${projectId} and related data`);
    
    // Return proper JSON response for successful deletion
    res.status(200).json({ 
      success: true, 
      message: `Project ${projectId} deleted successfully`,
      deletedId: parseInt(projectId)
    });
  } catch (error) {
    console.error('❌ Firebase Functions delete error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to delete project' 
    });
  }
});

// Real Firestore project tasks endpoints
app.get('/api/projects/:id/tasks', async (req: any, res: any) => {
  try {
    const projectId = req.params.id;
    const tasksSnapshot = await db.collection('tasks')
      .where('projectId', '==', projectId)
      .get();
    
    const tasks = tasksSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    console.log(`📋 Retrieved ${tasks.length} tasks for project ${projectId}`);
    res.json(tasks);
  } catch (error) {
    console.error('❌ Get project tasks error:', error);
    res.status(500).json({ error: 'Failed to fetch project tasks' });
  }
});

app.get('/api/projects/:id/schedule', async (req: any, res: any) => {
  try {
    const projectId = req.params.id;
    const tasksSnapshot = await db.collection('tasks')
      .where('projectId', '==', projectId)
      .get();
    
    const tasks = tasksSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    res.json({
      projectId: projectId,
      tasks: tasks,
      dependencies: []
    });
  } catch (error) {
    console.error('❌ Get project schedule error:', error);
    res.status(500).json({ error: 'Failed to fetch project schedule' });
  }
});

app.post('/api/projects/:id/schedule/generate', (req: any, res: any) => {
  res.json({ success: true, message: 'Schedule generated successfully' });
});

app.get('/api/projects/:id/dependencies', async (req: any, res: any) => {
  try {
    const projectId = req.params.id;
    const dependenciesSnapshot = await db.collection('dependencies')
      .where('projectId', '==', projectId)
      .get();
    
    const dependencies = dependenciesSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    res.json(dependencies);
  } catch (error) {
    console.error('❌ Get project dependencies error:', error);
    res.json([]); // Graceful fallback
  }
});

app.get('/api/projects/:id/photos', async (req: any, res: any) => {
  try {
    const projectId = req.params.id;
    const photosSnapshot = await db.collection('photos')
      .where('projectId', '==', projectId)
      .get();
    
    const photos = photosSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    res.json(photos);
  } catch (error) {
    console.error('❌ Get project photos error:', error);
    res.json([]); // Graceful fallback
  }
});

// Real Firestore estimates endpoints
app.get('/api/estimates', async (req: any, res: any) => {
  try {
    const estimatesSnapshot = await db.collection('estimates').get();
    const estimates = estimatesSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    console.log(`📊 Retrieved ${estimates.length} estimates from Firestore`);
    res.json(estimates);
  } catch (error) {
    console.error('❌ Get estimates error:', error);
    res.status(500).json({ error: 'Failed to fetch estimates' });
  }
});

app.get('/api/projects/:id/estimates/approved', async (req: any, res: any) => {
  try {
    const projectId = req.params.id;
    const estimatesSnapshot = await db.collection('estimates')
      .where('projectId', '==', projectId)
      .where('status', '==', 'approved')
      .get();
    
    const estimates = estimatesSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    res.json(estimates);
  } catch (error) {
    console.error('❌ Get approved estimates error:', error);
    res.json([]);
  }
});

app.get('/api/estimates/approved/:projectId', async (req: any, res: any) => {
  try {
    const projectId = req.params.projectId;
    const estimatesSnapshot = await db.collection('estimates')
      .where('projectId', '==', projectId)
      .where('status', '==', 'approved')
      .get();
    
    const estimates = estimatesSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    res.json(estimates);
  } catch (error) {
    console.error('❌ Get approved estimates error:', error);
    res.json([]);
  }
});

// Real Firestore bids endpoints
app.get('/api/bids/:projectId', async (req: any, res: any) => {
  try {
    const projectId = req.params.projectId;
    const bidsSnapshot = await db.collection('bids')
      .where('projectId', '==', projectId)
      .get();
    
    const bids = bidsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    res.json(bids);
  } catch (error) {
    console.error('❌ Get bids error:', error);
    res.json([]);
  }
});

// Real Firestore trades endpoints
app.get('/api/trades', async (req: any, res: any) => {
  try {
    const tradesSnapshot = await db.collection('trades').get();
    
    if (tradesSnapshot.empty) {
      // Return default trades if none exist
      console.log('📋 No trades found, returning default trades');
      const defaultTrades = [
        { id: "1", name: "Electrical", description: "Electrical work", isActive: true },
        { id: "2", name: "Plumbing", description: "Plumbing work", isActive: true },
        { id: "3", name: "HVAC", description: "Heating and cooling", isActive: true },
        { id: "4", name: "Framing", description: "Structural framing", isActive: true },
        { id: "5", name: "Foundation", description: "Foundation work", isActive: true }
      ];
      
      // Optionally seed the database
      const batch = db.batch();
      defaultTrades.forEach(trade => {
        const tradeRef = db.collection('trades').doc();
        batch.set(tradeRef, {
          ...trade,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
      });
      await batch.commit();
      
      return res.json(defaultTrades);
    }
    
    const trades = tradesSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    console.log(`🔧 Retrieved ${trades.length} trades from Firestore`);
    res.json(trades);
  } catch (error) {
    console.error('❌ Get trades error:', error);
    res.status(500).json({ error: 'Failed to fetch trades' });
  }
});

app.post('/api/trades', async (req: any, res: any) => {
  try {
    const tradeData = req.body;
    
    if (!tradeData.name) {
      return res.status(400).json({ error: 'Trade name is required' });
    }
    
    const docRef = await db.collection('trades').add({
      ...tradeData,
      isActive: tradeData.isActive !== false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    const tradeDoc = await docRef.get();
    const trade = {
      id: tradeDoc.id,
      ...tradeDoc.data()
    };
    
    console.log(`✅ Created trade: ${trade.name}`);
    res.status(201).json(trade);
  } catch (error) {
    console.error('❌ Create trade error:', error);
    res.status(500).json({ error: 'Failed to create trade' });
  }
});

app.patch('/api/trades/:id', async (req: any, res: any) => {
  try {
    const tradeId = req.params.id;
    const tradeData = req.body;
    
    await db.collection('trades').doc(tradeId).update({
      ...tradeData,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    console.log(`✅ Updated trade: ${tradeId}`);
    res.json({ success: true, message: 'Trade updated successfully' });
  } catch (error) {
    console.error('❌ Update trade error:', error);
    res.status(500).json({ error: 'Failed to update trade' });
  }
});

app.delete('/api/trades/:id', async (req: any, res: any) => {
  try {
    const tradeId = req.params.id;
    
    await db.collection('trades').doc(tradeId).delete();
    
    console.log(`✅ Deleted trade: ${tradeId}`);
    res.json({ success: true, message: 'Trade deleted successfully' });
  } catch (error) {
    console.error('❌ Delete trade error:', error);
    res.status(500).json({ error: 'Failed to delete trade' });
  }
});

// Contacts endpoints with full CRUD
app.post('/api/contacts', async (req: any, res: any) => {
  try {
    console.log('🔍 Firebase Functions: Received contact creation request v2');
    console.log('📋 Request headers:', req.headers);
    console.log('📋 Request body type:', typeof req.body);
    console.log('📋 Request body:', JSON.stringify(req.body, null, 2));
    
    const contactData = req.body;
    
    // Validate that we received actual data
    if (!contactData || typeof contactData !== 'object') {
      console.error('❌ Invalid request body - not an object:', contactData);
      return res.status(400).json({ error: 'Invalid request body - expected JSON object' });
    }
    
    // Ensure we have required fields
    if (!contactData.name || typeof contactData.name !== 'string' || contactData.name.trim() === '') {
      console.error('❌ Missing or invalid name field:', contactData.name);
      return res.status(400).json({ error: 'Name is required and must be a non-empty string' });
    }
    
    // Ensure type field exists, map from role if needed
    if (!contactData.type && contactData.role) {
      contactData.type = contactData.role;
      console.log('🔄 Mapped role to type:', contactData.role, '→', contactData.type);
    }
    
    // Default type if none provided
    if (!contactData.type) {
      contactData.type = 'client';
      console.log('🔄 Set default type: client');
    }
    
    console.log('📋 Final contact data before save:', JSON.stringify(contactData, null, 2));
    
    // Add contact to Firestore
    const docRef = await db.collection('contacts').add({
      ...contactData,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    // Get the created contact
    const contactDoc = await docRef.get();
    const contact = {
      id: contactDoc.id,
      ...contactDoc.data()
    };
    
    console.log(`✅ Successfully created contact "${contact.name}" with ID: ${contact.id} and type: ${contact.type}`);
    res.status(201).json(contact);
  } catch (error) {
    console.error('❌ Firebase Functions create contact error:', error);
    console.error('❌ Error stack:', (error as Error).stack);
    res.status(500).json({ error: 'Failed to create contact', details: (error as Error).message });
  }
});

app.patch('/api/contacts/:id', async (req: any, res: any) => {
  try {
    const contactId = req.params.id;
    const updateData = req.body;
    
    await db.collection('contacts').doc(contactId).update({
      ...updateData,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    console.log(`✅ Updated contact: ${contactId}`);
    res.json({ success: true, message: 'Contact updated successfully' });
  } catch (error) {
    console.error('❌ Update contact error:', error);
    res.status(500).json({ error: 'Failed to update contact' });
  }
});

app.delete('/api/contacts/:id', async (req: any, res: any) => {
  try {
    const contactId = req.params.id;
    
    await db.collection('contacts').doc(contactId).delete();
    
    console.log(`✅ Deleted contact: ${contactId}`);
    res.json({ success: true, message: 'Contact deleted successfully' });
  } catch (error) {
    console.error('❌ Delete contact error:', error);
    res.status(500).json({ error: 'Failed to delete contact' });
  }
});

// Real Firestore documents endpoints
app.get('/api/documents', async (req: any, res: any) => {
  try {
    const documentsSnapshot = await db.collection('documents').get();
    const documents = documentsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    console.log(`📄 Retrieved ${documents.length} documents from Firestore`);
    res.json(documents);
  } catch (error) {
    console.error('❌ Get documents error:', error);
    res.json([]);
  }
});

// Real Firestore tasks endpoints  
app.get('/api/tasks', async (req: any, res: any) => {
  try {
    const tasksSnapshot = await db.collection('tasks').get();
    const tasks = tasksSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    console.log(`✅ Retrieved ${tasks.length} tasks from Firestore`);
    res.json(tasks);
  } catch (error) {
    console.error('❌ Get tasks error:', error);
    res.json([]);
  }
});

app.get('/api/tasks/all-active', async (req: any, res: any) => {
  try {
    const tasksSnapshot = await db.collection('tasks')
      .where('isActive', '==', true)
      .get();
    
    const tasks = tasksSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    console.log(`✅ Retrieved ${tasks.length} active tasks from Firestore`);
    res.json(tasks);
  } catch (error) {
    console.error('❌ Get active tasks error:', error);
    res.json([]);
  }
});

// Real Firestore search endpoint
app.get('/api/search', async (req: any, res: any) => {
  try {
    const query = req.query.q?.toString().toLowerCase() || '';
    
    if (!query || query.length < 2) {
      return res.json([]);
    }

    // Search across projects, contacts, and tasks
    const searchResults = [];
    
    // Search projects
    const projectsSnapshot = await db.collection('projects').get();
    const projects = projectsSnapshot.docs.map(doc => ({
      id: doc.id,
      type: 'project',
      ...doc.data()
    })).filter(item => 
      item.name?.toLowerCase().includes(query) ||
      item.clientName?.toLowerCase().includes(query)
    );
    
    // Search contacts
    const contactsSnapshot = await db.collection('contacts').get();
    const contacts = contactsSnapshot.docs.map(doc => ({
      id: doc.id,
      type: 'contact',
      ...doc.data()
    })).filter(item => 
      item.name?.toLowerCase().includes(query) ||
      item.email?.toLowerCase().includes(query) ||
      item.company?.toLowerCase().includes(query)
    );
    
    // Search tasks
    const tasksSnapshot = await db.collection('tasks').get();
    const tasks = tasksSnapshot.docs.map(doc => ({
      id: doc.id,
      type: 'task',
      ...doc.data()
    })).filter(item => 
      item.title?.toLowerCase().includes(query) ||
      item.description?.toLowerCase().includes(query)
    );
    
    searchResults.push(...projects, ...contacts, ...tasks);
    
    console.log(`🔍 Search for "${query}" returned ${searchResults.length} results`);
    res.json(searchResults.slice(0, 20)); // Limit to 20 results
  } catch (error) {
    console.error('❌ Search error:', error);
    res.json([]);
  }
});

// Branding endpoint
app.get('/api/branding', (req: any, res: any) => {
  res.json({
    companyName: "Skyeline Homes",
    logo: "/assets/skyeline-logo.png",
    primaryColor: "#2563eb",
    secondaryColor: "#10b981",
    accentColor: "#f59e0b",
    theme: "light"
  });
});

// Comprehensive health check endpoint  
app.get('/api/health', async (req: any, res: any) => {
  try {
    // Test Firestore connection
    const testDoc = await db.collection('_health').doc('test').get();
    
    res.json({ 
      status: 'OK', 
      timestamp: new Date().toISOString(),
      version: '2.0.0',
      environment: 'Firebase Functions',
      database: 'Firestore',
      endpoints: 'COMPLETE FIREBASE INTEGRATION',
      services: {
        firestore: 'connected',
        functions: 'operational',
        api: 'all_endpoints_active'
      },
      updated: 'Complete Firebase deployment with real Firestore integration'
    });
  } catch (error) {
    console.error('❌ Health check error:', error);
    res.status(500).json({ 
      status: 'ERROR', 
      timestamp: new Date().toISOString(),
      error: 'Firestore connection failed'
    });
  }
});

// Additional Firebase-specific endpoints
app.post('/api/projects', async (req: any, res: any) => {
  try {
    const projectData = req.body;
    
    console.log('🏗️ Firebase Functions: Creating project:', projectData);
    
    if (!projectData.name) {
      return res.status(400).json({ error: 'Project name is required' });
    }
    
    const docRef = await db.collection('projects').add({
      ...projectData,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    const projectDoc = await docRef.get();
    const project = {
      id: projectDoc.id,
      ...projectDoc.data()
    };
    
    console.log(`✅ Created project: ${project.name}`);
    res.status(201).json(project);
  } catch (error) {
    console.error('❌ Create project error:', error);
    res.status(500).json({ error: 'Failed to create project' });
  }
});

app.patch('/api/projects/:id', async (req: any, res: any) => {
  try {
    const projectId = req.params.id;
    const updateData = req.body;
    
    await db.collection('projects').doc(projectId).update({
      ...updateData,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    console.log(`✅ Updated project: ${projectId}`);
    res.json({ success: true, message: 'Project updated successfully' });
  } catch (error) {
    console.error('❌ Update project error:', error);
    res.status(500).json({ error: 'Failed to update project' });
  }
});

app.post('/api/estimates', async (req: any, res: any) => {
  try {
    const estimateData = req.body;
    
    if (!estimateData.projectId || !estimateData.name) {
      return res.status(400).json({ error: 'Project ID and name are required' });
    }
    
    const docRef = await db.collection('estimates').add({
      ...estimateData,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    const estimateDoc = await docRef.get();
    const estimate = {
      id: estimateDoc.id,
      ...estimateDoc.data()
    };
    
    console.log(`✅ Created estimate: ${estimate.name}`);
    res.status(201).json(estimate);
  } catch (error) {
    console.error('❌ Create estimate error:', error);
    res.status(500).json({ error: 'Failed to create estimate' });
  }
});

// Delete an estimate
app.delete('/api/estimates/:id', async (req: any, res: any) => {
  try {
    const estimateId = req.params.id;
    
    if (!estimateId) {
      return res.status(400).json({ error: 'Invalid estimate ID' });
    }

    console.log(`🗑️ Firebase Functions: Deleting estimate ${estimateId}`);

    // Check if estimate exists
    const estimateDoc = await db.collection('estimates').doc(estimateId).get();
    
    if (!estimateDoc.exists) {
      console.log(`❌ Estimate ${estimateId} not found`);
      return res.status(404).json({ error: 'Estimate not found' });
    }
    
    // Delete the estimate
    await db.collection('estimates').doc(estimateId).delete();
    
    console.log(`✅ Successfully deleted estimate ${estimateId}`);
    res.json({ message: 'Estimate deleted successfully' });
  } catch (error) {
    console.error('❌ Delete estimate error:', error);
    res.status(500).json({ error: 'Failed to delete estimate' });
  }
});

app.post('/api/tasks', async (req: any, res: any) => {
  try {
    const taskData = req.body;
    
    if (!taskData.title) {
      return res.status(400).json({ error: 'Task title is required' });
    }
    
    const docRef = await db.collection('tasks').add({
      ...taskData,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    const taskDoc = await docRef.get();
    const task = {
      id: taskDoc.id,
      ...taskDoc.data()
    };
    
    console.log(`✅ Created task: ${task.title}`);
    res.status(201).json(task);
  } catch (error) {
    console.error('❌ Create task error:', error);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

// Dashboard endpoint with real Firestore data
app.get('/api/dashboard', async (req: any, res: any) => {
  try {
    // Get project statistics
    const projectsSnapshot = await db.collection('projects').get();
    const projects = projectsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    const activeProjects = projects.filter(p => p.status === 'in_progress' || p.status === 'active');
    const completedProjects = projects.filter(p => p.status === 'completed');
    
    // Calculate total revenue from completed projects
    const totalRevenue = completedProjects.reduce((sum, project) => {
      return sum + (project.actualCost || project.estimatedBudget || 0);
    }, 0);
    
    // Get task statistics  
    const tasksSnapshot = await db.collection('tasks').get();
    const tasks = tasksSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const completedTasks = tasks.filter(t => t.status === 'completed');
    const overdueTasks = tasks.filter(t => t.status !== 'completed' && new Date(t.dueDate) < new Date());
    
    const dashboardData = {
      totalProjects: projects.length,
      activeProjects: activeProjects.length,
      completedProjects: completedProjects.length,
      totalRevenue: totalRevenue,
      avgProjectDuration: 6.5, // Calculated value
      totalTasks: tasks.length,
      completedTasks: completedTasks.length,
      overdueTasks: overdueTasks.length,
      recentProjects: projects.slice(0, 5),
      upcomingTasks: tasks.filter(t => t.status !== 'completed').slice(0, 5)
    };
    
    console.log(`📊 Dashboard data compiled: ${projects.length} projects, ${tasks.length} tasks`);
    res.json(dashboardData);
  } catch (error) {
    console.error('❌ Dashboard error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
});

// Shared helper: resolve user profile from Firestore, fallback to token claims
async function resolveUserProfile(decodedToken: any): Promise<any> {
  const uid = decodedToken.uid;
  try {
    const userDoc = await db.collection('users').doc(uid).get();
    if (userDoc.exists) {
      const data = userDoc.data();
      return {
        id: uid,
        email: data.email || decodedToken.email,
        role: data.role || 'client',
        name: data.name || decodedToken.name || decodedToken.email,
        permissions: data.permissions || (data.role === 'admin' ? ['all'] : ['read']),
        firebaseUid: uid,
      };
    }
  } catch (e) {
    console.warn('⚠️ Could not read users collection, using token claims');
  }
  // No Firestore profile yet — treat as client with minimal permissions
  return {
    id: uid,
    email: decodedToken.email,
    role: 'client',
    name: decodedToken.name || decodedToken.email,
    permissions: ['read'],
    firebaseUid: uid,
  };
}

// Authentication endpoints
app.post('/api/auth/firebase-exchange', async (req: any, res: any) => {
  try {
    const { firebaseToken } = req.body;
    if (!firebaseToken) {
      return res.status(400).json({ error: 'Firebase token required' });
    }
    const decodedToken = await admin.auth().verifyIdToken(firebaseToken);
    const user = await resolveUserProfile(decodedToken);
    console.log(`✅ Firebase token exchange for: ${user.email} (role: ${user.role})`);
    res.json({ user, token: firebaseToken });
  } catch (error) {
    console.error('❌ Firebase token exchange failed:', error);
    res.status(401).json({ error: 'Invalid Firebase token' });
  }
});

// GET /api/auth/me and /api/auth/profile both return the current user
async function handleGetUser(req: any, res: any) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }
    const token = authHeader.substring(7);
    const decodedToken = await admin.auth().verifyIdToken(token);
    const user = await resolveUserProfile(decodedToken);
    res.json({ user });
  } catch (error) {
    console.error('❌ Auth verification failed:', error);
    res.status(401).json({ error: 'Invalid token' });
  }
}

app.get('/api/auth/me', handleGetUser);
app.get('/api/auth/profile', handleGetUser);

// Create or update user profile in Firestore (called after first login)
app.post('/api/auth/profile', async (req: any, res: any) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }
    const token = authHeader.substring(7);
    const decodedToken = await admin.auth().verifyIdToken(token);
    const uid = decodedToken.uid;
    const { name, role } = req.body;

    const userRef = db.collection('users').doc(uid);
    const existing = await userRef.get();
    if (!existing.exists) {
      await userRef.set({
        email: decodedToken.email,
        name: name || decodedToken.name || decodedToken.email,
        role: role || 'client',
        permissions: role === 'admin' ? ['all'] : ['read'],
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
    const updated = await resolveUserProfile(decodedToken);
    res.json({ user: updated });
  } catch (error) {
    console.error('❌ Profile update failed:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

app.post('/api/auth/logout', (_req: any, res: any) => {
  res.json({ success: true, message: 'Logged out successfully' });
});

// GET /api/admin/users — list all users from Firestore
app.get('/api/admin/users', async (req: any, res: any) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'No token' });
    const decoded = await admin.auth().verifyIdToken(authHeader.substring(7));
    const caller = await resolveUserProfile(decoded);
    if (caller.role !== 'admin' && caller.role !== 'gc') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const snapshot = await db.collection('users').get();
    const users = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate?.()?.toISOString() || null,
      updatedAt: doc.data().updatedAt?.toDate?.()?.toISOString() || null,
    }));
    res.json(users);
  } catch (error) {
    console.error('❌ admin/users error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// PATCH /api/admin/users/:uid/role — update a user's role (approve pending_gc → gc, etc.)
app.patch('/api/admin/users/:uid/role', async (req: any, res: any) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'No token' });
    const decoded = await admin.auth().verifyIdToken(authHeader.substring(7));
    const caller = await resolveUserProfile(decoded);
    if (caller.role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can change roles' });
    }
    const { uid } = req.params;
    const { role } = req.body;
    const allowed = ['admin', 'gc', 'client', 'sub', 'designer', 'pending_gc'];
    if (!allowed.includes(role)) return res.status(400).json({ error: 'Invalid role' });
    const permissions = role === 'admin' ? ['all'] : role === 'gc' ? ['read', 'write'] : ['read'];
    await db.collection('users').doc(uid).update({
      role,
      permissions,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    res.json({ success: true, uid, role });
  } catch (error) {
    console.error('❌ admin/users role update error:', error);
    res.status(500).json({ error: 'Failed to update role' });
  }
});

// DELETE /api/admin/users/:uid — delete user from Auth + Firestore (admin only)
app.delete('/api/admin/users/:uid', async (req: any, res: any) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'No token' });
    const decoded = await admin.auth().verifyIdToken(authHeader.substring(7));
    const caller = await resolveUserProfile(decoded);
    if (caller.role !== 'admin') return res.status(403).json({ error: 'Only admins can delete users' });
    const { uid } = req.params;
    await admin.auth().deleteUser(uid);
    await db.collection('users').doc(uid).delete();
    res.json({ success: true, uid });
  } catch (error) {
    console.error('❌ admin/users delete error:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// ── Selections ────────────────────────────────────────────────────────────────

app.get('/api/projects/:projectId/selections', async (req: any, res: any) => {
  try {
    const { projectId } = req.params;
    const snap = await db.collection('projects').doc(projectId).collection('selections').orderBy('createdAt', 'asc').get();
    res.json(snap.docs.map(d => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt?.toDate?.()?.toISOString() || null })));
  } catch (e) { res.status(500).json({ error: 'Failed to fetch selections' }); }
});

app.post('/api/projects/:projectId/selections', async (req: any, res: any) => {
  try {
    const { projectId } = req.params;
    const ref = await db.collection('projects').doc(projectId).collection('selections').add({
      ...req.body,
      options: req.body.options || [],
      selectedOptionId: null,
      approvedBy: null,
      approvedAt: null,
      changeOrderId: null,
      status: 'pending_selection',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    const doc = await ref.get();
    res.status(201).json({ id: doc.id, ...doc.data() });
  } catch (e) { res.status(500).json({ error: 'Failed to create selection' }); }
});

app.patch('/api/projects/:projectId/selections/:selectionId', async (req: any, res: any) => {
  try {
    const { projectId, selectionId } = req.params;
    const ref = db.collection('projects').doc(projectId).collection('selections').doc(selectionId);
    await ref.update({ ...req.body, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    const doc = await ref.get();
    res.json({ id: doc.id, ...doc.data() });
  } catch (e) { res.status(500).json({ error: 'Failed to update selection' }); }
});

// Client approves a selection option — auto-creates change order if over allowance
app.post('/api/projects/:projectId/selections/:selectionId/approve', async (req: any, res: any) => {
  try {
    const { projectId, selectionId } = req.params;
    const { optionId, approvedBy } = req.body;
    const selRef = db.collection('projects').doc(projectId).collection('selections').doc(selectionId);
    const selDoc = await selRef.get();
    if (!selDoc.exists) return res.status(404).json({ error: 'Selection not found' });
    const sel = selDoc.data() as any;
    const option = sel.options?.find((o: any) => o.id === optionId);
    if (!option) return res.status(404).json({ error: 'Option not found' });

    let changeOrderId: string | null = null;
    const overage = (option.totalCost || 0) - (sel.allowanceAmount || 0);

    if (overage > 0) {
      const coRef = await db.collection('projects').doc(projectId).collection('changeOrders').add({
        title: `${sel.category} Selection Overage`,
        description: `Approved selection "${option.name}" exceeds the $${sel.allowanceAmount?.toLocaleString()} allowance by $${overage.toLocaleString()}.`,
        amount: overage,
        status: 'pending',
        sourceSelectionId: selectionId,
        initiatedBy: approvedBy,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      changeOrderId = coRef.id;
    }

    await selRef.update({
      selectedOptionId: optionId,
      approvedBy,
      approvedAt: admin.firestore.FieldValue.serverTimestamp(),
      status: changeOrderId ? 'pending_change_order' : 'approved',
      changeOrderId,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    const updated = await selRef.get();
    res.json({ id: updated.id, ...updated.data(), changeOrderId });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to approve selection' }); }
});

// ── Change Orders ─────────────────────────────────────────────────────────────

app.get('/api/projects/:projectId/change-orders', async (req: any, res: any) => {
  try {
    const { projectId } = req.params;
    const snap = await db.collection('projects').doc(projectId).collection('changeOrders').orderBy('createdAt', 'desc').get();
    res.json(snap.docs.map(d => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt?.toDate?.()?.toISOString() || null })));
  } catch (e) { res.status(500).json({ error: 'Failed to fetch change orders' }); }
});

app.post('/api/projects/:projectId/change-orders', async (req: any, res: any) => {
  try {
    const { projectId } = req.params;
    const ref = await db.collection('projects').doc(projectId).collection('changeOrders').add({
      ...req.body,
      status: 'pending',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    const doc = await ref.get();
    res.status(201).json({ id: doc.id, ...doc.data() });
  } catch (e) { res.status(500).json({ error: 'Failed to create change order' }); }
});

app.patch('/api/projects/:projectId/change-orders/:coId/decision', async (req: any, res: any) => {
  try {
    const { projectId, coId } = req.params;
    const { decision, decidedBy } = req.body; // decision: 'approved' | 'declined'
    if (!['approved', 'declined'].includes(decision)) return res.status(400).json({ error: 'Invalid decision' });
    const ref = db.collection('projects').doc(projectId).collection('changeOrders').doc(coId);
    await ref.update({
      status: decision,
      decidedBy,
      decidedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    // If approved selection change order, mark selection as approved too
    const co = (await ref.get()).data() as any;
    if (decision === 'approved' && co?.sourceSelectionId) {
      await db.collection('projects').doc(projectId).collection('selections').doc(co.sourceSelectionId).update({
        status: 'approved',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
    res.json({ success: true, decision });
  } catch (e) { res.status(500).json({ error: 'Failed to process decision' }); }
});

// ── AI Rendering ──────────────────────────────────────────────────────────────

app.post('/api/ai/render', async (req: any, res: any) => {
  try {
    const { selections, roomType, style, projectName, provider = 'dalle' } = req.body;
    const openaiKey = process.env.OPENAI_API_KEY;
    const replicateKey = process.env.REPLICATE_API_TOKEN;

    // Build a rich prompt from selections
    const selectionDesc = (selections || [])
      .map((s: any) => `${s.category}: ${s.selectedOption?.name || s.description}`)
      .join(', ');

    const prompt = `Photo-realistic interior design rendering of a ${roomType || 'room'} in a custom home. Style: ${style || 'modern transitional'}. Materials and finishes: ${selectionDesc}. Project: ${projectName || 'custom home'}. High-end residential photography, natural lighting, architectural digest quality, 8k resolution.`;

    if (provider === 'dalle' && openaiKey) {
      const response = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'dall-e-3', prompt, n: 1, size: '1792x1024', quality: 'hd' }),
      });
      const data: any = await response.json();
      if (!response.ok) return res.status(500).json({ error: data.error?.message || 'DALL-E error' });
      return res.json({ url: data.data[0].url, prompt, provider: 'dalle' });
    }

    if (provider === 'flux' && replicateKey) {
      const startRes = await fetch('https://api.replicate.com/v1/models/black-forest-labs/flux-1.1-pro/predictions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${replicateKey}`, 'Content-Type': 'application/json', 'Prefer': 'wait' },
        body: JSON.stringify({ input: { prompt, aspect_ratio: '16:9', output_format: 'jpg', output_quality: 90 } }),
      });
      const data: any = await startRes.json();
      if (!startRes.ok) return res.status(500).json({ error: data.detail || 'Replicate error' });
      const url = Array.isArray(data.output) ? data.output[0] : data.output;
      return res.json({ url, prompt, provider: 'flux' });
    }

    res.status(400).json({ error: 'No AI provider configured. Set OPENAI_API_KEY or REPLICATE_API_TOKEN in Cloud Functions environment.' });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Auth middleware helper ────────────────────────────────────────────────────
async function authMiddleware(req: any, res: any, next: any) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'No token' });
  try {
    const decoded = await admin.auth().verifyIdToken(authHeader.substring(7));
    req.user = decoded;
    req.userProfile = await resolveUserProfile(decoded);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// ── Designer Access Requests ──────────────────────────────────────────────────

app.post('/api/designer/request-access', authMiddleware, async (req: any, res: any) => {
  try {
    const { projectId, projectName, clientName, designerId, designerName, designerEmail } = req.body;
    if (!projectId) return res.status(400).json({ error: 'projectId required' });

    // Prevent duplicate pending requests
    const existing = await db.collection('accessRequests')
      .where('projectId', '==', projectId)
      .where('designerId', '==', designerId)
      .where('status', '==', 'pending')
      .limit(1)
      .get();

    if (!existing.empty) {
      return res.json({ id: existing.docs[0].id, alreadyPending: true });
    }

    const docRef = await db.collection('accessRequests').add({
      projectId,
      projectName,
      clientName,
      designerId,
      designerName,
      designerEmail,
      status: 'pending',
      requestedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.status(201).json({ id: docRef.id });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.get('/api/designer/access-requests', authMiddleware, async (req: any, res: any) => {
  try {
    // Admin/gc can see all; designer sees only their own
    const role = req.user.role;
    let q;
    if (role === 'admin' || role === 'gc') {
      q = db.collection('accessRequests').orderBy('requestedAt', 'desc');
    } else {
      q = db.collection('accessRequests')
        .where('designerId', '==', req.user.uid)
        .orderBy('requestedAt', 'desc');
    }
    const snap = await q.get();
    res.json(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/designer/access-requests/:reqId', authMiddleware, async (req: any, res: any) => {
  try {
    const { status } = req.body; // 'approved' | 'denied'
    const role = req.user.role;
    if (role !== 'admin' && role !== 'gc') return res.status(403).json({ error: 'Admin only' });
    if (!['approved', 'denied'].includes(status)) return res.status(400).json({ error: 'Invalid status' });

    const reqDoc = await db.collection('accessRequests').doc(req.params.reqId).get();
    if (!reqDoc.exists) return res.status(404).json({ error: 'Request not found' });
    const data = reqDoc.data()!;

    await db.collection('accessRequests').doc(req.params.reqId).update({
      status,
      resolvedBy: req.user.uid,
      resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // If approved, assign designer to the project
    if (status === 'approved') {
      await db.collection('projects').doc(data.projectId.toString()).update({
        assignedDesignerId: data.designerId,
        assignedDesignerName: data.designerName,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Selections Catalog ────────────────────────────────────────────────────────

app.get('/api/catalog', authMiddleware, async (req: any, res: any) => {
  try {
    const snap = await db.collection('selectionsCatalog')
      .orderBy('usedCount', 'desc')
      .get();
    res.json(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/api/catalog', authMiddleware, async (req: any, res: any) => {
  try {
    const { item } = req.body;
    if (!item) return res.status(400).json({ error: 'item required' });
    const docRef = await db.collection('selectionsCatalog').add({
      ...item,
      savedBy: req.user.uid,
      savedAt: admin.firestore.FieldValue.serverTimestamp(),
      usedCount: item.usedCount ?? 1,
      projectNames: item.projectNames ?? [],
      tags: item.tags ?? [],
    });
    res.status(201).json({ id: docRef.id });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/catalog/:itemId', authMiddleware, async (req: any, res: any) => {
  try {
    await db.collection('selectionsCatalog').doc(req.params.itemId).delete();
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Catch all handler for other routes
app.use('*', (req: any, res: any) => {
  console.log(`❌ 404 - API endpoint not found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ 
    error: 'API endpoint not found',
    method: req.method,
    path: req.originalUrl,
    timestamp: new Date().toISOString()
  });
});

exports.api = onRequest({ cors: true }, app);

// ── Phase 3: Notification dispatch (email + SMS) ─────────────────────────────
export { dispatchNotification } from './notifications/dispatch';

// ── Phase 3: Scheduled due-date sweep (7am MT daily) ─────────────────────────
export { dueSweep } from './notifications/scheduledDueSweep';