import { type Project, type InsertProject, type Estimate, type InsertEstimate, type EstimateCategory, type InsertEstimateCategory, type EstimateItem, type InsertEstimateItem, type Bid, type InsertBid, type BidProcess, type InsertBidProcess, type BidResponse, type InsertBidResponse, type Contact, type InsertContact, type PurchaseOrder, type InsertPurchaseOrder, type Invoice, type InsertInvoice, type ProjectTask, type InsertProjectTask, type ClientPayment, type InsertClientPayment, type ProjectBudgetSummary, type ProjectDocument, type InsertProjectDocument, type ProjectPhoto, type InsertProjectPhoto, type ChangeOrder, type InsertChangeOrder, type WeatherLocation, type InsertWeatherLocation, type ScheduleSection, type InsertScheduleSection } from "@shared/schema";
import { IStorage } from './storage';
import { generateUniqueItemId, isUuidFormat } from './utils/id';
import { cacheService, CacheKeys, CACHE_CONFIG } from './cache';
import * as fs from 'fs';
import * as path from 'path';

// Persistent file-based storage implementation
export class MemoryStorage implements IStorage {
  private projects: Project[] = [];
  private contacts: Contact[] = [];
  private estimates: Estimate[] = [];
  private estimateCategories: EstimateCategory[] = [];
  private estimateItems: EstimateItem[] = [];
  private bids: Bid[] = [];
  private bidProcesses: BidProcess[] = [];
  private bidResponses: BidResponse[] = [];
  private bidInvitations: any[] = [];
  private bidItems: any[] = [];
  private purchaseOrders: PurchaseOrder[] = [];
  private invoices: Invoice[] = [];
  private invoicePayments: any[] = [];
  private projectTasks: ProjectTask[] = [];
  private taskDependencies: any[] = [];
  private clientPayments: ClientPayment[] = [];
  private projectDocuments: ProjectDocument[] = [];
  private projectPhotos: ProjectPhoto[] = [];
  private changeOrders: ChangeOrder[] = [];
  private weatherLocations: WeatherLocation[] = [];
  private scheduleSections: ScheduleSection[] = [];
  private systemSettings: any[] = [];
  private companyBranding: { logoUrl?: string; [key: string]: any } = {};
  
  private nextId = 1;
  private dataFile = path.join(process.cwd(), 'data', 'odyssey-data.json');

  constructor() {
    this.ensureDataDirectory();
    this.loadData();
    // Success operation completed
  }

  /**
   * Generate a unique UUID for an estimate item
   * Each item gets a truly unique ID that never collides
   */
  private generateUniqueItemId(): string {
    return generateUniqueItemId();
  }

  /**
   * Check if a string is a valid UUID format
   */
  private isUuidFormat(id: string): boolean {
    return isUuidFormat(id);
  }

  /**
   * Create a mapping between old timestamp-based IDs and new stable IDs
   * This allows existing bids to continue working while new items get stable IDs
   */
  private createIdMappingForProject(projectId: number): Map<string, string> {
    const mapping = new Map<string, string>();
    
    // Get all estimates for this project
    const projectEstimates = this.estimates.filter(e => e.projectId === projectId);
    
    for (const estimate of projectEstimates) {
      if (estimate.categories && Array.isArray(estimate.categories)) {
        for (const category of estimate.categories) {
          if (category.items && Array.isArray(category.items)) {
            category.items.forEach((item, index) => {
              // Migration: if item has an old ID, migrate it to UUID
              if (item.id && !this.isUuidFormat(item.id)) {
                const newUuid = this.generateUniqueItemId();
                mapping.set(item.id, newUuid); // old -> new
                mapping.set(newUuid, item.id); // new -> old (bidirectional)
                
                // Processing operation
                
                // Update the item with the new UUID
                item.id = newUuid;
              }
            });
          }
        }
      }
    }
    
    return mapping;
  }

  private ensureDataDirectory() {
    const dataDir = path.dirname(this.dataFile);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
  }

  private loadData() {
    try {
      if (fs.existsSync(this.dataFile)) {
        const data = JSON.parse(fs.readFileSync(this.dataFile, 'utf8'));
        this.projects = data.projects || [];
        this.contacts = data.contacts || [];
        this.estimates = data.estimates || [];
        this.estimateCategories = data.estimateCategories || [];
        this.estimateItems = data.estimateItems || [];
        this.bids = data.bids || [];
        this.bidProcesses = data.bidProcesses || [];
        this.bidResponses = data.bidResponses || [];
        this.bidInvitations = data.bidInvitations || [];
        this.bidItems = data.bidItems || [];
        this.purchaseOrders = data.purchaseOrders || [];
        this.invoices = data.invoices || [];
        this.invoicePayments = data.invoicePayments || [];
        this.projectTasks = data.projectTasks || [];
        this.taskDependencies = data.taskDependencies || [];
        this.clientPayments = data.clientPayments || [];
        this.projectDocuments = data.projectDocuments || [];
        this.projectPhotos = data.projectPhotos || [];
        this.changeOrders = data.changeOrders || [];
        this.weatherLocations = data.weatherLocations || [];
        this.scheduleSections = data.scheduleSections || [];
        this.systemSettings = data.systemSettings || [];
        this.companyBranding = data.companyBranding || {};
        this.nextId = data.nextId || 1;
        
        // Development logging removed
        // Development logging removed
        
        // Migrate existing estimate items without titles
        this.migrateEstimateItemTitles();
        
        // Migrate contacts to ensure they have isActive field
        this.migrateContactsActiveField();
      } else {
        // Development logging removed
        this.initializeSampleData();
        this.saveData();
      }
    } catch (error) {
      console.error('❌ Error loading data file, initializing with sample data:', error);
      this.initializeSampleData();
      this.saveData();
    }
  }

  private migrateEstimateItemTitles() {
    let migrationNeeded = false;
    let idMigrationNeeded = false;
    
    // First, fix any estimate categories/items stored in estimate.categories
    for (const estimate of this.estimates) {
      if (estimate.categories && Array.isArray(estimate.categories)) {
        for (const category of estimate.categories) {
          if (category.items && Array.isArray(category.items)) {
            for (let i = 0; i < category.items.length; i++) {
              const item = category.items[i];
              
              // Check if item needs an ID - now using UUIDs
              if (!item.id) {
                item.id = this.generateUniqueItemId();
                idMigrationNeeded = true;
                // Development logging removed
              }
              
              // Check if item needs a title
              if (!item.title) {
                item.title = `${item.trade} - Item ${i + 1}`;
                migrationNeeded = true;
                // Development logging removed
              }
            }
          }
        }
      }
    }
    
    // Group estimate items by estimate ID to number them properly
    const itemsByEstimate = new Map<number, any[]>();
    
    for (const item of this.estimateItems) {
      if (!item.title || !item.id) {
        if (!item.title) migrationNeeded = true;
        if (!item.id) idMigrationNeeded = true;
        
        // Find the category for this item to get the estimate ID
        const category = this.estimateCategories.find(cat => cat.id === item.categoryId);
        if (category) {
          const estimateId = category.estimateId;
          if (!itemsByEstimate.has(estimateId)) {
            itemsByEstimate.set(estimateId, []);
          }
          itemsByEstimate.get(estimateId)!.push(item);
        }
      }
    }
    
    if (migrationNeeded || idMigrationNeeded) {
      // Processing operation
      
      // Assign numbered titles and IDs to items within each estimate
      for (const [estimateId, items] of itemsByEstimate) {
        items.sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0)); // Sort by order
        items.forEach((item, index) => {
          if (!item.id) {
            // Find the estimate for this item to get projectId
            const estimate = this.estimates.find(e => e.id === parseInt(estimateId.toString()));
            item.id = this.generateUniqueItemId();
            // Development logging removed
          }
          if (!item.title) {
            item.title = `${item.trade} - Item ${index + 1}`;
            // Development logging removed
          }
        });
      }
      
      const totalMigrated = Array.from(itemsByEstimate.values()).flat().length;
      const embeddedMigrated = this.estimates.reduce((total, est) => 
        total + (est.categories?.reduce((catTotal: number, cat: any) => 
          catTotal + (cat.items?.length || 0), 0) || 0), 0);
      
