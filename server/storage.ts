import { type Project, type InsertProject, type Estimate, type InsertEstimate, type EstimateCategory, type InsertEstimateCategory, type EstimateItem, type InsertEstimateItem, type Bid, type InsertBid, type BidProcess, type InsertBidProcess, type BidResponse, type InsertBidResponse, type Contact, type InsertContact, type PurchaseOrder, type InsertPurchaseOrder, type Invoice, type InsertInvoice, type ProjectTask, type InsertProjectTask, type ClientPayment, type InsertClientPayment, type ProjectBudgetSummary, type ProjectDocument, type InsertProjectDocument, type ProjectPhoto, type InsertProjectPhoto, type ChangeOrder, type InsertChangeOrder, type WeatherLocation, type InsertWeatherLocation, type ScheduleSection, type InsertScheduleSection, type ScheduleTemplate, type InsertScheduleTemplate, type TaskDependency, type User, type InsertUser } from "@shared/schema";
import { MemoryStorage } from './memory-storage';
import { db } from './db';
import { projects, estimates, estimateCategories, estimateItems, bids, bidItems, contacts, purchaseOrders, invoices, projectTasks, clientPayments, projectDocuments, projectPhotos, changeOrders, weatherLocations, scheduleSections, users, bidProcesses, bidResponses, taskDependencies, scheduleTemplates } from "@shared/schema";
import { eq, desc, and, or, gte, lte, lt, isNotNull, inArray, asc, sql, not } from 'drizzle-orm';
import { cacheService, CacheKeys, CacheTTL } from './utils/redisClient';

export interface IStorage {
  createProject(projectData: any): Promise<Project>;
  getProjects(): Promise<Project[]>;
  getProject(id: number): Promise<Project | undefined>;
  updateProject(id: number, updateData: any): Promise<Project | undefined>;
  deleteProject(id: number): Promise<boolean>;
  archiveProject(id: number): Promise<boolean>;
  createEstimate(estimateData: any): Promise<Estimate>;
  getAllEstimates(): Promise<Estimate[]>;
  getEstimatesByProject(projectId: number): Promise<Estimate[]>;
  updateEstimate(id: number, updateData: any): Promise<Estimate | undefined>;
  deleteEstimate(estimateId: number): Promise<boolean>;
  deleteEstimateItem(itemId: number): Promise<boolean>;
  createBid(bidData: any): Promise<Bid>;
  getAllBids(): Promise<Bid[]>;
  getBidsByProject(projectId: number): Promise<Bid[]>;
  acceptBid(bidId: number): Promise<Bid | undefined>;
  updateEstimateItemStatus(estimateId: number, itemId: number, status: string): Promise<boolean>;
  updateEstimateItem(itemId: number, updateData: any): Promise<EstimateItem | undefined>;
  getEstimateCategories(estimateId: number): Promise<any[]>;
  // New bidding process methods
  createBidProcess(bidProcessData: any): Promise<BidProcess>;
  getBidProcessesByProject(projectId: number): Promise<BidProcess[]>;
  getBidProcessByEstimateItem(estimateItemId: number): Promise<BidProcess | undefined>;
  getBidInvitationsByEstimateItem(estimateItemId: string): Promise<any[]>;
  getBidResponsesByEstimateItem(estimateItemId: string): Promise<any[]>;
  deleteBidProcessByEstimateItem(estimateItemId: number): Promise<boolean>;
  createBidResponse(bidResponseData: any): Promise<BidResponse>;
  getBidResponsesByProcess(bidProcessId: number): Promise<BidResponse[]>;
  getBidResponsesBySubcontractor(subcontractorId: number): Promise<BidResponse[]>;
  getBidResponsesByProject(projectId: number): Promise<any[]>;
  awardBidResponse(bidResponseId: number, estimateItemId: number): Promise<BidResponse | undefined>;
  sendBidReminder(bidProcessId: number, contactId: number): Promise<boolean>;
  selectWinningBid(bidResponseId: number): Promise<BidResponse | undefined>;
  createContact(contactData: any): Promise<Contact>;
  getAllContacts(): Promise<Contact[]>;
  getContactsPaginated(page: number, limit: number, search: string): Promise<{ contacts: Contact[], totalCount: number, page: number, limit: number, totalPages: number, hasMore: boolean }>;
  getContactById(id: number): Promise<Contact | undefined>;
  getContactByEmail(email: string): Promise<Contact | undefined>;
  updateContact(id: number, updateData: any): Promise<Contact | undefined>;
  deleteContact(id: number): Promise<boolean>;
  deleteAllContacts(): Promise<number>;
  getContactsWithExpiringInsurance(): Promise<Contact[]>;
  getSubcontractorsByTrade(trade: string): Promise<Contact[]>;
  validateSubcontractorCompliance(contactId: number): Promise<boolean>;
  validateSubcontractorComplianceDetails(contactId: number): Promise<{ isCompliant: boolean; missingRequirements: string[] }>;
  // Trades management methods
  getAllTrades(): Promise<any[]>;
  createTrade(tradeData: any): Promise<any>;
  updateTrade(id: number, updateData: any): Promise<any>;
  deleteTrade(id: number): Promise<boolean>;
  getTradeCategories(): Promise<string[]>;
  createBidInvitation(invitationData: any): Promise<any>;
  getAllBidProcesses(): Promise<BidProcess[]>;
  getAllBidResponses(): Promise<BidResponse[]>;
  deleteBidResponse(bidResponseId: number): Promise<boolean>;
  getAllBidInvitations(): Promise<any[]>;
  // Purchase Order methods
  createPurchaseOrder(poData: any): Promise<PurchaseOrder>;
  getPurchaseOrdersByProject(projectId: number): Promise<PurchaseOrder[]>;
  getPurchaseOrdersByContact(contactId: number): Promise<PurchaseOrder[]>;
  updatePurchaseOrder(id: number, updateData: any): Promise<PurchaseOrder | undefined>;
  signPurchaseOrder(id: number, contactId: number, signature: string): Promise<PurchaseOrder | undefined>;
  sendPurchaseOrderToSubcontractor(id: number): Promise<PurchaseOrder | undefined>;
  cancelPurchaseOrder(id: number, reason: string): Promise<PurchaseOrder | undefined>;
  deletePurchaseOrder(id: number): Promise<boolean>;
  getApprovedEstimateItems(projectId: number): Promise<EstimateItem[]>;
  createPurchaseOrderFromEstimate(poData: any): Promise<PurchaseOrder>;
  // Global schedule methods
  getProjectsByIds(projectIds: number[]): Promise<Project[]>;
  // Project manager methods
  getProjectManagers(): Promise<{ id: string; name: string; email: string }[]>;
  // Invoice methods
  createInvoice(invoiceData: any): Promise<Invoice>;
  getInvoicesByProject(projectId: number): Promise<Invoice[]>;
  getInvoicesByContact(contactId: number): Promise<Invoice[]>;
  getAllInvoices(): Promise<Invoice[]>;
  updateInvoice(id: number, updateData: any): Promise<Invoice | undefined>;
  approveInvoice(id: number, approvedBy: number): Promise<Invoice | undefined>;
  // Enhanced payment tracking methods
  addPaymentToInvoice(invoiceId: number, paymentData: any): Promise<Invoice | undefined>;
  getAvailablePOsForInvoice(projectId: number): Promise<PurchaseOrder[]>;
  linkInvoiceToPO(invoiceId: number, poId: number): Promise<boolean>;
  updatePOPaymentStatus(poId: number): Promise<PurchaseOrder | undefined>;
  calculatePOBalances(): Promise<void>;
  // New automated invoice creation methods
  autoGenerateInvoiceFromPO(poId: number, linkedJobId?: number): Promise<Invoice | undefined>;
  checkPOForInvoiceGeneration(poId: number): Promise<boolean>;
  // Cross-portal deletion methods
  deleteBidResponse(bidResponseId: number): Promise<boolean>;
  // Messaging methods
  getMessageThreadsByProject(projectId?: number): Promise<any[]>;
  updateInvoiceStatus(invoiceId: number, status: string): Promise<Invoice | undefined>;
  getInvoicePayments(invoiceId: number): Promise<any[]>;
  recordInvoicePayment(invoiceId: number, paymentData: any): Promise<boolean>;
  calculateInvoiceBalance(invoiceId: number): Promise<{ totalPaid: number; remainingBalance: number }>;
  getInvoicesByStatus(status: string): Promise<Invoice[]>;
  approveInvoiceForPayment(invoiceId: number, approvedBy: number): Promise<Invoice | undefined>;
  // Project Schedule/Task methods
  createProjectTask(taskData: any): Promise<ProjectTask>;
  getProjectTasks(projectId: number): Promise<ProjectTask[]>;
  getProjectTasksForSubcontractor(projectId: number, contactId: number): Promise<ProjectTask[]>;
  getProjectDependencies(projectId: number): Promise<any[]>;
  createTaskDependency(dependencyData: any): Promise<TaskDependency>;
  deleteTaskDependency(dependencyId: number): Promise<boolean>;
  updateProjectTask(id: number, updateData: any): Promise<ProjectTask | undefined>;
  updateTaskStatus(taskId: number, status: string): Promise<ProjectTask | undefined>;
  deleteProjectTask(id: number): Promise<boolean>;
  autoGenerateSchedule(projectId: number, projectStartDate: string, createdBy: number): Promise<ProjectTask[]>;
  
  // Schedule Template methods
  createScheduleTemplate(templateData: InsertScheduleTemplate): Promise<ScheduleTemplate>;
  getScheduleTemplates(createdBy?: number): Promise<ScheduleTemplate[]>;
  getScheduleTemplateById(id: number): Promise<ScheduleTemplate | undefined>;
  copyScheduleFromTemplate(templateId: number, targetProjectId: number, projectStartDate: string): Promise<{ tasks: ProjectTask[], dependencies: TaskDependency[] }>;
  updateScheduleTemplate(id: number, updateData: Partial<InsertScheduleTemplate>): Promise<ScheduleTemplate | undefined>;
  deleteScheduleTemplate(id: number): Promise<boolean>;
  incrementTemplateUsage(templateId: number): Promise<void>;
  // Budget methods
  createClientPayment(paymentData: any): Promise<ClientPayment>;
  getClientPaymentsByProject(projectId: number): Promise<ClientPayment[]>;
  getAllClientPayments(): Promise<ClientPayment[]>;
  updateClientPayment(id: number, updateData: any): Promise<ClientPayment | undefined>;
  deleteClientPayment(id: number): Promise<boolean>;
  getProjectBudgetSummary(projectId: number): Promise<ProjectBudgetSummary | undefined>;
  updateProjectBudgetSummary(projectId: number): Promise<ProjectBudgetSummary>;
  updateProjectBudgetFromApprovedEstimates(projectId: number): Promise<Project | undefined>;
  // Document methods
  createProjectDocument(documentData: any): Promise<ProjectDocument>;
  getProjectDocuments(projectId: number): Promise<ProjectDocument[]>;
  getProjectDocument(id: number): Promise<ProjectDocument | undefined>;
  updateProjectDocument(id: number, updateData: any): Promise<ProjectDocument | undefined>;
  deleteProjectDocument(id: number): Promise<boolean>;
  // Change Order methods
  createChangeOrder(changeOrderData: any): Promise<ChangeOrder>;
  getChangeOrdersByProject(projectId: number): Promise<ChangeOrder[]>;
  // Missing methods that routes.ts needs
  createTask(taskData: any): Promise<ProjectTask>;
  getBidItems(bidId: number): Promise<any[]>;
  getAllBidInvitations(): Promise<any[]>;
  getBidInvitationsByProject(projectId: number): Promise<any[]>;
  getBidInvitationsBySubcontractor(subcontractorId: number): Promise<any[]>;
  getBidResponseDetails(responseId: number): Promise<any>;
  getEstimatesByProjectId(projectId: number): Promise<Estimate[]>;
  updateBidStatus(bidId: number, status: string): Promise<any>;
  updateBidProcess(processId: number, updateData: any): Promise<BidProcess | undefined>;
  getSubcontractorSchedule(subcontractorId: number): Promise<any[]>;
  getSubcontractorPurchaseOrders(subcontractorId: number): Promise<PurchaseOrder[]>;
  getSubcontractorProgressPhotos(subcontractorId: number): Promise<any[]>;
  createProgressPhoto(photoData: any): Promise<any>;
  updateBidResponseAttachments(responseId: number, attachments: any[]): Promise<BidResponse | undefined>;
  getProjectEstimates(projectId: number): Promise<Estimate[]>;
  getSystemSetting(key: string): Promise<any>;
  setSystemSetting(key: string, value: any): Promise<any>;
  deleteSystemSetting(key: string): Promise<boolean>;
  getContact(id: number): Promise<Contact | undefined>;
  getChangeOrdersByContact(contactId: number): Promise<ChangeOrder[]>;
  updateChangeOrder(id: number, updateData: any): Promise<ChangeOrder | undefined>;
  approveChangeOrder(id: number, approvedBy: number): Promise<ChangeOrder | undefined>;
  rejectChangeOrder(id: number, rejectedBy: number): Promise<ChangeOrder | undefined>;
  // Photo methods
  createProjectPhoto(photoData: any): Promise<ProjectPhoto>;
  getProjectPhotos(projectId: number, role?: string): Promise<ProjectPhoto[]>;
  // Task methods
  getAllTasks(): Promise<ProjectTask[]>;
  // Purchase Order methods  
  getAllPurchaseOrders(): Promise<PurchaseOrder[]>;
  updatePhotoVisibility(photoId: number, visibleToClient: boolean): Promise<ProjectPhoto | undefined>;
  approvePhoto(photoId: number, approvedBy: number): Promise<ProjectPhoto | undefined>;
  deleteProjectPhoto(photoId: number): Promise<boolean>;
  
  // Subcontractor Portal methods
  getSubcontractorProjects(subcontractorId: number): Promise<Project[]>;
  getSubcontractorBids(subcontractorId: number): Promise<BidResponse[]>;
  getSubcontractorJobs(subcontractorId: number): Promise<ProjectTask[]>;
  getSubcontractorInvoices(subcontractorId: number): Promise<Invoice[]>;
  
  // Client Portal methods
  getProjectTeam(projectId: number): Promise<Contact[]>;
  // Timeline builder methods
  getAllActiveTasks(): Promise<ProjectTask[]>;
  bulkUpdateProjectTasks(projectId: number, tasks: any[]): Promise<ProjectTask[]>;
  autoGenerateProjectTasks(projectId: number): Promise<ProjectTask[]>;
  
  // Weather location methods
  getWeatherLocations(): Promise<WeatherLocation[]>;
  createWeatherLocation(data: InsertWeatherLocation): Promise<WeatherLocation>;
  updateWeatherLocation(id: number, data: Partial<InsertWeatherLocation>): Promise<WeatherLocation | undefined>;
  deleteWeatherLocation(id: number): Promise<boolean>;
  setDefaultWeatherLocation(id: number): Promise<boolean>;
  
  // Financial analysis methods (missing from interface)
  getBudgetVarianceAnalysis(projectId?: number): Promise<any>;
  getCashFlowAnalysis(projectId?: number): Promise<any>;
  getEnhancedSummary(): Promise<any>;
  getProfitabilityTrends(): Promise<any>;
  getApprovedBids(projectId: number): Promise<any[]>;
  getCashFlowForecasts(projectId: number): Promise<any>;
  getAutomatedPurchaseOrders(projectId?: number): Promise<any>;
  getCompanyCashFlowAnalysis(): Promise<any>;
  getAllPurchaseOrders(): Promise<PurchaseOrder[]>;
  
  // Company branding methods
  getCompanyBranding(): Promise<{ logoUrl?: string; [key: string]: any }>;
  updateCompanyBranding(brandingData: { logoUrl?: string | null; [key: string]: any }): Promise<{ logoUrl?: string; [key: string]: any }>;
  
  // User management methods
  getAllUsers(): Promise<User[]>;
  getUserById(id: number): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByFirebaseUid(firebaseUid: string): Promise<User | undefined>;
  createUser(userData: InsertUser): Promise<User>;
  createOrUpdateUserFromFirebase(firebaseUser: { uid: string; email: string; name?: string; displayName?: string }): Promise<User>;
  updateUser(id: number, updateData: Partial<InsertUser>): Promise<User | undefined>;
  updateUserRole(id: number, role: string): Promise<User | undefined>;
  updateUserStatus(id: number, isActive: boolean): Promise<User | undefined>;
  deleteUser(id: number): Promise<boolean>;
}

// DatabaseStorage class - implements IStorage using PostgreSQL
export class DatabaseStorage implements IStorage {
  private parseDate(dateValue: any): Date | null {
    if (!dateValue) return null;
    if (dateValue instanceof Date) return dateValue;
    if (typeof dateValue === 'string') {
      const parsed = new Date(dateValue);
      return isNaN(parsed.getTime()) ? null : parsed;
    }
    return null;
  }

  async createProject(projectData: any): Promise<Project> {
    // Map the frontend data to the database schema
    const dbProject = {
      name: projectData.name || projectData.projectName, // Handle both field names
      description: projectData.description || projectData.notes,
      clientName: projectData.clientName,
      clientEmail: projectData.clientEmail,
      clientPhone: projectData.clientPhone,
      address: projectData.address || projectData.projectAddress,
      squareFootage: projectData.squareFootage || 0,
      estimatedBudget: projectData.estimatedBudget || projectData.targetBudget || 0,
      status: projectData.status || 'planning',
      startDate: this.parseDate(projectData.startDate),
      targetCompletion: this.parseDate(projectData.targetCompletion || projectData.estimatedFinishDate),
      notes: projectData.notes || projectData.description || '',
      projectMetadata: typeof projectData.projectMetadata === 'string' ? projectData.projectMetadata : JSON.stringify({
        projectType: projectData.projectType,
        assignedProjectManager: projectData.assignedProjectManager,
        costPerSqft: projectData.costPerSqft,
        contingencyPercent: projectData.contingencyPercent,
        contractorFeePercent: projectData.contractorFeePercent,
        clientId: projectData.clientId,
        createdBy: projectData.createdBy
      })
    };

    const [project] = await db
      .insert(projects)
      .values(dbProject)
      .returning();
    return project;
  }

  async getProjects(): Promise<Project[]> {
    // Try cache first
    const cached = await cacheService.get(CacheKeys.ALL_PROJECTS);
    if (cached) {
      return JSON.parse(cached);
    }

    // Fetch from database
    const result = await db
      .select()
      .from(projects)
      .orderBy(desc(projects.createdAt));

    // Cache for 60 seconds
    await cacheService.set(CacheKeys.ALL_PROJECTS, JSON.stringify(result), CacheTTL.LONG);
    
    return result;
  }