      // Success operation completed
      this.saveData(); // Save the migrated data
    }
  }

  private migrateContactsActiveField() {
    let migrationNeeded = false;
    
    for (const contact of this.contacts) {
      if (contact.isActive === undefined || contact.isActive === null) {
        contact.isActive = true; // Default all existing contacts to active
        migrationNeeded = true;
      }
    }
    
    if (migrationNeeded) {
      // Processing operation
      // Success operation completed
      this.saveData(); // Save the migrated data
    }
  }

  private saveData() {
    try {
      const data = {
        projects: this.projects,
        contacts: this.contacts,
        estimates: this.estimates,
        estimateCategories: this.estimateCategories,
        estimateItems: this.estimateItems,
        bids: this.bids,
        bidProcesses: this.bidProcesses,
        bidResponses: this.bidResponses,
        bidInvitations: this.bidInvitations,
        bidItems: this.bidItems,
        purchaseOrders: this.purchaseOrders,
        invoices: this.invoices,
        invoicePayments: this.invoicePayments,
        projectTasks: this.projectTasks,
        taskDependencies: this.taskDependencies,
        clientPayments: this.clientPayments,
        projectDocuments: this.projectDocuments,
        projectPhotos: this.projectPhotos,
        changeOrders: this.changeOrders,
        weatherLocations: this.weatherLocations,
        scheduleSections: this.scheduleSections,
        systemSettings: this.systemSettings,
        companyBranding: this.companyBranding,
        nextId: this.nextId
      };
      
      fs.writeFileSync(this.dataFile, JSON.stringify(data, null, 2));
      // Development logging removed
    } catch (error) {
      console.error('❌ Error saving data:', error);
    }
  }

  private initializeSampleData() {
    // Initialize with sample projects
    this.projects = [
      {
        id: 1,
        name: "Modern Lakehouse",
        clientName: "John Smith",
        address: "123 Lake View Drive, Portland, OR 97201",
        status: "active",
        estimatedBudget: 650000,
        squareFootage: 2500,
        createdAt: new Date("2024-01-15"),
        updatedAt: new Date("2024-01-15"),
        metadata: { projectManager: "Mike Rodriguez", clientId: 1 }
      },
      {
        id: 2,
        name: "Suburban Estate",
        clientName: "Sarah Johnson",
        address: "456 Oak Street, Beaverton, OR 97005",
        status: "planning",
        estimatedBudget: 850000,
        squareFootage: 3200,
        createdAt: new Date("2024-01-10"),
        updatedAt: new Date("2024-01-10"),
        metadata: { projectManager: "Sarah Johnson", clientId: 2 }
      },
      {
        id: 3,
        name: "Downtown Loft Renovation",
        clientName: "ABC Construction LLC",
        address: "789 Main Street, Portland, OR 97214",
        status: "on_hold",
        estimatedBudget: 425000,
        squareFootage: 1800,
        createdAt: new Date("2024-01-05"),
        updatedAt: new Date("2024-01-05"),
        metadata: { projectManager: "Mike Rodriguez", clientId: 3 }
      }
    ];

    // Initialize with comprehensive contacts of all types
    this.contacts = [
      // Clients
      {
        id: 1,
        name: "John Smith",
        email: "john.smith@email.com",
        phone: "(503) 555-0101",
        role: "client",
        company: null,
        address: "123 Lake View Drive, Portland, OR 97201",
        hasPortalAccess: true,
        portalEmail: "john.smith@email.com",
        portalPassword: "temp123",
        portalRole: "client",
        portalAccessGrantedAt: new Date("2024-01-15"),
        createdAt: new Date("2024-01-15"),
        updatedAt: new Date("2024-01-15")
      },
      {
        id: 4,
        name: "Emily Davis",
        email: "emily.davis@gmail.com",
        phone: "(503) 555-0104",
        role: "client",
        company: null,
        address: "456 Oak Street, Beaverton, OR 97005",
        hasPortalAccess: true,
        portalEmail: "emily.davis@gmail.com",
        portalPassword: "client456",
        portalRole: "client",
        portalAccessGrantedAt: new Date("2024-01-12"),
        createdAt: new Date("2024-01-12"),
        updatedAt: new Date("2024-01-12")
      },
      {
        id: 5,
        name: "Robert Wilson",
        email: "rwilson@yahoo.com",
        phone: "(503) 555-0105",
        role: "client",
        company: null,
        address: "789 Main Street, Portland, OR 97214",
        hasPortalAccess: false,
        portalEmail: null,
        portalPassword: null,
        portalRole: null,
        portalAccessGrantedAt: null,
        createdAt: new Date("2024-01-08"),
        updatedAt: new Date("2024-01-08")
      },
      {
        id: 6,
        name: "Jennifer Brown",
        email: "j.brown@outlook.com",
        phone: "(503) 555-0106",
        role: "client",
        company: null,
        address: "321 Pine Avenue, Lake Oswego, OR 97034",
        hasPortalAccess: true,
        portalEmail: "j.brown@outlook.com",
        portalPassword: "client789",
        portalRole: "client",
        portalAccessGrantedAt: new Date("2024-01-20"),
        createdAt: new Date("2024-01-20"),
        updatedAt: new Date("2024-01-20")
      },
      
      // Project Managers
      {
        id: 2,
        name: "Sarah Johnson",
        email: "sarah.johnson@api.com",
        phone: "(503) 555-0102",
        role: "project_manager",
        company: "Skyeline Homes",
        address: null,
        hasPortalAccess: true,
        portalEmail: "sarah.johnson@api.com",
        portalPassword: "admin123",
        portalRole: "project_manager",
        portalAccessGrantedAt: new Date("2024-01-10"),
        createdAt: new Date("2024-01-10"),
        updatedAt: new Date("2024-01-10")
      },
      {
        id: 3,
        name: "Mike Rodriguez",
        email: "mike.rodriguez@api.com",
        phone: "(503) 555-0103",
        role: "project_manager",
        company: "Skyeline Homes",
        address: null,
        hasPortalAccess: true,
        portalEmail: "mike.rodriguez@api.com",
        portalPassword: "admin123",
        portalRole: "project_manager",
        portalAccessGrantedAt: new Date("2024-01-05"),
        createdAt: new Date("2024-01-05"),
        updatedAt: new Date("2024-01-05")
      },
      {
        id: 7,
        name: "David Chen",
        email: "david.chen@api.com",
        phone: "(503) 555-0107",
        role: "project_manager",
        company: "Skyeline Homes",
        address: null,
        hasPortalAccess: true,
        portalEmail: "david.chen@api.com",
        portalPassword: "admin456",
        portalRole: "project_manager",
        portalAccessGrantedAt: new Date("2024-01-18"),
        createdAt: new Date("2024-01-18"),
        updatedAt: new Date("2024-01-18")
      },
      
      // Subcontractors
      {
        id: 8,
        name: "Tom Anderson",
        email: "tom@andersonplumbing.com",
        phone: "(503) 555-0108",
        role: "subcontractor",
        company: "Anderson Plumbing Services",
        address: "987 Industrial Way, Portland, OR 97210",
        hasPortalAccess: true,
        portalEmail: "tom@andersonplumbing.com",
        portalPassword: "sub123",
        portalRole: "subcontractor",
        portalAccessGrantedAt: new Date("2024-01-14"),
        createdAt: new Date("2024-01-14"),
        updatedAt: new Date("2024-01-14")
      },
      {
        id: 9,
        name: "Lisa Martinez",
        email: "lisa@primeelectrical.com",
        phone: "(503) 555-0109",
        role: "subcontractor",
        company: "Prime Electrical Solutions",
        address: "654 Commerce Street, Beaverton, OR 97005",
        hasPortalAccess: true,
        portalEmail: "lisa@primeelectrical.com",
        portalPassword: "elec456",
        portalRole: "subcontractor",
        portalAccessGrantedAt: new Date("2024-01-16"),
        createdAt: new Date("2024-01-16"),
        updatedAt: new Date("2024-01-16")
      },
      {
        id: 10,
        name: "Carlos Gonzalez",
        email: "carlos@gonzalezframing.com",
        phone: "(503) 555-0110",
        role: "subcontractor",
        company: "Gonzalez Framing & Construction",
        address: "432 Builder's Lane, Portland, OR 97203",
        hasPortalAccess: false,
        portalEmail: null,
        portalPassword: null,
        portalRole: null,
        portalAccessGrantedAt: null,
        createdAt: new Date("2024-01-11"),
        updatedAt: new Date("2024-01-11")
      },
      {
        id: 11,
        name: "Rachel Kim",
        email: "rachel@kimhvac.com",
        phone: "(503) 555-0111",
        role: "subcontractor",
        company: "Kim HVAC Systems",
        address: "789 Mechanical Drive, Tigard, OR 97223",
        hasPortalAccess: true,
        portalEmail: "rachel@kimhvac.com",
        portalPassword: "hvac789",
        portalRole: "subcontractor",
        portalAccessGrantedAt: new Date("2024-01-19"),
        createdAt: new Date("2024-01-19"),
        updatedAt: new Date("2024-01-19")
      },
      {
        id: 12,
        name: "Steve Thompson",
        email: "steve@thompsonroofing.com",
        phone: "(503) 555-0112",
        role: "subcontractor",
        company: "Thompson Roofing Specialists",
        address: "123 Rooftop Avenue, Portland, OR 97211",
        hasPortalAccess: true,
        portalEmail: "steve@thompsonroofing.com",
        portalPassword: "roof321",
        portalRole: "subcontractor",
        portalAccessGrantedAt: new Date("2024-01-13"),
        createdAt: new Date("2024-01-13"),
        updatedAt: new Date("2024-01-13")
      },
      {
        id: 13,
        name: "Maria Lopez",
        email: "maria@lopezflooring.com",
        phone: "(503) 555-0113",
        role: "subcontractor",
        company: "Lopez Premium Flooring",
        address: "567 Carpet Court, Milwaukie, OR 97267",
        hasPortalAccess: false,
        portalEmail: null,
        portalPassword: null,
        portalRole: null,
        portalAccessGrantedAt: null,
        createdAt: new Date("2024-01-09"),
        updatedAt: new Date("2024-01-09")
      },
      {
        id: 14,
        name: "James Parker",
        email: "james@parkerpaint.com",
        phone: "(503) 555-0114",
        role: "subcontractor",
        company: "Parker Painting & Finishes",
        address: "890 Color Street, Portland, OR 97202",
        hasPortalAccess: true,
        portalEmail: "james@parkerpaint.com",
        portalPassword: "paint654",
        portalRole: "subcontractor",
        portalAccessGrantedAt: new Date("2024-01-17"),
        createdAt: new Date("2024-01-17"),
        updatedAt: new Date("2024-01-17")
      },
      
      // Designers
      {
        id: 15,
        name: "Amanda Foster",
        email: "amanda@fostercreative.com",
        phone: "(503) 555-0115",
        role: "designer",
        company: "Foster Creative Design Studio",
        address: "234 Design Plaza, Portland, OR 97205",
        hasPortalAccess: true,
        portalEmail: "amanda@fostercreative.com",
        portalPassword: "design123",
        portalRole: "designer",
        portalAccessGrantedAt: new Date("2024-01-15"),
        createdAt: new Date("2024-01-15"),
        updatedAt: new Date("2024-01-15")
      },
      {
        id: 16,
        name: "Michael Reed",
        email: "michael@reedinteriors.com",
        phone: "(503) 555-0116",
        role: "designer",
        company: "Reed Interior Design",
        address: "456 Style Boulevard, Lake Oswego, OR 97034",
        hasPortalAccess: true,
        portalEmail: "michael@reedinteriors.com",
        portalPassword: "interior456",
        portalRole: "designer",
        portalAccessGrantedAt: new Date("2024-01-21"),
        createdAt: new Date("2024-01-21"),
        updatedAt: new Date("2024-01-21")
      },
      {
        id: 17,
        name: "Sophie Clark",
        email: "sophie@clarkspaces.com",
        phone: "(503) 555-0117",
        role: "designer",
        company: "Clark Spaces Architecture",
        address: "678 Creative Circle, Portland, OR 97208",
        hasPortalAccess: false,
        portalEmail: null,
        portalPassword: null,
        portalRole: null,
        portalAccessGrantedAt: null,
        createdAt: new Date("2024-01-07"),
        updatedAt: new Date("2024-01-07")
      },
      {
        id: 18,
        name: "Alex Morgan",
        email: "alex@modernlivingdesign.com",
        phone: "(503) 555-0118",
        role: "designer",
        company: "Modern Living Design Co.",
        address: "321 Contemporary Lane, Beaverton, OR 97006",
        hasPortalAccess: true,
        portalEmail: "alex@modernlivingdesign.com",
        portalPassword: "modern789",
        portalRole: "designer",
        portalAccessGrantedAt: new Date("2024-01-22"),
        createdAt: new Date("2024-01-22"),
        updatedAt: new Date("2024-01-22")
      }
    ];

    // Initialize weather locations
    this.weatherLocations = [
      {
        id: 1,
        name: "Portland, OR",
        latitude: 45.5152,
        longitude: -122.6784,
        isActive: true,
        createdAt: new Date("2024-01-01"),
        updatedAt: new Date("2024-01-01")
      },
      {
        id: 2,
        name: "Seattle, WA",
        latitude: 47.6062,
        longitude: -122.3321,
        isActive: true,
        createdAt: new Date("2024-01-01"),
        updatedAt: new Date("2024-01-01")
      },
      {
        id: 3,
        name: "Vancouver, WA",
        latitude: 45.6387,
        longitude: -122.6615,
        isActive: true,
        createdAt: new Date("2024-01-01"),
        updatedAt: new Date("2024-01-01")
      }
    ];

    this.nextId = 19;
  }

  // Project methods
  async getProjects(): Promise<Project[]> {
    // Try cache first
    const cached = await cacheService.get<Project[]>(CacheKeys.projects());
    if (cached) {
      return cached;
    }

    // Fetch from memory
    const result = this.projects || [];
    
    // Cache for 60 seconds
    await cacheService.set(CacheKeys.projects(), result, CACHE_CONFIG.PROJECTS_TTL);
    
    return result;
  }

  async createProject(projectData: any): Promise<Project> {
    const project: Project = {
      id: this.nextId++,
      name: projectData.name,
      clientName: projectData.clientName,
      clientIds: projectData.clientIds ? JSON.stringify(projectData.clientIds) : null, // Store as JSON string
      address: projectData.address,
      status: projectData.status || "planning",
      estimatedBudget: projectData.estimatedBudget || null,
      squareFootage: projectData.squareFootage || null,
      costPerSquareFoot: projectData.costPerSquareFoot || null,
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: projectData.metadata || {}
    };
    this.projects.push(project);
    this.saveData(); // Save immediately after creating project
    // Success operation completed
    return project;
  }



  async getProject(id: number): Promise<Project | undefined> {
    return this.projects.find(p => p.id === id);
  }

  async updateProject(id: number, updateData: any): Promise<Project | undefined> {
    const index = this.projects.findIndex(p => p.id === id);
    if (index === -1) return undefined;
    
    const originalProject = this.projects[index];
    const originalStartDate = originalProject.startDate;
    const newStartDate = updateData.startDate;
    
    // Development logging removed
    
    // Check if start date is being updated - be more flexible with date comparison
    let startDateChanged = false;
    if (newStartDate && originalStartDate) {
      const newDateStr = new Date(newStartDate).toISOString().split('T')[0];
      const originalDateStr = new Date(originalStartDate).toISOString().split('T')[0];
      startDateChanged = newDateStr !== originalDateStr;
      // Development logging removed
    } else if (newStartDate && !originalStartDate) {
      startDateChanged = true;
      // Development logging removed
    }
    
    // Development logging removed
    
    this.projects[index] = {
      ...this.projects[index],
      ...updateData,
      updatedAt: new Date()
    };
    
    // If start date changed, automatically shift the entire schedule
    if (startDateChanged) {
      // Development logging removed
      await this.shiftProjectSchedule(id, new Date(originalStartDate), new Date(newStartDate));
    }
    
    this.saveData(); // Save immediately after updating project
    // Success operation completed
    return this.projects[index];
  }

  async deleteProject(id: number): Promise<boolean> {
    const index = this.projects.findIndex(p => p.id === id);
    if (index === -1) return false;

    // Development logging removed

    // Delete all estimates for this project (affects client portal)
    const projectEstimates = this.estimates.filter(e => e.projectId === id);
    // Development logging removed
    this.estimates = this.estimates.filter(e => e.projectId !== id);

    // Delete all bid processes and responses for this project (affects subcontractor portal)
    const projectBidProcesses = this.bidProcesses.filter(bp => bp.projectId === id);
    // Development logging removed
    this.bidProcesses = this.bidProcesses.filter(bp => bp.projectId !== id);

    const projectBidResponses = this.bidResponses.filter(br => br.projectId === id);
    // Development logging removed
    this.bidResponses = this.bidResponses.filter(br => br.projectId !== id);

    // Delete all bid invitations for this project (affects subcontractor portal)
    const projectBidInvitations = this.bidInvitations.filter(bi => bi.projectId === id);
    // Development logging removed
    this.bidInvitations = this.bidInvitations.filter(bi => bi.projectId !== id);

    // Delete all project tasks/schedule items (affects all portals)
    const projectTasks = this.projectTasks.filter(t => t.projectId === id);
    // Development logging removed
    this.projectTasks = this.projectTasks.filter(t => t.projectId !== id);

    // Delete all task dependencies for this project's tasks
    const taskIds = projectTasks.map(t => t.id);
    const projectTaskDependencies = this.taskDependencies.filter(td => 
      taskIds.includes(td.taskId) || taskIds.includes(td.dependsOnTaskId)
    );
    // Development logging removed
    this.taskDependencies = this.taskDependencies.filter(td => 
      !taskIds.includes(td.taskId) && !taskIds.includes(td.dependsOnTaskId)
    );

    // Delete all purchase orders for this project (affects subcontractor portal)
    const projectPOs = this.purchaseOrders.filter(po => po.projectId === id);
    // Development logging removed
    this.purchaseOrders = this.purchaseOrders.filter(po => po.projectId !== id);

    // Delete all invoices for this project (affects all portals)
    const projectInvoices = this.invoices.filter(inv => inv.projectId === id);
    // Development logging removed
    this.invoices = this.invoices.filter(inv => inv.projectId !== id);

    // Delete all project documents (affects client and designer portals)
    const projectDocs = this.projectDocuments.filter(doc => doc.projectId === id);
    // Development logging removed
    this.projectDocuments = this.projectDocuments.filter(doc => doc.projectId !== id);

    // Delete all project photos (affects client and designer portals)
    const projectPhotos = this.projectPhotos.filter(photo => photo.projectId === id);
    // Development logging removed
    this.projectPhotos = this.projectPhotos.filter(photo => photo.projectId !== id);

    // Delete all change orders for this project (affects all portals)
    const projectChangeOrders = this.changeOrders.filter(co => co.projectId === id);
    // Development logging removed
    this.changeOrders = this.changeOrders.filter(co => co.projectId !== id);

    // Delete all client payments for this project
    const projectPayments = this.clientPayments.filter(cp => cp.projectId === id);
    // Development logging removed
    this.clientPayments = this.clientPayments.filter(cp => cp.projectId !== id);

    // Finally delete the project itself
    this.projects.splice(index, 1);
    this.saveData(); // Save immediately after deleting project
    
    // Success operation completed
    return true;
  }

  async archiveProject(id: number): Promise<boolean> {
    return !!(await this.updateProject(id, { status: 'completed' }));
  }

  /**
   * Automatically shift all project schedule tasks when the project start date changes
   * The first task will start exactly on the new project start date
   */
  private async shiftProjectSchedule(projectId: number, originalStartDate: Date, newStartDate: Date): Promise<void> {
    const projectTasks = this.projectTasks.filter(task => task.projectId === projectId);
    
    if (projectTasks.length === 0) {
      // Development logging removed
      return;
    }
    
    // Development logging removed
    
    // Helper function to skip weekends when adding days
    const addBusinessDays = (startDate: Date, businessDays: number): Date => {
      const result = new Date(startDate);
      let daysAdded = 0;
      
      while (daysAdded < businessDays) {
        result.setDate(result.getDate() + 1);
        // Only count weekdays (Mon-Fri) as business days
        if (result.getDay() !== 0 && result.getDay() !== 6) {
          daysAdded++;
        }
      }
      
      return result;
    };
    
    // Sort tasks by original start date to maintain proper sequencing
    const sortedTasks = projectTasks.sort((a, b) => 
      new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
    );
    
    // Start scheduling from the new project start date (preserve exact date selected by user)
    let currentScheduleDate = new Date(newStartDate);
    
    // DO NOT automatically move to business day - respect user's exact date selection
    // If user selects a weekend, the first task should start on that weekend date
    
    // Schedule each task sequentially
    for (let i = 0; i < sortedTasks.length; i++) {
      const task = sortedTasks[i];
      const originalTaskStart = new Date(task.startDate);
      const originalTaskEnd = new Date(task.endDate);
      
      // Calculate task duration in business days
      const taskDurationDays = Math.round((originalTaskEnd.getTime() - originalTaskStart.getTime()) / (1000 * 60 * 60 * 24));
      
      // Set task start date (preserve exact date without timezone conversion)
      const year = currentScheduleDate.getFullYear();
      const month = (currentScheduleDate.getMonth() + 1).toString().padStart(2, '0');
      const day = currentScheduleDate.getDate().toString().padStart(2, '0');
      task.startDate = `${year}-${month}-${day}`;
      
      // Calculate task end date by adding business days
      const taskEndDate = addBusinessDays(currentScheduleDate, Math.max(1, taskDurationDays));
      const endYear = taskEndDate.getFullYear();
      const endMonth = (taskEndDate.getMonth() + 1).toString().padStart(2, '0');
      const endDay = taskEndDate.getDate().toString().padStart(2, '0');
      task.endDate = `${endYear}-${endMonth}-${endDay}`;
      task.updatedAt = new Date().toISOString();
      
      // Development logging removed
      
      // Next task starts the business day after this task ends
      currentScheduleDate = new Date(taskEndDate);
      currentScheduleDate.setDate(currentScheduleDate.getDate() + 1);
      
      // Make sure next start date is a business day
      while (currentScheduleDate.getDay() === 0 || currentScheduleDate.getDay() === 6) {
        currentScheduleDate.setDate(currentScheduleDate.getDate() + 1);
      }
    }
    
    // Development logging removed
  }

  // Add helper method to get client names from clientIds
  getClientNamesForProject(project: any): string[] {
    if (!project.clientIds) return [];
    
    try {
      const clientIds = typeof project.clientIds === 'string' 
        ? JSON.parse(project.clientIds) 
        : project.clientIds;
      
      return clientIds.map((id: string) => {
        const contact = this.contacts.find(c => c.id.toString() === id);
        return contact ? contact.name : `Client ${id}`;
      });
    } catch (error) {
      console.error('Error parsing clientIds:', error);
      return [];
    }
  }

  // Contact methods
  async createContact(contactData: any): Promise<Contact> {
    const contact: Contact = {
      id: this.nextId++,
      name: contactData.name,
      email: contactData.email || null,
      phone: contactData.phone || null,
      role: contactData.role,
      company: contactData.company || null,
      trade: contactData.trade || null, // Legacy single trade for backwards compatibility
      trades: contactData.trades || (contactData.trade ? [contactData.trade] : []), // Array of trades
      address: contactData.address || null,
      city: contactData.city || null,
      state: contactData.state || null,
      zipCode: contactData.zipCode || null,
      notes: contactData.notes || null,
      hasPortalAccess: contactData.hasPortalAccess || false,
      portalEmail: contactData.portalEmail || null,
      portalPassword: contactData.portalPassword || null,
      portalRole: contactData.portalRole || null,
      portalAccessGrantedAt: contactData.portalAccessGrantedAt || null,
      isActive: contactData.isActive !== undefined ? contactData.isActive : true, // Default to active
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    
    this.contacts.push(contact);
    this.saveData(); // Save immediately after creating contact
    // Development logging removed
    return contact;
  }

  async getAllContacts(): Promise<Contact[]> {
    return [...this.contacts].sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async getContactById(id: number): Promise<Contact | undefined> {
    return this.contacts.find(c => c.id === id);
  }

  async updateContact(id: number, updateData: any): Promise<Contact | undefined> {
    const index = this.contacts.findIndex(c => c.id === id);
    if (index === -1) return undefined;
    
    this.contacts[index] = {
      ...this.contacts[index],
      ...updateData,
      updatedAt: new Date()
    };
    this.saveData(); // Save immediately after updating contact
    // Success operation completed
    return this.contacts[index];
  }

  async deleteContact(id: number): Promise<boolean> {
    const index = this.contacts.findIndex(c => c.id === id);
    if (index === -1) return false;
    this.contacts.splice(index, 1);
    this.saveData(); // Save immediately after deleting contact
    // Success operation completed
    return true;
  }

  async getContactsWithExpiringInsurance(): Promise<Contact[]> {
    // Mock implementation - return empty array for now
    return [];
  }

  async getSubcontractorsByTrade(trade: string): Promise<Contact[]> {
    return this.contacts.filter(c => 
      c.role === 'subcontractor' && 
      (c.trade === trade || (c.trades && c.trades.includes(trade)))
    );
  }

  async validateSubcontractorCompliance(contactId: number): Promise<boolean> {
    const contact = this.contacts.find((c: any) => c.id === contactId && c.role === 'subcontractor');
    
    if (!contact) {
      // Development logging removed
      return false;
    }

    // Check compliance requirements:
    // 1. Agreement must be signed
    // 2. Insurance must be current (not expired)
    // 3. W9 form must be current (not expired)
    
    const today = new Date();
    const hasValidInsurance = contact.insuranceExpirationDate && 
      new Date(contact.insuranceExpirationDate) > today;
    const hasValidW9 = contact.w9ExpirationDate && 
      new Date(contact.w9ExpirationDate) > today;
    
    const isCompliant = !!(
      contact.agreementSigned &&
      contact.w9FileUrl &&
      hasValidW9 &&
      contact.insuranceFileUrl &&
      hasValidInsurance
    );

    // Development logging removed
    // Development logging removed
    // Development logging removed
    // Development logging removed
    // Development logging removed
    // Development logging removed
    // Development logging removed

    return isCompliant;
  }

  async validateSubcontractorComplianceDetails(contactId: number): Promise<{ isCompliant: boolean; missingRequirements: string[] }> {
    const contact = this.contacts.find((c: any) => c.id === contactId && c.role === 'subcontractor');
    
    if (!contact) {
      return { isCompliant: false, missingRequirements: ['Valid subcontractor record'] };
    }

    const missingRequirements: string[] = [];
    const today = new Date();

    // Check each compliance requirement individually
    if (!contact.agreementSigned) {
      missingRequirements.push('Signed subcontractor agreement');
    }

    if (!contact.w9FileUrl) {
      missingRequirements.push('W-9 tax form');
    } else if (contact.w9ExpirationDate && new Date(contact.w9ExpirationDate) <= today) {
      missingRequirements.push('Current W-9 tax form (expired)');
    }

    if (!contact.insuranceFileUrl) {
      missingRequirements.push('Insurance certificate');
    } else if (contact.insuranceExpirationDate && new Date(contact.insuranceExpirationDate) <= today) {
      missingRequirements.push('Current insurance certificate (expired)');
    }

    return {
      isCompliant: missingRequirements.length === 0,
      missingRequirements
    };
  }

  // Project manager methods
  async getProjectManagers(): Promise<{ id: string; name: string; email: string }[]> {
    return this.contacts
      .filter(c => c.role === 'project_manager')
      .map(c => ({ id: c.id.toString(), name: c.name, email: c.email || '' }));
  }

  // Weather location methods
  async getWeatherLocations(): Promise<WeatherLocation[]> {
    return [...this.weatherLocations];
  }

  async createWeatherLocation(data: InsertWeatherLocation): Promise<WeatherLocation> {
    const location: WeatherLocation = {
      id: this.nextId++,
      name: data.name,
      latitude: data.latitude,
      longitude: data.longitude,
      isActive: data.isActive ?? true,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.weatherLocations.push(location);
    this.saveData(); // Save immediately after creating weather location
    // Success operation completed
    return location;
  }

  async updateWeatherLocation(id: number, data: Partial<InsertWeatherLocation>): Promise<WeatherLocation | undefined> {
    const index = this.weatherLocations.findIndex(w => w.id === id);
    if (index === -1) return undefined;
    
    this.weatherLocations[index] = {
      ...this.weatherLocations[index],
      ...data,
      updatedAt: new Date()
    };
    this.saveData(); // Save immediately after updating weather location
    // Success operation completed
    return this.weatherLocations[index];
  }

  async deleteWeatherLocation(id: number): Promise<boolean> {
    const index = this.weatherLocations.findIndex(w => w.id === id);
    if (index === -1) return false;
    this.weatherLocations.splice(index, 1);
    this.saveData(); // Save immediately after deleting weather location
    // Success operation completed
    return true;
  }

  // Add missing methods for schedule system
  async getProjectTasks(projectId: number): Promise<ProjectTask[]> {
    // Development logging removed
    const tasks = this.projectTasks.filter(t => t.projectId === projectId);
    // Development logging removed);
    return tasks;
  }

  async getProjectDependencies(projectId: number): Promise<any[]> {
    // Development logging removed
    return this.taskDependencies.filter((d: any) => d.projectId === projectId) || [];
  }

  async getTasks(filter: { projectId: number }): Promise<ProjectTask[]> {
    // Development logging removed
    return this.getProjectTasks(filter.projectId);
  }

  async getDependencies(filter: { projectId: number }): Promise<any[]> {
    // Development logging removed
    return this.getProjectDependencies(filter.projectId);
  }

  async getAllTasks(): Promise<ProjectTask[]> {
    return this.projectTasks;
  }

  // Stub methods for other interfaces (can be implemented as needed)
  async createEstimate(estimateData: any): Promise<any> {
    // Development logging removed
    
    // Ensure estimates array exists
    if (!this.estimates) {
      this.estimates = [];
      // Component lifecycle tracked
    }
    
    // Generate new ID
    const nextId = Math.max(0, ...this.estimates.map(e => e.id || 0)) + 1;
    
    const estimate = {
      id: nextId,
      projectId: estimateData.projectId,
      name: estimateData.name,
      description: estimateData.description || '',
      totalCost: 0,
      totalDuration: 0,
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...estimateData
    };

    // Calculate totals from categories and assign UUIDs to items
    if (estimateData.categories) {
      let totalCost = 0;
      let totalDuration = 0;
      
      estimateData.categories.forEach((category: any) => {
        category.items?.forEach((item: any) => {
          // Assign UUID to new estimate items if they don't have one
          if (!item.id) {
            item.id = this.generateUniqueItemId();
            // Development logging removed
          }
          
          const baseCost = parseFloat(String(item.estimatedCost)) || 0;
          const markupAmount = baseCost * ((parseFloat(String(item.markup)) || 0) / 100);
          const contingencyAmount = (baseCost + markupAmount) * ((parseFloat(String(item.contingency)) || 0) / 100);
          totalCost += baseCost + markupAmount + contingencyAmount;
          totalDuration += parseFloat(String(item.duration)) || 0;
        });
      });
      
      estimate.totalCost = totalCost;
      estimate.totalDuration = totalDuration;
    }

    this.estimates.push(estimate);
    
    // Convert estimate items to project tasks for the schedule system
    if (estimateData.categories) {
      estimateData.categories.forEach((category: any) => {
        category.items?.forEach((item: any) => {
          const task: ProjectTask = {
            id: Math.max(0, ...this.projectTasks.map(t => t.id || 0)) + 1,
            projectId: estimateData.projectId,
            title: item.trade || item.description || 'Untitled Task',
            description: item.description || null,
            status: 'pending',
            startDate: new Date(), // Default to today, will be calculated in schedule
            endDate: null,
            duration: parseFloat(String(item.duration)) || 1,
            assignedTo: null,
            estimatedCost: parseFloat(String(item.estimatedCost)) || 0,
            actualCost: null,
            progress: 0,
            priority: 'medium',
            notes: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            dependencies: null,
            tags: null,
            category: item.trade || 'general',
            subtasks: null,
            estimatedHours: null,
            actualHours: null,
            billableHours: null,
            hourlyRate: null,
            isCompleted: false,
            completedAt: null,
            inspectorRequired: false,
            inspectionDate: null,
            inspectionStatus: null,
            estimateItemId: item.id // Link back to the estimate item
          };
          this.projectTasks.push(task);
          // Development logging removed
        });
      });
    }
    
    this.saveData(); // Save immediately after creating estimate and tasks
    
    // Success operation completed
    return estimate;
  }
  async getAllEstimates(): Promise<any[]> { 
    // Development logging removed
    
    // Ensure estimates array exists
    if (!this.estimates) {
      this.estimates = [];
      // Component lifecycle tracked
    }
    
    return this.estimates || [];
  }

  async getEstimate(estimateId: number): Promise<any | undefined> {
    // Development logging removed
    
    // Ensure estimates array exists
    if (!this.estimates) {
      this.estimates = [];
      // Component lifecycle tracked
      return undefined;
    }
    
    const estimate = this.estimates.find(e => e.id === estimateId);
    // Development logging removed` : 'not found');
    
    return estimate;
  }
  async getEstimatesByProject(projectId: number): Promise<Estimate[]> { return []; }
  async updateEstimate(id: number, updateData: any): Promise<Estimate | undefined> { 
    // Development logging removed
    
    // Ensure estimates array exists
    if (!this.estimates) {
      this.estimates = [];
      // Component lifecycle tracked
      return undefined;
    }
    
    const index = this.estimates.findIndex(e => e.id === id);
    if (index === -1) {
      // Development logging removed
      return undefined;
    }
    
    // Update the estimate with new data
    this.estimates[index] = {
      ...this.estimates[index],
      ...updateData,
      updatedAt: new Date().toISOString()
    };
    
    // Save changes to file
    this.saveData();
    
    // Development logging removed
    return this.estimates[index];
  }
  async deleteEstimate(estimateId: number): Promise<boolean> { 
    // Development logging removed
    
    // Ensure estimates array exists
    if (!this.estimates) {
      this.estimates = [];
      // Component lifecycle tracked
      return false;
    }
    
    const index = this.estimates.findIndex(e => e.id === estimateId);
    if (index === -1) {
      // Development logging removed
      return false;
    }
    
    const estimate = this.estimates[index];

    // Delete all bid processes for estimate items (affects subcontractor portal)
    let deletedBidProcesses = 0;
    if (estimate.categories) {
      for (const category of estimate.categories) {
        if (category.items) {
          for (const item of category.items) {
            const bidProcessIndex = this.bidProcesses.findIndex(bp => bp.estimateItemId === item.id);
            if (bidProcessIndex !== -1) {
              this.bidProcesses.splice(bidProcessIndex, 1);
              deletedBidProcesses++;
            }
          }
        }
      }
    }
    // Development logging removed

    // Delete all bid responses for this estimate (affects subcontractor portal)
    const estimateBidResponses = this.bidResponses.filter(br => br.estimateId === estimateId);
    // Development logging removed
    this.bidResponses = this.bidResponses.filter(br => br.estimateId !== estimateId);

    // Delete all bid invitations for this estimate (affects subcontractor portal)
    const estimateBidInvitations = this.bidInvitations.filter(bi => bi.estimateId === estimateId);
    // Development logging removed
    this.bidInvitations = this.bidInvitations.filter(bi => bi.estimateId !== estimateId);

    // Delete all purchase orders generated from this estimate (affects subcontractor portal)
    const estimatePOs = this.purchaseOrders.filter(po => po.estimateId === estimateId);
    // Development logging removed
    this.purchaseOrders = this.purchaseOrders.filter(po => po.estimateId !== estimateId);

    // Finally delete the estimate itself (affects client portal)
    const deletedEstimate = this.estimates.splice(index, 1)[0];
    this.saveData(); // Save immediately after deleting estimate
    
    // Success operation completed
    return true;
  }
  async deleteEstimateItem(itemId: number): Promise<boolean> { return false; }
  async createBid(bidData: any): Promise<Bid> { throw new Error('Not implemented in memory storage'); }
  async getAllBids(): Promise<Bid[]> { return []; }
  async getBidsByProject(projectId: number): Promise<Bid[]> { return []; }
  async acceptBid(bidId: number): Promise<Bid | undefined> { return undefined; }
  async updateEstimateItemStatus(estimateId: number, itemId: number, status: string): Promise<boolean> { 
    const estimate = this.estimates.find(e => e.id === estimateId);
    if (!estimate || !estimate.categories) return false;

    let updated = false;
    for (const category of estimate.categories) {
      if (category.items) {
        for (const item of category.items) {
          if (item.id === itemId) {
            item.status = status;
            item.hasBeenBidOut = (status === 'Bidding' || status === 'Waiting Approval' || status === 'Approved');
            updated = true;
            break;
          }
        }
      }
      if (updated) break;
    }

    if (updated) {
      // Check and update overall estimate status after item status change
      this.checkAndUpdateEstimateStatus(estimate);
      this.saveData();
      // Success operation completed
    }
    return updated;
  }

  async updateEstimateItem(itemId: number | string, updateData: any): Promise<any> {
    // Development logging removed);
    
    let updatedItem = null;
    let updated = false;
    
    // Find and update in estimates array (embedded structure)
    for (const estimate of this.estimates) {
      if (estimate.categories) {
        for (const category of estimate.categories) {
          if (category.items) {
            for (const item of category.items) {
              if (item.id == itemId) { // Use == for loose equality to handle string/number comparison
                // Update all provided fields
                Object.keys(updateData).forEach(key => {
                  if (key !== 'id' && key !== 'estimateId') { // Don't update ID fields
                    item[key] = updateData[key];
                  }
                });
                
                // Set updated timestamp
                item.updatedAt = new Date().toISOString();
                
                updatedItem = { ...item };
                updated = true;
                // Development logging removed
                break;
              }
            }
            if (updated) break;
          }
        }
        if (updated) {
          // Check and update overall estimate status after item changes
          this.checkAndUpdateEstimateStatus(estimate);
          break;
        }
      }
    }

    if (updated) {
      this.saveData();
      // Success operation completed
      return updatedItem;
    } else {
      console.warn(`⚠️ Estimate item ${itemId} not found for update`);
      return null;
    }
  }
  async getEstimateCategories(estimateId: number): Promise<any[]> { 
    const estimate = this.estimates.find(e => e.id === estimateId);
    if (!estimate || !estimate.categories) return [];
    
    // Add IDs to items for proper tracking
    estimate.categories.forEach((category: any, categoryIndex: number) => {
      if (category.items) {
        category.items.forEach((item: any, itemIndex: number) => {
          if (!item.id) {
            // Generate consistent IDs based on estimate and position
            item.id = parseInt(`${estimateId}${categoryIndex.toString().padStart(2, '0')}${itemIndex.toString().padStart(2, '0')}`);
          }
        });
      }
    });
    
    this.saveData(); // Save the IDs back to storage
    return estimate.categories;
  }
  async createBidProcess(bidProcessData: any): Promise<BidProcess> { 
    const bidProcess = {
      id: this.bidProcesses.length + 1,
      ...bidProcessData,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    this.bidProcesses.push(bidProcess);
    this.saveData();
    // Success operation completed
    return bidProcess;
  }
  async getBidProcessesByProject(projectId: number): Promise<BidProcess[]> { 
    return this.bidProcesses.filter((bp: any) => bp.projectId === projectId);
  }

  async updateBidProcess(id: number, updateData: any): Promise<BidProcess | null> {
    const index = this.bidProcesses.findIndex(bp => bp.id === id);
    if (index === -1) return null;
    
    this.bidProcesses[index] = {
      ...this.bidProcesses[index],
      ...updateData,
      updatedAt: new Date().toISOString()
    };
    this.saveData();
    // Success operation completed
    return this.bidProcesses[index];
  }
  async getBidProcessByEstimateItem(estimateItemId: number): Promise<BidProcess | undefined> { 
    return this.bidProcesses.find((bp: any) => bp.estimateItemId === estimateItemId);
  }

  async getBidInvitationsByEstimateItem(estimateItemId: string): Promise<any[]> {
    try {
      // Return bid invitations for this specific estimate item
      return this.bidInvitations.filter(invitation => invitation.estimateItemId === estimateItemId) || [];
    } catch (error) {
      console.error('Error getting bid invitations for item:', error);
      return [];
    }
  }

  async getBidResponsesByEstimateItem(estimateItemId: string): Promise<any[]> {
    try {
      // Return bid responses for this specific estimate item
      return this.bidResponses.filter(response => response.estimateItemId === estimateItemId) || [];
    } catch (error) {
      console.error('Error getting bid responses for item:', error);
      return [];
    }
  }

  async deleteBidResponse(bidResponseId: number): Promise<boolean> {
    // Development logging removed
    
    const bidResponseIndex = this.bidResponses.findIndex(br => br.id === bidResponseId);
    if (bidResponseIndex === -1) {
      // Development logging removed
      return false;
    }
    
    const bidResponse = this.bidResponses[bidResponseIndex];
    
    // Delete from subcontractor portal bid list
    this.bidResponses.splice(bidResponseIndex, 1);
    
    // If this bid was awarded, clean up related estimate item and purchase orders
    if (bidResponse.status === 'awarded') {
      // Reset estimate item status if it was linked to this bid
      if (bidResponse.estimateItemId) {
        const estimate = this.estimates.find(e => e.id === bidResponse.estimateId);
        if (estimate && estimate.categories) {
          for (const category of estimate.categories) {
            if (category.items) {
              const item = category.items.find(i => i.id === bidResponse.estimateItemId);
              if (item) {
                item.status = 'Estimating';
                item.hasBeenBidOut = false;
                item.vendor = null;
                // Development logging removed
              }
            }
          }
        }
      }
      
      // Delete related purchase orders (affects subcontractor portal)
      const relatedPOs = this.purchaseOrders.filter(po => 
        po.bidResponseId === bidResponseId || 
        (po.estimateItemId === bidResponse.estimateItemId && po.contactId === bidResponse.contactId)
      );
      // Development logging removed
      this.purchaseOrders = this.purchaseOrders.filter(po => 
        po.bidResponseId !== bidResponseId && 
        !(po.estimateItemId === bidResponse.estimateItemId && po.contactId === bidResponse.contactId)
      );
    }
    
    this.saveData();
    // Success operation completed
    return true;
  }

  async deleteBidProcessByEstimateItem(estimateItemId: number): Promise<boolean> {
    try {
      // Development logging removed
      
      // Find the bid process
      const bidProcessIndex = this.bidProcesses.findIndex((bp: any) => bp.estimateItemId === estimateItemId);
      
      if (bidProcessIndex === -1) {
        // Development logging removed
        return false;
      }

      const bidProcess = this.bidProcesses[bidProcessIndex];

      // Delete all bid responses for this bid process (affects subcontractor portal)
      const relatedBidResponses = this.bidResponses.filter(br => br.estimateItemId === estimateItemId);
      // Development logging removed
      this.bidResponses = this.bidResponses.filter(br => br.estimateItemId !== estimateItemId);

      // Delete all bid invitations for this process (affects subcontractor portal)
      const relatedBidInvitations = this.bidInvitations.filter(bi => bi.estimateItemId === estimateItemId);
      // Development logging removed
      this.bidInvitations = this.bidInvitations.filter(bi => bi.estimateItemId !== estimateItemId);

      // Remove the bid process
      this.bidProcesses.splice(bidProcessIndex, 1);

      // Reset the estimate item status to "Estimating"
      const estimateItem = this.estimateItems.find((item: any) => item.id === estimateItemId);
      if (estimateItem) {
        estimateItem.status = 'Estimating';
        // Processing operation
      }

      // Save changes to file
      this.saveData();

      // Success operation completed
      return true;
    } catch (error) {
      console.error(`❌ Error deleting bid process for estimate item ${estimateItemId}:`, error);
      return false;
    }
  }
  async createBidResponse(bidResponseData: any): Promise<BidResponse> { 
    const bidResponse = {
      id: this.bidResponses.length + 1,
      ...bidResponseData,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    this.bidResponses.push(bidResponse);

    // For manual bids, ensure there's a bid process to maintain consistency
    if (bidResponseData.isManualBid && bidResponseData.estimateItemId) {
      // Check if bid process already exists for this estimate item
      let bidProcess = this.bidProcesses.find((bp: any) => 
        bp.estimateItemId === bidResponseData.estimateItemId
      );
      
      if (!bidProcess) {
        // Create a bid process for the manual bid to maintain system consistency
        bidProcess = {
          id: this.bidProcesses.length + 1,
          projectId: bidResponseData.projectId,
          estimateId: null, // Manual bids might not have a specific estimate ID
          estimateItemId: bidResponseData.estimateItemId,
          trade: bidResponseData.trade || 'Manual Entry',
          estimatedCost: bidResponseData.bidAmount || bidResponseData.proposedCost,
          description: bidResponseData.notes || 'Manual bid entry',
          status: 'submitted', // Start as submitted since we have a response
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          isManualBidProcess: true
        };
        
        this.bidProcesses.push(bidProcess);
        // Success operation completed
      }
      
      // Link the bid response to the bid process
      bidResponse.bidProcessId = bidProcess.id;
    }
    
    this.saveData();
    // Success operation completed
    return bidResponse;
  }
  async getBidResponsesByProcess(bidProcessId: number): Promise<BidResponse[]> { return []; }
  async getBidResponsesBySubcontractor(subcontractorId: number): Promise<BidResponse[]> { 
    // Development logging removed
    
    const responses = this.bidResponses.filter((br: any) => 
      br.contactId === subcontractorId || br.subcontractorId === subcontractorId
    );
    
    // Development logging removed
    
    // Enhance responses with contact information
    return responses.map((br: any) => {
      const contact = this.contacts.find((c: any) => 
        c.id === br.contactId || c.id === br.subcontractorId
      );
      
      return {
        ...br,
        subcontractorName: contact?.name || br.subcontractorName,
        subcontractorCompany: contact?.company || br.subcontractorCompany,
        proposedCost: br.bidAmount || br.proposedCost,
        proposedDuration: br.timeline || br.proposedDuration,
        status: br.status || 'submitted'
      };
    });
  }
  async getBidResponsesByProject(projectId: number): Promise<any[]> { 
    // Development logging removed
    
    // First, get all estimate items for this project
    const projectEstimates = this.estimates.filter((est: any) => est.projectId === projectId);
    // Development logging removed
    
    const estimateItemIds = new Set();
    
    // Collect all estimate item IDs from all estimates in this project
    projectEstimates.forEach((estimate: any) => {
      if (estimate.categories) {
        estimate.categories.forEach((category: any) => {
          if (category.items) {
            category.items.forEach((item: any) => {
              if (item.id) {
                estimateItemIds.add(item.id);
                // Development logging removed
              }
            });
          }
        });
      }
    });

    // Development logging removed
    // Development logging removed);

    // Enhanced intelligent ID matching for bid responses using stable ID system
    // Import functions with proper error handling
    let isTimestampBasedId: (id: string) => boolean;
    let hashTrade: (trade: string) => string;
    
    try {
      const idUtils = require('./utils/id');
      isTimestampBasedId = idUtils.isTimestampBasedId || (() => false);
      hashTrade = idUtils.hashTrade || (() => '');
    } catch (error) {
      console.warn('⚠️  ID utilities not available, using fallbacks');
      isTimestampBasedId = (id: string) => id && id.match(/^item-\d{13}-[a-z0-9]+$/i) !== null;
      hashTrade = (trade: string) => trade ? trade.toLowerCase().slice(0, 8) : '';
    }
    
    const bidResponses = this.bidResponses.filter((br: any) => {
      // Method 1: Direct projectId match (old format)
      if (br.projectId === projectId) {
        // Development logging removed
        return true;
      }
      
      // Method 2: Exact estimateItemId match
      if (br.estimateItemId && estimateItemIds.has(br.estimateItemId)) {
        // Development logging removed
        return true;
      }
      
      // Method 3: DISABLED - No automatic trade-based matching
      // This prevents bids from being incorrectly assigned to "not needing to bid" items
      // Manual bids should ONLY match by exact estimateItemId
      if (br.estimateItemId && !estimateItemIds.has(br.estimateItemId)) {
        // Development logging removed
        // Return false to exclude this bid from this project
        return false;
      }
      
      return false;
    });

    // Development logging removed
    
    // Save data if any bid responses were updated with new IDs
    const hasUpdatedBids = bidResponses.some(br => br.matchedByTrade);
    if (hasUpdatedBids) {
      this.saveData();
      // Development logging removed
    }

    // Enhance bid responses with additional contact information
    return bidResponses.map((br: any) => {
      const contact = this.contacts.find((c: any) => 
        c.id === br.contactId || c.id === br.subcontractorId
      );
      
      return {
        ...br,
        // Normalize field names for consistency
        subcontractorId: br.contactId || br.subcontractorId,
        subcontractorName: contact?.name || br.subcontractorName,
        subcontractorCompany: contact?.company || br.subcontractorCompany,
        proposedCost: br.bidAmount || br.proposedCost,
        proposedDuration: br.timeline || br.proposedDuration,
        status: br.status || 'submitted'
      };
    });
  }
  async awardBidResponse(bidResponseId: number, estimateItemId: number): Promise<BidResponse | undefined> { 
    const bidResponse = this.bidResponses.find((br: any) => br.id === bidResponseId);
    if (!bidResponse) {
      // Development logging removed
      return undefined;
    }

    // Update bid response status to awarded
    bidResponse.status = 'awarded';
    bidResponse.awardedAt = new Date().toISOString();
    bidResponse.updatedAt = new Date().toISOString();

    // Update the estimate item with bid details
    const estimate = this.estimates.find((est: any) => 
      est.categories?.some((cat: any) => 
        cat.items?.some((item: any) => item.id === estimateItemId)
      )
    );

    if (estimate) {
      estimate.categories.forEach((category: any) => {
        category.items.forEach((item: any) => {
          if (item.id === estimateItemId) {
            // Update estimate item with winning bid information
            const contact = this.contacts.find((c: any) => 
              c.id === bidResponse.contactId || c.id === bidResponse.subcontractorId
            );
            
            item.vendor = contact?.company || contact?.name || bidResponse.subcontractorName || '';
            item.estimatedCost = bidResponse.bidAmount || bidResponse.proposedCost;
            item.duration = bidResponse.timeline || bidResponse.proposedDuration;
            item.status = 'Job Awarded';
            item.files = [...(item.files || []), ...(bidResponse.attachments || [])];
            
            // Success operation completed
          }
        });
      });
    }

    // Mark other bid responses for the same estimate item as declined
    this.bidResponses.forEach((br: any) => {
      if (br.estimateItemId === estimateItemId && br.id !== bidResponseId && br.status !== 'awarded') {
        br.status = 'declined';
        br.declinedAt = new Date().toISOString();
        br.updatedAt = new Date().toISOString();
      }
    });

    this.saveData();
    // Success operation completed
    return bidResponse;
  }
  async sendBidReminder(bidProcessId: number, contactId: number): Promise<boolean> { return false; }
  // Helper method to check and update estimate status based on item statuses
  private checkAndUpdateEstimateStatus(estimate: any): void {
    // Search/lookup operation
    if (!estimate || !estimate.categories) {
      // Development logging removed
      return;
    }

    // Count items and their statuses for debugging
    let totalItems = 0;
    let awardedItems = 0;
    for (const category of estimate.categories) {
      if (category.items && Array.isArray(category.items)) {
        for (const item of category.items) {
          totalItems++;
          // Development logging removed
          if (item.status === 'Job Awarded') {
            awardedItems++;
          }
        }
      }
    }

    const allItemsAwarded = estimate.categories.every((category: any) =>
      category.items && category.items.length > 0 && category.items.every((item: any) => item.status === 'Job Awarded')
    );
    
    const hasAnyAwarded = estimate.categories.some((category: any) =>
      category.items && category.items.some((item: any) => item.status === 'Job Awarded')
    );

    const newStatus = allItemsAwarded ? 'Waiting Approval' : 
                     hasAnyAwarded ? 'Pending' : 'Pending';

    // Development logging removed
    // Development logging removed
    // Development logging removed

    if (estimate.status !== newStatus) {
      const oldStatus = estimate.status;
      estimate.status = newStatus;
      estimate.updatedAt = new Date().toISOString();
      // Development logging removed
    } else {
      // Development logging removed
    }
  }

  async selectWinningBid(bidResponseId: number): Promise<BidResponse | undefined> { 
    // Target operation completed
    const bidResponse = this.bidResponses.find((br: any) => br.id === bidResponseId);
    if (!bidResponse) {
      // Development logging removed
      return undefined;
    }

    // Development logging removed

    // Update bid response status to awarded
    bidResponse.status = 'awarded';
    bidResponse.awardedAt = new Date().toISOString();
    bidResponse.updatedAt = new Date().toISOString();

    // Update the corresponding bid process status and winner
    const bidProcess = this.bidProcesses.find((bp: any) => bp.estimateItemId === bidResponse.estimateItemId);
    if (bidProcess) {
      bidProcess.status = 'awarded';
      bidProcess.winnerSubcontractorId = bidResponse.contactId || bidResponse.subcontractorId;
      bidProcess.awardedAt = new Date().toISOString();
      bidProcess.updatedAt = new Date().toISOString();
      // Success operation completed
    }

    // Update the estimate item with bid details
    const estimate = this.estimates.find((est: any) => 
      est.categories?.some((cat: any) => 
        cat.items?.some((item: any) => item.id === bidResponse.estimateItemId)
      )
    );

    if (estimate) {
      // Development logging removed
      estimate.categories.forEach((category: any) => {
        category.items.forEach((item: any) => {
          if (item.id === bidResponse.estimateItemId) {
            // Update estimate item with winning bid information
            const contact = this.contacts.find((c: any) => 
              c.id === bidResponse.contactId || c.id === bidResponse.subcontractorId
            );
            
            item.vendor = contact?.company || contact?.name || bidResponse.subcontractorName || '';
            item.estimatedCost = bidResponse.bidAmount || bidResponse.proposedCost;
            item.duration = bidResponse.timeline || bidResponse.proposedDuration;
            item.status = 'Job Awarded';
            
            // Merge attachments without duplicates (check by filename)
            const existingFiles = item.files || [];
            const newAttachments = bidResponse.attachments || [];
            const filesToAdd = newAttachments.filter((newFile: any) => 
              !existingFiles.some((existingFile: any) => 
                existingFile.filename === newFile.filename
              )
            );
            item.files = [...existingFiles, ...filesToAdd];
            
            // Success operation completed
          }
        });
      });
    } else {
      // Development logging removed
    }

    // Mark other bid responses for the same estimate item as declined
    this.bidResponses.forEach((br: any) => {
      if (br.estimateItemId === bidResponse.estimateItemId && br.id !== bidResponseId && br.status !== 'awarded') {
        br.status = 'declined';
        br.declinedAt = new Date().toISOString();
        br.updatedAt = new Date().toISOString();
      }
    });

    // Check if all estimate items are now awarded and update overall estimate status
    if (estimate) {
      this.checkAndUpdateEstimateStatus(estimate);
    }

    this.saveData();
    // Success operation completed
    return bidResponse;
  }
  async createBidInvitation(invitationData: any): Promise<any> { 
    // Add bidInvitations array if it doesn't exist
    if (!this.bidInvitations) {
      this.bidInvitations = [];
    }
    
    const invitation = {
      id: this.bidInvitations.length + 1,
      ...invitationData,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    this.bidInvitations.push(invitation);
    this.saveData();
    // Success operation completed
    return invitation;
  }

  async getAllBidProcesses(): Promise<BidProcess[]> {
    return this.bidProcesses || [];
  }

  async getAllBidResponses(): Promise<BidResponse[]> {
    return this.bidResponses || [];
  }

  async getAllBidInvitations(): Promise<any[]> {
    return this.bidInvitations || [];
  }

  // Purchase Order methods
  async createPurchaseOrder(poData: any): Promise<any> {
    if (!this.purchaseOrders) {
      this.purchaseOrders = [];
    }
    
    const purchaseOrder = {
      id: this.purchaseOrders.length + 1,
      ...poData,
      createdAt: poData.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    this.purchaseOrders.push(purchaseOrder);
    this.saveData();
    // Success operation completed
    return purchaseOrder;
  }

  async getPurchaseOrder(id: string): Promise<any | null> {
    return this.purchaseOrders.find(po => po.id === id) || null;
  }

  async getPurchaseOrdersByProject(projectId: string): Promise<any[]> {
    return this.purchaseOrders.filter(po => po.projectId.toString() === projectId.toString());
  }

  async getAllPurchaseOrders(): Promise<any[]> {
    return this.purchaseOrders || [];
  }

  async updatePurchaseOrder(id: string, updateData: any): Promise<any | null> {
    const index = this.purchaseOrders.findIndex(po => po.id === id);
    if (index === -1) return null;
    
    this.purchaseOrders[index] = {
      ...this.purchaseOrders[index],
      ...updateData,
      updatedAt: new Date().toISOString()
    };
    this.saveData();
    // Success operation completed
    return this.purchaseOrders[index];
  }

  async deletePurchaseOrder(id: string): Promise<boolean> {
    const index = this.purchaseOrders.findIndex(po => po.id === id);
    if (index === -1) return false;
    
    this.purchaseOrders.splice(index, 1);
    this.saveData();
    // Success operation completed
    return true;
  }

  async getBidProcess(id: number): Promise<any | null> {
    return this.bidProcesses.find(bp => bp.id === id) || null;
  }

  async getBidResponse(id: number): Promise<any | null> {
    return this.bidResponses.find(br => br.id === id) || null;
  }

  async getBidInvitationsBySubcontractor(subcontractorId: number): Promise<any[]> {
    if (!this.bidInvitations) {
      this.bidInvitations = [];
    }
    
    const invitations = this.bidInvitations.filter((invitation: any) => 
      invitation.subcontractorId === subcontractorId
    );
    
    // Development logging removed
    return invitations;
  }

  async getBidInvitationsByProject(projectId: number): Promise<any[]> {
    if (!this.bidInvitations) {
      this.bidInvitations = [];
    }
    
    const projectInvitations = this.bidInvitations.filter(invitation => 
      invitation.projectId === projectId
    );
    
    // Development logging removed
    return projectInvitations;
  }

  async getBidItems(projectId?: string): Promise<any[]> {
    const data = this.loadData();
    
    if (projectId) {
      return data.bidItems?.filter((item: any) => 
        item.projectId === projectId.toString() || item.projectId === parseInt(projectId)
      ) || [];
    }
    
    return data.bidItems || [];
  }



  // Award bid to subcontractor
  async awardBid(bidItemId: string, subId: string, bidData: any): Promise<any> {
    const data = this.loadData();
    const bidItemIndex = data.bidItems?.findIndex((item: any) => item.id === bidItemId);
    
    if (bidItemIndex === -1) {
      throw new Error('Bid item not found');
    }
    
    const bidItem = data.bidItems[bidItemIndex];
    
    // Update bid item with selected subcontractor
    bidItem.selectedSubId = subId;
    bidItem.status = 'waiting_approval';
    
    // Update bid status to awarded if not already
    const bidIndex = bidItem.bids?.findIndex((bid: any) => bid.subId === subId);
    if (bidIndex !== -1) {
      bidItem.bids[bidIndex].status = 'awarded';
    }
    
    // Save data
    this.saveData(data);
    
    return bidItem;
  }

  // Award bid for estimate item (comprehensive implementation)
  async awardBidForEstimateItem(estimateItemId: number, awardData: {
    winningBidResponseId: number,
    winningSubcontractorId: number,
    awardedAmount: number,
    awardedDuration: number
  }): Promise<any> {
    const { winningBidResponseId, winningSubcontractorId, awardedAmount, awardedDuration } = awardData;
    
    // Processing operation
    // Development logging removed
    
    // 1. Update the winning bid response status to 'awarded'
    const winningBidResponse = this.bidResponses.find(br => br.id === winningBidResponseId);
    if (winningBidResponse) {
      winningBidResponse.status = 'awarded';
      winningBidResponse.awardedAt = new Date().toISOString();
      // Success operation completed
    }
    
    // 2. Update all other bid responses for this estimate item to 'declined'
    const otherBidResponses = this.bidResponses.filter(br => 
      br.estimateItemId === estimateItemId && br.id !== winningBidResponseId
    );
    
    otherBidResponses.forEach(br => {
      br.status = 'declined';
      br.declinedAt = new Date().toISOString();
      // Development logging removed
    });
    
    // Development logging removed
    
    // 3. Update the estimate item with winner information and status
    // Find the estimate item within the categories structure
    let estimateItem: any = null;
    let estimateToUpdate: any = null;
    
    // Search through all estimates and their categories to find the item
    for (const estimate of this.estimates) {
      if (estimate.categories) {
        for (const category of estimate.categories) {
          if (category.items) {
            const foundItem = category.items.find((item: any) => item.id === estimateItemId);
            if (foundItem) {
              estimateItem = foundItem;
              estimateToUpdate = estimate;
              break;
            }
          }
        }
      }
      if (estimateItem) break;
    }
    
    if (estimateItem) {
      // Search/lookup operation
      
      estimateItem.selectedSubcontractorId = winningSubcontractorId;
      estimateItem.awardedAmount = awardedAmount;
      estimateItem.awardedDuration = awardedDuration;
      estimateItem.status = 'Jobs Awarded'; // Use proper bid management status
      estimateItem.awardedAt = new Date().toISOString();
      
      // Update vendor field and cost with contractor info
      const contractor = this.contacts.find(c => c.id === winningSubcontractorId);
      if (contractor) {
        estimateItem.vendor = contractor.company || contractor.name;
        estimateItem.estimatedCost = awardedAmount; // Update the cost field 
        estimateItem.duration = awardedDuration; // Update duration
        
        // Add visual indicator that this item is tied to a bid
        estimateItem.linkedToBid = true;
        estimateItem.bidAwardId = winningBidResponseId;
        
        // Development logging removed
      }
      
      // 4. Merge attachments from winning bid with existing estimate item attachments
      if (winningBidResponse && winningBidResponse.attachments) {
        const existingAttachments = estimateItem.attachments || estimateItem.files || [];
        const bidAttachments = Array.isArray(winningBidResponse.attachments) 
          ? winningBidResponse.attachments 
          : [winningBidResponse.attachments];
        
        // Merge attachments, avoiding duplicates
        const uniqueAttachments = [...existingAttachments];
        bidAttachments.forEach(attachment => {
          if (!existingAttachments.some(existing => existing === attachment)) {
            uniqueAttachments.push(attachment);
          }
        });
        
        estimateItem.files = uniqueAttachments; // Use 'files' field based on JSON structure
        // Development logging removed
      }
      
      // Update the estimate's updatedAt timestamp
      if (estimateToUpdate) {
        estimateToUpdate.updatedAt = new Date().toISOString();
      }
      
      // Success operation completed
    } else {
      // Development logging removed
    }
    
    // 4. Update bid process status
    const bidProcess = this.bidProcesses.find(bp => bp.estimateItemId === estimateItemId);
    if (bidProcess) {
      bidProcess.status = 'awarded';
      bidProcess.winnerSubcontractorId = winningSubcontractorId;
      bidProcess.awardedAt = new Date().toISOString();
      // Success operation completed
    }
    
    // 5. Save all changes to file
    this.saveData();
    // Development logging removed
    
    return {
      estimateItem,
      winningBidResponse,
      declinedBidResponses: otherBidResponses,
      bidProcess,
      awardedAt: new Date().toISOString()
    };
  }



  async getPurchaseOrdersByContact(contactId: number): Promise<PurchaseOrder[]> { 
    return this.purchaseOrders.filter(po => po.subcontractorId === contactId);
  }

  async signPurchaseOrder(id: number, contactId: number, signature: string): Promise<PurchaseOrder | undefined> {
    // Search/lookup operation
    // Development logging removed
    
    const po = this.purchaseOrders.find(p => p.id === id);
    if (!po) {
      // Development logging removed
      return undefined;
    }

    // Update PO with signature information
    po.status = 'signed';
    po.signedAt = new Date().toISOString();
    po.signedBy = contactId;
    po.signature = signature;
    po.updatedAt = new Date().toISOString();

    // Success operation completed
    
    // Check if we should auto-generate an invoice
    await this.checkAndCreateAutoInvoice(po);
    
    // Save to persistent storage
    this.saveData();
    
    return po;
  }
  async sendPurchaseOrderToSubcontractor(id: number): Promise<PurchaseOrder | undefined> { return undefined; }
  async cancelPurchaseOrder(id: number, reason: string): Promise<PurchaseOrder | undefined> { return undefined; }

  async getApprovedEstimateItems(projectId: number): Promise<EstimateItem[]> {
    // Get all estimates for the project
    const projectEstimates = this.estimates.filter(est => est.projectId === projectId);
    // Search/lookup operation
    
    const approvedItems: EstimateItem[] = [];
    
    // Extract approved items from all categories
    for (const estimate of projectEstimates) {
      if (estimate.categories) {
        for (const category of estimate.categories) {
          if (category.items) {
            for (const item of category.items) {
              // Check if item status is "Approved" (after client approval)
              if (item.status === 'Approved') {
                approvedItems.push({
                  id: item.id,
                  estimateId: estimate.id,
                  categoryId: category.id,
                  trade: item.trade,
                  description: item.description,
                  vendor: item.vendor,
                  cost: item.cost,
                  duration: item.duration || 1,
                  status: item.status,
                  vendorId: item.vendorId,
                  markup: item.markup,
                  contingency: item.contingency
                });
                // Success operation completed
              }
            }
          }
        }
      }
    }
    
    // Development logging removed
    return approvedItems;
  }
  async createPurchaseOrderFromEstimate(poData: any): Promise<PurchaseOrder> { throw new Error('Not implemented in memory storage'); }
  async getProjectsByIds(projectIds: number[]): Promise<Project[]> { return this.projects.filter(p => projectIds.includes(p.id)); }
  async createInvoice(invoiceData: any): Promise<Invoice> {
    // Development logging removed
    
    const newInvoice = {
      id: this.invoices.length > 0 ? Math.max(...this.invoices.map(i => i.id)) + 1 : 1,
      ...invoiceData,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.invoices.push(newInvoice);
    this.saveData();
    
    // Success operation completed
    return newInvoice;
  }
  async getInvoicesByProject(projectId: number): Promise<Invoice[]> { 
    return this.invoices.filter(invoice => invoice.projectId === projectId);
  }
  async getInvoicesByContact(contactId: number): Promise<Invoice[]> { return []; }
  async getAllInvoices(): Promise<Invoice[]> { return this.invoices; }
  async updateInvoice(id: number, updateData: any): Promise<Invoice | undefined> { return undefined; }
  async approveInvoice(id: number, approvedBy: number): Promise<Invoice | undefined> { return undefined; }
  async addPaymentToInvoice(invoiceId: number, paymentData: any): Promise<Invoice | undefined> { return undefined; }
  async getAvailablePOsForInvoice(projectId: number): Promise<PurchaseOrder[]> { return []; }
  async linkInvoiceToPO(invoiceId: number, poId: number): Promise<boolean> { return false; }
  async updatePOPaymentStatus(poId: number): Promise<PurchaseOrder | undefined> { return undefined; }
  async calculatePOBalances(): Promise<void> { }
  async createProjectTask(taskData: any): Promise<ProjectTask> {
    const task = {
      id: this.nextId++,
      projectId: taskData.projectId,
      title: taskData.title || taskData.name,
      description: taskData.description || '',
      startDate: taskData.startDate,
      endDate: taskData.endDate,
      duration: taskData.duration || 1,
      status: taskData.status || 'scheduled',
      assignedTo: taskData.assignedTo || taskData.contactId,
      trade: taskData.trade || '',
      estimateItemId: taskData.estimateItemId,
      dependencies: taskData.dependencies || [],
      createdBy: taskData.createdBy || 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    this.projectTasks.push(task);
    this.saveData();
    // Success operation completed
    return task;
  }



  async getProjectTasksForSubcontractor(projectId: number, contactId: number): Promise<ProjectTask[]> {
    const tasks = this.projectTasks.filter(task => 
      task.projectId === projectId && 
      (task.assignedTo === contactId || task.contactId === contactId)
    );
    // Development logging removed
    return tasks;
  }



  async createDependency(dependencyData: any): Promise<any> {
    const newDependency = {
      id: this.nextId++,
      ...dependencyData,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    this.taskDependencies.push(newDependency);
    this.saveData();
    
    // Success operation completed
    return newDependency;
  }

  async deleteDependency(dependencyId: string): Promise<boolean> {
    // Handle the dependency ID format "toTaskId-fromTaskId" from the frontend
    if (dependencyId.includes('-')) {
      const [toTaskId, fromTaskId] = dependencyId.split('-');
      const index = this.taskDependencies.findIndex(dep => 
        dep.toTaskId === parseInt(toTaskId) && dep.fromTaskId === parseInt(fromTaskId)
      );
      
      if (index === -1) {
        // Development logging removed
        return false;
      }
      
      this.taskDependencies.splice(index, 1);
      this.saveData();
      
      // Success operation completed
      return true;
    }
    
    // Handle numeric dependency ID
    const index = this.taskDependencies.findIndex(dep => dep.id.toString() === dependencyId);
    if (index === -1) {
      // Development logging removed
      return false;
    }
    
    this.taskDependencies.splice(index, 1);
    this.saveData();
    
    // Success operation completed
    return true;
  }
  async updateProjectTask(id: number, updateData: any): Promise<ProjectTask | undefined> {
    // Target operation completed
    const taskIndex = this.projectTasks.findIndex(t => t.id === id);
    if (taskIndex === -1) {
      // Development logging removed
      return undefined;
    }
    
    // Handle both 'order' and 'orderIndex' field names for compatibility
    const updatedTaskData = { ...updateData };
    if (updateData.order !== undefined && updateData.orderIndex === undefined) {
      updatedTaskData.orderIndex = updateData.order;
      delete updatedTaskData.order;
    }
    
    // Handle dependency field mapping (frontend uses 'dependencies' string, backend uses 'dependsOn' array)
    if (updateData.dependencies !== undefined) {
      if (typeof updateData.dependencies === 'string') {
        // Convert comma-separated string to array of numbers
        updatedTaskData.dependsOn = updateData.dependencies
          .split(',')
          .map((id: string) => parseInt(id.trim()))
          .filter((id: number) => !isNaN(id));
      } else if (Array.isArray(updateData.dependencies)) {
        // Already an array, just ensure it's numbers
        updatedTaskData.dependsOn = updateData.dependencies.map((id: any) => parseInt(id)).filter((id: number) => !isNaN(id));
      }
      // Remove the frontend field name to avoid confusion
      delete updatedTaskData.dependencies;
    }
    
    this.projectTasks[taskIndex] = {
      ...this.projectTasks[taskIndex],
      ...updatedTaskData,
      updatedAt: new Date().toISOString()
    };
    
    this.saveData();
    // Success operation completed
    return this.projectTasks[taskIndex];
  }

  async updateTaskStatus(taskId: number, status: string): Promise<ProjectTask | undefined> {
    // Processing operation
    
    const task = this.projectTasks.find(t => t.id === taskId);
    if (!task) {
      // Development logging removed
      return undefined;
    }

    const oldStatus = task.status;
    task.status = status;
    task.updatedAt = new Date().toISOString();

    // Log status change
    // Success operation completed
    
    // Check for auto-invoice creation if task is completed
    if (status === 'Completed' && oldStatus !== 'Completed') {
      // Success operation completed
      
      // Find related signed PO for this task
      const relatedPO = this.purchaseOrders.find(po => 
        po.projectId === task.projectId && 
        po.trade === task.trade && 
        po.status === 'signed'
      );

      if (relatedPO) {
        await this.checkAndCreateAutoInvoice(relatedPO);
      }
    }

    this.saveData();
    return task;
  }

  async updateTaskDependencies(taskId: number, dependencies: any): Promise<boolean> {
    // Development logging removed
    const taskIndex = this.projectTasks.findIndex(t => t.id === taskId);
    if (taskIndex === -1) {
      // Development logging removed
      return false;
    }

    // Convert dependencies to proper format
    let dependsOnArray: number[] = [];
    if (typeof dependencies === 'string') {
      // Handle comma-separated string
      dependsOnArray = dependencies
        .split(',')
        .map((id: string) => parseInt(id.trim()))
        .filter((id: number) => !isNaN(id));
    } else if (Array.isArray(dependencies)) {
      // Handle array format
      dependsOnArray = dependencies.map((id: any) => parseInt(id)).filter((id: number) => !isNaN(id));
    }

    // Update the task with new dependencies
    this.projectTasks[taskIndex] = {
      ...this.projectTasks[taskIndex],
      dependsOn: dependsOnArray,
      updatedAt: new Date().toISOString()
    };

    this.saveData();
    // Success operation completed}]`);
    return true;
  }

  async deleteProjectTask(id: number): Promise<boolean> {
    const taskIndex = this.projectTasks.findIndex(t => t.id === id);
    if (taskIndex === -1) return false;
    
    const removedTask = this.projectTasks.splice(taskIndex, 1)[0];
    this.saveData();
    // Success operation completed
    return true;
  }
  async autoGenerateSchedule(projectId: number, projectStartDate: string, createdBy: number): Promise<ProjectTask[]> { 
    // Development logging removed
    
    // Get approved estimate items for the project
    const approvedItems = await this.getApprovedEstimateItems(projectId);
    // Development logging removed
    
    if (approvedItems.length === 0) {
      // Development logging removed
      return [];
    }
    
    // Define conventional trade sequence
    const tradeSequence = [
      'Foundation', 'Framing', 'Plumbing', 'Electrical', 'HVAC', 
      'Insulation', 'Drywall', 'Flooring', 'Cabinetry', 'Painting'
    ];
    
    // Group items by trade and sort by conventional sequence
    const groupedByTrade = new Map();
    approvedItems.forEach((item: any) => {
      if (!groupedByTrade.has(item.trade)) {
        groupedByTrade.set(item.trade, []);
      }
      groupedByTrade.get(item.trade).push(item);
    });
    
    const sortedTrades = Array.from(groupedByTrade.keys()).sort((a, b) => {
      const indexA = tradeSequence.indexOf(a);
      const indexB = tradeSequence.indexOf(b);
      if (indexA === -1) return 1;
      if (indexB === -1) return -1;
      return indexA - indexB;
    });
    
    // Generate tasks
    const generatedTasks: ProjectTask[] = [];
    let currentStartDate = new Date(projectStartDate);
    
    // Skip weekends for start date
    while (currentStartDate.getDay() === 0 || currentStartDate.getDay() === 6) {
      currentStartDate = new Date(currentStartDate.getTime() + 24 * 60 * 60 * 1000);
    }
    
    for (const trade of sortedTrades) {
      const tradeItems = groupedByTrade.get(trade);
      const totalDuration = tradeItems.reduce((sum: number, item: any) => sum + (item.duration || 1), 0);
      
      // Calculate end date (business days only)
      let endDate = new Date(currentStartDate);
      let daysAdded = 0;
      while (daysAdded < totalDuration - 1) {
        endDate = new Date(endDate.getTime() + 24 * 60 * 60 * 1000);
        if (endDate.getDay() !== 0 && endDate.getDay() !== 6) {
          daysAdded++;
        }
      }
      
      // Find subcontractor contact
      let contactId = null;
      const vendor = tradeItems.find((item: any) => item.vendor)?.vendor;
      if (vendor) {
        const contact = this.contacts.find(c => 
          c.role === 'subcontractor' && 
          (c.company?.toLowerCase().includes(vendor.toLowerCase()) || c.name.toLowerCase().includes(vendor.toLowerCase()))
        );
        if (contact) contactId = contact.id;
      }
      
      const task: ProjectTask = {
        id: this.projectTasks.length + 1,
        projectId,
        title: `${trade} Work`,
        description: tradeItems.map((item: any) => item.description).join(', '),
        trade,
        contactId,
        estimateItemId: tradeItems[0]?.id,
        startDate: currentStartDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
        duration: totalDuration,
        status: 'scheduled',
        dependencies: generatedTasks.length > 0 ? [generatedTasks[generatedTasks.length - 1].id] : [],
        createdBy,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      this.projectTasks.push(task);
      generatedTasks.push(task);
      
      // Move to next business day for next task
      currentStartDate = new Date(endDate.getTime() + 24 * 60 * 60 * 1000);
      while (currentStartDate.getDay() === 0 || currentStartDate.getDay() === 6) {
        currentStartDate = new Date(currentStartDate.getTime() + 24 * 60 * 60 * 1000);
      }
    }
    
    // Save data
    this.saveData();
    
    // Success operation completed
    return generatedTasks;
  }

  async appendScheduleFromSelected(projectId: number, projectStartDate: string, createdBy: number, selectedEstimateIds: number[]): Promise<ProjectTask[]> {
    // Development logging removed
    // Development logging removed
    
    // Get all approved estimate items for the project
    const allApprovedItems = await this.getApprovedEstimateItems(projectId);
    
    // Filter to only selected items
    const selectedItems = allApprovedItems.filter((item: any) => selectedEstimateIds.includes(item.id));
    // Development logging removed
    
    if (selectedItems.length === 0) {
      // Development logging removed
      return [];
    }
    
    // Define conventional trade sequence
    const tradeSequence = [
      'Foundation', 'Framing', 'Plumbing', 'Electrical', 'HVAC', 
      'Insulation', 'Drywall', 'Flooring', 'Cabinetry', 'Painting'
    ];
    
    // Group items by trade and sort by conventional sequence
    const groupedByTrade = new Map();
    selectedItems.forEach((item: any) => {
      if (!groupedByTrade.has(item.trade)) {
        groupedByTrade.set(item.trade, []);
      }
      groupedByTrade.get(item.trade).push(item);
    });
    
    const sortedTrades = Array.from(groupedByTrade.keys()).sort((a, b) => {
      const indexA = tradeSequence.indexOf(a);
      const indexB = tradeSequence.indexOf(b);
      if (indexA === -1) return 1;
      if (indexB === -1) return -1;
      return indexA - indexB;
    });
    
    // Generate tasks
    const generatedTasks: ProjectTask[] = [];
    let currentStartDate = new Date(projectStartDate);
    
    // Skip weekends for start date
    while (currentStartDate.getDay() === 0 || currentStartDate.getDay() === 6) {
      currentStartDate = new Date(currentStartDate.getTime() + 24 * 60 * 60 * 1000);
    }
    
    for (const trade of sortedTrades) {
      const tradeItems = groupedByTrade.get(trade);
      const totalDuration = tradeItems.reduce((sum: number, item: any) => sum + (item.duration || 1), 0);
      
      // Calculate end date (business days only)
      let endDate = new Date(currentStartDate);
      let daysAdded = 0;
      while (daysAdded < totalDuration - 1) {
        endDate = new Date(endDate.getTime() + 24 * 60 * 60 * 1000);
        if (endDate.getDay() !== 0 && endDate.getDay() !== 6) {
          daysAdded++;
        }
      }
      
      // Find subcontractor contact
      let contactId = null;
      const vendor = tradeItems.find((item: any) => item.vendor)?.vendor;
      if (vendor) {
        const contact = this.contacts.find(c => 
          c.role === 'subcontractor' && 
          (c.company?.toLowerCase().includes(vendor.toLowerCase()) || c.name.toLowerCase().includes(vendor.toLowerCase()))
        );
        if (contact) contactId = contact.id;
      }
      
      const task: ProjectTask = {
        id: this.projectTasks.length + 1,
        projectId,
        title: `${trade} Work`,
        description: tradeItems.map((item: any) => item.description).join(', '),
        trade,
        contactId,
        estimateItemId: tradeItems[0]?.id,
        startDate: currentStartDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
        duration: totalDuration,
        status: 'scheduled',
        dependencies: generatedTasks.length > 0 ? [generatedTasks[generatedTasks.length - 1].id] : [],
        createdBy,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      this.projectTasks.push(task);
      generatedTasks.push(task);
      
      // Move to next business day for next task
      currentStartDate = new Date(endDate.getTime() + 24 * 60 * 60 * 1000);
      while (currentStartDate.getDay() === 0 || currentStartDate.getDay() === 6) {
        currentStartDate = new Date(currentStartDate.getTime() + 24 * 60 * 60 * 1000);
      }
    }
    
    // Save data
    this.saveData();
    
    // Success operation completed
    return generatedTasks;
  }
  async createClientPayment(paymentData: any): Promise<ClientPayment> {
    // Development logging removed
    
    const newPayment = {
      id: this.clientPayments.length > 0 ? Math.max(...this.clientPayments.map(p => p.id)) + 1 : 1,
      ...paymentData,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.clientPayments.push(newPayment);
    this.saveData();
    
    // Success operation completed
    return newPayment;
  }
  async getClientPaymentsByProject(projectId: number): Promise<ClientPayment[]> { 
    return this.clientPayments.filter(payment => payment.projectId === projectId);
  }
  async getAllClientPayments(): Promise<ClientPayment[]> { return this.clientPayments; }
  async updateClientPayment(id: number, updateData: any): Promise<ClientPayment | undefined> { return undefined; }
  async deleteClientPayment(id: number): Promise<boolean> { return false; }
  async getProjectBudgetSummary(projectId: number): Promise<ProjectBudgetSummary | undefined> { return undefined; }
  async updateProjectBudgetSummary(projectId: number): Promise<ProjectBudgetSummary> { throw new Error('Not implemented in memory storage'); }
  async createProjectDocument(documentData: any): Promise<ProjectDocument> {
    // Development logging removed
    
    const newDocument: ProjectDocument = {
      id: this.projectDocuments.length > 0 ? Math.max(...this.projectDocuments.map(d => d.id)) + 1 : 1,
      projectId: documentData.projectId,
      fileName: documentData.fileName,
      originalFileName: documentData.originalFileName,
      fileUrl: documentData.fileUrl,
      documentType: documentData.documentType || 'other',
      fileSize: documentData.fileSize || 0,
      uploadedBy: documentData.uploadedBy || 1,
      description: documentData.description || '',
      targetId: documentData.targetId || null,
      uploadedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.projectDocuments.push(newDocument);
    this.saveData();
    
    // Development logging removed
    return newDocument;
  }
  async getProjectDocuments(projectId: number): Promise<ProjectDocument[]> { 
    // Development logging removed
    const documents = this.projectDocuments.filter(doc => doc.projectId === projectId);
    // Development logging removed
    return documents;
  }
  async getProjectDocument(id: number): Promise<ProjectDocument | undefined> { return undefined; }
  async updateProjectDocument(id: number, updateData: any): Promise<ProjectDocument | undefined> { return undefined; }
  async deleteProjectDocument(id: number): Promise<boolean> { return false; }
  async createChangeOrder(changeOrderData: any): Promise<ChangeOrder> { throw new Error('Not implemented in memory storage'); }
  async getChangeOrdersByProject(projectId: number): Promise<ChangeOrder[]> { return []; }
  async getChangeOrdersByContact(contactId: number): Promise<ChangeOrder[]> { return []; }
  async updateChangeOrder(id: number, updateData: any): Promise<ChangeOrder | undefined> { return undefined; }
  async approveChangeOrder(id: number, approvedBy: number): Promise<ChangeOrder | undefined> { return undefined; }
  async rejectChangeOrder(id: number, rejectedBy: number): Promise<ChangeOrder | undefined> { return undefined; }
  async createProjectPhoto(photoData: any): Promise<ProjectPhoto> { throw new Error('Not implemented in memory storage'); }
  async getProjectPhotos(projectId: number, role?: string): Promise<ProjectPhoto[]> { return []; }
  async updatePhotoVisibility(photoId: number, visibleToClient: boolean): Promise<ProjectPhoto | undefined> { return undefined; }
  async approvePhoto(photoId: number, approvedBy: number): Promise<ProjectPhoto | undefined> { return undefined; }
  async deleteProjectPhoto(photoId: number): Promise<boolean> { return false; }
  async getSubcontractorProjects(subcontractorId: number): Promise<Project[]> { 
    // Development logging removed
    
    // Find projects where subcontractor has tasks or bids
    const subcontractorTasks = this.projectTasks.filter((task: any) => 
      task.subcontractorId === subcontractorId || task.contactId === subcontractorId
    );
    
    const subcontractorBids = this.bidResponses.filter((bid: any) => 
      bid.subcontractorId === subcontractorId || bid.contactId === subcontractorId
    );
    
    const projectIds = [
      ...subcontractorTasks.map((task: any) => task.projectId),
      ...subcontractorBids.map((bid: any) => {
        const bidProcess = this.bidProcesses.find((bp: any) => bp.id === bid.bidProcessId);
        return bidProcess?.projectId;
      }).filter(Boolean)
    ];
    
    const uniqueProjectIds = [...new Set(projectIds)];
    const projects = this.projects.filter((project: any) => uniqueProjectIds.includes(project.id));
    
    // Development logging removed
    return projects;
  }
  
  async getSubcontractorBids(subcontractorId: number): Promise<BidResponse[]> { 
    // Development logging removed
    
    const bids = this.bidResponses.filter((bid: any) => 
      bid.subcontractorId === subcontractorId || bid.contactId === subcontractorId
    );
    
    // Development logging removed
    return bids;
  }
  
  async getSubcontractorJobs(subcontractorId: number): Promise<ProjectTask[]> { 
    // Development logging removed
    
    const jobs = this.projectTasks.filter((task: any) => 
      task.subcontractorId === subcontractorId || task.contactId === subcontractorId
    );
    
    // Development logging removed
    return jobs;
  }
  async getSubcontractorInvoices(subcontractorId: number): Promise<Invoice[]> { 
    return this.invoices.filter(invoice => invoice.contactId === subcontractorId);
  }
  
  async getSubcontractorPurchaseOrders(subcontractorId: number): Promise<PurchaseOrder[]> { 
    // Development logging removed
    
    const pos = this.purchaseOrders.filter((po: any) => 
      po.subcontractorId === subcontractorId || po.contactId === subcontractorId
    );
    
    // Development logging removed
    return pos;
  }
  
  async getSubcontractorProgressPhotos(subcontractorId: number): Promise<ProjectPhoto[]> { 
    // Development logging removed
    
    const photos = this.projectPhotos.filter((photo: any) => 
      photo.uploadedBy === subcontractorId || photo.subcontractorId === subcontractorId
    );
    
    // Development logging removed
    return photos;
  }
  
  async getSubcontractorSchedule(subcontractorId: number): Promise<ProjectTask[]> { 
    // Development logging removed
    
    const scheduleTasks = this.projectTasks.filter((task: any) => 
      task.subcontractorId === subcontractorId || task.contactId === subcontractorId
    );
    
    // Development logging removed
    return scheduleTasks;
  }
  
  async createProgressPhoto(photoData: any): Promise<ProjectPhoto> {
    // Development logging removed
    
    const photo = {
      id: Date.now(),
      ...photoData,
      createdAt: new Date().toISOString(),
      status: 'pending'
    };
    
    this.projectPhotos.push(photo);
    await this.saveData();
    
    // Development logging removed
    return photo;
  }









  async updateBidResponseAttachments(bidResponseId: number, attachments: any[]): Promise<boolean> {
    const bidResponseIndex = this.bidResponses.findIndex((br: any) => br.id === bidResponseId);
    
    if (bidResponseIndex === -1) {
      // Development logging removed
      return false;
    }

    this.bidResponses[bidResponseIndex].attachments = attachments;
    this.bidResponses[bidResponseIndex].updatedAt = new Date().toISOString();
    
    this.saveData();
    // Development logging removed
    return true;
  }

  async createSubcontractorInvoice(invoiceData: any): Promise<any> {
    const invoice = {
      id: this.invoices.length + 1,
      ...invoiceData,
      createdAt: new Date().toISOString()
    };

    this.invoices.push(invoice);
    this.saveData();
    
    // Development logging removed
    return invoice;
  }
  
  async getProjectTeam(projectId: number): Promise<Contact[]> { return []; }
  async getAllActiveTasks(): Promise<ProjectTask[]> {
    const activeTasks = this.projectTasks.filter(task => 
      task.status !== 'cancelled' && task.status !== 'completed'
    );
    // Development logging removed
    return activeTasks;
  }
  async bulkUpdateProjectTasks(projectId: number, tasks: any[]): Promise<ProjectTask[]> {
    const updatedTasks: ProjectTask[] = [];
    
    for (const taskUpdate of tasks) {
      const existingTaskIndex = this.projectTasks.findIndex(t => t.id === taskUpdate.id);
      
      if (existingTaskIndex !== -1) {
        // Update existing task
        this.projectTasks[existingTaskIndex] = {
          ...this.projectTasks[existingTaskIndex],
          ...taskUpdate,
          updatedAt: new Date().toISOString()
        };
        updatedTasks.push(this.projectTasks[existingTaskIndex]);
      } else {
        // Create new task
        const newTask = await this.createProjectTask({ ...taskUpdate, projectId });
        updatedTasks.push(newTask);
      }
    }
    
    this.saveData();
    // Success operation completed
    return updatedTasks;
  }

  // ===============================================
  // NEW AUTOMATED INVOICE CREATION METHODS
  // ===============================================

  /**
   * Auto-generate invoice from completed and signed Purchase Order
   */
  async autoGenerateInvoiceFromPO(poId: number, linkedJobId?: number): Promise<Invoice | undefined> {
    const po = this.purchaseOrders.find(p => p.id === poId);
    if (!po) {
      console.error(`❌ PO not found: ${poId}`);
      return undefined;
    }

    // Check if PO qualifies for invoice generation
    if (!await this.checkPOForInvoiceGeneration(poId)) {
      // Development logging removed
      return undefined;
    }

    // Check if invoice already exists for this PO
    const existingInvoice = this.invoices.find(inv => inv.poId === poId);
    if (existingInvoice) {
      // Development logging removed
      return existingInvoice;
    }

    // Get subcontractor details
    const subcontractor = this.contacts.find(c => c.id === po.contactId);
    if (!subcontractor) {
      console.error(`❌ Subcontractor not found for PO: ${po.contactId}`);
      return undefined;
    }

    // Generate unique invoice ID
    const invoiceId = `INV-${po.projectId}-${Date.now()}`;
    const invoiceNumber = `${invoiceId.replace('INV-', 'SKYE-')}`;

    // Calculate due date (30 days from creation)
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 30);

    // Create auto-generated invoice
    const newInvoice = {
      id: this.nextId++,
      invoiceId: invoiceId,
      projectId: po.projectId,
      contactId: po.contactId,
      poId: po.id,
      invoiceNumber: invoiceNumber,
      description: `Auto-generated invoice for ${po.trade} work - PO #${po.poNumber}`,
      amount: po.amount,
      trade: po.trade,
      workPeriod: `PO Completion - ${new Date().toLocaleDateString()}`,
      materials: JSON.stringify([]),
      labor: JSON.stringify([]),
      attachments: JSON.stringify([]),
      submittedDate: new Date(),
      dueDate: dueDate,
      status: 'pending_approval',
      approvedBy: null,
      approvedAt: null,
      approvedByAdminAt: null,
      payments: JSON.stringify([]),
      totalPaid: 0,
      remainingBalance: po.amount,
      isAutoGenerated: true,
      linkedJobId: linkedJobId || null,
      notes: `Auto-generated from completed Purchase Order #${po.poNumber}`,
      paidAt: null,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.invoices.push(newInvoice);
    this.saveData();

    // Success operation completed
    return newInvoice;
  }

  /**
   * Check if PO qualifies for invoice generation
   */
  async checkPOForInvoiceGeneration(poId: number): Promise<boolean> {
    const po = this.purchaseOrders.find(p => p.id === poId);
    if (!po) return false;

    // Must be signed by subcontractor
    if (po.status !== 'signed') {
      // Development logging removed
      return false;
    }

    // Check if linked job/task is complete (if applicable)
    if (po.linkedJobId) {
      const linkedTask = this.projectTasks.find(t => t.id === po.linkedJobId);
      if (linkedTask && linkedTask.status !== 'Complete') {
        // Development logging removed
        return false;
      }
    }

    return true;
  }

  /**
   * Update invoice status and trigger automated workflows
   */
  async updateInvoiceStatus(invoiceId: number, status: string): Promise<Invoice | undefined> {
    const invoice = this.invoices.find(inv => inv.id === invoiceId);
    if (!invoice) return undefined;

    const oldStatus = invoice.status;
    invoice.status = status;
    invoice.updatedAt = new Date();

    // Update specific timestamps based on status
    if (status === 'approved' && oldStatus !== 'approved') {
      invoice.approvedAt = new Date();
    }
    if (status === 'paid_in_full' && oldStatus !== 'paid_in_full') {
      invoice.paidAt = new Date();
    }

    this.saveData();
    // Success operation completed
    return invoice;
  }

  /**
   * Get payment records for an invoice
   */
  async getInvoicePayments(invoiceId: number): Promise<any[]> {
    return this.invoicePayments.filter(payment => payment.invoiceId === invoiceId);
  }

  // ===============================================
  // COMPLIANCE VALIDATION METHODS
  // ===============================================

  /**
   * Validate subcontractor compliance status
   */
  async validateSubcontractorCompliance(contactId: number): Promise<boolean> {
    const contact = this.contacts.find(c => c.id === contactId);
    if (!contact || contact.role !== 'subcontractor') {
      return false;
    }

    // Check W-9 is current
    const w9Current = contact.w9FileUrl && contact.w9ExpirationDate && 
      new Date(contact.w9ExpirationDate) > new Date();

    // Check Insurance is current
    const insuranceCurrent = contact.insuranceFileUrl && contact.insuranceExpirationDate && 
      new Date(contact.insuranceExpirationDate) > new Date();

    // Check Agreement is signed
    const agreementSigned = contact.agreementSigned === true;

    return w9Current && insuranceCurrent && agreementSigned;
  }

  /**
   * Get detailed compliance status for a subcontractor
   */
  async validateSubcontractorComplianceDetails(contactId: number): Promise<{
    w9Status: string;
    w9Current: boolean;
    insuranceStatus: string;
    insuranceCurrent: boolean;
    agreementSigned: boolean;
    missingRequirements: string[];
  }> {
    const contact = this.contacts.find(c => c.id === contactId);
    if (!contact || contact.role !== 'subcontractor') {
      return {
        w9Status: 'missing',
        w9Current: false,
        insuranceStatus: 'missing',
        insuranceCurrent: false,
        agreementSigned: false,
        missingRequirements: ['All compliance documents']
      };
    }

    const now = new Date();
    
    // Check W-9 status
    let w9Status = 'missing';
    let w9Current = false;
    if (contact.w9FileUrl && contact.w9ExpirationDate) {
      const w9ExpDate = new Date(contact.w9ExpirationDate);
      if (w9ExpDate > now) {
        w9Status = 'current';
        w9Current = true;
      } else {
        w9Status = 'expired';
      }
    }

    // Check Insurance status
    let insuranceStatus = 'missing';
    let insuranceCurrent = false;
    if (contact.insuranceFileUrl && contact.insuranceExpirationDate) {
      const insuranceExpDate = new Date(contact.insuranceExpirationDate);
      if (insuranceExpDate > now) {
        insuranceStatus = 'current';
        insuranceCurrent = true;
      } else {
        insuranceStatus = 'expired';
      }
    }

    // Check Agreement
    const agreementSigned = contact.agreementSigned === true;

    // Determine missing requirements
    const missingRequirements: string[] = [];
    if (!w9Current) {
      if (w9Status === 'missing') {
        missingRequirements.push('W-9 Form');
      } else if (w9Status === 'expired') {
        missingRequirements.push('Current W-9 Form (expired)');
      }
    }
    if (!insuranceCurrent) {
      if (insuranceStatus === 'missing') {
        missingRequirements.push('Insurance Certificate');
      } else if (insuranceStatus === 'expired') {
        missingRequirements.push('Current Insurance Certificate (expired)');
      }
    }
    if (!agreementSigned) {
      missingRequirements.push('Subcontractor Agreement');
    }

    return {
      w9Status,
      w9Current,
      insuranceStatus,
      insuranceCurrent,
      agreementSigned,
      missingRequirements
    };
  }

  /**
   * Record a new payment for an invoice
   */
  async recordInvoicePayment(invoiceId: number, paymentData: any): Promise<boolean> {
    const invoice = this.invoices.find(inv => inv.id === invoiceId);
    if (!invoice) {
      console.error(`❌ Invoice not found: ${invoiceId}`);
      return false;
    }

    // Create payment record
    const payment = {
      id: this.nextId++,
      invoiceId: invoiceId,
      amount: parseFloat(paymentData.amount),
      paymentDate: new Date(paymentData.paymentDate || new Date()),
      paymentMethod: paymentData.paymentMethod || 'Bank Transfer',
      checkNumber: paymentData.checkNumber || null,
      referenceNumber: paymentData.referenceNumber || null,
      notes: paymentData.notes || '',
      recordedBy: paymentData.recordedBy || 1,
      createdAt: new Date()
    };

    this.invoicePayments.push(payment);

    // Update invoice totals
    await this.calculateInvoiceBalance(invoiceId);

    // Development logging removed
    return true;
  }

  /**
   * Calculate total paid and remaining balance for an invoice
   */
  async calculateInvoiceBalance(invoiceId: number): Promise<{ totalPaid: number; remainingBalance: number }> {
    const invoice = this.invoices.find(inv => inv.id === invoiceId);
    if (!invoice) {
      return { totalPaid: 0, remainingBalance: 0 };
    }

    const payments = await this.getInvoicePayments(invoiceId);
    const totalPaid = payments.reduce((sum, payment) => sum + parseFloat(payment.amount), 0);
    const remainingBalance = invoice.amount - totalPaid;

    // Update invoice totals
    invoice.totalPaid = totalPaid;
    invoice.remainingBalance = remainingBalance;

    // Update status based on payment
    let newStatus = invoice.status;
    if (totalPaid >= invoice.amount) {
      newStatus = 'paid_in_full';
      invoice.paidAt = new Date();
    } else if (totalPaid > 0) {
      newStatus = 'partial_paid';
    }

    if (newStatus !== invoice.status) {
      invoice.status = newStatus;
    }

    invoice.updatedAt = new Date();
    this.saveData();

    return { totalPaid, remainingBalance };
  }

  /**
   * Get invoices by status
   */
  async getInvoicesByStatus(status: string): Promise<Invoice[]> {
    return this.invoices.filter(invoice => invoice.status === status);
  }

  /**
   * Approve invoice for payment (Admin/PM action)
   */
  async approveInvoiceForPayment(invoiceId: number, approvedBy: number): Promise<Invoice | undefined> {
    const invoice = this.invoices.find(inv => inv.id === invoiceId);
    if (!invoice) return undefined;

    invoice.status = 'approved';
    invoice.approvedBy = approvedBy;
    invoice.approvedAt = new Date();
    invoice.approvedByAdminAt = new Date();
    invoice.updatedAt = new Date();

    this.saveData();

    // Success operation completed
    return invoice;
  }
  async autoGenerateProjectTasks(projectId: number): Promise<ProjectTask[]> { return []; }
  
  async setDefaultWeatherLocation(id: number): Promise<boolean> {
    // First, set all locations to non-default
    this.weatherLocations.forEach(location => {
      location.isDefault = false;
    });

    // Then, find and set the specified location as default
    const targetLocation = this.weatherLocations.find(location => location.id === id);
    if (targetLocation) {
      targetLocation.isDefault = true;
      this.saveData();
      // Development logging removed
      return true;
    }

    console.error(`❌ Weather location with ID ${id} not found`);
    return false;
  }

  /**
   * Get detailed bid response information including contractor details and attachments
   */
  async getBidResponseDetails(bidResponseId: number): Promise<any> {
    const bidResponse = this.bidResponses.find(br => br.id === bidResponseId);
    if (!bidResponse) {
      return null;
    }

    // Get contractor information
    const contractor = this.contacts.find(c => c.id === bidResponse.contactId);
    
    // Get related estimate item
    const estimateItem = await this.getEstimateItemById(bidResponse.estimateItemId);
    
    // Get related project
    let project = null;
    if (estimateItem) {
      for (const estimate of this.estimates) {
        if (estimate.categories) {
          for (const category of estimate.categories) {
            if (category.items && category.items.some((item: any) => item.id === bidResponse.estimateItemId)) {
              project = this.projects.find(p => p.id === estimate.projectId);
              break;
            }
          }
        }
        if (project) break;
      }
    }

    return {
      id: bidResponse.id,
      bidAmount: bidResponse.bidAmount,
      timeline: bidResponse.timeline,
      notes: bidResponse.notes,
      attachments: bidResponse.attachments || [],
      status: bidResponse.status,
      submittedAt: bidResponse.createdAt,
      awardedAt: bidResponse.awardedAt,
      contractor: {
        id: contractor?.id,
        name: contractor?.name,
        company: contractor?.company,
        email: contractor?.email,
        phone: contractor?.phone,
        trade: contractor?.trade
      },
      estimateItem: {
        id: estimateItem?.id,
        trade: estimateItem?.trade,
        description: estimateItem?.description,
        estimatedCost: estimateItem?.estimatedCost
      },
      project: {
        id: project?.id,
        name: project?.name,
        clientName: project?.clientName
      }
    };
  }

  /**
   * Get estimate item by ID from categories structure
   */
  async getEstimateItemById(estimateItemId: number): Promise<any> {
    for (const estimate of this.estimates) {
      if (estimate.categories) {
        for (const category of estimate.categories) {
          if (category.items) {
            const item = category.items.find((item: any) => item.id === estimateItemId);
            if (item) {
              return item;
            }
          }
        }
      }
    }
    return null;
  }

  // Auto Invoice Creation System
  private async checkAndCreateAutoInvoice(po: any): Promise<void> {
    try {
      // Search/lookup operation
      
      // Only create invoice if PO is signed
      if (po.status !== 'signed') {
        // Development logging removed
        return;
      }

      // Check if invoice already exists for this PO
      const existingInvoice = this.invoices.find(inv => inv.poId === po.id);
      if (existingInvoice) {
        // Development logging removed
        return;
      }

      // Check if there's a linked task/job that's complete
      const linkedTask = this.projectTasks.find(task => 
        task.projectId === po.projectId && 
        task.trade === po.trade &&
        task.status === 'completed'
      );

      if (!linkedTask) {
        // Development logging removed
        return;
      }

      // Success operation completed

      // Generate unique invoice ID and number
      const invoiceId = `INV-${Date.now()}`;
      const invoiceNumber = `${po.projectId}-${String(this.invoices.length + 1).padStart(3, '0')}`;

      // Calculate due date (14 days from now)
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 14);

      // Create the auto-generated invoice
      const autoInvoice = {
        id: this.nextId++,
        invoiceId,
        projectId: po.projectId,
        contactId: po.contactId,
        poId: po.id,
        invoiceNumber,
        description: `Auto-generated invoice for ${po.trade} work - ${po.description}`,
        amount: po.amount,
        trade: po.trade,
        workPeriod: `Work completed as of ${new Date().toLocaleDateString()}`,
        materials: JSON.stringify([]),
        labor: JSON.stringify([{
          description: `${po.trade} work completion`,
          hours: linkedTask.duration * 8, // Assume 8 hours per day
          rate: po.amount / (linkedTask.duration * 8),
          total: po.amount
        }]),
        attachments: JSON.stringify([]),
        submittedDate: new Date().toISOString(),
        dueDate: dueDate.toISOString(),
        status: 'draft',
        isAutoGenerated: true,
        linkedJobId: linkedTask.id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        totalPaid: 0,
        remainingBalance: po.amount
      };

      // Add to invoices array
      this.invoices.push(autoInvoice);

      // Target operation completed
      // Development logging removed
      // Development logging removed
      // Development logging removed
      // Development logging removed

      // Mark PO as having invoice created
      po.invoiceCreated = true;
      po.autoInvoiceId = autoInvoice.id;

    } catch (error) {
      console.error('❌ Error creating auto-invoice:', error);
    }
  }



  // Messaging methods (simplified implementation)
  async getMessageThreadsByProject(projectId?: number): Promise<any[]> {
    // Development logging removed
    // Return empty array for now - messaging system needs full implementation
    return [];
  }

  // Financial analysis methods
  async getBudgetVarianceAnalysis(projectId: number): Promise<any> {
    // Development logging removed
    
    const project = this.projects.find(p => p.id === projectId);
    if (!project) return null;

    const projectPOs = this.purchaseOrders.filter(po => po.projectId === projectId);
    const projectInvoices = this.invoices.filter(inv => inv.projectId === projectId);
    const projectPayments = this.clientPayments.filter(pay => pay.projectId === projectId);

    const totalBudgeted = project.totalBudget || 0;
    const totalCommitted = projectPOs.reduce((sum, po) => sum + po.amount, 0);
    const totalInvoiced = projectInvoices.reduce((sum, inv) => sum + inv.amount, 0);
    const totalReceived = projectPayments.reduce((sum, pay) => sum + pay.amount, 0);

    return {
      projectId,
      totalBudgeted,
      totalCommitted,
      totalInvoiced,
      totalReceived,
      commitmentVariance: totalBudgeted - totalCommitted,
      invoiceVariance: totalCommitted - totalInvoiced,
      cashPosition: totalReceived - totalInvoiced,
      profitMargin: totalReceived - totalCommitted
    };
  }

  async getApprovedBids(projectId: number): Promise<any[]> {
    // Development logging removed
    return this.bidResponses.filter(bid => 
      bid.projectId === projectId && bid.status === 'awarded'
    );
  }

  async getCashFlowForecasts(projectId: number): Promise<any> {
    // Development logging removed
    
    const projectPOs = this.purchaseOrders.filter(po => po.projectId === projectId);
    const projectInvoices = this.invoices.filter(inv => inv.projectId === projectId);
    const projectPayments = this.clientPayments.filter(pay => pay.projectId === projectId);

    const totalCommitted = projectPOs.reduce((sum, po) => sum + po.amount, 0);
    const totalInvoiced = projectInvoices.reduce((sum, inv) => sum + inv.amount, 0);
    const totalReceived = projectPayments.reduce((sum, pay) => sum + pay.amount, 0);

    return {
      projectId,
      forecastData: {
        committed: totalCommitted,
        invoiced: totalInvoiced,
        received: totalReceived,
        pendingInvoices: totalCommitted - totalInvoiced,
        pendingCollections: totalInvoiced - totalReceived,
        projectedCashFlow: totalReceived - totalCommitted
      }
    };
  }

  // Missing financial methods needed by frontend
  async getEnhancedSummary(): Promise<any> {
    // Development logging removed
    
    const totalRevenue = this.clientPayments.reduce((sum, pay) => sum + pay.amount, 0);
    const totalExpenses = this.invoices.reduce((sum, inv) => sum + inv.amount, 0);
    const totalProjects = this.projects.length;
    const activeProjects = this.projects.filter(p => p.status === 'active').length;

    return {
      totalProjects,
      activeProjects,
      totalRevenue,
      totalExpenses,
      netProfit: totalRevenue - totalExpenses,
      lastUpdated: new Date().toISOString()
    };
  }

  async getProfitabilityTrends(): Promise<any> {
    // Development logging removed
    
    const trends = this.projects.map(project => {
      const projectRevenue = this.clientPayments
        .filter(pay => pay.projectId === project.id)
        .reduce((sum, pay) => sum + pay.amount, 0);
      const projectExpenses = this.invoices
        .filter(inv => inv.projectId === project.id)
        .reduce((sum, inv) => sum + inv.amount, 0);
      
      return {
        projectId: project.id,
        projectName: project.name,
        revenue: projectRevenue,
        expenses: projectExpenses,
        profit: projectRevenue - projectExpenses,
        profitMargin: projectRevenue > 0 ? ((projectRevenue - projectExpenses) / projectRevenue) * 100 : 0,
        month: new Date().toISOString().slice(0, 7)
      };
    });

    return {
      trends,
      totalProfit: trends.reduce((sum, t) => sum + t.profit, 0),
      avgProfitMargin: trends.length > 0 ? trends.reduce((sum, t) => sum + t.profitMargin, 0) / trends.length : 0,
      lastUpdated: new Date().toISOString()
    };
  }





  async getCashFlowAnalysis(projectId: number): Promise<any> {
    // Development logging removed
    
    const project = this.projects.find(p => p.id === projectId);
    if (!project) return null;

    const projectPOs = this.purchaseOrders.filter(po => po.projectId === projectId);
    const projectInvoices = this.invoices.filter(inv => inv.projectId === projectId);
    const projectPayments = this.clientPayments.filter(pay => pay.projectId === projectId);

    const totalRevenue = projectPayments.reduce((sum, pay) => sum + pay.amount, 0);
    const totalExpenses = projectInvoices.reduce((sum, inv) => sum + inv.amount, 0);
    const totalCommitments = projectPOs.reduce((sum, po) => sum + po.amount, 0);

    return {
      projectId,
      totalRevenue,
      totalExpenses,
      totalCommitments,
      netCashFlow: totalRevenue - totalExpenses,
      projectedProfit: totalRevenue - totalCommitments,
      cashPosition: totalRevenue - totalExpenses
    };
  }

  // Company-wide financial analysis methods
  async getCompanyCashFlowAnalysis(): Promise<any> {
    // Development logging removed
    
    const allProjects = this.projects;
    const allPOs = this.purchaseOrders;
    const allInvoices = this.invoices;
    const allPayments = this.clientPayments;

    // Calculate totals across all projects
    const totalRevenue = allPayments.reduce((sum, pay) => sum + pay.amount, 0);
    const totalExpenses = allInvoices.reduce((sum, inv) => sum + inv.amount, 0);
    const totalCommitments = allPOs.reduce((sum, po) => sum + po.amount, 0);
    
    // Calculate receivables (project budgets minus payments received)
    const totalReceivables = allProjects.reduce((sum, project) => {
      const projectPayments = allPayments
        .filter(payment => payment.projectId === project.id)
        .reduce((total, payment) => total + payment.amount, 0);
      return sum + (project.budget || 0) - projectPayments;
    }, 0);

    // Calculate outstanding invoices
    const outstandingInvoices = allInvoices
      .filter(invoice => invoice.status !== 'paid')
      .reduce((sum, invoice) => sum + (invoice.balanceRemaining || invoice.amount), 0);

    // Calculate monthly trends (last 6 months)
    const monthlyTrends = Array.from({ length: 6 }, (_, i) => {
      const date = new Date();
      date.setMonth(date.getMonth() - (5 - i));
      const monthName = date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      
      const monthPayments = allPayments
        .filter(payment => {
          if (!payment.paymentDate) return false;
          const paymentDate = new Date(payment.paymentDate);
          return paymentDate.getMonth() === date.getMonth() && 
                 paymentDate.getFullYear() === date.getFullYear();
        })
        .reduce((sum, payment) => sum + payment.amount, 0);

      const monthExpenses = allInvoices
        .filter(invoice => {
          if (!invoice.paidAt && !invoice.createdAt) return false;
          const paidDate = new Date(invoice.paidAt || invoice.createdAt);
          return paidDate.getMonth() === date.getMonth() && 
                 paidDate.getFullYear() === date.getFullYear();
        })
        .reduce((sum, invoice) => sum + invoice.amount, 0);

      return {
        month: monthName,
        revenue: monthPayments,
        expenses: monthExpenses,
        profit: monthPayments - monthExpenses,
        netCashFlow: monthPayments - monthExpenses
      };
    });

    // Calculate 30-day cash flow projection
    const projectedCashFlow = Array.from({ length: 30 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() + i);
      
      // Estimate daily cash flow based on project timelines and payment schedules
      const projectedInflow = totalReceivables / 30; // Simplified daily receivables
      const projectedOutflow = outstandingInvoices / 30; // Simplified daily expenses
      
      return {
        date: date.toISOString().split('T')[0],
        inflow: projectedInflow,
        outflow: projectedOutflow,
        netFlow: projectedInflow - projectedOutflow
      };
    });

    return {
      summary: {
        totalRevenue,
        totalExpenses,
        totalCommitments,
        totalReceivables,
        outstandingInvoices,
        netCashFlow: totalRevenue - totalExpenses,
        projectedProfit: totalReceivables - totalCommitments,
        workingCapital: totalRevenue - outstandingInvoices
      },
      monthlyTrends,
      projectedCashFlow,
      healthMetrics: {
        profitMargin: totalRevenue > 0 ? ((totalRevenue - totalExpenses) / totalRevenue) * 100 : 0,
        collectionEfficiency: totalReceivables > 0 ? (totalRevenue / (totalRevenue + totalReceivables)) * 100 : 100,
        cashRatio: totalExpenses > 0 ? (totalRevenue / totalExpenses) : 0,
        commitmentRatio: totalRevenue > 0 ? (totalCommitments / totalRevenue) : 0
      }
    };
  }

  async getCompanyFinancialSummary(): Promise<any> {
    // Development logging removed
    
    const cashFlowAnalysis = await this.getCompanyCashFlowAnalysis();
    const activeProjects = this.projects.filter(p => p.status === 'active' || p.status === 'in_progress');
    
    return {
      ...cashFlowAnalysis,
      projectCount: {
        active: activeProjects.length,
        total: this.projects.length,
        completed: this.projects.filter(p => p.status === 'completed').length
      },
      lastUpdated: new Date().toISOString()
    };
  }

  async getAutomatedPurchaseOrders(projectId: number): Promise<any[]> {
    // Development logging removed
    return this.purchaseOrders.filter(po => 
      po.projectId === projectId && po.automated === true
    );
  }

  async getCashFlowForecast(projectId: string) {
    return this.getCashFlowForecasts(parseInt(projectId));
  }

  // Client portal specific methods
  async getPurchaseOrdersByProject(projectId: number): Promise<any[]> {
    // Development logging removed
    return this.purchaseOrders.filter(po => po.projectId === projectId);
  }

  async getInvoicesByProject(projectId: number): Promise<any[]> {
    // Development logging removed
    return this.invoices.filter(inv => inv.projectId === projectId);
  }

  async getEstimatesByProject(projectId: number): Promise<any[]> {
    // Development logging removed
    try {
      const data = await this.loadData();
      return data.estimates.filter((est: any) => est.projectId === projectId);
    } catch (error) {
      console.error('Error getting estimates by project:', error);
      return [];
    }
  }

  // System Settings Management
  async getSystemSetting(key: string): Promise<any> {
    const setting = this.systemSettings.find(s => s.settingKey === key);
    return setting || null;
  }

  async setSystemSetting(key: string, value: string, options?: { type?: string; description?: string; [key: string]: any }): Promise<any> {
    const existingIndex = this.systemSettings.findIndex(s => s.settingKey === key);
    
    const settingData = {
      id: existingIndex >= 0 ? this.systemSettings[existingIndex].id : this.nextId++,
      settingKey: key,
      settingValue: value,
      settingType: options?.type || 'text',
      description: options?.description || null,
      updatedBy: null, // TODO: Add user context
      updatedAt: new Date(),
      ...options
    };

    if (existingIndex >= 0) {
      this.systemSettings[existingIndex] = settingData;
    } else {
      this.systemSettings.push(settingData);
    }

    this.saveData();
    return settingData;
  }

  async deleteSystemSetting(key: string): Promise<boolean> {
    const index = this.systemSettings.findIndex(s => s.settingKey === key);
    if (index === -1) return false;

    this.systemSettings.splice(index, 1);
    this.saveData();
    return true;
  }

  // Company branding methods
  async getCompanyBranding(): Promise<{ logoUrl?: string; [key: string]: any }> {
    return this.companyBranding;
  }

  async updateCompanyBranding(brandingData: { logoUrl?: string | null; [key: string]: any }): Promise<{ logoUrl?: string; [key: string]: any }> {
    this.companyBranding = {
      ...this.companyBranding,
      ...brandingData
    };
    
    // If logoUrl is explicitly null, remove it
    if (brandingData.logoUrl === null) {
      delete this.companyBranding.logoUrl;
    }
    
    this.saveData();
    return this.companyBranding;
  }

  // Update project budget based on approved estimates
  async updateProjectBudgetFromApprovedEstimates(projectId: number): Promise<Project | undefined> {
    // Development logging removed
    
    // Get all estimates for this project
    const projectEstimates = this.estimates.filter(e => e.projectId === projectId);
    // Development logging removed
    
    let totalApprovedAmount = 0;
    let approvedEstimatesCount = 0;
    
    // Calculate sum of all approved estimates
    for (const estimate of projectEstimates) {
      if (estimate.status === 'Client Signed' || estimate.status === 'Approved') {
        if (estimate.categories && Array.isArray(estimate.categories)) {
          for (const category of estimate.categories) {
            if (category.items && Array.isArray(category.items)) {
              for (const item of category.items) {
                if (item.status === 'Approved') {
                  // Calculate total cost including markup and contingency
                  const baseCost = item.estimatedCost || 0;
                  const markupAmount = baseCost * ((item.markup || 0) / 100);
                  const contingencyAmount = (baseCost + markupAmount) * ((item.contingency || 0) / 100);
                  const itemTotal = baseCost + markupAmount + contingencyAmount;
                  
                  totalApprovedAmount += itemTotal;
                  // Development logging removed
                }
              }
            }
          }
        }
        approvedEstimatesCount++;
      }
    }
    
    // Development logging removed
    
    // Only update project budget if we have approved estimates
    if (totalApprovedAmount > 0) {
      const projectIndex = this.projects.findIndex(p => p.id === projectId);
      if (projectIndex !== -1) {
        const oldBudget = this.projects[projectIndex].estimatedBudget;
        this.projects[projectIndex] = {
          ...this.projects[projectIndex],
          estimatedBudget: totalApprovedAmount,
          updatedAt: new Date()
        };
        
        this.saveData();
        // Success operation completed
        return this.projects[projectIndex];
      }
    }
    
    // Development logging removed
    return undefined;
  }
}

export const storage = new MemoryStorage();