  async getProject(id: number): Promise<Project | undefined> {
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, id));
    return project || undefined;
  }

  async updateProject(id: number, updateData: any): Promise<Project | undefined> {
    const [updatedProject] = await db
      .update(projects)
      .set({
        name: updateData.name,
        description: updateData.description,
        clientName: updateData.clientName,
        clientEmail: updateData.clientEmail,
        clientPhone: updateData.clientPhone,
        address: updateData.address,
        squareFootage: updateData.squareFootage,
        estimatedBudget: updateData.estimatedBudget,
        status: updateData.status,
        startDate: updateData.startDate ? new Date(updateData.startDate) : null,
        targetCompletion: updateData.targetCompletion ? new Date(updateData.targetCompletion) : null,
        projectMetadata: updateData.projectMetadata,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, id))
      .returning();
    return updatedProject || undefined;
  }

  async deleteProject(id: number): Promise<boolean> {
    try {
      // Delete related records first
      await db.delete(estimateItems).where(
        eq(estimateItems.categoryId, 
          db.select({ id: estimateCategories.id }).from(estimateCategories)
            .where(eq(estimateCategories.estimateId, 
              db.select({ id: estimates.id }).from(estimates)
                .where(eq(estimates.projectId, id))
            ))
        )
      );
      
      await db.delete(estimateCategories).where(
        eq(estimateCategories.estimateId, 
          db.select({ id: estimates.id }).from(estimates)
            .where(eq(estimates.projectId, id))
        )
      );
      
      await db.delete(estimates).where(eq(estimates.projectId, id));
      await db.delete(bids).where(eq(bids.projectId, id));
      
      // Delete the project
      const result = await db.delete(projects).where(eq(projects.id, id));
      return (result.rowCount || 0) > 0;
    } catch (error) {
      // Silently handle project deletion errors in production
      return false;
    }
  }

  async archiveProject(id: number): Promise<boolean> {
    try {
      const [updatedProject] = await db
        .update(projects)
        .set({
          status: 'archived',
          updatedAt: new Date(),
        })
        .where(eq(projects.id, id))
        .returning();
      return !!updatedProject;
    } catch (error) {
      return false;
    }
  }

  async createEstimate(estimateData: any): Promise<Estimate> {
    try {
      // Development logging removed);
      
      const [estimate] = await db
        .insert(estimates)
        .values({
          projectId: estimateData.projectId,
          name: estimateData.name || 'Untitled Estimate',
          description: estimateData.description,
          totalCost: estimateData.totalCost || 0,
          totalDuration: estimateData.totalDuration || 0,
          status: 'pending',
        })
        .returning();

      // Success operation completed

      // Create categories and items
      if (estimateData.categories && estimateData.categories.length > 0) {
        for (let i = 0; i < estimateData.categories.length; i++) {
          const category = estimateData.categories[i];
          // Development logging removed
          
          // Creating category with normalized structure
          const [createdCategory] = await db
            .insert(estimateCategories)
            .values({
              estimateId: estimate.id,
              name: category.name || category.categoryName || `Category ${i + 1}`,
              orderIndex: i,
            })
            .returning();

          // Success operation completed

          if (category.items && category.items.length > 0) {
            for (let j = 0; j < category.items.length; j++) {
              const item = category.items[j];
              // Development logging removed
              
              const [createdItem] = await db.insert(estimateItems).values({
                categoryId: createdCategory.id,
                title: item.title || item.trade || `Item ${j + 1}`,
                trade: item.trade || 'Unknown Trade',
                vendor: item.vendor || '',
                description: item.description || '',
                estimatedCost: Number(item.estimatedCost) || 0,
                markup: Number(item.markup) || 0,
                contingency: Number(item.contingency) || 0,
                duration: Number(item.duration) || 0,
                status: item.status || 'Estimating',
                costType: item.costType || 'subcontractor',
                requiresBid: item.requiresBid !== undefined ? item.requiresBid : true,
                orderIndex: j,
              }).returning();
              
              // Success operation completed
            }
          }
        }
      }

      // Success operation completed
      return estimate;
    } catch (error) {
      console.error('❌ Error creating estimate:', error);
      throw error;
    }
  }

  async deleteEstimate(estimateId: number): Promise<boolean> {
    try {
      // Delete estimate items first (due to foreign key constraints)
      const categories = await db
        .select()
        .from(estimateCategories)
        .where(eq(estimateCategories.estimateId, estimateId));

      for (const category of categories) {
        await db
          .delete(estimateItems)
          .where(eq(estimateItems.categoryId, category.id));
      }

      // Delete estimate categories
      await db
        .delete(estimateCategories)
        .where(eq(estimateCategories.estimateId, estimateId));

      // Delete the estimate
      const result = await db
        .delete(estimates)
        .where(eq(estimates.id, estimateId))
        .returning();

      return result.length > 0;
    } catch (error) {
      
      return false;
    }
  }

  async deleteEstimateItem(itemId: number): Promise<boolean> {
    try {
      const result = await db
        .delete(estimateItems)
        .where(eq(estimateItems.id, itemId))
        .returning();

      return result.length > 0;
    } catch (error) {
      
      return false;
    }
  }

  async getAllEstimates(): Promise<any[]> {
    // Get estimates with their categories and items
    const estimatesWithData = await db
      .select({
        id: estimates.id,
        projectId: estimates.projectId,
        name: estimates.name,
        description: estimates.description,
        totalCost: estimates.totalCost,
        totalDuration: estimates.totalDuration,
        status: estimates.status,
        createdAt: estimates.createdAt,
        updatedAt: estimates.updatedAt,
      })
      .from(estimates)
      .orderBy(desc(estimates.createdAt));

    // For each estimate, get categories and items
    const result = [];
    for (const estimate of estimatesWithData) {
      const categories = await db
        .select()
        .from(estimateCategories)
        .where(eq(estimateCategories.estimateId, estimate.id))
        .orderBy(estimateCategories.orderIndex);

      const categoriesWithItems = [];
      for (const category of categories) {
        const items = await db
          .select()
          .from(estimateItems)
          .where(eq(estimateItems.categoryId, category.id))
          .orderBy(estimateItems.orderIndex);

        categoriesWithItems.push({
          ...category,
          categoryName: category.name,
          items: items,
        });
      }

      result.push({
        ...estimate,
        trade: estimate.name, // For backward compatibility
        estimatedAmount: estimate.totalCost, // For backward compatibility
        laborHours: estimate.totalDuration, // For backward compatibility
        notes: JSON.stringify(categoriesWithItems), // For backward compatibility with frontend
        categories: categoriesWithItems,
      });
    }

    return result;
  }

  async getEstimate(id: number): Promise<any | undefined> {
    // Get single estimate with categories and items
    const [estimate] = await db
      .select({
        id: estimates.id,
        projectId: estimates.projectId,
        name: estimates.name,
        description: estimates.description,
        totalCost: estimates.totalCost,
        totalDuration: estimates.totalDuration,
        status: estimates.status,
        createdAt: estimates.createdAt,
        updatedAt: estimates.updatedAt,
      })
      .from(estimates)
      .where(eq(estimates.id, id));

    if (!estimate) {
      return undefined;
    }

    // Get categories and items for this estimate
    const categories = await db
      .select()
      .from(estimateCategories)
      .where(eq(estimateCategories.estimateId, estimate.id))
      .orderBy(estimateCategories.orderIndex);

    const categoriesWithItems = [];
    for (const category of categories) {
      const items = await db
        .select()
        .from(estimateItems)
        .where(eq(estimateItems.categoryId, category.id))
        .orderBy(estimateItems.orderIndex);

      categoriesWithItems.push({
        ...category,
        categoryName: category.name,
        items: items,
      });
    }

    return {
      ...estimate,
      trade: estimate.name, // For backward compatibility
      estimatedAmount: estimate.totalCost, // For backward compatibility
      laborHours: estimate.totalDuration, // For backward compatibility
      notes: JSON.stringify(categoriesWithItems), // For backward compatibility with frontend
      categories: categoriesWithItems,
    };
  }

  async getEstimatesByProject(projectId: number): Promise<any[]> {
    // Get estimates with their categories and items for a specific project
    const estimatesWithData = await db
      .select({
        id: estimates.id,
        projectId: estimates.projectId,
        name: estimates.name,
        description: estimates.description,
        totalCost: estimates.totalCost,
        totalDuration: estimates.totalDuration,
        status: estimates.status,
        createdAt: estimates.createdAt,
        updatedAt: estimates.updatedAt,
      })
      .from(estimates)
      .where(eq(estimates.projectId, projectId))
      .orderBy(desc(estimates.createdAt));

    // For each estimate, get categories and items
    const result = [];
    for (const estimate of estimatesWithData) {
      const categories = await db
        .select()
        .from(estimateCategories)
        .where(eq(estimateCategories.estimateId, estimate.id))
        .orderBy(estimateCategories.orderIndex);

      const categoriesWithItems = [];
      for (const category of categories) {
        const items = await db
          .select()
          .from(estimateItems)
          .where(eq(estimateItems.categoryId, category.id))
          .orderBy(estimateItems.orderIndex);

        categoriesWithItems.push({
          ...category,
          categoryName: category.name,
          items: items,
        });
      }

      result.push({
        ...estimate,
        trade: estimate.name, // For backward compatibility
        estimatedAmount: estimate.totalCost, // For backward compatibility
        laborHours: estimate.totalDuration, // For backward compatibility
        notes: JSON.stringify(categoriesWithItems), // For backward compatibility with frontend
        categories: categoriesWithItems,
      });
    }

    return result;
  }

  async updateEstimate(id: number, updateData: any): Promise<Estimate | undefined> {
    // First update the main estimate
    const [updatedEstimate] = await db
      .update(estimates)
      .set({
        name: updateData.name,
        description: updateData.description,
        totalCost: updateData.totalCost,
        totalDuration: updateData.totalDuration,
        updatedAt: new Date(),
      })
      .where(eq(estimates.id, id))
      .returning();

    // If categories are provided, update the normalized structure
    if (updateData.categories && Array.isArray(updateData.categories)) {
      // Delete existing categories and items
      await db.delete(estimateItems)
        .where(inArray(estimateItems.categoryId, 
          db.select({ id: estimateCategories.id })
            .from(estimateCategories)
            .where(eq(estimateCategories.estimateId, id))
        ));
      
      await db.delete(estimateCategories)
        .where(eq(estimateCategories.estimateId, id));

      // Insert new categories and items
      for (let categoryIndex = 0; categoryIndex < updateData.categories.length; categoryIndex++) {
        const category = updateData.categories[categoryIndex];
        
        const [createdCategory] = await db
          .insert(estimateCategories)
          .values({
            estimateId: id,
            name: category.name || `Category ${categoryIndex + 1}`,
            orderIndex: categoryIndex,
          })
          .returning();

        // Insert items for this category
        if (category.items && Array.isArray(category.items)) {
          for (let itemIndex = 0; itemIndex < category.items.length; itemIndex++) {
            const item = category.items[itemIndex];
            
            await db.insert(estimateItems).values({
              categoryId: createdCategory.id,
              trade: item.trade || 'Unknown Trade',
              vendor: item.vendor || 'Unknown Vendor',
              estimatedCost: parseFloat(item.estimatedCost) || 0,
              markup: parseFloat(item.markup) || 0,
              contingency: parseFloat(item.contingency) || 0,
              duration: parseFloat(item.duration) || 0,
              description: item.description || '',
              status: item.status || 'Estimating',
              orderIndex: itemIndex,
            });
          }
        }
      }
    }

    return updatedEstimate || undefined;
  }

  async createBid(bidData: any): Promise<Bid> {
    const [bid] = await db
      .insert(bids)
      .values({
        projectId: bidData.projectId,
        estimateId: bidData.estimateId,
        contractorName: bidData.contractorName || bidData.subcontractorName,
        contractorEmail: bidData.contractorEmail,
        contractorPhone: bidData.contractorPhone,
        bidAmount: bidData.bidAmount || bidData.amount,
        timeline: bidData.timeline,
        notes: bidData.notes,
        status: 'pending',
      })
      .returning();
    
    // Automatically update estimate item status to "Bidding" when bid is created
    if (bidData.estimateItemId) {
      await this.updateEstimateItemStatus(bidData.estimateId, bidData.estimateItemId, 'Bidding');
    }
    
    return bid;
  }

  async updateEstimateItemStatus(estimateId: number, itemId: number, status: string): Promise<boolean> {
    try {
      const result = await db
        .update(estimateItems)
        .set({ status })
        .where(eq(estimateItems.id, itemId))
        .returning();
      
      // Development logging removed
      return result.length > 0;
    } catch (error) {
      console.error(`Error updating estimate item status:`, error);
      return false;
    }
  }

  async getEstimateCategories(estimateId: number): Promise<any[]> {
    try {
      const categories = await db
        .select()
        .from(estimateCategories)
        .where(eq(estimateCategories.estimateId, estimateId))
        .orderBy(estimateCategories.orderIndex);

      const categoriesWithItems = await Promise.all(
        categories.map(async (category) => {
          const items = await db
            .select()
            .from(estimateItems)
            .where(eq(estimateItems.categoryId, category.id))
            .orderBy(estimateItems.orderIndex);

          return {
            ...category,
            items
          };
        })
      );

      return categoriesWithItems;
    } catch (error) {
      console.error('Error fetching estimate categories:', error);
      return [];
    }
  }

  async sendEstimateToClient(estimateId: number): Promise<boolean> {
    try {
      // Development logging removed
      
      // Get categories and items count for logging
      const categoryIds = await db
        .select({ id: estimateCategories.id })
        .from(estimateCategories)
        .where(eq(estimateCategories.estimateId, estimateId));

      // Development logging removed

      let itemsUpdated = 0;
      if (categoryIds.length > 0) {
        const result = await db
          .update(estimateItems)
          .set({ status: 'Pending Client Approval' })
          .where(inArray(estimateItems.categoryId, categoryIds.map(c => c.id)))
          .returning();
          
        itemsUpdated = result.length;
        // Development logging removed
      }

      // Update estimate status to "Sent to Client"
      const estimateResult = await db
        .update(estimates)
        .set({ 
          status: 'Sent to Client',
          sentToClientAt: new Date().toISOString(),
          updatedAt: new Date()
        })
        .where(eq(estimates.id, estimateId))
        .returning();

      if (estimateResult.length > 0) {
        // Development logging removed
        // Development logging removed
        return true;
      } else {
        // Development logging removed
        return false;
      }
    } catch (error) {
      console.error('Error sending estimate to client:', error);
      return false;
    }
  }

  async updateEstimateSignatureStatus(estimateId: number, signed: boolean, signedDate?: Date): Promise<boolean> {
    try {
      await db
        .update(estimates)
        .set({ 
          status: signed ? 'signed' : 'sent',
          updatedAt: new Date()
        })
        .where(eq(estimates.id, estimateId));
      return true;
    } catch (error) {
      console.error('Error updating estimate signature status:', error);
      return false;
    }
  }



  async getAllBids(): Promise<Bid[]> {
    return await db
      .select()
      .from(bids)
      .orderBy(desc(bids.createdAt));
  }

  async getBidsByProject(projectId: number): Promise<Bid[]> {
    return await db
      .select()
      .from(bids)
      .where(eq(bids.projectId, projectId))
      .orderBy(desc(bids.createdAt));
  }

  async deleteBid(bidId: number): Promise<boolean> {
    try {
      const result = await db
        .delete(bids)
        .where(eq(bids.id, bidId))
        .returning();

      return result.length > 0;
    } catch (error) {
      
      return false;
    }
  }

  async deleteBidItem(bidItemId: number): Promise<boolean> {
    try {
      const result = await db
        .delete(bidItems)
        .where(eq(bidItems.id, bidItemId))
        .returning();

      return result.length > 0;
    } catch (error) {
      
      return false;
    }
  }

  async updateBid(bidId: number, updateData: any): Promise<Bid | undefined> {
    try {
      const [updatedBid] = await db
        .update(bids)
        .set({
          contractorName: updateData.contractorName,
          contractorEmail: updateData.contractorEmail,
          contractorPhone: updateData.contractorPhone,
          bidAmount: updateData.bidAmount,
          timeline: updateData.timeline,
          notes: updateData.notes,
          updatedAt: new Date(),
        })
        .where(eq(bids.id, bidId))
        .returning();

      return updatedBid;
    } catch (error) {
      
      return undefined;
    }
  }

  async updateBidItem(bidItemId: number, updateData: any): Promise<any> {
    try {
      const [updatedBidItem] = await db
        .update(bidItems)
        .set({
          subcontractorName: updateData.subcontractorName,
          contactEmail: updateData.contactEmail,
          contactPhone: updateData.contactPhone,
          bidAmount: updateData.bidAmount,
          timeline: updateData.timeline,
          notes: updateData.notes,
          updatedAt: new Date(),
        })
        .where(eq(bidItems.id, bidItemId))
        .returning();

      return updatedBidItem;
    } catch (error) {
      
      return undefined;
    }
  }

  async updateBidStatus(bidId: number, status: string): Promise<Bid | undefined> {
    const [updatedBid] = await db
      .update(bids)
      .set({ status, updatedAt: new Date() })
      .where(eq(bids.id, bidId))
      .returning();
    return updatedBid || undefined;
  }

  async acceptBid(bidId: number): Promise<Bid | undefined> {
    try {
      // Update bid status to accepted
      const [updatedBid] = await db
        .update(bids)
        .set({ status: 'accepted' })
        .where(eq(bids.id, bidId))
        .returning();

      if (updatedBid) {
        // Also update the estimate item status to "Waiting Approval"
        // This is a simplified version - finding the Manual J item to update
        await this.updateEstimateItemStatus(updatedBid.estimateId || 6, 6, 'Waiting Approval');
      }

      return updatedBid;
    } catch (error) {
      
      return undefined;
    }
  }

  async createContact(contactData: any): Promise<Contact> {
    const [contact] = await db
      .insert(contacts)
      .values({
        name: contactData.name,
        email: contactData.email,
        phone: contactData.phone,
        role: contactData.role,
        company: contactData.company,
        trade: contactData.trade,
        associatedProjects: JSON.stringify(contactData.associatedProjects || []),
        notes: contactData.notes,
        avatarUrl: contactData.avatarUrl,
        rating: contactData.rating || 0,
        tags: JSON.stringify(contactData.tags || []),
        address: contactData.address,
        city: contactData.city,
        state: contactData.state,
        zipCode: contactData.zipCode,
        lastContact: contactData.lastContact ? new Date(contactData.lastContact) : null,
        // Insurance fields (optional for non-subcontractors)
        insuranceProvider: contactData.insuranceProvider,
        insurancePolicyNumber: contactData.insurancePolicyNumber,
        insuranceExpirationDate: contactData.insuranceExpirationDate ? new Date(contactData.insuranceExpirationDate) : null,
        insuranceFileUrl: contactData.insuranceFileUrl,
        w9FileUrl: contactData.w9FileUrl,
        // Compliance tracking fields
        agreementSigned: contactData.agreementSigned || false,
        isCompliant: contactData.isCompliant || false,
      })
      .returning();
    return contact;
  }

  async getContactsPaginated(page: number = 1, limit: number = 50, search: string = ''): Promise<{ contacts: Contact[], totalCount: number, page: number, limit: number, totalPages: number, hasMore: boolean }> {
    try {
      const offset = (page - 1) * limit;
      
      // Build search condition
      let searchCondition = undefined;
      if (search.trim()) {
        const searchTerm = `%${search.toLowerCase()}%`;
        searchCondition = or(
          sql`LOWER(name) LIKE ${searchTerm}`,
          sql`LOWER(email) LIKE ${searchTerm}`,
          sql`LOWER(company) LIKE ${searchTerm}`,
          sql`LOWER(phone) LIKE ${searchTerm}`
        );
      }
      
      // Get total count
      const countQuery = searchCondition 
        ? sql`SELECT COUNT(*) as count FROM ${contacts} WHERE ${searchCondition}`
        : sql`SELECT COUNT(*) as count FROM ${contacts}`;
      const countResult = await db.execute(countQuery);
      const totalCount = parseInt(countResult.rows[0]?.count || '0');
      
      // Get paginated results
      const contactsQuery = searchCondition
        ? db.select().from(contacts).where(searchCondition).orderBy(desc(contacts.createdAt)).limit(limit).offset(offset)
        : db.select().from(contacts).orderBy(desc(contacts.createdAt)).limit(limit).offset(offset);
      
      const contactList = await contactsQuery;
      
      return {
        contacts: contactList,
        totalCount,
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit),
        hasMore: (offset + limit) < totalCount
      };
    } catch (error) {
      console.error('Error getting paginated contacts:', error);
      return {
        contacts: [],
        totalCount: 0,
        page,
        limit,
        totalPages: 0,
        hasMore: false
      };
    }
  }

  async getAllContacts(): Promise<Contact[]> {
    return await db
      .select()
      .from(contacts)
      .where(eq(contacts.isActive, true))
      .orderBy(desc(contacts.createdAt));
  }

  async getContactById(id: number): Promise<Contact | undefined> {
    const [contact] = await db
      .select()
      .from(contacts)
      .where(eq(contacts.id, id));
    return contact || undefined;
  }

  async getContactByEmail(email: string): Promise<Contact | undefined> {
    const [contact] = await db
      .select()
      .from(contacts)
      .where(eq(contacts.email, email));
    return contact || undefined;
  }

  async updateContact(id: number, updateData: any): Promise<Contact | undefined> {
    const [updatedContact] = await db
      .update(contacts)
      .set({
        name: updateData.name,
        email: updateData.email,
        phone: updateData.phone,
        role: updateData.role,
        company: updateData.company,
        trade: updateData.trade,
        associatedProjects: updateData.associatedProjects ? JSON.stringify(updateData.associatedProjects) : undefined,
        notes: updateData.notes,
        avatarUrl: updateData.avatarUrl,
        tags: updateData.tags ? JSON.stringify(updateData.tags) : undefined,
        address: updateData.address,
        city: updateData.city,
        state: updateData.state,
        zipCode: updateData.zipCode,
        lastContact: updateData.lastContact ? new Date(updateData.lastContact) : undefined,
        // Insurance fields
        insuranceProvider: updateData.insuranceProvider,
        insurancePolicyNumber: updateData.insurancePolicyNumber,
        insuranceExpirationDate: updateData.insuranceExpirationDate ? new Date(updateData.insuranceExpirationDate) : undefined,
        insuranceFileUrl: updateData.insuranceFileUrl,
        w9FileUrl: updateData.w9FileUrl,
        // Compliance tracking fields
        agreementSigned: updateData.agreementSigned !== undefined ? updateData.agreementSigned : undefined,
        isCompliant: updateData.isCompliant !== undefined ? updateData.isCompliant : undefined,
        updatedAt: new Date(),
      })
      .where(eq(contacts.id, id))
      .returning();
    return updatedContact || undefined;
  }

  async deleteContact(id: number): Promise<boolean> {
    const [deletedContact] = await db
      .update(contacts)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(contacts.id, id))
      .returning();
    return !!deletedContact;
  }

  async deleteAllContacts(): Promise<number> {
    const allContacts = await db.select().from(contacts);
    const count = allContacts.length;
    
    await db.delete(contacts);
    
    return count;
  }

  async getContactsWithExpiringInsurance(): Promise<Contact[]> {
    // Get the date 30 days from now
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    
    // Get today's date
    const today = new Date();
    
    return await db
      .select()
      .from(contacts)
      .where(
        and(
          eq(contacts.isActive, true),
          eq(contacts.role, 'subcontractor'),
          isNotNull(contacts.insuranceExpirationDate),
          lt(contacts.insuranceExpirationDate, thirtyDaysFromNow),
          gte(contacts.insuranceExpirationDate, today)
        )
      )
      .orderBy(contacts.insuranceExpirationDate);
  }

  async getSubcontractorsByTrade(trade: string): Promise<Contact[]> {
    return await db
      .select()
      .from(contacts)
      .where(
        and(
          eq(contacts.isActive, true),
          eq(contacts.role, 'subcontractor'),
          eq(contacts.trade, trade)
        )
      )
      .orderBy(contacts.name);
  }

  async validateSubcontractorCompliance(contactId: number): Promise<boolean> {
    const [contact] = await db
      .select()
      .from(contacts)
      .where(
        and(
          eq(contacts.id, contactId),
          eq(contacts.role, 'subcontractor'),
          eq(contacts.isActive, true)
        )
      );

    if (!contact) return false;

    // Check compliance requirements:
    // 1. Agreement must be signed
    // 2. Insurance must be current (not expired)
    // 3. W9 form must be uploaded
    const hasValidInsurance = contact.insuranceExpirationDate && 
      new Date(contact.insuranceExpirationDate) > new Date();
    
    return !!(
      contact.agreementSigned &&
      contact.w9FileUrl &&
      hasValidInsurance &&
      contact.isCompliant
    );
  }

  async validateSubcontractorComplianceDetails(contactId: number): Promise<{ isCompliant: boolean; missingRequirements: string[] }> {
    const [contact] = await db
      .select()
      .from(contacts)
      .where(
        and(
          eq(contacts.id, contactId),
          eq(contacts.role, 'subcontractor'),
          eq(contacts.isActive, true)
        )
      );

    if (!contact) {
      return { isCompliant: false, missingRequirements: ['Valid subcontractor record'] };
    }

    const missingRequirements: string[] = [];

    // Check each compliance requirement individually
    if (!contact.agreementSigned) {
      missingRequirements.push('Signed subcontractor agreement');
    }

    if (!contact.w9FileUrl) {
      missingRequirements.push('W-9 tax form');
    }

    const hasValidInsurance = contact.insuranceExpirationDate && 
      new Date(contact.insuranceExpirationDate) > new Date();
    
    if (!hasValidInsurance) {
      missingRequirements.push('Current liability insurance (not expired)');
    }

    if (!contact.isCompliant) {
      missingRequirements.push('Compliance verification status');
    }

    return {
      isCompliant: missingRequirements.length === 0,
      missingRequirements
    };
  }

  // New bidding process methods
  async createBidProcess(bidProcessData: any): Promise<BidProcess> {
    const [bidProcess] = await db
      .insert(bidProcesses)
      .values({
        projectId: bidProcessData.projectId,
        estimateItemId: bidProcessData.estimateItemId,
        trade: bidProcessData.trade,
        invitedSubcontractors: JSON.stringify(bidProcessData.invitedSubcontractors || []),
        selectedEstimateSnapshot: JSON.stringify(bidProcessData.selectedEstimateSnapshot || {}),
        status: 'Bidding',
      })
      .returning();

    return bidProcess;
  }

  async getBidProcessesByProject(projectId: number): Promise<BidProcess[]> {
    return await db
      .select()
      .from(bidProcesses)
      .where(eq(bidProcesses.projectId, projectId))
      .orderBy(desc(bidProcesses.createdAt));
  }

  async getBidProcessByEstimateItem(estimateItemId: number): Promise<BidProcess | undefined> {
    const [bidProcess] = await db
      .select()
      .from(bidProcesses)
      .where(eq(bidProcesses.estimateItemId, estimateItemId));
    
    return bidProcess;
  }

  async getBidInvitationsByEstimateItem(estimateItemId: string): Promise<any[]> {
    try {
      // For now, return empty array to prevent 404 errors
      // This method would normally return bid invitations for a specific estimate item
      return [];
    } catch (error) {
      console.error('Error getting bid invitations for item:', error);
      return [];
    }
  }

  async getBidResponsesByEstimateItem(estimateItemId: string): Promise<any[]> {
    try {
      // For now, return empty array to prevent 404 errors
      // This method would normally return bid responses for a specific estimate item
      return [];
    } catch (error) {
      console.error('Error getting bid responses for item:', error);
      return [];
    }
  }

  async deleteBidProcessByEstimateItem(estimateItemId: number): Promise<boolean> {
    try {
      // First check if bid process exists
      const existingBidProcess = await this.getBidProcessByEstimateItem(estimateItemId);
      
      if (!existingBidProcess) {
        // Development logging removed
        return false;
      }
      
      // Delete the bid process
      await db
        .delete(bidProcesses)
        .where(eq(bidProcesses.estimateItemId, estimateItemId));
      
      // Also reset the estimate item status back to "Estimating" if needed
      await db
        .update(estimateItems)
        .set({ status: 'Estimating' })
        .where(eq(estimateItems.id, estimateItemId));
      
      // Success operation completed
      return true;
    } catch (error) {
      console.error(`❌ Error deleting bid process for estimate item ${estimateItemId}:`, error);
      throw error;
    }
  }

  async createBidResponse(bidResponseData: any): Promise<BidResponse> {
    // Validate subcontractor compliance before allowing bid submission
    const isCompliant = await this.validateSubcontractorCompliance(
      bidResponseData.contactId || bidResponseData.subcontractorId
    );

    if (!isCompliant) {
      throw new Error('Subcontractor must be compliant (signed agreement, valid insurance, W9 on file) to submit bids');
    }

    const [bidResponse] = await db
      .insert(bidResponses)
      .values({
        bidProcessId: bidResponseData.bidProcessId,
        contactId: bidResponseData.contactId || bidResponseData.subcontractorId, // Support both field names
        bidAmount: bidResponseData.bidAmount,
        timeline: bidResponseData.timeline,
        notes: bidResponseData.notes,
        attachments: JSON.stringify(bidResponseData.attachments || []),
        status: 'submitted',
      })
      .returning();

    return bidResponse;
  }

  async getBidResponsesByProcess(bidProcessId: number): Promise<BidResponse[]> {
    return await db
      .select()
      .from(bidResponses)
      .where(eq(bidResponses.bidProcessId, bidProcessId))
      .orderBy(desc(bidResponses.submittedAt));
  }

  async getBidResponsesBySubcontractor(subcontractorId: number): Promise<BidResponse[]> {
    return await db
      .select()
      .from(bidResponses)
      .where(eq(bidResponses.contactId, subcontractorId))
      .orderBy(desc(bidResponses.submittedAt));
  }

  async getBidResponsesByProject(projectId: number): Promise<any[]> {
    try {
      const results = await db
        .select({
          id: bidResponses.id,
          bidProcessId: bidResponses.bidProcessId,
          contactId: bidResponses.contactId,
          bidAmount: bidResponses.bidAmount,
          timeline: bidResponses.timeline,
          notes: bidResponses.notes,
          attachments: bidResponses.attachments,
          status: bidResponses.status,
          submittedAt: bidResponses.submittedAt,
          updatedAt: bidResponses.updatedAt,
          estimateItemId: bidProcesses.estimateItemId,
        })
        .from(bidResponses)
        .innerJoin(bidProcesses, eq(bidResponses.bidProcessId, bidProcesses.id))
        .where(eq(bidProcesses.projectId, projectId))
        .orderBy(desc(bidResponses.submittedAt));
      
      return results;
    } catch (error) {
      console.error('Error fetching bid responses by project:', error);
      return [];
    }
  }

  // Send bid reminder to subcontractors
  async sendBidReminder(bidProcessId: number, message: string): Promise<any> {
    try {
      // Get bid process details
      const [bidProcess] = await db
        .select()
        .from(bidProcesses)
        .where(eq(bidProcesses.id, bidProcessId));

      if (!bidProcess) {
        throw new Error('Bid process not found');
      }

      // Get invited subcontractors
      const invitedSubcontractors = bidProcess.invitedSubcontractors || [];
      
      // Get subcontractor contact info
      const subcontractorContacts = await db
        .select()
        .from(contacts)
        .where(inArray(contacts.id, invitedSubcontractors));

      // Log reminder (in production, this would send emails/notifications)
      // Development logging removed
      // Development logging removed
      // Development logging removed.join(', '));

      // Update bid process with reminder timestamp
      await db
        .update(bidProcesses)
        .set({ 
          lastReminderSent: new Date(),
          updatedAt: new Date()
        })
        .where(eq(bidProcesses.id, bidProcessId));

      return {
        bidProcessId,
        recipientCount: subcontractorContacts.length,
        recipients: subcontractorContacts.map(c => ({ id: c.id, email: c.email, company: c.company })),
        message,
        sentAt: new Date()
      };
    } catch (error) {
      console.error('Error sending bid reminder:', error);
      throw error;
    }
  }

  // Close bidding process
  async closeBidProcess(bidProcessId: number): Promise<BidProcess | undefined> {
    try {
      const [closedProcess] = await db
        .update(bidProcesses)
        .set({ 
          status: 'closed',
          closedAt: new Date(),
          updatedAt: new Date()
        })
        .where(eq(bidProcesses.id, bidProcessId))
        .returning();

      return closedProcess;
    } catch (error) {
      console.error('Error closing bid process:', error);
      throw error;
    }
  }

  // Get available bids for subcontractor
  async getAvailableBidsForSubcontractor(subcontractorId: number): Promise<any[]> {
    try {
      // Get subcontractor's trade
      const [subcontractor] = await db
        .select()
        .from(contacts)
        .where(eq(contacts.id, subcontractorId));

      if (!subcontractor) {
        throw new Error('Subcontractor not found');
      }

      // Get open bid processes for this trade
      const openBidProcesses = await db
        .select({
          bidProcess: bidProcesses,
          project: projects,
          client: contacts
        })
        .from(bidProcesses)
        .innerJoin(projects, eq(bidProcesses.projectId, projects.id))
        .leftJoin(contacts, eq(projects.clientId, contacts.id))
        .where(
          and(
            eq(bidProcesses.trade, subcontractor.trade),
            eq(bidProcesses.status, 'open'),
            sql`${bidProcesses.invitedSubcontractors}::jsonb ? ${subcontractorId.toString()}`
          )
        );

      // Check if subcontractor has already submitted bids
      const submittedBids = await db
        .select({ bidProcessId: bidResponses.bidProcessId })
        .from(bidResponses)
        .where(eq(bidResponses.contactId, subcontractorId));

      const submittedBidProcessIds = submittedBids.map(b => b.bidProcessId);

      // Filter out already submitted bids
      return openBidProcesses
        .filter(bp => !submittedBidProcessIds.includes(bp.bidProcess.id))
        .map(bp => ({
          ...bp.bidProcess,
          projectName: bp.project.name,
          clientName: bp.client?.name || 'Unknown',
          projectAddress: bp.project.address || 'Address not provided'
        }));
    } catch (error) {
      console.error('Error fetching available bids:', error);
      throw error;
    }
  }

  // Get bid analytics for dashboard
  async getBidAnalytics(): Promise<any> {
    try {
      // Active bid processes
      const activeBidProcesses = await db
        .select()
        .from(bidProcesses)
        .where(eq(bidProcesses.status, 'open'));

      // Total bid responses
      const totalBidResponses = await db
        .select()
        .from(bidResponses);

      // Response rates by trade
      const responseRates = await db
        .select({
          trade: bidProcesses.trade,
          totalProcesses: sql`COUNT(DISTINCT ${bidProcesses.id})`.mapWith(Number),
          totalResponses: sql`COUNT(${bidResponses.id})`.mapWith(Number)
        })
        .from(bidProcesses)
        .leftJoin(bidResponses, eq(bidProcesses.id, bidResponses.bidProcessId))
        .groupBy(bidProcesses.trade);

      // Average bid amounts by trade
      const avgBidAmounts = await db
        .select({
          trade: bidProcesses.trade,
          avgAmount: sql`AVG(${bidResponses.bidAmount})`.mapWith(Number),
          minAmount: sql`MIN(${bidResponses.bidAmount})`.mapWith(Number),
          maxAmount: sql`MAX(${bidResponses.bidAmount})`.mapWith(Number)
        })
        .from(bidProcesses)
        .innerJoin(bidResponses, eq(bidProcesses.id, bidResponses.bidProcessId))
        .groupBy(bidProcesses.trade);

      // Overdue processes
      const overdueProcesses = activeBidProcesses.filter(bp => 
        new Date(bp.deadline) < new Date()
      );

      return {
        summary: {
          activeBidProcesses: activeBidProcesses.length,
          totalBidResponses: totalBidResponses.length,
          overdueProcesses: overdueProcesses.length,
          avgResponseRate: responseRates.length > 0 
            ? responseRates.reduce((sum, rate) => sum + (rate.totalResponses / Math.max(rate.totalProcesses, 1)), 0) / responseRates.length * 100 
            : 0
        },
        responseRates: responseRates.map(rate => ({
          trade: rate.trade,
          totalProcesses: rate.totalProcesses,
          totalResponses: rate.totalResponses,
          responseRate: (rate.totalResponses / Math.max(rate.totalProcesses, 1)) * 100
        })),
        avgBidAmounts: avgBidAmounts,
        overdueProcesses: overdueProcesses.map(bp => ({
          id: bp.id,
          trade: bp.trade,
          deadline: bp.deadline,
          daysOverdue: Math.ceil((new Date().getTime() - new Date(bp.deadline).getTime()) / (1000 * 60 * 60 * 24))
        }))
      };
    } catch (error) {
      console.error('Error fetching bid analytics:', error);
      throw error;
    }
  }

  async awardBidResponse(bidResponseId: number, estimateItemId: number): Promise<BidResponse | undefined> {
    try {
      // First, get the bid response to award
      const [bidToAward] = await db
        .select()
        .from(bidResponses)
        .where(eq(bidResponses.id, bidResponseId));

      if (!bidToAward) {
        throw new Error('Bid response not found');
      }

      // Update the awarded bid to 'awarded' status
      const [awardedBid] = await db
        .update(bidResponses)
        .set({ status: 'awarded', updatedAt: new Date() })
        .where(eq(bidResponses.id, bidResponseId))
        .returning();

      // Decline all other bids for the same estimate item
      await db
        .update(bidResponses)
        .set({ status: 'declined', updatedAt: new Date() })
        .where(
          and(
            eq(bidResponses.estimateItemId, estimateItemId),
            not(eq(bidResponses.id, bidResponseId))
          )
        );

      // Update the estimate item status to "Waiting Approval"
      if (bidToAward.estimateId) {
        await this.updateEstimateItemStatus(bidToAward.estimateId, estimateItemId, 'Waiting Approval');
      }

      return awardedBid;
    } catch (error) {
      console.error('Error awarding bid response:', error);
      throw error;
    }
  }



  async selectWinningBid(bidResponseId: number): Promise<BidResponse | undefined> {
    try {
      // Development logging removed
      
      // Get the bid response
      const [bidResponse] = await db
        .select()
        .from(bidResponses)
        .where(eq(bidResponses.id, bidResponseId));

      if (!bidResponse) {
        // Development logging removed
        return undefined;
      }

      // Success operation completed

      // Validate subcontractor compliance before awarding bid
      const isCompliant = await this.validateSubcontractorCompliance(bidResponse.contactId);
      if (!isCompliant) {
        throw new Error('Cannot award bid to non-compliant subcontractor. Ensure agreement is signed, insurance is current, and W9 is on file.');
      }

      // Update the selected bid response to 'awarded' status
      const [updatedResponse] = await db
        .update(bidResponses)
        .set({ status: 'awarded', updatedAt: new Date() })
        .where(eq(bidResponses.id, bidResponseId))
        .returning();

      // Development logging removed

      // Mark OTHER responses as rejected (fix the bug here)
      await db
        .update(bidResponses)
        .set({ status: 'rejected', updatedAt: new Date() })
        .where(
          and(
            eq(bidResponses.bidProcessId, bidResponse.bidProcessId),
            not(eq(bidResponses.id, bidResponseId)) // Fix: reject others, not the selected one
          )
        );

      // Success operation completed

      // Update the bid process status and winner
      await db
        .update(bidProcesses)
        .set({ 
          status: 'Awarded',
          winnerSubcontractorId: bidResponse.contactId,
          updatedAt: new Date()
        })
        .where(eq(bidProcesses.id, bidResponse.bidProcessId));

      // Development logging removed

      // Get the bid process to access estimate item information
      const [bidProcess] = await db
        .select()
        .from(bidProcesses)
        .where(eq(bidProcesses.id, bidResponse.bidProcessId));

      if (bidProcess && bidProcess.estimateItemId) {
        // Processing operation
        
        // Get subcontractor contact info for vendor field
        const [subcontractor] = await db
          .select()
          .from(contacts)
          .where(eq(contacts.id, bidResponse.contactId));

        const vendorName = subcontractor 
          ? (subcontractor.company || subcontractor.name || 'Unknown Vendor')
          : 'Unknown Vendor';

        // Development logging removed

        // Get current estimate item to preserve existing attachments
        const [currentEstimateItem] = await db
          .select()
          .from(estimateItems)
          .where(eq(estimateItems.id, bidProcess.estimateItemId));

        let updatedAttachments = currentEstimateItem?.attachments || [];

        // If bid response has attachments, merge them with existing ones
        if (bidResponse.attachments && bidResponse.attachments.length > 0) {
          // Development logging removed
          // Parse bid attachments and merge with existing
          const bidAttachments = Array.isArray(bidResponse.attachments) 
            ? bidResponse.attachments 
            : JSON.parse(bidResponse.attachments || '[]');
          
          updatedAttachments = [...updatedAttachments, ...bidAttachments];
        }

        // Update the estimate item with ALL winning bid information
        const updateData = {
          vendor: vendorName,
          estimatedCost: bidResponse.bidAmount,
          duration: bidResponse.timeline || currentEstimateItem?.duration || 1,
          status: 'Job Awarded', // Set to proper awarded status
          attachments: updatedAttachments,
          updatedAt: new Date(),
        };

        // Development logging removed

        await db
          .update(estimateItems)
          .set(updateData)
          .where(eq(estimateItems.id, bidProcess.estimateItemId));

        // Success operation completed
      } else {
        // Development logging removed
      }

      // Development logging removed
      
      // Trigger automatic project status transition to client_review
      try {
        const { ProjectWorkflowService } = await import('./services/ProjectWorkflowService');
        await ProjectWorkflowService.awardBid(updatedResponse.projectId || bidResponse.projectId, 'system');
      } catch (error) {
        console.error('Error triggering automatic status transition:', error);
      }
      
      return updatedResponse;

    } catch (error) {
      console.error('❌ Error in selectWinningBid:', error);
      throw error; // Re-throw the error instead of returning undefined
    }
  }

  async createBidInvitation(invitationData: any): Promise<any> {
    try {
      // For now, we'll create a bid process to track the invitation
      // This could be expanded to a separate bid_invitations table later
      const bidProcess = await this.createBidProcess({
        projectId: invitationData.projectId,
        estimateItemId: invitationData.estimateItemId,
        trade: invitationData.trade,
        invitedSubcontractors: invitationData.invitedSubcontractors || [],
        selectedEstimateSnapshot: {
          category: invitationData.category,
          description: invitationData.description,
          estimatedCost: invitationData.estimatedCost,
          dueDate: invitationData.dueDate,
          notes: invitationData.notes,
          attachments: invitationData.attachments || [],
        },
      });

      return {
        id: bidProcess.id,
        projectId: invitationData.projectId,
        estimateId: invitationData.estimateId,
        estimateItemId: invitationData.estimateItemId,
        trade: invitationData.trade,
        invitedSubcontractors: invitationData.invitedSubcontractors,
        status: 'Bidding',
        createdAt: bidProcess.createdAt,
      };
    } catch (error) {
      
      throw error;
    }
  }

  // Purchase Order methods
  async createPurchaseOrder(poData: any): Promise<PurchaseOrder> {
    // Validate subcontractor compliance before creating PO
    const complianceResult = await this.validateSubcontractorComplianceDetails(poData.contactId);
    if (!complianceResult.isCompliant) {
      const missingItems = complianceResult.missingRequirements.join(', ');
      throw new Error(`Cannot create Purchase Order. The subcontractor is missing: ${missingItems}. Please update their profile in the Contacts section before proceeding.`);
    }

    // Generate PO number if not provided
    const poNumber = poData.poNumber || `PO-${Date.now()}`;
    
    // Initialize status history
    const statusHistory = [{
      status: 'draft',
      date: new Date().toISOString(),
      user: poData.createdBy,
      note: 'PO created'
    }];

    const [purchaseOrder] = await db
      .insert(purchaseOrders)
      .values({
        projectId: poData.projectId,
        contactId: poData.contactId,
        estimateItemId: poData.estimateItemId,
        poNumber,
        description: poData.description,
        amount: poData.amount,
        duration: poData.duration || 0,
        trade: poData.trade,
        startDate: poData.startDate ? new Date(poData.startDate) : null,
        endDate: poData.endDate ? new Date(poData.endDate) : null,
        status: 'draft',
        statusHistory: JSON.stringify(statusHistory),
        createdBy: poData.createdBy,
      })
      .returning();

    return purchaseOrder;
  }

  async createPurchaseOrderFromEstimate(poData: any): Promise<PurchaseOrder> {
    // Validate that estimate item is approved
    const [estimateItem] = await db
      .select()
      .from(estimateItems)
      .where(eq(estimateItems.id, poData.estimateItemId));
    
    if (!estimateItem || estimateItem.status !== 'Approved') {
      throw new Error('Can only create PO from approved estimate items');
    }

    // Get subcontractor from bid response or estimate item
    const subcontractor = await this.getContactById(poData.contactId);
    if (!subcontractor) {
      throw new Error('Subcontractor not found');
    }

    // Calculate end date based on duration and start date
    const startDate = new Date(poData.startDate);
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + (poData.duration || estimateItem.duration || 0));

    return await this.createPurchaseOrder({
      ...poData,
      trade: estimateItem.trade,
      amount: poData.amount || estimateItem.estimatedCost * (1 + (estimateItem.markup || 0) / 100) * (1 + (estimateItem.contingency || 0) / 100),
      duration: poData.duration || estimateItem.duration,
      description: poData.description || estimateItem.description,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    });
  }

  // Global schedule methods
  async getProjectsByIds(projectIds: number[]): Promise<Project[]> {
    if (!projectIds || projectIds.length === 0) {
      return [];
    }
    
    const { inArray } = await import('drizzle-orm');
    
    const projectList = await db
      .select()
      .from(projects)
      .where(inArray(projects.id, projectIds));
    
    return projectList;
  }

  async getAllPurchaseOrders(): Promise<any[]> {
    try {
      const result = await db
        .select()
        .from(purchaseOrders)
        .orderBy(desc(purchaseOrders.createdAt));
      
      return result;
    } catch (error) {
      console.error('Error fetching all purchase orders:', error);
      return [];
    }
  }

  async getPurchaseOrdersByProject(projectId: number): Promise<any[]> {
    try {
      const result = await db
        .select()
        .from(purchaseOrders)
        .where(eq(purchaseOrders.projectId, projectId))
        .orderBy(desc(purchaseOrders.createdAt));
      
      return result;
    } catch (error) {
      console.error('Error fetching purchase orders:', error);
      return [];
    }
  }

  async getPurchaseOrdersByContact(contactId: number): Promise<PurchaseOrder[]> {
    return await db
      .select()
      .from(purchaseOrders)
      .where(eq(purchaseOrders.contactId, contactId))
      .orderBy(desc(purchaseOrders.createdAt));
  }

  async updatePurchaseOrder(id: number, updateData: any): Promise<PurchaseOrder | undefined> {
    const [updatedPO] = await db
      .update(purchaseOrders)
      .set({
        description: updateData.description,
        amount: updateData.amount,
        trade: updateData.trade,
        workScope: updateData.workScope,
        startDate: updateData.startDate ? new Date(updateData.startDate) : undefined,
        expectedCompletion: updateData.expectedCompletion ? new Date(updateData.expectedCompletion) : undefined,
        terms: updateData.terms,
        termsAndConditions: updateData.termsAndConditions,
        status: updateData.status,
        updatedAt: new Date(),
      })
      .where(eq(purchaseOrders.id, id))
      .returning();

    return updatedPO || undefined;
  }

  async signPurchaseOrder(id: number, contactId: number, signature: string): Promise<PurchaseOrder | undefined> {
    // Validate that the signer is compliant
    const isCompliant = await this.validateSubcontractorCompliance(contactId);
    if (!isCompliant) {
      throw new Error('Cannot sign PO as non-compliant subcontractor. Ensure agreement is signed, insurance is current, and W9 is on file.');
    }

    // Get current PO to update status history
    const [currentPO] = await db
      .select()
      .from(purchaseOrders)
      .where(eq(purchaseOrders.id, id));

    if (!currentPO) {
      throw new Error('Purchase Order not found');
    }

    // Update status history
    const statusHistory = Array.isArray(currentPO.statusHistory) 
      ? currentPO.statusHistory 
      : (currentPO.statusHistory ? JSON.parse(currentPO.statusHistory) : []);
    statusHistory.push({
      status: 'signed',
      date: new Date().toISOString(),
      user: contactId,
      note: 'PO signed by subcontractor'
    });

    const [signedPO] = await db
      .update(purchaseOrders)
      .set({
        status: 'signed',
        signedBy: contactId,
        signedAt: new Date(),
        signature,
        statusHistory: JSON.stringify(statusHistory),
        updatedAt: new Date(),
      })
      .where(eq(purchaseOrders.id, id))
      .returning();

    return signedPO || undefined;
  }

  async sendPurchaseOrderToSubcontractor(id: number): Promise<PurchaseOrder | undefined> {
    // Get current PO to update status history
    const [currentPO] = await db
      .select()
      .from(purchaseOrders)
      .where(eq(purchaseOrders.id, id));

    if (!currentPO) {
      throw new Error('Purchase Order not found');
    }

    // Update status history
    const statusHistory = Array.isArray(currentPO.statusHistory) 
      ? currentPO.statusHistory 
      : (currentPO.statusHistory ? JSON.parse(currentPO.statusHistory) : []);
    statusHistory.push({
      status: 'sent',
      date: new Date().toISOString(),
      user: currentPO.createdBy,
      note: 'PO sent to subcontractor'
    });

    const [sentPO] = await db
      .update(purchaseOrders)
      .set({
        status: 'sent',
        statusHistory: JSON.stringify(statusHistory),
        updatedAt: new Date(),
      })
      .where(eq(purchaseOrders.id, id))
      .returning();

    // TODO: Send email notification to subcontractor
    // TODO: Update subcontractor portal with PO notification

    return sentPO || undefined;
  }

  async cancelPurchaseOrder(id: number, reason: string): Promise<PurchaseOrder | undefined> {
    // Get current PO to update status history
    const [currentPO] = await db
      .select()
      .from(purchaseOrders)
      .where(eq(purchaseOrders.id, id));

    if (!currentPO) {
      throw new Error('Purchase Order not found');
    }

    // Update status history
    const statusHistory = JSON.parse(currentPO.statusHistory || '[]');
    statusHistory.push({
      status: 'cancelled',
      date: new Date().toISOString(),
      user: currentPO.createdBy,
      note: `PO cancelled: ${reason}`
    });

    const [cancelledPO] = await db
      .update(purchaseOrders)
      .set({
        status: 'cancelled',
        cancellationReason: reason,
        statusHistory: JSON.stringify(statusHistory),
        updatedAt: new Date(),
      })
      .where(eq(purchaseOrders.id, id))
      .returning();

    return cancelledPO || undefined;
  }

  async deletePurchaseOrder(id: number): Promise<boolean> {
    try {
      const result = await db
        .delete(purchaseOrders)
        .where(eq(purchaseOrders.id, id));
      
      return true;
    } catch (error) {
      console.error('Error deleting purchase order:', error);
      return false;
    }
  }

  async getApprovedEstimateItems(projectId: number): Promise<EstimateItem[]> {
    // Get all estimates for the project
    const projectEstimates = await db
      .select()
      .from(estimates)
      .where(eq(estimates.projectId, projectId));

    const approvedItems: EstimateItem[] = [];

    for (const estimate of projectEstimates) {
      const categories = await db
        .select()
        .from(estimateCategories)
        .where(eq(estimateCategories.estimateId, estimate.id));

      for (const category of categories) {
        const items = await db
          .select()
          .from(estimateItems)
          .where(and(
            eq(estimateItems.categoryId, category.id),
            eq(estimateItems.status, 'Approved')
          ));

        approvedItems.push(...items);
      }
    }

    return approvedItems;
  }

  // Invoice methods
  async createInvoice(invoiceData: any): Promise<Invoice> {
    // Validate subcontractor compliance before allowing invoice submission
    const isCompliant = await this.validateSubcontractorCompliance(invoiceData.contactId);
    if (!isCompliant) {
      throw new Error('Cannot submit invoice as non-compliant subcontractor. Ensure agreement is signed, insurance is current, and W9 is on file.');
    }

    const [invoice] = await db
      .insert(invoices)
      .values({
        projectId: invoiceData.projectId,
        contactId: invoiceData.contactId,
        poId: invoiceData.poId,
        invoiceNumber: invoiceData.invoiceNumber,
        description: invoiceData.description,
        amount: invoiceData.amount,
        trade: invoiceData.trade,
        workPeriod: invoiceData.workPeriod,
        materials: JSON.stringify(invoiceData.materials || []),
        labor: JSON.stringify(invoiceData.labor || []),
        attachments: JSON.stringify(invoiceData.attachments || []),
        dueDate: invoiceData.dueDate ? new Date(invoiceData.dueDate) : null,
        status: 'pending',
        notes: invoiceData.notes,
      })
      .returning();

    return invoice;
  }

  async getInvoicesByProject(projectId: number): Promise<Invoice[]> {
    return await db
      .select()
      .from(invoices)
      .where(eq(invoices.projectId, projectId))
      .orderBy(desc(invoices.submittedDate));
  }

  async getInvoicesByContact(contactId: number): Promise<Invoice[]> {
    return await db
      .select()
      .from(invoices)
      .where(eq(invoices.contactId, contactId))
      .orderBy(desc(invoices.submittedDate));
  }

  async getAllInvoices(): Promise<Invoice[]> {
    return await db
      .select()
      .from(invoices)
      .orderBy(desc(invoices.submittedDate));
  }

  async updateInvoice(id: number, updateData: any): Promise<Invoice | undefined> {
    const [updatedInvoice] = await db
      .update(invoices)
      .set({
        description: updateData.description,
        amount: updateData.amount,
        trade: updateData.trade,
        workPeriod: updateData.workPeriod,
        materials: updateData.materials ? JSON.stringify(updateData.materials) : undefined,
        labor: updateData.labor ? JSON.stringify(updateData.labor) : undefined,
        attachments: updateData.attachments ? JSON.stringify(updateData.attachments) : undefined,
        dueDate: updateData.dueDate ? new Date(updateData.dueDate) : undefined,
        status: updateData.status,
        notes: updateData.notes,
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, id))
      .returning();

    return updatedInvoice || undefined;
  }

  async approveInvoice(id: number, approvedBy: number): Promise<Invoice | undefined> {
    const [approvedInvoice] = await db
      .update(invoices)
      .set({
        status: 'approved',
        approvedBy: approvedBy,
        approvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, id))
      .returning();

    return approvedInvoice || undefined;
  }

  // Project Schedule/Task methods
  async createProjectTask(taskData: any): Promise<ProjectTask> {
    const [task] = await db
      .insert(projectTasks)
      .values({
        projectId: taskData.projectId,
        title: taskData.title,
        trade: taskData.trade,
        contactId: taskData.contactId,
        estimateItemId: taskData.estimateItemId,
        startDate: new Date(taskData.startDate),
        endDate: new Date(taskData.endDate),
        duration: taskData.duration,
        status: taskData.status || 'Scheduled',
        description: taskData.description,
        notes: taskData.notes,
        dependsOn: JSON.stringify(taskData.dependsOn || []),
        isAutoGenerated: taskData.isAutoGenerated || false,
        color: taskData.color,
        createdBy: taskData.createdBy,
      })
      .returning();

    return task;
  }

  async getProjectTasks(projectId: number): Promise<ProjectTask[]> {
    return await db
      .select()
      .from(projectTasks)
      .where(eq(projectTasks.projectId, projectId))
      .orderBy(projectTasks.startDate);
  }

  async getProjectDependencies(projectId: number): Promise<TaskDependency[]> {
    return await db
      .select()
      .from(taskDependencies)
      .where(eq(taskDependencies.projectId, projectId))
      .orderBy(taskDependencies.id);
  }

  async getProjectTasksForSubcontractor(projectId: number, contactId: number): Promise<ProjectTask[]> {
    return await db
      .select()
      .from(projectTasks)
      .where(
        and(
          eq(projectTasks.projectId, projectId),
          eq(projectTasks.contactId, contactId)
        )
      )
      .orderBy(projectTasks.startDate);
  }

  async updateProjectTask(id: number, updateData: any): Promise<ProjectTask | undefined> {
    const [updatedTask] = await db
      .update(projectTasks)
      .set({
        title: updateData.title,
        trade: updateData.trade,
        contactId: updateData.contactId,
        startDate: updateData.startDate ? new Date(updateData.startDate) : undefined,
        endDate: updateData.endDate ? new Date(updateData.endDate) : undefined,
        duration: updateData.duration,
        status: updateData.status,
        description: updateData.description,
        notes: updateData.notes,
        dependsOn: updateData.dependsOn ? JSON.stringify(updateData.dependsOn) : undefined,
        color: updateData.color,
        updatedAt: new Date(),
      })
      .where(eq(projectTasks.id, id))
      .returning();

    return updatedTask || undefined;
  }

  async updateTaskDependencies(taskId: number, dependencies: string[]): Promise<boolean> {
    try {
      // Development logging removed
      
      const result = await db
        .update(projectTasks)
        .set({ dependencies: JSON.stringify(dependencies) })
        .where(eq(projectTasks.id, taskId))
        .returning();

      const success = result.length > 0;
      // Development logging removed
      return success;
    } catch (error) {
      console.error('Error updating task dependencies:', error);
      return false;
    }
  }

  async deleteProjectTask(id: number): Promise<boolean> {
    const result = await db
      .delete(projectTasks)
      .where(eq(projectTasks.id, id));
    
    return result.rowCount > 0;
  }



  async appendScheduleFromSelected(projectId: number, projectStartDate: string, createdBy: number, selectedEstimateIds: number[]): Promise<ProjectTask[]> {
    try {
      // First, get existing tasks to find the latest end date
      const existingTasks = await this.getProjectTasks(projectId);
      
      // Find the latest end date from existing tasks
      let startDate = new Date(projectStartDate);
      if (existingTasks.length > 0) {
        const latestEndDate = existingTasks.reduce((latest, task) => {
          const taskEndDate = new Date(task.endDate);
          return taskEndDate > latest ? taskEndDate : latest;
        }, new Date(existingTasks[0].endDate));
        
        // Start new tasks the day after the latest end date
        startDate = new Date(latestEndDate);
        startDate.setDate(startDate.getDate() + 1);
      }

      // Get only the selected approved estimate items
      const approvedEstimateItems = await db
        .select({
          id: estimateItems.id,
          trade: estimateItems.trade,
          vendor: estimateItems.vendor,
          duration: estimateItems.duration,
          description: estimateItems.description,
          cost: estimateItems.estimatedCost,
          status: estimateItems.status
        })
        .from(estimateItems)
        .innerJoin(estimateCategories, eq(estimateItems.categoryId, estimateCategories.id))
        .innerJoin(estimates, eq(estimateCategories.estimateId, estimates.id))
        .where(
          and(
            eq(estimates.projectId, projectId),
            eq(estimateItems.status, 'Approved'),
            inArray(estimateItems.id, selectedEstimateIds)
          )
        );

    if (approvedEstimateItems.length === 0) {
      return [];
    }

    // Define conventional trade sequence
    const tradeSequence = [
      'Excavation',
      'Foundation', 
      'Framing',
      'Plumbing',
      'Electrical',
      'HVAC',
      'Insulation',
      'Drywall',
      'Flooring',
      'Cabinets',
      'Painting',
      'Final Inspection'
    ];

    // Group estimate items by trade and sort by conventional sequence
    const groupedByTrade = new Map();
    approvedEstimateItems.forEach(item => {
      if (!groupedByTrade.has(item.trade)) {
        groupedByTrade.set(item.trade, []);
      }
      groupedByTrade.get(item.trade).push(item);
    });

    // Sort trades by conventional sequence
    const sortedTrades = Array.from(groupedByTrade.keys()).sort((a, b) => {
      const indexA = tradeSequence.indexOf(a);
      const indexB = tradeSequence.indexOf(b);
      // If trade not in sequence, put it at the end
      if (indexA === -1) return 1;
      if (indexB === -1) return -1;
      return indexA - indexB;
    });

    // Generate schedule tasks
    const generatedTasks: ProjectTask[] = [];
    let currentStartDate = new Date(startDate);
    
    // Ensure start date is a business day
    while (this.isWeekend(currentStartDate)) {
      currentStartDate = new Date(currentStartDate.getTime() + 24 * 60 * 60 * 1000);
    }

    // Don't clear existing tasks - we're appending to the schedule

    for (const trade of sortedTrades) {
      const tradeItems = groupedByTrade.get(trade);
      
      // Calculate total duration for this trade
      const totalDuration = tradeItems.reduce((sum, item) => sum + (item.duration || 1), 0);
      
      // Find subcontractor for this trade (use first vendor found)
      const vendor = tradeItems.find(item => item.vendor)?.vendor;
      let contactId = null;
      
      if (vendor) {
        // Try to find matching contact by company/name
        const [contact] = await db
          .select()
          .from(contacts)
          .where(
            and(
              eq(contacts.role, 'subcontractor'),
              eq(contacts.trade, trade)
            )
          )
          .limit(1);
        
        if (contact) {
          contactId = contact.id;
        }
      }

      // Create task for this trade using business day calculations
      const endDate = this.addBusinessDays(currentStartDate, totalDuration - 1);

      const taskData = {
        projectId,
        title: `${trade} Work`,
        trade,
        contactId,
        estimateItemId: tradeItems[0]?.id, // Reference first item
        startDate: currentStartDate.toISOString(),
        endDate: endDate.toISOString(),
        duration: totalDuration,
        status: 'Scheduled',
        description: `Auto-generated task for ${trade} - ${tradeItems.length} items`,
        notes: `Items: ${tradeItems.map(item => item.description || 'No description').join(', ')}`,
        dependsOn: [],
        isAutoGenerated: true,
        createdBy,
      };

      const createdTask = await this.createProjectTask(taskData);
      generatedTasks.push(createdTask);

      // Move to next business day for next trade (proper sequencing)
      currentStartDate = this.getNextBusinessDay(endDate);
    }

    return generatedTasks;
    } catch (error) {
      
      throw error;
    }
  }

  // Business day helper functions
  private isWeekend(date: Date): boolean {
    const day = date.getDay();
    return day === 0 || day === 6; // Sunday = 0, Saturday = 6
  }

  private addBusinessDays(startDate: Date, businessDays: number): Date {
    if (businessDays <= 0) return new Date(startDate);
    
    let currentDate = new Date(startDate);
    let daysAdded = 0;
    
    while (daysAdded < businessDays) {
      currentDate = new Date(currentDate.getTime() + 24 * 60 * 60 * 1000);
      if (!this.isWeekend(currentDate)) {
        daysAdded++;
      }
    }
    
    return currentDate;
  }

  private getNextBusinessDay(date: Date): Date {
    let nextDate = new Date(date.getTime() + 24 * 60 * 60 * 1000);
    while (this.isWeekend(nextDate)) {
      nextDate = new Date(nextDate.getTime() + 24 * 60 * 60 * 1000);
    }
    return nextDate;
  }

  async autoGenerateSchedule(projectId: number, projectStartDate: string, createdBy: number): Promise<ProjectTask[]> {
    try {
      // First, get all approved estimate items for this project
      const approvedEstimateItems = await db
        .select({
          id: estimateItems.id,
          trade: estimateItems.trade,
          vendor: estimateItems.vendor,
          duration: estimateItems.duration,
          description: estimateItems.description,
          cost: estimateItems.cost,
          status: estimateItems.status
        })
        .from(estimateItems)
        .innerJoin(estimates, eq(estimateItems.estimateId, estimates.id))
        .where(
          and(
            eq(estimates.projectId, projectId),
            eq(estimateItems.status, 'Approved')
          )
        );

    if (approvedEstimateItems.length === 0) {
      return [];
    }

    // Define conventional trade sequence
    const tradeSequence = [
      'Excavation',
      'Foundation', 
      'Framing',
      'Plumbing',
      'Electrical',
      'HVAC',
      'Insulation',
      'Drywall',
      'Flooring',
      'Cabinets',
      'Painting',
      'Final Inspection'
    ];

    // Group estimate items by trade and sort by conventional sequence
    const groupedByTrade = new Map();
    approvedEstimateItems.forEach(item => {
      if (!groupedByTrade.has(item.trade)) {
        groupedByTrade.set(item.trade, []);
      }
      groupedByTrade.get(item.trade).push(item);
    });

    // Sort trades by conventional sequence
    const sortedTrades = Array.from(groupedByTrade.keys()).sort((a, b) => {
      const indexA = tradeSequence.indexOf(a);
      const indexB = tradeSequence.indexOf(b);
      // If trade not in sequence, put it at the end
      if (indexA === -1) return 1;
      if (indexB === -1) return -1;
      return indexA - indexB;
    });

    // Generate schedule tasks
    const generatedTasks: ProjectTask[] = [];
    let currentStartDate = new Date(projectStartDate);

    // Ensure start date is a business day
    while (this.isWeekend(currentStartDate)) {
      currentStartDate = new Date(currentStartDate.getTime() + 24 * 60 * 60 * 1000);
    }

    for (const trade of sortedTrades) {
      const tradeItems = groupedByTrade.get(trade);
      
      // Calculate total duration for this trade
      const totalDuration = tradeItems.reduce((sum, item) => sum + (item.duration || 1), 0);
      
      // Find subcontractor for this trade (use first vendor found)
      const vendor = tradeItems.find(item => item.vendor)?.vendor;
      let contactId = null;
      
      if (vendor) {
        // Try to find matching contact by company/name
        const [contact] = await db
          .select()
          .from(contacts)
          .where(
            and(
              eq(contacts.role, 'subcontractor'),
              eq(contacts.trade, trade)
            )
          )
          .limit(1);
        
        if (contact) {
          contactId = contact.id;
        }
      }

      // Create task for this trade using business day calculations
      const endDate = this.addBusinessDays(currentStartDate, totalDuration - 1);

      const taskData = {
        projectId,
        title: `${trade} Work`,
        trade,
        contactId,
        estimateItemId: tradeItems[0]?.id, // Reference first item
        startDate: currentStartDate.toISOString(),
        endDate: endDate.toISOString(),
        duration: totalDuration,
        status: 'Scheduled',
        description: `Auto-generated task for ${trade} - ${tradeItems.length} items`,
        notes: `Items: ${tradeItems.map(item => item.description || 'No description').join(', ')}`,
        dependsOn: [],
        isAutoGenerated: true,
        createdBy,
      };

      const createdTask = await this.createProjectTask(taskData);
      generatedTasks.push(createdTask);

      // Move start date for next trade (next business day after completion)
      currentStartDate = this.getNextBusinessDay(endDate);
    }

    return generatedTasks;
    } catch (error) {
      
      throw error;
    }
  }

  // Budget methods
  async createClientPayment(paymentData: any): Promise<ClientPayment> {
    const [payment] = await db
      .insert(clientPayments)
      .values(paymentData)
      .returning();
    
    // Update budget summary after payment
    await this.updateProjectBudgetSummary(paymentData.projectId);
    
    return payment;
  }

  async getClientPaymentsByProject(projectId: number): Promise<ClientPayment[]> {
    return await db
      .select()
      .from(clientPayments)
      .where(eq(clientPayments.projectId, projectId))
      .orderBy(desc(clientPayments.paymentDate));
  }

  async getAllClientPayments(): Promise<ClientPayment[]> {
    return await db
      .select()
      .from(clientPayments)
      .orderBy(desc(clientPayments.paymentDate));
  }

  async updateClientPayment(id: number, updateData: any): Promise<ClientPayment | undefined> {
    const [updated] = await db
      .update(clientPayments)
      .set(updateData)
      .where(eq(clientPayments.id, id))
      .returning();
    
    if (updated) {
      await this.updateProjectBudgetSummary(updated.projectId);
    }
    
    return updated;
  }

  async deleteClientPayment(id: number): Promise<boolean> {
    const [payment] = await db
      .select()
      .from(clientPayments)
      .where(eq(clientPayments.id, id));
    
    if (!payment) return false;
    
    const result = await db
      .delete(clientPayments)
      .where(eq(clientPayments.id, id));
    
    if (result.rowCount > 0) {
      await this.updateProjectBudgetSummary(payment.projectId);
      return true;
    }
    
    return false;
  }

  async getProjectBudgetSummary(projectId: number): Promise<ProjectBudgetSummary | undefined> {
    const [summary] = await db
      .select()
      .from(projectBudgetSummary)
      .where(eq(projectBudgetSummary.projectId, projectId));
    
    if (!summary) {
      return await this.updateProjectBudgetSummary(projectId);
    }
    
    return summary;
  }

  async updateProjectBudgetSummary(projectId: number): Promise<ProjectBudgetSummary> {
    // Calculate total approved estimates
    const approvedEstimates = await db
      .select()
      .from(estimateItems)
      .innerJoin(estimates, eq(estimateItems.estimateId, estimates.id))
      .where(
        and(
          eq(estimates.projectId, projectId),
          eq(estimateItems.status, 'Approved')
        )
      );
    
    const totalEstimate = approvedEstimates.reduce((sum, item) => {
      const cost = item.estimate_items.estimatedCost || 0;
      const markup = item.estimate_items.markupPercentage || 0;
      const contingency = item.estimate_items.contingencyPercentage || 0;
      return sum + (cost * (1 + markup/100 + contingency/100));
    }, 0);

    // Calculate total client payments
    const payments = await db
      .select()
      .from(clientPayments)
      .where(eq(clientPayments.projectId, projectId));
    
    const totalClientPayments = payments.reduce((sum, payment) => sum + payment.amount, 0);

    // Calculate total sub invoices
    const subInvoices = await db
      .select()
      .from(invoices)
      .where(eq(invoices.projectId, projectId));
    
    const totalSubInvoices = subInvoices.reduce((sum, invoice) => sum + invoice.amount, 0);

    // Calculate derived values
    const remainingToInvoiceClient = totalEstimate - totalClientPayments;
    const remainingToPaySubs = totalEstimate - totalSubInvoices;
    const projectedMargin = totalClientPayments - totalSubInvoices;

    const summaryData = {
      projectId,
      totalEstimate,
      totalClientPayments,
      totalSubInvoices,
      remainingToInvoiceClient,
      remainingToPaySubs,
      projectedMargin,
      lastUpdated: new Date(),
    };

    // Upsert budget summary
    const [summary] = await db
      .insert(projectBudgetSummary)
      .values(summaryData)
      .onConflictDoUpdate({
        target: projectBudgetSummary.projectId,
        set: summaryData,
      })
      .returning();

    return summary;
  }

  // Document methods
  async createProjectDocument(documentData: any): Promise<ProjectDocument> {
    const [document] = await db
      .insert(projectDocuments)
      .values({
        projectId: documentData.projectId,
        fileName: documentData.fileName,
        originalFileName: documentData.originalFileName,
        fileUrl: documentData.fileUrl,
        documentType: documentData.documentType,
        fileSize: documentData.fileSize,
        uploadedBy: documentData.uploadedBy,
        description: documentData.description,
        targetId: documentData.targetId,
      })
      .returning();
    return document;
  }

  async getProjectDocuments(projectId: number): Promise<ProjectDocument[]> {
    return await db
      .select()
      .from(projectDocuments)
      .where(eq(projectDocuments.projectId, projectId))
      .orderBy(desc(projectDocuments.createdAt));
  }

  async getProjectDocument(id: number): Promise<ProjectDocument | undefined> {
    const [document] = await db
      .select()
      .from(projectDocuments)
      .where(eq(projectDocuments.id, id));
    return document;
  }

  async updateProjectDocument(id: number, updateData: any): Promise<ProjectDocument | undefined> {
    const [updated] = await db
      .update(projectDocuments)
      .set({
        fileName: updateData.fileName,
        originalFileName: updateData.originalFileName,
        fileUrl: updateData.fileUrl,
        fileSize: updateData.fileSize,
        mimeType: updateData.mimeType,
        versionNumber: updateData.versionNumber,
        description: updateData.description,
        updatedAt: new Date(),
      })
      .where(eq(projectDocuments.id, id))
      .returning();
    return updated;
  }

  async deleteProjectDocument(id: number): Promise<boolean> {
    const result = await db
      .delete(projectDocuments)
      .where(eq(projectDocuments.id, id));
    return result.rowCount > 0;
  }

  // Change Order methods
  async createChangeOrder(changeOrderData: any): Promise<ChangeOrder> {
    const [changeOrder] = await db
      .insert(changeOrders)
      .values({
        projectId: changeOrderData.projectId,
        purchaseOrderId: changeOrderData.purchaseOrderId,
        contactId: changeOrderData.contactId,
        changeOrderNumber: changeOrderData.changeOrderNumber,
        description: changeOrderData.description,
        costImpact: changeOrderData.costImpact,
        timeImpact: changeOrderData.timeImpact || 0,
        status: changeOrderData.status || 'pending',
        signedDocumentId: changeOrderData.signedDocumentId,
        submittedBy: changeOrderData.submittedBy,
      })
      .returning();
    return changeOrder;
  }

  async getChangeOrdersByProject(projectId: number): Promise<any[]> {
    // Use raw SQL to query the newly created change_orders table
    const result = await db.execute(sql`
      SELECT 
        id,
        project_id,
        purchase_order_id,
        contact_id,
        change_order_number,
        description,
        cost_impact,
        time_impact,
        status,
        signed_document_id,
        submitted_by,
        approved_by,
        created_at,
        updated_at
      FROM change_orders 
      WHERE project_id = ${projectId}
      ORDER BY created_at DESC
    `);
    
    return result.rows;
  }

  async getChangeOrdersByContact(contactId: number): Promise<ChangeOrder[]> {
    return await db
      .select()
      .from(changeOrders)
      .where(eq(changeOrders.contactId, contactId))
      .orderBy(desc(changeOrders.createdAt));
  }

  async updateChangeOrder(id: number, updateData: any): Promise<ChangeOrder | undefined> {
    const [updated] = await db
      .update(changeOrders)
      .set({
        description: updateData.description,
        costImpact: updateData.costImpact,
        timeImpact: updateData.timeImpact,
        status: updateData.status,
        signedDocumentId: updateData.signedDocumentId,
        updatedAt: new Date(),
      })
      .where(eq(changeOrders.id, id))
      .returning();
    return updated;
  }

  async approveChangeOrder(id: number, approvedBy: number): Promise<ChangeOrder | undefined> {
    const [updated] = await db
      .update(changeOrders)
      .set({
        status: 'approved',
        approvedBy: approvedBy,
        updatedAt: new Date(),
      })
      .where(eq(changeOrders.id, id))
      .returning();
    return updated;
  }

  async rejectChangeOrder(id: number, rejectedBy: number): Promise<ChangeOrder | undefined> {
    const [updated] = await db
      .update(changeOrders)
      .set({
        status: 'rejected',
        approvedBy: rejectedBy, // Using same field for rejected by
        updatedAt: new Date(),
      })
      .where(eq(changeOrders.id, id))
      .returning();
    return updated;
  }

  // Photo methods
  async createProjectPhoto(photoData: any): Promise<ProjectPhoto> {
    const [photo] = await db
      .insert(projectPhotos)
      .values({
        projectId: photoData.projectId,
        url: photoData.url,
        uploadedBy: photoData.uploadedBy,
        role: photoData.role,
        caption: photoData.caption,
        category: photoData.category,
        visibleToClient: photoData.visibleToClient,
        approvedByAdmin: photoData.approvedByAdmin,
        fileName: photoData.fileName,
        fileSize: photoData.fileSize,
      })
      .returning();
    return photo;
  }

  async getProjectPhotos(projectId: number, role?: string): Promise<ProjectPhoto[]> {
    let query = db
      .select()
      .from(projectPhotos)
      .where(eq(projectPhotos.projectId, projectId));

    // Apply role-based filtering
    if (role === 'Client') {
      query = query.where(
        and(
          eq(projectPhotos.projectId, projectId),
          eq(projectPhotos.visibleToClient, true)
        )
      );
    } else if (role === 'Subcontractor') {
      // Subcontractors see only their own uploads
      query = query.where(
        and(
          eq(projectPhotos.projectId, projectId),
          eq(projectPhotos.role, 'Subcontractor')
        )
      );
    }
    // Admin and ProjectManager see all photos

    return await query.orderBy(desc(projectPhotos.createdAt));
  }

  async updatePhotoVisibility(photoId: number, visibleToClient: boolean): Promise<ProjectPhoto | undefined> {
    const [updated] = await db
      .update(projectPhotos)
      .set({ visibleToClient })
      .where(eq(projectPhotos.id, photoId))
      .returning();
    return updated;
  }

  async approvePhoto(photoId: number, approvedBy: number): Promise<ProjectPhoto | undefined> {
    const [updated] = await db
      .update(projectPhotos)
      .set({ 
        approvedByAdmin: true,
        // You might want to add approvedBy field to track who approved
      })
      .where(eq(projectPhotos.id, photoId))
      .returning();
    return updated;
  }

  async deleteProjectPhoto(photoId: number): Promise<boolean> {
    const result = await db
      .delete(projectPhotos)
      .where(eq(projectPhotos.id, photoId));
    return result.rowCount > 0;
  }

  // Subcontractor Portal methods
  async getSubcontractorProjects(subcontractorId: number): Promise<Project[]> {
    // Get projects where subcontractor has tasks or bid responses
    const subcontractorTasks = await db
      .select({ projectId: projectTasks.projectId })
      .from(projectTasks)
      .where(eq(projectTasks.contactId, subcontractorId));
    
    const subcontractorBids = await db
      .select({ projectId: bidProcesses.projectId })
      .from(bidResponses)
      .innerJoin(bidProcesses, eq(bidResponses.bidProcessId, bidProcesses.id))
      .where(eq(bidResponses.contactId, subcontractorId));
    
    const projectIds = [
      ...subcontractorTasks.map(t => t.projectId),
      ...subcontractorBids.map(b => b.projectId)
    ];
    
    if (projectIds.length === 0) return [];
    
    const uniqueProjectIds = [...new Set(projectIds)];
    
    return await db
      .select()
      .from(projects)
      .where(inArray(projects.id, uniqueProjectIds))
      .orderBy(projects.createdAt);
  }

  async getSubcontractorBids(subcontractorId: number): Promise<BidResponse[]> {
    return await db
      .select()
      .from(bidResponses)
      .where(eq(bidResponses.contactId, subcontractorId))
      .orderBy(desc(bidResponses.submittedAt));
  }

  async getSubcontractorJobs(subcontractorId: number): Promise<ProjectTask[]> {
    return await db
      .select()
      .from(projectTasks)
      .where(eq(projectTasks.contactId, subcontractorId))
      .orderBy(projectTasks.startDate);
  }

  async getSubcontractorInvoices(subcontractorId: number): Promise<Invoice[]> {
    return await db
      .select()
      .from(invoices)
      .where(eq(invoices.contactId, subcontractorId))
      .orderBy(invoices.createdAt);
  }

  // Client Portal methods
  async getProjectTeam(projectId: number): Promise<Contact[]> {
    try {
      // Get team members associated with the project (project manager, subcontractors, etc.)
      const projectTasksResult = await db
        .select({ contactId: projectTasks.contactId })
        .from(projectTasks)
        .where(eq(projectTasks.projectId, projectId));
      
      const contactIds = [...new Set(projectTasksResult.map(t => t.contactId).filter(Boolean))];
      
      if (contactIds.length === 0) {
        // Return mock team members if no tasks found
        return [
          {
            id: 1,
            name: "Sarah Johnson",
            email: "sarah@api.com",
            phone: "(555) 123-4567",
            contactType: "employee",
            companyName: "Skyeline Homes",
            trades: null,
            notes: null,
            licenseNumber: null,
            insuranceProvider: null,
            insuranceExpirationDate: null,
            w9OnFile: null,
            w9FileUrl: null,
            agreementSigned: null,
            agreementSignedDate: null,
            isCompliant: null,
            hasPortalAccess: null,
            portalEmail: null,
            portalPassword: null,
            portalAccessGrantedAt: null,
            portalLastLogin: null,
            createdAt: new Date(),
            updatedAt: new Date()
          } as Contact,
          {
            id: 2,
            name: "David Chen",
            email: "david@api.com",
            phone: "(555) 123-4568",
            contactType: "designer",
            companyName: "Skyeline Homes",
            trades: null,
            notes: null,
            licenseNumber: null,
            insuranceProvider: null,
            insuranceExpirationDate: null,
            w9OnFile: null,
            w9FileUrl: null,
            agreementSigned: null,
            agreementSignedDate: null,
            isCompliant: null,
            hasPortalAccess: null,
            portalEmail: null,
            portalPassword: null,
            portalAccessGrantedAt: null,
            portalLastLogin: null,
            createdAt: new Date(),
            updatedAt: new Date()
          } as Contact
        ];
      }
      
      return await db
        .select()
        .from(contacts)
        .where(inArray(contacts.id, contactIds))
        .orderBy(contacts.name);
    } catch (error) {
      console.error('Error fetching project team:', error);
      return [];
    }
  }

  // Timeline builder methods
  async getAllActiveTasks(): Promise<ProjectTask[]> {
    const allTasks = await db
      .select()
      .from(projectTasks)
      .where(
        and(
          not(eq(projectTasks.status, 'completed')),
          not(eq(projectTasks.status, 'cancelled'))
        )
      )
      .orderBy(projectTasks.startDate);
    
    return allTasks;
  }

  async bulkUpdateProjectTasks(projectId: number, tasks: any[]): Promise<ProjectTask[]> {
    // Delete existing tasks for this project
    await db.delete(projectTasks).where(eq(projectTasks.projectId, projectId));
    
    // Insert new tasks
    const insertData = tasks.map(task => ({
      projectId,
      title: task.title,
      description: task.description,
      trade: task.trade,
      duration: task.duration,
      startDate: new Date(task.startDate),
      endDate: new Date(task.endDate),
      status: task.status,
      dependencies: JSON.stringify(task.dependencies),
      assignedTo: task.assignedTo,
      priority: task.priority,
      estimatedCost: task.estimatedCost,
      notes: task.notes,
      weatherDependent: task.weatherDependent,
      inspectorRequired: task.inspectorRequired,
      progress: task.progress || 0,
      createdBy: 1 // Default admin user
    }));

    if (insertData.length > 0) {
      return await db.insert(projectTasks).values(insertData).returning();
    }
    
    return [];
  }

  async autoGenerateProjectTasks(projectId: number): Promise<ProjectTask[]> {
    // Get approved estimate items for the project
    const approvedItems = await this.getApprovedEstimateItems(projectId);
    
    if (approvedItems.length === 0) {
      return [];
    }

    // Trade sequence mapping for smart ordering
    const tradeSequence: Record<string, number> = {
      'Excavation': 1,
      'Foundation': 2,
      'Framing': 3,
      'Roofing': 4,
      'Plumbing': 5,
      'Electrical': 5,
      'HVAC': 5,
      'Insulation': 6,
      'Drywall': 7,
      'Flooring': 8,
      'Painting': 8,
      'Cabinets': 9,
      'Countertops': 10,
      'Final Inspection': 11
    };

    // Standard durations for trades
    const standardDurations: Record<string, number> = {
      'Excavation': 2,
      'Foundation': 3,
      'Framing': 5,
      'Roofing': 2,
      'Plumbing': 3,
      'Electrical': 3,
      'HVAC': 4,
      'Insulation': 1,
      'Drywall': 4,
      'Flooring': 3,
      'Painting': 3,
      'Cabinets': 2,
      'Countertops': 1
    };

    // Group items by trade
    const tradeGroups = approvedItems.reduce((groups, item) => {
      const trade = item.trade || 'General';
      if (!groups[trade]) {
        groups[trade] = [];
      }
      groups[trade].push(item);
      return groups;
    }, {} as Record<string, any[]>);

    // Generate tasks with smart scheduling
    const tasks: any[] = [];
    let currentDate = new Date();
    
    // Sort trades by sequence
    const sortedTrades = Object.keys(tradeGroups).sort((a, b) => {
      const seqA = tradeSequence[a] || 999;
      const seqB = tradeSequence[b] || 999;
      return seqA - seqB;
    });

    for (const trade of sortedTrades) {
      const items = tradeGroups[trade];
      const duration = standardDurations[trade] || 3;
      
      // Skip weekends for start date
      while (currentDate.getDay() === 0 || currentDate.getDay() === 6) {
        currentDate = new Date(currentDate.getTime() + 24 * 60 * 60 * 1000);
      }

      const endDate = new Date(currentDate.getTime() + (duration - 1) * 24 * 60 * 60 * 1000);
      
      const task = {
        title: `${trade} Work`,
        description: `${trade} installation and completion`,
        trade,
        duration,
        startDate: new Date(currentDate),
        endDate,
        status: 'not_started',
        dependencies: [],
        priority: 'medium',
        estimatedCost: items.reduce((sum, item) => sum + (item.cost || 0), 0),
        weatherDependent: ['Excavation', 'Foundation', 'Framing', 'Roofing'].includes(trade),
        inspectorRequired: ['Foundation', 'Framing', 'Plumbing', 'Electrical', 'HVAC'].includes(trade),
        progress: 0
      };

      tasks.push(task);
      
      // Move to next date (add 1 day buffer between trades)
      currentDate = new Date(endDate.getTime() + 2 * 24 * 60 * 60 * 1000);
    }

    // Save the generated tasks
    return await this.bulkUpdateProjectTasks(projectId, tasks);
  }

  // Project Manager methods
  async getProjectManagers(): Promise<{ id: string; name: string; email: string }[]> {
    try {
      // Get project managers from contacts table
      const projectManagers = await db
        .select({
          id: contacts.id,
          name: contacts.name,
          email: contacts.email
        })
        .from(contacts)
        .where(
          and(
            eq(contacts.contactType, 'project_manager'),
            eq(contacts.isActive, true)
          )
        )
        .orderBy(contacts.name);

      // Convert to string IDs and return
      return projectManagers.map(pm => ({
        id: pm.id.toString(),
        name: pm.name || 'Unknown',
        email: pm.email || ''
      }));
    } catch (error) {
      // Fallback to default project managers if database query fails
      return [
        { id: 'pm1', name: 'Sarah Wilson', email: 'sarah@api.com' },
        { id: 'pm2', name: 'Mike Johnson', email: 'mike@api.com' },
        { id: 'pm3', name: 'David Chen', email: 'david@api.com' },
        { id: 'pm4', name: 'Lisa Parker', email: 'lisa@api.com' },
        { id: 'pm5', name: 'James Rodriguez', email: 'james@api.com' },
      ];
    }
  }

  // Financial Management Methods
  async getBudgetVarianceAnalysis(projectId: number): Promise<any> {
    try {
      // Get project estimates and actual costs
      const estimates = await db
        .select()
        .from(estimateItems)
        .innerJoin(estimates, eq(estimateItems.estimateId, estimates.id))
        .where(eq(estimates.projectId, projectId));
      
      const invoices = await db
        .select()
        .from(invoices)
        .where(eq(invoices.projectId, projectId));
      
      // Calculate variances by trade
      const variances = estimates.reduce((acc, item) => {
        const trade = item.estimate_items.trade;
        const budgeted = item.estimate_items.estimatedCost || 0;
        const actual = invoices
          .filter(inv => inv.trade === trade)
          .reduce((sum, inv) => sum + (inv.amount || 0), 0);
        
        acc[trade] = {
          budgeted,
          actual,
          variance: actual - budgeted,
          percentageVariance: budgeted > 0 ? ((actual - budgeted) / budgeted) * 100 : 0
        };
        
        return acc;
      }, {});
      
      return {
        projectId: parseInt(projectId),
        variances,
        totalBudgeted: Object.values(variances).reduce((sum, v: any) => sum + v.budgeted, 0),
        totalActual: Object.values(variances).reduce((sum, v: any) => sum + v.actual, 0),
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      return {
        projectId: parseInt(projectId),
        variances: {},
        totalBudgeted: 0,
        totalActual: 0,
        lastUpdated: new Date().toISOString()
      };
    }
  }

  async getApprovedBids(projectId: number): Promise<any> {
    try {
      const bids = await db
        .select()
        .from(bidResponses)
        .where(
          and(
            eq(bidResponses.projectId, projectId),
            eq(bidResponses.status, 'accepted')
          )
        );
      
      return bids.map(bid => ({
        id: bid.id,
        projectId: bid.projectId,
        trade: bid.trade,
        vendor: bid.vendor,
        amount: bid.price,
        status: bid.status,
        approvedDate: bid.submittedAt
      }));
    } catch (error) {
      return [];
    }
  }

  async getCashFlowForecasts(projectId: number): Promise<any> {
    try {
      const forecasts = [];
      const currentDate = new Date();
      
      // Generate 6 months of forecasts
      for (let i = 0; i < 6; i++) {
        const month = new Date(currentDate);
        month.setMonth(currentDate.getMonth() + i);
        
        forecasts.push({
          month: month.toISOString().substring(0, 7),
          inflow: Math.random() * 50000 + 25000,
          outflow: Math.random() * 40000 + 20000,
          netCashFlow: Math.random() * 10000 + 5000
        });
      }
      
      return {
        projectId: parseInt(projectId),
        forecasts,
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      return {
        projectId: parseInt(projectId),
        forecasts: [],
        lastUpdated: new Date().toISOString()
      };
    }
  }

  async getCashFlowAnalysis(projectId: number): Promise<any> {
    try {
      const payments = await db
        .select()
        .from(clientPayments)
        .where(eq(clientPayments.projectId, projectId));
      
      const expenses = await db
        .select()
        .from(invoices)
        .where(eq(invoices.projectId, projectId));
      
      const totalIncome = payments.reduce((sum, p) => sum + p.amount, 0);
      const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
      
      return {
        projectId: parseInt(projectId),
        totalIncome,
        totalExpenses,
        netCashFlow: totalIncome - totalExpenses,
        cashFlowRatio: totalExpenses > 0 ? totalIncome / totalExpenses : 0,
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      return {
        projectId: parseInt(projectId),
        totalIncome: 0,
        totalExpenses: 0,
        netCashFlow: 0,
        cashFlowRatio: 0,
        lastUpdated: new Date().toISOString()
      };
    }
  }

  async getAutomatedPurchaseOrders(projectId: number): Promise<any> {
    try {
      const pos = await db
        .select()
        .from(purchaseOrders)
        .where(eq(purchaseOrders.projectId, projectId));
      
      return pos.map(po => ({
        id: po.id,
        projectId: po.projectId,
        vendor: po.vendor,
        amount: po.amount,
        status: po.status,
        isAutomated: po.isAutomated || false,
        createdAt: po.createdAt
      }));
    } catch (error) {
      return [];
    }
  }

  async getCostVarianceAnalysis(projectId: number): Promise<any> {
    try {
      // Get project budget and actual costs
      const [project] = await db
        .select()
        .from(projects)
        .where(eq(projects.id, projectId));

      if (!project) {
        throw new Error('Project not found');
      }

      // Get estimate totals for budgeted costs
      const estimateData = await db
        .select({
          trade: estimateItems.trade,
          budgetedCost: sql<number>`sum(${estimateItems.estimatedCost})`,
          itemCount: sql<number>`count(${estimateItems.id})`
        })
        .from(estimateItems)
        .innerJoin(estimateCategories, eq(estimateItems.categoryId, estimateCategories.id))
        .innerJoin(estimates, eq(estimateCategories.estimateId, estimates.id))
        .where(eq(estimates.projectId, projectId))
        .groupBy(estimateItems.trade);

      // Mock actual costs for demo - in production, would come from actual cost tracking
      const actualCosts = estimateData.map(item => ({
        trade: item.trade,
        budgetedCost: item.budgetedCost,
        actualCost: item.budgetedCost * (0.85 + Math.random() * 0.3), // Simulate variance
        variance: 0,
        variancePercentage: 0
      }));

      // Calculate variances
      actualCosts.forEach(item => {
        item.variance = item.actualCost - item.budgetedCost;
        item.variancePercentage = item.budgetedCost ? (item.variance / item.budgetedCost) * 100 : 0;
      });

      return {
        projectId,
        totalBudget: project.estimatedBudget || 0,
        totalActualCost: actualCosts.reduce((sum, item) => sum + item.actualCost, 0),
        totalVariance: actualCosts.reduce((sum, item) => sum + item.variance, 0),
        costsByTrade: actualCosts,
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error in getCostVarianceAnalysis:', error);
      throw error;
    }
  }

  async getCostVarianceTrends(projectId: number, timeframe: string): Promise<any> {
    try {
      // Mock trend data - in production, would track historical variances
      const months = timeframe === '12m' ? 12 : 6;
      const trends = [];
      
      for (let i = months - 1; i >= 0; i--) {
        const date = new Date();
        date.setMonth(date.getMonth() - i);
        
        trends.push({
          date: date.toISOString().split('T')[0],
          plannedCost: 10000 + (i * 2000),
          actualCost: 9500 + (i * 2100) + (Math.random() * 1000),
          variance: 0,
          variancePercentage: 0
        });
      }

      // Calculate variances for trends
      trends.forEach(trend => {
        trend.variance = trend.actualCost - trend.plannedCost;
        trend.variancePercentage = trend.plannedCost ? (trend.variance / trend.plannedCost) * 100 : 0;
      });

      return trends;
    } catch (error) {
      console.error('Error in getCostVarianceTrends:', error);
      throw error;
    }
  }

  async getCashFlowForecast(projectId: number, months: number = 6): Promise<any> {
    try {
      // Debug information removed
      
      let project = null;
      let scheduledTasks = [];
      
      // Handle project ID 0 as company-wide overview
      if (projectId === 0) {
        // Debug information removed
        // Get all projects for company-wide overview
        const allProjects = await db.select().from(projects);
        const totalBudget = allProjects.reduce((sum, p) => sum + (p.estimatedBudget || 0), 0);
        
        project = {
          id: 0,
          name: 'Company Overview',
          estimatedBudget: totalBudget || 500000, // Use real total or fallback
        };
      } else {
        // Get specific project data
        const [projectData] = await db
          .select()
          .from(projects)
          .where(eq(projects.id, projectId));

        if (!projectData) {
          throw new Error('Project not found');
        }
        project = projectData;
        
        // Get scheduled tasks for specific project
        scheduledTasks = await db
          .select()
          .from(projectTasks)
          .where(eq(projectTasks.projectId, projectId))
          .orderBy(projectTasks.startDate);
      }

      // scheduledTasks already handled above based on projectId

      // Generate cash flow forecast
      const forecast = [];
      const currentDate = new Date();
      
      for (let i = 0; i < months; i++) {
        const forecastDate = new Date(currentDate);
        forecastDate.setMonth(forecastDate.getMonth() + i);
        
        const monthlyIncome = (project.estimatedBudget || 0) / 12; // Simple monthly distribution
        const monthlyExpenses = monthlyIncome * 0.8; // 80% expenses
        const netCashFlow = monthlyIncome - monthlyExpenses;
        
        forecast.push({
          month: forecastDate.toISOString().split('T')[0],
          income: monthlyIncome,
          expenses: monthlyExpenses,
          netCashFlow,
          cumulativeCashFlow: i === 0 ? netCashFlow : forecast[i-1].cumulativeCashFlow + netCashFlow
        });
      }

      return {
        projectId,
        forecastMonths: months,
        forecast,
        totalProjectedIncome: forecast.reduce((sum, f) => sum + f.income, 0),
        totalProjectedExpenses: forecast.reduce((sum, f) => sum + f.expenses, 0),
        projectedNetCashFlow: forecast.reduce((sum, f) => sum + f.netCashFlow, 0),
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error in getCashFlowForecast:', error);
      throw error;
    }
  }

  async analyzeCashFlowScenarios(projectId: number, scenarios: any[]): Promise<any> {
    try {
      // Analyze different cash flow scenarios
      const results = await Promise.all(scenarios.map(async (scenario) => {
        const forecast = await this.getCashFlowForecast(projectId, scenario.months || 6);
        
        // Apply scenario modifications
        const modifiedForecast = forecast.forecast.map(f => ({
          ...f,
          income: f.income * (scenario.incomeMultiplier || 1),
          expenses: f.expenses * (scenario.expenseMultiplier || 1)
        }));
        
        // Recalculate net cash flow
        modifiedForecast.forEach((f, index) => {
          f.netCashFlow = f.income - f.expenses;
          f.cumulativeCashFlow = index === 0 ? f.netCashFlow : modifiedForecast[index-1].cumulativeCashFlow + f.netCashFlow;
        });
        
        return {
          scenarioName: scenario.name,
          forecast: modifiedForecast,
          totalIncome: modifiedForecast.reduce((sum, f) => sum + f.income, 0),
          totalExpenses: modifiedForecast.reduce((sum, f) => sum + f.expenses, 0),
          netCashFlow: modifiedForecast.reduce((sum, f) => sum + f.netCashFlow, 0)
        };
      }));
      
      return results;
    } catch (error) {
      console.error('Error in analyzeCashFlowScenarios:', error);
      throw error;
    }
  }

  async getProfitMarginAnalysis(projectId: number): Promise<any> {
    try {
      // Get project and estimate data
      const [project] = await db
        .select()
        .from(projects)
        .where(eq(projects.id, projectId));

      if (!project) {
        throw new Error('Project not found');
      }

      // Get estimate totals
      const estimateData = await db
        .select({
          totalCost: sql<number>`sum(${estimateItems.estimatedCost})`,
          totalMarkup: sql<number>`sum(${estimateItems.markup})`,
          totalContingency: sql<number>`sum(${estimateItems.contingency})`
        })
        .from(estimateItems)
        .innerJoin(estimateCategories, eq(estimateItems.categoryId, estimateCategories.id))
        .innerJoin(estimates, eq(estimateCategories.estimateId, estimates.id))
        .where(eq(estimates.projectId, projectId));

      const data = estimateData[0] || { totalCost: 0, totalMarkup: 0, totalContingency: 0 };
      
      const revenue = project.estimatedBudget || 0;
      const directCosts = data.totalCost || 0;
      const markup = data.totalMarkup || 0;
      const contingency = data.totalContingency || 0;
      const grossProfit = revenue - directCosts;
      const netProfit = grossProfit - (markup + contingency);
      const profitMargin = revenue ? (netProfit / revenue) * 100 : 0;

      return {
        projectId,
        revenue,
        directCosts,
        markup,
        contingency,
        grossProfit,
        netProfit,
        profitMargin,
        marginAnalysis: {
          excellent: profitMargin >= 20,
          good: profitMargin >= 15,
          fair: profitMargin >= 10,
          poor: profitMargin < 10
        },
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error in getProfitMarginAnalysis:', error);
      throw error;
    }
  }

  async getProfitMarginTrends(projectId: number): Promise<any> {
    try {
      // Mock trend data - in production, would track historical margins
      const trends = [];
      
      for (let i = 11; i >= 0; i--) {
        const date = new Date();
        date.setMonth(date.getMonth() - i);
        
        trends.push({
          month: date.toISOString().split('T')[0],
          revenue: 50000 + (Math.random() * 10000),
          costs: 35000 + (Math.random() * 8000),
          profit: 0,
          margin: 0
        });
      }

      // Calculate profit and margin
      trends.forEach(trend => {
        trend.profit = trend.revenue - trend.costs;
        trend.margin = trend.revenue ? (trend.profit / trend.revenue) * 100 : 0;
      });

      return trends;
    } catch (error) {
      console.error('Error in getProfitMarginTrends:', error);
      throw error;
    }
  }

  // Mock financial storage methods for demo
  async getAutomatedPOConfig(projectId: number): Promise<any> {
    return {
      projectId,
      autoGenerateEnabled: true,
      autoSendEnabled: false,
      approvalThreshold: 5000,
      rules: [
        {
          id: 1,
          name: 'Auto-generate POs for approved estimates',
          condition: 'estimate_approved',
          action: 'create_po',
          enabled: true
        },
        {
          id: 2,
          name: 'Auto-send POs under $5000',
          condition: 'po_amount_under_5000',
          action: 'send_po',
          enabled: false
        }
      ]
    };
  }

  async updateAutomatedPOConfig(projectId: number, rules: any): Promise<any> {
    // Mock implementation
    return { projectId, ...rules, lastUpdated: new Date().toISOString() };
  }

  async getAutomatedPOMetrics(projectId: number): Promise<any> {
    return {
      projectId,
      totalPOsGenerated: 15,
      autoGeneratedPOs: 12,
      manualPOs: 3,
      automationRate: 80,
      avgProcessingTime: 2.5,
      costSavings: 2400,
      lastUpdated: new Date().toISOString()
    };
  }

  async executeAutomatedPO(projectId: number, trigger: any): Promise<any> {
    return {
      projectId,
      trigger,
      success: true,
      poId: Date.now(),
      message: 'PO automatically generated and sent',
      timestamp: new Date().toISOString()
    };
  }

  async getInvoiceMatchingRecords(projectId: number): Promise<any[]> {
    return [
      {
        id: 1,
        projectId,
        invoiceId: 101,
        purchaseOrderId: 201,
        vendorName: 'ABC Electric',
        invoiceAmount: 5000,
        poAmount: 5000,
        matchingScore: 1.0,
        matchingStatus: 'auto_matched',
        discrepancies: null,
        autoMatchedAt: new Date().toISOString()
      },
      {
        id: 2,
        projectId,
        invoiceId: 102,
        purchaseOrderId: 202,
        vendorName: 'PlumbPro',
        invoiceAmount: 3200,
        poAmount: 3000,
        matchingScore: 0.85,
        matchingStatus: 'requires_review',
        discrepancies: JSON.stringify([
          { field: 'amount', description: 'Invoice amount exceeds PO by $200', expected: 3000, actual: 3200 }
        ]),
        autoMatchedAt: null
      }
    ];
  }

  async getUnmatchedInvoices(projectId: number): Promise<any[]> {
    return [
      {
        id: 103,
        projectId,
        vendorName: 'HVAC Solutions',
        amount: 8500,
        createdAt: new Date().toISOString()
      }
    ];
  }

  async getUnmatchedPurchaseOrders(projectId: number): Promise<any[]> {
    return [
      {
        id: 203,
        projectId,
        vendorName: 'Flooring Express',
        amount: 12000,
        createdAt: new Date().toISOString()
      }
    ];
  }

  async autoMatchInvoices(projectId: number, threshold: number): Promise<any> {
    return {
      projectId,
      threshold,
      matchedCount: 3,
      totalProcessed: 5,
      successRate: 60,
      timestamp: new Date().toISOString()
    };
  }

  async manualMatchInvoice(projectId: number, invoiceId: number, purchaseOrderId: number): Promise<any> {
    return {
      projectId,
      invoiceId,
      purchaseOrderId,
      matched: true,
      matchingScore: 0.95,
      timestamp: new Date().toISOString()
    };
  }

  async approveInvoiceMatch(matchId: number, notes?: string): Promise<any> {
    return {
      matchId,
      approved: true,
      notes,
      timestamp: new Date().toISOString()
    };
  }

  async rejectInvoiceMatch(matchId: number, notes?: string): Promise<any> {
    return {
      matchId,
      rejected: true,
      notes,
      timestamp: new Date().toISOString()
    };
  }

  async getPaymentProcessingRecords(projectId: number): Promise<any[]> {
    return [
      {
        id: 1,
        projectId,
        invoiceId: 101,
        vendorName: 'ABC Electric',
        amount: 5000,
        paymentMethod: 'ach',
        scheduledDate: new Date().toISOString(),
        status: 'scheduled',
        paymentReference: null
      },
      {
        id: 2,
        projectId,
        invoiceId: 102,
        vendorName: 'PlumbPro',
        amount: 3200,
        paymentMethod: 'check',
        scheduledDate: new Date().toISOString(),
        status: 'processing',
        paymentReference: 'CHK-001'
      }
    ];
  }

  async getApprovedInvoices(projectId: number): Promise<any[]> {
    return [
      {
        id: 104,
        projectId,
        vendorName: 'HVAC Solutions',
        amount: 8500,
        dueDate: new Date().toISOString(),
        description: 'HVAC installation and setup',
        vendorId: 1
      }
    ];
  }

  async getPaymentStatistics(projectId: number): Promise<any> {
    return {
      projectId,
      totalPayments: 25,
      totalAmount: 125000,
      averageProcessingTime: 2.5,
      successRate: 96,
      paymentMethods: [
        { method: 'ach', count: 15, amount: 75000 },
        { method: 'check', count: 8, amount: 40000 },
        { method: 'wire', count: 2, amount: 10000 }
      ],
      lastUpdated: new Date().toISOString()
    };
  }

  async schedulePayment(paymentData: any): Promise<any> {
    return {
      id: Date.now(),
      ...paymentData,
      status: 'scheduled',
      createdAt: new Date().toISOString()
    };
  }

  async processPayment(paymentId: number): Promise<any> {
    return {
      id: paymentId,
      status: 'processing',
      processedAt: new Date().toISOString()
    };
  }

  async cancelPayment(paymentId: number): Promise<any> {
    return {
      id: paymentId,
      status: 'cancelled',
      cancelledAt: new Date().toISOString()
    };
  }

  async getFinancialDashboardSummary(projectId: number): Promise<any> {
    const costVariance = await this.getCostVarianceAnalysis(projectId);
    const profitMargin = await this.getProfitMarginAnalysis(projectId);
    const cashFlow = await this.getCashFlowForecast(projectId, 6);
    
    return {
      projectId,
      totalRevenue: profitMargin.revenue,
      totalCosts: profitMargin.directCosts,
      netProfit: profitMargin.netProfit,
      profitMargin: profitMargin.profitMargin,
      cashFlowStatus: cashFlow.projectedNetCashFlow > 0 ? 'positive' : 'negative',
      costVariance: costVariance.totalVariance,
      lastUpdated: new Date().toISOString()
    };
  }

  async generateFinancialReport(projectId: number, type: string, format: string): Promise<any> {
    const summary = await this.getFinancialDashboardSummary(projectId);
    const costVariance = await this.getCostVarianceAnalysis(projectId);
    const profitMargin = await this.getProfitMarginAnalysis(projectId);
    const cashFlow = await this.getCashFlowForecast(projectId, 6);
    
    return {
      projectId,
      reportType: type,
      format,
      summary,
      costVariance,
      profitMargin,
      cashFlow,
      generatedAt: new Date().toISOString()
    };
  }

  // Messaging methods
  async getMessageThreadsByProject(projectId: number): Promise<any[]> {
    try {
      const threadsResult = await pool.query(`
        SELECT 
          t.id,
          t.project_id as "projectId",
          t.chat_type as "chatType",
          t.participants,
          t.title,
          t.last_message_at as "lastMessageAt",
          t.is_active as "isActive",
          t.created_at as "createdAt",
          m.content as last_message_content,
          m.sender_name as last_message_sender,
          m.created_at as last_message_time,
          COALESCE(unread.count, 0) as "unreadCount"
        FROM message_threads t
        LEFT JOIN messages m ON m.id = (
          SELECT id FROM messages 
          WHERE thread_id = t.id 
          ORDER BY created_at DESC 
          LIMIT 1
        )
        LEFT JOIN (
          SELECT thread_id, COUNT(*) as count
          FROM messages 
          WHERE NOT ('1' = ANY(
            SELECT jsonb_array_elements_text(read_by)
          ))
          GROUP BY thread_id
        ) unread ON unread.thread_id = t.id
        WHERE t.project_id = $1 AND t.is_active = true
        ORDER BY t.last_message_at DESC
      `, [projectId]);

      return threadsResult.rows.map((thread: any) => ({
        id: thread.id,
        projectId: thread.projectId,
        chatType: thread.chatType,
        title: thread.title,
        participants: thread.participants || [],
        lastMessageAt: thread.lastMessageAt,
        unreadCount: thread.unreadCount || 0,
        lastMessage: thread.last_message_content ? {
          content: thread.last_message_content,
          senderName: thread.last_message_sender,
          createdAt: thread.last_message_time
        } : null,
        participantDetails: thread.participants || []
      }));
    } catch (error) {
      console.error('Error fetching message threads:', error);
      return [];
    }
  }

  async getMessagesByThread(threadId: number): Promise<any[]> {
    try {
      const messagesResult = await pool.query(`
        SELECT 
          id,
          thread_id as "threadId",
          sender_id as "senderId",
          sender_name as "senderName",
          sender_role as "senderRole",
          content,
          message_type as "messageType",
          attachments,
          read_by as "readBy",
          is_deleted as "isDeleted",
          created_at as "createdAt",
          updated_at as "updatedAt"
        FROM messages 
        WHERE thread_id = $1 AND is_deleted = false
        ORDER BY created_at ASC
      `, [threadId]);

      return messagesResult.rows.map((message: any) => ({
        id: message.id,
        threadId: message.threadId,
        senderId: message.senderId,
        senderName: message.senderName,
        senderRole: message.senderRole,
        content: message.content,
        messageType: message.messageType || 'text',
        attachments: message.attachments || [],
        readBy: message.readBy || [],
        isDeleted: message.isDeleted || false,
        createdAt: message.createdAt,
        updatedAt: message.updatedAt
      }));
    } catch (error) {
      console.error('Error fetching messages:', error);
      return [];
    }
  }

  async createMessageThread(threadData: any): Promise<any> {
    try {
      const result = await pool.query(`
        INSERT INTO message_threads (
          project_id, chat_type, participants, title, is_active, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
        RETURNING 
          id,
          project_id as "projectId",
          chat_type as "chatType",
          participants,
          title,
          is_active as "isActive",
          created_at as "createdAt",
          updated_at as "updatedAt"
      `, [
        threadData.projectId,
        threadData.chatType,
        JSON.stringify(threadData.participants || []),
        threadData.title,
        true
      ]);

      return result.rows[0];
    } catch (error) {
      console.error('Error creating message thread:', error);
      throw error;
    }
  }

  async createMessage(messageData: any): Promise<any> {
    try {
      // Insert the message
      const messageResult = await pool.query(`
        INSERT INTO messages (
          thread_id, sender_id, sender_name, sender_role, content, 
          message_type, attachments, read_by, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
        RETURNING 
          id,
          thread_id as "threadId",
          sender_id as "senderId",
          sender_name as "senderName",
          sender_role as "senderRole",
          content,
          message_type as "messageType",
          attachments,
          read_by as "readBy",
          created_at as "createdAt"
      `, [
        messageData.threadId,
        messageData.senderId,
        messageData.senderName,
        messageData.senderRole,
        messageData.content,
        messageData.messageType || 'text',
        JSON.stringify(messageData.attachments || []),
        JSON.stringify([messageData.senderId]) // Mark as read by sender
      ]);

      // Update thread's last_message_at
      await pool.query(`
        UPDATE message_threads 
        SET last_message_at = NOW(), updated_at = NOW()
        WHERE id = $1
      `, [messageData.threadId]);

      return messageResult.rows[0];
    } catch (error) {
      console.error('Error creating message:', error);
      throw error;
    }
  }

  async getUnreadMessageCount(projectId: number, userId: string): Promise<number> {
    try {
      const result = await pool.query(`
        SELECT COUNT(*) as count
        FROM messages m
        JOIN message_threads t ON m.thread_id = t.id
        WHERE t.project_id = $1 
        AND m.sender_id != $2
        AND NOT ($2 = ANY(
          SELECT jsonb_array_elements_text(m.read_by)
        ))
        AND m.is_deleted = false
        AND t.is_active = true
      `, [projectId, userId]);

      return parseInt(result.rows[0]?.count || '0');
    } catch (error) {
      console.error('Error getting unread message count:', error);
      return 0;
    }
  }

  async markThreadAsRead(threadId: number, userId: string): Promise<void> {
    try {
      // Mark all messages in the thread as read by this user
      await pool.query(`
        UPDATE messages 
        SET read_by = CASE 
          WHEN read_by IS NULL THEN jsonb_build_array($2)
          WHEN NOT (read_by ? $2) THEN read_by || jsonb_build_array($2)
          ELSE read_by
        END,
        updated_at = NOW()
        WHERE thread_id = $1 AND sender_id != $2
      `, [threadId, userId]);
    } catch (error) {
      console.error('Error marking thread as read:', error);
    }
  }

  async getContactsByProject(projectId: number): Promise<any[]> {
    // Return existing contacts filtered by project - for now return all
    return this.getContacts();
  }

  // Weather location methods
  async getWeatherLocations(): Promise<WeatherLocation[]> {
    return await db.select().from(weatherLocations).orderBy(desc(weatherLocations.isDefault), weatherLocations.name);
  }

  async createWeatherLocation(data: InsertWeatherLocation): Promise<WeatherLocation> {
    const [created] = await db
      .insert(weatherLocations)
      .values(data)
      .returning();
    return created;
  }

  async updateWeatherLocation(id: number, data: Partial<InsertWeatherLocation>): Promise<WeatherLocation | undefined> {
    const [updated] = await db
      .update(weatherLocations)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(weatherLocations.id, id))
      .returning();
    return updated;
  }

  async deleteWeatherLocation(id: number): Promise<boolean> {
    const result = await db
      .delete(weatherLocations)
      .where(eq(weatherLocations.id, id));
    return result.rowCount > 0;
  }

  async setDefaultWeatherLocation(id: number): Promise<boolean> {
    // First remove default flag from all locations
    await db
      .update(weatherLocations)
      .set({ isDefault: false });
    
    // Then set the specified location as default
    const [updated] = await db
      .update(weatherLocations)
      .set({ isDefault: true })
      .where(eq(weatherLocations.id, id))
      .returning();
    
    return !!updated;
  }
  // ===== SCHEDULE SECTIONS METHODS =====
  async getScheduleSections(projectId: number): Promise<any[]> {
    return await db
      .select()
      .from(scheduleSections)
      .where(eq(scheduleSections.projectId, projectId))
      .orderBy(scheduleSections.orderIndex);
  }

  async createScheduleSection(projectId: number, sectionData: any): Promise<any> {
    const [section] = await db
      .insert(scheduleSections)
      .values({
        projectId,
        title: sectionData.title,
        description: sectionData.description,
        orderIndex: sectionData.orderIndex || 0,
        color: sectionData.color,
        isCollapsed: false
      })
      .returning();
    return section;
  }

  async updateScheduleSection(sectionId: number, updates: any): Promise<any> {
    const [section] = await db
      .update(scheduleSections)
      .set({
        ...updates,
        updatedAt: new Date()
      })
      .where(eq(scheduleSections.id, sectionId))
      .returning();
    return section;
  }

  async deleteScheduleSection(sectionId: number): Promise<void> {
    // First, move all tasks in this section to unassigned (sectionId = null)
    await db
      .update(projectTasks)
      .set({ sectionId: null })
      .where(eq(projectTasks.sectionId, sectionId));
    
    // Then delete the section
    await db
      .delete(scheduleSections)
      .where(eq(scheduleSections.id, sectionId));
  }

  async assignTaskToSection(taskId: number, sectionId: number | null): Promise<any> {
    const [task] = await db
      .update(projectTasks)
      .set({ 
        sectionId,
        updatedAt: new Date()
      })
      .where(eq(projectTasks.id, taskId))
      .returning();
    return task;
  }

  async reorderTasksInSection(sectionId: number, taskOrders: { taskId: number; orderIndex: number }[]): Promise<void> {
    for (const { taskId, orderIndex } of taskOrders) {
      await db
        .update(projectTasks)
        .set({ 
          orderIndex,
          updatedAt: new Date()
        })
        .where(eq(projectTasks.id, taskId));
    }
  }

  // Enhanced messaging methods for portal system
  async getMessageThreadsByProjects(projectIds: number[]): Promise<any[]> {
    try {
      if (projectIds.length === 0) return [];
      
      const threadsResult = await pool.query(`
        SELECT 
          t.id,
          t.project_id as "projectId",
          t.chat_type as "chatType",
          t.participants,
          t.title,
          t.last_message_at as "lastMessageAt",
          t.is_active as "isActive",
          t.created_at as "createdAt",
          t.priority,
          t.tags,
          m.content as last_message_content,
          m.sender_name as last_message_sender,
          m.created_at as last_message_time,
          COALESCE(unread.count, 0) as "unreadCount"
        FROM message_threads t
        LEFT JOIN messages m ON m.id = (
          SELECT id FROM messages 
          WHERE thread_id = t.id 
          ORDER BY created_at DESC 
          LIMIT 1
        )
        LEFT JOIN (
          SELECT thread_id, COUNT(*) as count
          FROM messages 
          WHERE NOT ('1' = ANY(
            SELECT jsonb_array_elements_text(read_by)
          ))
          GROUP BY thread_id
        ) unread ON unread.thread_id = t.id
        WHERE t.project_id = ANY($1) AND t.is_active = true
        ORDER BY t.last_message_at DESC
      `, [projectIds]);

      return this.formatThreadResults(threadsResult.rows);
    } catch (error) {
      console.error('Error fetching message threads by projects:', error);
      return [];
    }
  }

  async getMessageThreadsByContext(context: string, userId: string): Promise<any[]> {
    try {
      const threadsResult = await pool.query(`
        SELECT 
          t.id,
          t.project_id as "projectId",
          t.chat_type as "chatType",
          t.participants,
          t.title,
          t.last_message_at as "lastMessageAt",
          t.is_active as "isActive",
          t.created_at as "createdAt",
          t.priority,
          t.tags,
          m.content as last_message_content,
          m.sender_name as last_message_sender,
          m.created_at as last_message_time,
          COALESCE(unread.count, 0) as "unreadCount"
        FROM message_threads t
        LEFT JOIN messages m ON m.id = (
          SELECT id FROM messages 
          WHERE thread_id = t.id 
          ORDER BY created_at DESC 
          LIMIT 1
        )
        LEFT JOIN (
          SELECT thread_id, COUNT(*) as count
          FROM messages 
          WHERE NOT ($2 = ANY(
            SELECT jsonb_array_elements_text(read_by)
          ))
          GROUP BY thread_id
        ) unread ON unread.thread_id = t.id
        WHERE t.is_active = true 
        AND $2 = ANY(
          SELECT jsonb_array_elements_text(t.participants)
        )
        ORDER BY t.last_message_at DESC
      `, [context, userId]);

      return this.formatThreadResults(threadsResult.rows);
    } catch (error) {
      console.error('Error fetching message threads by context:', error);
      return [];
    }
  }

  async getAllMessageThreads(): Promise<any[]> {
    try {
      const threadsResult = await pool.query(`
        SELECT 
          t.id,
          t.project_id as "projectId",
          t.chat_type as "chatType",
          t.participants,
          t.title,
          t.last_message_at as "lastMessageAt",
          t.is_active as "isActive",
          t.created_at as "createdAt",
          t.priority,
          t.tags,
          m.content as last_message_content,
          m.sender_name as last_message_sender,
          m.created_at as last_message_time,
          COALESCE(unread.count, 0) as "unreadCount"
        FROM message_threads t
        LEFT JOIN messages m ON m.id = (
          SELECT id FROM messages 
          WHERE thread_id = t.id 
          ORDER BY created_at DESC 
          LIMIT 1
        )
        LEFT JOIN (
          SELECT thread_id, COUNT(*) as count
          FROM messages 
          GROUP BY thread_id
        ) unread ON unread.thread_id = t.id
        WHERE t.is_active = true
        ORDER BY t.last_message_at DESC
      `);

      return this.formatThreadResults(threadsResult.rows);
    } catch (error) {
      console.error('Error fetching all message threads:', error);
      return [];
    }
  }

  async getTotalUnreadMessageCount(userId: string): Promise<number> {
    try {
      const result = await pool.query(`
        SELECT COUNT(*) as count
        FROM messages m
        JOIN message_threads t ON t.id = m.thread_id
        WHERE t.is_active = true
        AND NOT ($1 = ANY(
          SELECT jsonb_array_elements_text(m.read_by)
        ))
        AND $1 = ANY(
          SELECT jsonb_array_elements_text(t.participants)
        )
      `, [userId]);

      return parseInt(result.rows[0]?.count || '0');
    } catch (error) {
      console.error('Error fetching total unread message count:', error);
      return 0;
    }
  }

  async getMessageNotifications(userId: string): Promise<any[]> {
    try {
      const result = await pool.query(`
        SELECT 
          m.id::text as id,
          m.thread_id as "threadId",
          t.project_id as "projectId",
          m.sender_name as "senderName",
          m.content,
          'new_message' as type,
          t.title,
          m.created_at as "createdAt",
          NOT ($1 = ANY(
            SELECT jsonb_array_elements_text(m.read_by)
          )) as "isRead"
        FROM messages m
        JOIN message_threads t ON t.id = m.thread_id
        WHERE t.is_active = true
        AND m.sender_id != $1
        AND $1 = ANY(
          SELECT jsonb_array_elements_text(t.participants)
        )
        ORDER BY m.created_at DESC
        LIMIT 50
      `, [userId]);

      return result.rows.map(row => ({
        ...row,
        isRead: !row.isRead
      }));
    } catch (error) {
      console.error('Error fetching message notifications:', error);
      return [];
    }
  }

  async markNotificationAsRead(notificationId: string, userId: string): Promise<void> {
    try {
      await pool.query(`
        UPDATE messages 
        SET read_by = read_by || jsonb_build_array($2::text)
        WHERE id = $1 
        AND NOT ($2::text = ANY(
          SELECT jsonb_array_elements_text(read_by)
        ))
      `, [parseInt(notificationId), userId]);
    } catch (error) {
      console.error('Error marking notification as read:', error);
      throw error;
    }
  }

  async markAllNotificationsAsRead(userId: string): Promise<void> {
    try {
      await pool.query(`
        UPDATE messages 
        SET read_by = read_by || jsonb_build_array($1::text)
        WHERE thread_id IN (
          SELECT id FROM message_threads t
          WHERE t.is_active = true
          AND $1 = ANY(
            SELECT jsonb_array_elements_text(t.participants)
          )
        )
        AND NOT ($1::text = ANY(
          SELECT jsonb_array_elements_text(read_by)
        ))
      `, [userId]);
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
      throw error;
    }
  }

  async deleteNotification(notificationId: string): Promise<void> {
    // For now, we don't actually delete messages, just mark as read
    return;
  }

  async updateMessageThread(threadId: number, updates: any): Promise<any> {
    try {
      const setClause = [];
      const values = [threadId];
      let paramIndex = 2;

      if (updates.title) {
        setClause.push(`title = $${paramIndex++}`);
        values.push(updates.title);
      }

      if (updates.chatType) {
        setClause.push(`chat_type = $${paramIndex++}`);
        values.push(updates.chatType);
      }

      if (updates.priority) {
        setClause.push(`priority = $${paramIndex++}`);
        values.push(updates.priority);
      }

      if (updates.tags) {
        setClause.push(`tags = $${paramIndex++}`);
        values.push(JSON.stringify(updates.tags));
      }

      if (updates.isActive !== undefined) {
        setClause.push(`is_active = $${paramIndex++}`);
        values.push(updates.isActive);
      }

      if (setClause.length === 0) {
        throw new Error('No valid fields to update');
      }

      setClause.push('updated_at = NOW()');

      const result = await pool.query(`
        UPDATE message_threads 
        SET ${setClause.join(', ')}
        WHERE id = $1
        RETURNING *
      `, values);

      return result.rows[0];
    } catch (error) {
      console.error('Error updating message thread:', error);
      throw error;
    }
  }

  async archiveMessageThread(threadId: number, userId: string): Promise<void> {
    try {
      await pool.query(`
        UPDATE message_threads 
        SET is_active = false, updated_at = NOW()
        WHERE id = $1
      `, [threadId]);
    } catch (error) {
      console.error('Error archiving message thread:', error);
      throw error;
    }
  }

  async deleteMessageThread(threadId: number): Promise<void> {
    try {
      await pool.query('DELETE FROM messages WHERE thread_id = $1', [threadId]);
      await pool.query('DELETE FROM message_threads WHERE id = $1', [threadId]);
    } catch (error) {
      console.error('Error deleting message thread:', error);
      throw error;
    }
  }

  private formatThreadResults(rows: any[]): any[] {
    return rows.map((thread: any) => ({
      id: thread.id,
      projectId: thread.projectId,
      chatType: thread.chatType,
      title: thread.title,
      participants: thread.participants || [],
      lastMessageAt: thread.lastMessageAt,
      unreadCount: thread.unreadCount || 0,
      priority: thread.priority,
      tags: thread.tags ? JSON.parse(thread.tags) : [],
      isActive: thread.isActive,
      createdAt: thread.createdAt,
      lastMessage: thread.last_message_content ? {
        content: thread.last_message_content,
        senderName: thread.last_message_sender,
        createdAt: thread.last_message_time
      } : null,
      participantDetails: thread.participants || []
    }));
  }

  // Payment Tracking Methods
  async addPaymentToInvoice(invoiceId: number, paymentData: any): Promise<Invoice | undefined> {
    try {
      // Get current invoice data
      const [invoice] = await db
        .select()
        .from(invoices)
        .where(eq(invoices.id, invoiceId));

      if (!invoice) {
        throw new Error('Invoice not found');
      }

      // Parse existing payments with error handling
      let existingPayments = [];
      try {
        existingPayments = invoice.payments && invoice.payments !== '' ? JSON.parse(invoice.payments) : [];
      } catch (error) {
        console.warn('Failed to parse existing payments JSON:', error);
        existingPayments = [];
      }
      
      // Add new payment
      const newPayment = {
        id: Date.now(),
        amount: parseFloat(paymentData.amount) || 0,
        paymentDate: paymentData.paymentDate,
        paymentMethod: paymentData.paymentMethod || 'check',
        notes: paymentData.notes || '',
        paidBy: paymentData.paidBy || 'unknown',
        createdAt: new Date().toISOString()
      };

      existingPayments.push(newPayment);

      // Calculate new totals
      const totalPaid = existingPayments.reduce((sum, payment) => sum + payment.amount, 0);
      const balanceRemaining = invoice.amount - totalPaid;

      // Update invoice
      const [updated] = await db
        .update(invoices)
        .set({
          payments: JSON.stringify(existingPayments),
          totalPaid: totalPaid.toString(),
          balanceRemaining: balanceRemaining.toString(),
          status: balanceRemaining <= 0 ? 'paid' : 'partial',
          updatedAt: new Date()
        })
        .where(eq(invoices.id, invoiceId))
        .returning();

      // Update linked PO if exists
      if (invoice.poId) {
        await this.updatePOPaymentStatus(invoice.poId);
      }

      return updated;
    } catch (error) {
      console.error('Error adding payment to invoice:', error);
      throw error;
    }
  }

  async getAvailablePOsForInvoice(projectId: number): Promise<PurchaseOrder[]> {
    try {
      return await db
        .select()
        .from(purchaseOrders)
        .where(
          and(
            eq(purchaseOrders.projectId, projectId),
            eq(purchaseOrders.status, 'signed')
          )
        )
        .orderBy(desc(purchaseOrders.createdAt));
    } catch (error) {
      console.error('Error getting available POs:', error);
      return [];
    }
  }

  async linkInvoiceToPO(invoiceId: number, poId: number): Promise<boolean> {
    try {
      await db
        .update(invoices)
        .set({
          poId: poId,
          updatedAt: new Date()
        })
        .where(eq(invoices.id, invoiceId));

      // Update PO payment status
      await this.updatePOPaymentStatus(poId);

      return true;
    } catch (error) {
      console.error('Error linking invoice to PO:', error);
      return false;
    }
  }

  async updatePOPaymentStatus(poId: number): Promise<PurchaseOrder | undefined> {
    try {
      // Get PO
      const [po] = await db
        .select()
        .from(purchaseOrders)
        .where(eq(purchaseOrders.id, poId));

      if (!po) {
        return undefined;
      }

      // Get all linked invoices
      const linkedInvoices = await db
        .select()
        .from(invoices)
        .where(eq(invoices.poId, poId));

      // Calculate totals
      const totalInvoiced = linkedInvoices.reduce((sum, inv) => sum + inv.amount, 0);
      const totalPaid = linkedInvoices.reduce((sum, inv) => sum + parseFloat(inv.totalPaid || '0'), 0);
      const balanceRemaining = po.amount - totalPaid;

      // Determine PO status
      let poStatus = 'unpaid';
      if (totalPaid >= po.amount) {
        poStatus = 'paid';
      } else if (totalPaid > 0) {
        poStatus = 'partial';
      }

      // Update applied invoices array
      const appliedInvoices = linkedInvoices.map(inv => ({
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        amount: inv.amount,
        totalPaid: parseFloat(inv.totalPaid || '0'),
        balanceRemaining: parseFloat(inv.balanceRemaining || '0')
      }));

      // Update PO
      const [updated] = await db
        .update(purchaseOrders)
        .set({
          appliedInvoices: JSON.stringify(appliedInvoices),
          totalPaid: totalPaid.toString(),
          balanceRemaining: balanceRemaining.toString(),
          poStatus: poStatus,
          updatedAt: new Date()
        })
        .where(eq(purchaseOrders.id, poId))
        .returning();

      return updated;
    } catch (error) {
      console.error('Error updating PO payment status:', error);
      throw error;
    }
  }

  async calculatePOBalances(): Promise<void> {
    try {
      // Get all POs
      const pos = await db
        .select()
        .from(purchaseOrders)
        .where(eq(purchaseOrders.status, 'signed'));

      for (const po of pos) {
        await this.updatePOPaymentStatus(po.id);
      }
    } catch (error) {
      console.error('Error calculating PO balances:', error);
      throw error;
    }
  }

  // ============================================================================
  // SCHEDULE MANAGEMENT - Database Implementation
  // ============================================================================

  async getProjectSchedule(projectId: number): Promise<any> {
    try {
      const ScheduleService = await import('./services/ScheduleService');
      return await ScheduleService.default.getProjectSchedule(projectId);
    } catch (error) {
      console.error('Error getting project schedule:', error);
      throw error;
    }
  }

  async createScheduleTask(projectId: number, taskData: any): Promise<any> {
    try {
      const ScheduleService = await import('./services/ScheduleService');
      return await ScheduleService.default.createTask({
        ...taskData,
        projectId,
      });
    } catch (error) {
      console.error('Error creating schedule task:', error);
      throw error;
    }
  }

  async updateScheduleTask(taskId: number, updates: any): Promise<any> {
    try {
      const ScheduleService = await import('./services/ScheduleService');
      return await ScheduleService.default.updateTask(taskId, updates);
    } catch (error) {
      console.error('Error updating schedule task:', error);
      throw error;
    }
  }

  async deleteScheduleTask(taskId: number): Promise<boolean> {
    try {
      const ScheduleService = await import('./services/ScheduleService');
      return await ScheduleService.default.deleteTask(taskId);
    } catch (error) {
      console.error('Error deleting schedule task:', error);
      return false;
    }
  }



  async createTaskDependency(projectId: number, depData: any): Promise<any> {
    try {
      const ScheduleService = await import('./services/ScheduleService');
      return await ScheduleService.default.createDependency({
        ...depData,
        projectId,
      });
    } catch (error) {
      console.error('Error creating task dependency:', error);
      throw error;
    }
  }

  async deleteTaskDependency(dependencyId: number): Promise<boolean> {
    try {
      const ScheduleService = await import('./services/ScheduleService');
      return await ScheduleService.default.deleteDependency(dependencyId);
    } catch (error) {
      console.error('Error deleting task dependency:', error);
      return false;
    }
  }

  // Auto-scheduling functionality
  async generateScheduleFromEstimate(projectId: number, estimateId: number): Promise<any> {
    try {
      // Get estimate items to create tasks
      const estimate = await this.getEstimate(estimateId);
      if (!estimate) {
        throw new Error('Estimate not found');
      }

      const estimateItems = await this.getEstimateItems(estimateId);
      const ScheduleService = await import('./services/ScheduleService');

      // Create tasks from estimate items
      const tasks = [];
      let currentDate = new Date();
      
      for (const item of estimateItems) {
        const duration = item.duration || 1; // Default 1 day if no duration
        const endDate = new Date(currentDate);
        endDate.setDate(endDate.getDate() + duration);

        const task = await ScheduleService.default.createTask({
          projectId,
          title: item.description || item.trade,
          trade: item.trade,
          startDate: new Date(currentDate),
          endDate,
          duration,
          description: item.description,
          contactId: item.contactId,
        });

        tasks.push(task);
        
        // Move to next business day for sequential tasks
        currentDate = new Date(endDate);
        currentDate.setDate(currentDate.getDate() + 1);
      }

      return {
        success: true,
        message: `Generated ${tasks.length} tasks from estimate`,
        tasks,
      };
    } catch (error) {
      console.error('Error generating schedule from estimate:', error);
      throw error;
    }
  }

  // ============================================================================
  // BRANDING MANAGEMENT - Database Implementation
  // ============================================================================

  async getCompanyBranding(): Promise<{ logoUrl?: string; [key: string]: any }> {
    try {
      // Return default branding configuration
      // In a full implementation, this would be stored in a database table
      return {
        logoUrl: null,
        companyName: 'Skyeline Homes',
        primaryColor: '#2F80ED',
        secondaryColor: '#56CCF2',
        accentColor: '#2F80ED',
        themeMode: 'light'
      };
    } catch (error) {
      console.error('Error getting company branding:', error);
      // Return default fallback
      return {
        logoUrl: null,
        companyName: 'Skyeline Homes',
        primaryColor: '#2F80ED',
        secondaryColor: '#56CCF2',
        accentColor: '#2F80ED',
        themeMode: 'light'
      };
    }
  }

  async updateCompanyBranding(brandingData: { logoUrl?: string | null; [key: string]: any }): Promise<{ logoUrl?: string; [key: string]: any }> {
    try {
      // In a full implementation, this would update a database table
      // For now, just return the updated data
      // Development logging removed
      
      return {
        logoUrl: brandingData.logoUrl || null,
        companyName: brandingData.companyName || 'Skyeline Homes',
        primaryColor: brandingData.primaryColor || '#2F80ED',
        secondaryColor: brandingData.secondaryColor || '#56CCF2',
        accentColor: brandingData.accentColor || '#2F80ED',
        themeMode: brandingData.themeMode || 'light'
      };
    } catch (error) {
      console.error('Error updating company branding:', error);
      throw error;
    }
  }

  // Schedule Template methods
  async createScheduleTemplate(templateData: InsertScheduleTemplate): Promise<ScheduleTemplate> {
    const [template] = await db
      .insert(scheduleTemplates)
      .values({
        name: templateData.name,
        projectId: templateData.projectId,
        description: templateData.description,
        tasksData: templateData.tasksData,
        dependenciesData: templateData.dependenciesData,
        createdBy: templateData.createdBy,
        isPublic: templateData.isPublic || false,
        usageCount: 0,
      })
      .returning();
    
    return template;
  }

  async getScheduleTemplates(createdBy?: number): Promise<ScheduleTemplate[]> {
    const whereClause = createdBy 
      ? eq(scheduleTemplates.createdBy, createdBy)
      : undefined;
    
    return await db
      .select()
      .from(scheduleTemplates)
      .where(whereClause)
      .orderBy(desc(scheduleTemplates.createdAt));
  }

  async getScheduleTemplateById(id: number): Promise<ScheduleTemplate | undefined> {
    const [template] = await db
      .select()
      .from(scheduleTemplates)
      .where(eq(scheduleTemplates.id, id));
    
    return template;
  }

  async copyScheduleFromTemplate(templateId: number, targetProjectId: number, projectStartDate: string): Promise<{ tasks: ProjectTask[], dependencies: TaskDependency[] }> {
    // Get the template
    const template = await this.getScheduleTemplateById(templateId);
    if (!template) {
      throw new Error('Template not found');
    }

    // Get the source project's tasks and dependencies
    const sourceTasks = await this.getProjectTasks(template.projectId);
    const sourceDependencies = await this.getProjectDependencies(template.projectId);

    if (sourceTasks.length === 0) {
      return { tasks: [], dependencies: [] };
    }

    // Create mapping of old task IDs to new task IDs
    const taskIdMapping = new Map<number, number>();
    const newTasks: ProjectTask[] = [];
    
    // Calculate date offset
    const sourceStartDate = new Date(Math.min(...sourceTasks.map(t => new Date(t.startDate).getTime())));
    const targetStartDate = new Date(projectStartDate);
    const dateOffset = targetStartDate.getTime() - sourceStartDate.getTime();

    // Copy tasks
    for (const sourceTask of sourceTasks) {
      const newStartDate = new Date(new Date(sourceTask.startDate).getTime() + dateOffset);
      const newEndDate = new Date(new Date(sourceTask.endDate).getTime() + dateOffset);

      const newTask = await this.createProjectTask({
        projectId: targetProjectId,
        title: sourceTask.title,
        trade: sourceTask.trade,
        contactId: null, // Will need to be reassigned
        estimateItemId: null, // Will need to be reassigned
        startDate: newStartDate.toISOString(),
        endDate: newEndDate.toISOString(),
        duration: sourceTask.duration,
        status: 'Scheduled',
        description: sourceTask.description,
        notes: `Copied from template: ${template.name}`,
        dependsOn: [],
        isAutoGenerated: true,
        color: sourceTask.color,
        createdBy: template.createdBy,
      });

      taskIdMapping.set(sourceTask.id, newTask.id);
      newTasks.push(newTask);
    }

    // Copy dependencies with updated task IDs
    const newDependencies: TaskDependency[] = [];
    for (const sourceDep of sourceDependencies) {
      const newPredecessorId = taskIdMapping.get(sourceDep.predecessorId);
      const newSuccessorId = taskIdMapping.get(sourceDep.successorId);

      if (newPredecessorId && newSuccessorId) {
        const newDependency = await this.createDependency({
          predecessorId: newPredecessorId,
          successorId: newSuccessorId,
          dependencyType: sourceDep.dependencyType || 'finish-to-start',
          lag: sourceDep.lag || 0,
        });
        newDependencies.push(newDependency);
      }
    }

    // Increment template usage count
    await this.incrementTemplateUsage(templateId);

    return { tasks: newTasks, dependencies: newDependencies };
  }

  async updateScheduleTemplate(id: number, updateData: Partial<InsertScheduleTemplate>): Promise<ScheduleTemplate | undefined> {
    const [updated] = await db
      .update(scheduleTemplates)
      .set({
        name: updateData.name,
        description: updateData.description,
        updatedAt: new Date(),
      })
      .where(eq(scheduleTemplates.id, id))
      .returning();
    
    return updated;
  }

  async deleteScheduleTemplate(id: number): Promise<boolean> {
    const result = await db
      .delete(scheduleTemplates)
      .where(eq(scheduleTemplates.id, id));
    
    return result.rowCount > 0;
  }

  async incrementTemplateUsage(templateId: number): Promise<void> {
    await db
      .update(scheduleTemplates)
      .set({
        usageCount: sql`${scheduleTemplates.usageCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(scheduleTemplates.id, templateId));
  }

  // Missing method implementations to fix TypeScript errors
  async createTask(taskData: any): Promise<ProjectTask> {
    // Development logging removed
    try {
      const ScheduleService = await import('./services/ScheduleService');
      return await ScheduleService.default.createTask({
        projectId: taskData.projectId,
        title: taskData.title,
        description: taskData.description,
        startDate: taskData.startDate,
        endDate: taskData.endDate,
        status: taskData.status || 'not_started',
        assignedTo: taskData.assignedTo
      });
    } catch (error) {
      console.error('❌ Error creating task:', error);
      throw error;
    }
  }

  async getBidItems(bidId: number): Promise<any[]> {
    try {
      const bid = await db.select().from(bids).where(eq(bids.id, bidId));
      if (!bid.length) return [];
      return bid[0].items || [];
    } catch (error) {
      console.error('Error fetching bid items:', error);
      return [];
    }
  }

  async getBidInvitationsByProject(projectId: number): Promise<any[]> {
    try {
      // If bidInvitations table doesn't exist, return from bidProcesses
      const processes = await db.select().from(bidProcesses)
        .where(eq(bidProcesses.projectId, projectId));
      return processes;
    } catch (error) {
      console.error('Error fetching bid invitations by project:', error);
      return [];
    }
  }

  async getBidInvitationsBySubcontractor(subcontractorId: number): Promise<any[]> {
    try {
      // If bidInvitations table doesn't exist, return from bidProcesses
      const processes = await db.select().from(bidProcesses)
        .where(eq(bidProcesses.contactId, subcontractorId));
      return processes;
    } catch (error) {
      console.error('Error fetching bid invitations by subcontractor:', error);
      return [];
    }
  }

  async getBidResponseDetails(responseId: number): Promise<any> {
    try {
      const [response] = await db.select().from(bidResponses)
        .where(eq(bidResponses.id, responseId));
      return response || null;
    } catch (error) {
      console.error('Error fetching bid response details:', error);
      return null;
    }
  }

  async getEstimatesByProjectId(projectId: number): Promise<Estimate[]> {
    return this.getEstimatesByProject(projectId);
  }

  async updateBidProcess(processId: number, updateData: any): Promise<BidProcess | undefined> {
    try {
      const [updated] = await db.update(bidProcesses)
        .set(updateData)
        .where(eq(bidProcesses.id, processId))
        .returning();
      return updated;
    } catch (error) {
      console.error('Error updating bid process:', error);
      return undefined;
    }
  }

  async getSubcontractorSchedule(subcontractorId: number): Promise<any[]> {
    try {
      const tasks = await db.select().from(projectTasks)
        .where(eq(projectTasks.assignedTo, subcontractorId));
      return tasks;
    } catch (error) {
      console.error('Error fetching subcontractor schedule:', error);
      return [];
    }
  }

  async getSubcontractorPurchaseOrders(subcontractorId: number): Promise<PurchaseOrder[]> {
    try {
      const pos = await db.select().from(purchaseOrders)
        .where(eq(purchaseOrders.contactId, subcontractorId));
      return pos;
    } catch (error) {
      console.error('Error fetching subcontractor purchase orders:', error);
      return [];
    }
  }

  async getSubcontractorProgressPhotos(subcontractorId: number): Promise<any[]> {
    try {
      const photos = await db.select().from(projectPhotos)
        .where(eq(projectPhotos.uploadedBy, subcontractorId));
      return photos;
    } catch (error) {
      console.error('Error fetching subcontractor progress photos:', error);
      return [];
    }
  }

  async createProgressPhoto(photoData: any): Promise<any> {
    return this.createProjectPhoto(photoData);
  }

  async updateBidResponseAttachments(responseId: number, attachments: any[]): Promise<BidResponse | undefined> {
    try {
      const [updated] = await db.update(bidResponses)
        .set({ attachments: JSON.stringify(attachments) })
        .where(eq(bidResponses.id, responseId))
        .returning();
      return updated;
    } catch (error) {
      console.error('Error updating bid response attachments:', error);
      return undefined;
    }
  }

  async getProjectEstimates(projectId: number): Promise<Estimate[]> {
    return this.getEstimatesByProject(projectId);
  }

  async getSystemSetting(key: string): Promise<any> {
    return null; // System settings not implemented in current schema
  }

  async setSystemSetting(key: string, value: any): Promise<any> {
    return value; // System settings not implemented in current schema
  }

  async deleteSystemSetting(key: string): Promise<boolean> {
    return true; // System settings not implemented in current schema
  }

  async getContact(id: number): Promise<Contact | undefined> {
    return this.getContactById(id);
  }

  // ===== TRADES MANAGEMENT METHODS =====
  private tradesInitialized = false;
  
  private async ensureTradesTable(): Promise<void> {
    if (this.tradesInitialized) return;
    
    try {
      // Try to query the table first - if it fails, create it
      await db.execute(sql`SELECT 1 FROM trades LIMIT 1`);
      this.tradesInitialized = true;
    } catch (error) {
      // Table doesn't exist, create it
      try {
        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS trades (
            id SERIAL PRIMARY KEY,
            name VARCHAR(100) NOT NULL UNIQUE,
            description TEXT,
            category VARCHAR(50) DEFAULT 'General',
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);

        // Insert default trades only if table is empty
        const count = await db.execute(sql`SELECT COUNT(*) as count FROM trades`);
        if (count.rows[0]?.count === 0) {
          await db.execute(sql`
            INSERT INTO trades (name, description, category) VALUES
            ('General Contracting', 'General construction and project management', 'Construction'),
            ('Excavation', 'Site preparation and excavation work', 'Site Work'),
            ('Foundation', 'Foundation and concrete work', 'Structural'),
            ('Framing', 'Structural framing and carpentry', 'Structural'),
            ('Roofing', 'Roofing installation and repair', 'Exterior'),
            ('Electrical', 'Electrical installation and repair', 'MEP'),
            ('Plumbing', 'Plumbing installation and repair', 'MEP'),
            ('HVAC', 'Heating, ventilation, and air conditioning', 'MEP'),
            ('Insulation', 'Insulation installation', 'Interior'),
            ('Drywall', 'Drywall installation and finishing', 'Interior'),
            ('Flooring', 'Floor installation and finishing', 'Interior'),
            ('Painting', 'Interior and exterior painting', 'Finishes'),
            ('Cabinets', 'Cabinet installation', 'Finishes'),
            ('Countertops', 'Countertop installation', 'Finishes'),
            ('Landscaping', 'Landscaping and site finishing', 'Site Work')
          `);
        }
        this.tradesInitialized = true;
      } catch (createError) {
        console.error('Error creating trades table:', createError);
      }
    }
  }

  async getAllTrades(): Promise<any[]> {
    try {
      // Check cache first
      const cacheKey = CacheKeys.trades;
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        return cached;
      }

      await this.ensureTradesTable();

      const result = await db.execute(sql`
        SELECT 
          id,
          name,
          description,
          category,
          is_active as "isActive",
          created_at as "createdAt",
          updated_at as "updatedAt"
        FROM trades 
        WHERE is_active = true
        ORDER BY category, name
      `);

      // Cache for 1 hour
      await cacheService.set(cacheKey, result.rows, CacheTTL.MEDIUM);
      return result.rows;
    } catch (error) {
      console.error('Error getting trades:', error);
      return [];
    }
  }

  async createTrade(tradeData: any): Promise<any> {
    try {
      const result = await db.execute(sql`
        INSERT INTO trades (name, description, category, is_active)
        VALUES (${tradeData.name}, ${tradeData.description}, ${tradeData.category}, ${tradeData.isActive})
        RETURNING id, name, description, category, is_active as "isActive", created_at as "createdAt", updated_at as "updatedAt"
      `);

      return result.rows[0];
    } catch (error) {
      console.error('Error creating trade:', error);
      throw error;
    }
  }

  async updateTrade(id: number, updateData: any): Promise<any> {
    try {
      const result = await db.execute(sql`
        UPDATE trades 
        SET 
          name = ${updateData.name},
          description = ${updateData.description},
          category = ${updateData.category},
          is_active = ${updateData.isActive},
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ${id}
        RETURNING id, name, description, category, is_active as "isActive", created_at as "createdAt", updated_at as "updatedAt"
      `);

      return result.rows[0];
    } catch (error) {
      console.error('Error updating trade:', error);
      throw error;
    }
  }

  async deleteTrade(id: number): Promise<boolean> {
    try {
      const result = await db.execute(sql`
        DELETE FROM trades WHERE id = ${id}
      `);

      return result.rowCount > 0;
    } catch (error) {
      console.error('Error deleting trade:', error);
      return false;
    }
  }

  async getTradeCategories(): Promise<string[]> {
    try {
      const result = await db.execute(sql`
        SELECT DISTINCT category 
        FROM trades 
        WHERE is_active = true 
        ORDER BY category
      `);

      return result.rows.map((row: any) => row.category);
    } catch (error) {
      console.error('Error getting trade categories:', error);
      return [];
    }
  }

  // User management methods implementation
  async getAllUsers(): Promise<User[]> {
    try {
      const result = await db
        .select()
        .from(users)
        .orderBy(desc(users.createdAt));
      
      return result;
    } catch (error) {
      console.error('Error getting all users:', error);
      return [];
    }
  }

  async getUserById(id: number): Promise<User | undefined> {
    try {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, id));
      
      return user;
    } catch (error) {
      console.error('Error getting user by ID:', error);
      return undefined;
    }
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    try {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, email));
      
      return user;
    } catch (error) {
      console.error('Error getting user by email:', error);
      return undefined;
    }
  }

  async getUserByFirebaseUid(firebaseUid: string): Promise<User | undefined> {
    try {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.firebaseUid, firebaseUid));
      
      return user;
    } catch (error) {
      console.error('Error getting user by Firebase UID:', error);
      return undefined;
    }
  }

  async createOrUpdateUserFromFirebase(firebaseUser: { uid: string; email: string; name?: string; displayName?: string }): Promise<User> {
    try {
      // First, check if user exists by Firebase UID
      let existingUser = await this.getUserByFirebaseUid(firebaseUser.uid);
      
      // If not found by UID, check by email
      if (!existingUser) {
        existingUser = await this.getUserByEmail(firebaseUser.email);
      }
      
      if (existingUser) {
        // Update existing user with Firebase UID if not set
        if (!existingUser.firebaseUid) {
          const [updatedUser] = await db
            .update(users)
            .set({
              firebaseUid: firebaseUser.uid,
              fullName: existingUser.fullName || firebaseUser.name || firebaseUser.displayName,
              updatedAt: new Date()
            })
            .where(eq(users.id, existingUser.id))
            .returning();
          return updatedUser;
        }
        return existingUser;
      }

      // Create new user
      const [newUser] = await db
        .insert(users)
        .values({
          email: firebaseUser.email,
          username: firebaseUser.email.split('@')[0],
          fullName: firebaseUser.name || firebaseUser.displayName || firebaseUser.email.split('@')[0],
          firebaseUid: firebaseUser.uid,
          role: 'client',
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();
      
      return newUser;
    } catch (error) {
      console.error('Error creating/updating user from Firebase:', error);
      throw error;
    }
  }

  async createUser(userData: InsertUser): Promise<User> {
    try {
      const [user] = await db
        .insert(users)
        .values({
          ...userData,
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();
      
      return user;
    } catch (error) {
      console.error('Error creating user:', error);
      throw error;
    }
  }

  async updateUser(id: number, updateData: Partial<InsertUser>): Promise<User | undefined> {
    try {
      const [user] = await db
        .update(users)
        .set({
          ...updateData,
          updatedAt: new Date()
        })
        .where(eq(users.id, id))
        .returning();
      
      return user;
    } catch (error) {
      console.error('Error updating user:', error);
      return undefined;
    }
  }

  async updateUserRole(id: number, role: string): Promise<User | undefined> {
    try {
      const [user] = await db
        .update(users)
        .set({
          role,
          updatedAt: new Date()
        })
        .where(eq(users.id, id))
        .returning();
      
      return user;
    } catch (error) {
      console.error('Error updating user role:', error);
      return undefined;
    }
  }

  async updateUserStatus(id: number, isActive: boolean): Promise<User | undefined> {
    try {
      const [user] = await db
        .update(users)
        .set({
          isActive,
          updatedAt: new Date()
        })
        .where(eq(users.id, id))
        .returning();
      
      return user;
    } catch (error) {
      console.error('Error updating user status:', error);
      return undefined;
    }
  }

  async deleteUser(id: number): Promise<boolean> {
    try {
      const result = await db
        .delete(users)
        .where(eq(users.id, id));
      
      return result.rowCount > 0;
    } catch (error) {
      console.error('Error deleting user:', error);
      return false;
    }
  }
}

// Use DatabaseStorage as the primary storage implementation (migrated from memory storage)
export const storage = new DatabaseStorage();
