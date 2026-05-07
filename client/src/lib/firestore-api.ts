import { 
  collection, 
  doc, 
  getDocs, 
  getDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  limit,
  Timestamp,
  WhereFilterOp,
  OrderByDirection
} from 'firebase/firestore';
import { db } from './firebase';

// Firebase error wrapper for consistent error handling
export class FirestoreError extends Error {
  constructor(message: string, public originalError?: unknown) {
    super(message);
    this.name = 'FirestoreError';
  }
}

// Type-safe filter interfaces
export interface WhereFilter {
  type: 'where';
  field: string;
  operator: WhereFilterOp;
  value: unknown;
}

export interface OrderByFilter {
  type: 'orderBy';
  field: string;
  direction?: OrderByDirection;
}

export interface LimitFilter {
  type: 'limit';
  value: number;
}

export type FirestoreFilter = WhereFilter | OrderByFilter | LimitFilter;

// Firestore API wrapper for consistent data operations
export class FirestoreAPI {
  
  // Generic collection operations with proper query building
  static async getCollection<T>(collectionName: string, filters: FirestoreFilter[] = []): Promise<T[]> {
    try {
      const collectionRef = collection(db, collectionName);
      
      // Build query with filters
      let firestoreQuery = query(collectionRef);
      
      filters.forEach(filter => {
        if (filter.type === 'where') {
          firestoreQuery = query(firestoreQuery, where(filter.field, filter.operator, filter.value));
        } else if (filter.type === 'orderBy') {
          firestoreQuery = query(firestoreQuery, orderBy(filter.field, filter.direction || 'asc'));
        } else if (filter.type === 'limit') {
          firestoreQuery = query(firestoreQuery, limit(filter.value));
        }
      });
      
      const snapshot = await getDocs(firestoreQuery);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as T));
    } catch (error) {
      throw new FirestoreError(`Failed to fetch ${collectionName}`, error);
    }
  }
  
  static async getDocument<T>(collectionName: string, docId: string): Promise<T | null> {
    try {
      const docRef = doc(db, collectionName, docId);
      const snapshot = await getDoc(docRef);
      
      if (snapshot.exists()) {
        return { id: snapshot.id, ...snapshot.data() } as T;
      }
      return null;
    } catch (error) {
      throw new FirestoreError(`Failed to fetch document ${docId} from ${collectionName}`, error);
    }
  }
  
  static async createDocument<T>(collectionName: string, data: Record<string, unknown>): Promise<T> {
    try {
      const docRef = await addDoc(collection(db, collectionName), {
        ...data,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
      
      const newDoc = await getDoc(docRef);
      return { id: docRef.id, ...newDoc.data() } as T;
    } catch (error) {
      throw new FirestoreError(`Failed to create document in ${collectionName}`, error);
    }
  }
  
  static async updateDocument<T>(collectionName: string, docId: string, data: Record<string, unknown>): Promise<T> {
    try {
      const docRef = doc(db, collectionName, docId);
      await updateDoc(docRef, {
        ...data,
        updatedAt: Timestamp.now(),
      });
      
      const updatedDoc = await getDoc(docRef);
      return { id: docId, ...updatedDoc.data() } as T;
    } catch (error) {
      throw new FirestoreError(`Failed to update document ${docId} in ${collectionName}`, error);
    }
  }
  
  static async deleteDocument(collectionName: string, docId: string): Promise<void> {
    try {
      await deleteDoc(doc(db, collectionName, docId));
    } catch (error) {
      throw new FirestoreError(`Failed to delete document ${docId} from ${collectionName}`, error);
    }
  }
  
  // Specific entity operations
  static async getProjects() {
    return this.getCollection('projects', [
      { type: 'orderBy', field: 'createdAt', direction: 'desc' }
    ]);
  }
  
  static async getProject(id: string) {
    return this.getDocument('projects', id);
  }
  
  static async createProject(data: Record<string, unknown>) {
    return this.createDocument('projects', data);
  }
  
  static async updateProject(id: string, data: Record<string, unknown>) {
    return this.updateDocument('projects', id, data);
  }
  
  static async getContacts() {
    return this.getCollection('contacts', [
      { type: 'where', field: 'isActive', operator: '==', value: true },
      { type: 'orderBy', field: 'lastName', direction: 'asc' }
    ]);
  }
  
  static async createContact(data: Record<string, unknown>) {
    return this.createDocument('contacts', data);
  }
  
  static async getEstimates(projectId: string) {
    return this.getCollection('estimates', [
      { type: 'where', field: 'projectId', operator: '==', value: projectId },
      { type: 'orderBy', field: 'createdAt', direction: 'desc' }
    ]);
  }
  
  static async createEstimate(data: any) {
    return this.createDocument('estimates', data);
  }
  
  static async getNotifications(userId: string) {
    return this.getCollection('notifications', [
      { type: 'where', field: 'userId', operator: '==', value: userId },
      { type: 'orderBy', field: 'createdAt', direction: 'desc' },
      { type: 'limit', value: 50 }
    ]);
  }
  
  static async getThreads(userId: string) {
    return this.getCollection('threads', [
      { type: 'where', field: 'participants', operator: 'array-contains', value: userId },
      { type: 'orderBy', field: 'lastMessageAt', direction: 'desc' }
    ]);
  }
  
  static async getMessages(threadId: string) {
    return this.getCollection('messages', [
      { type: 'where', field: 'threadId', operator: '==', value: threadId },
      { type: 'orderBy', field: 'createdAt', direction: 'asc' }
    ]);
  }
  
  static async sendMessage(threadId: string, content: string, senderId: string) {
    const messageData = {
      threadId,
      content,
      senderId,
      messageType: 'text',
      isRead: false,
      readBy: [],
    };
    
    const newMessage = await this.createDocument('messages', messageData);
    
    // Update thread's last message info
    await this.updateDocument('threads', threadId, {
      lastMessageAt: Timestamp.now(),
      lastMessage: content.substring(0, 100),
    });
    
    return newMessage;
  }
  
  static async getTransactions(projectId: string) {
    return this.getCollection('transactions', [
      { type: 'where', field: 'projectId', operator: '==', value: projectId },
      { type: 'orderBy', field: 'date', direction: 'desc' }
    ]);
  }
  
  static async createTransaction(data: any) {
    return this.createDocument('transactions', data);
  }
  
  static async getPurchaseOrders(projectId: string) {
    return this.getCollection('purchaseOrders', [
      { type: 'where', field: 'projectId', operator: '==', value: projectId },
      { type: 'orderBy', field: 'orderDate', direction: 'desc' }
    ]);
  }
  
  static async createPurchaseOrder(data: any) {
    return this.createDocument('purchaseOrders', data);
  }
}

// Legacy API compatibility wrapper
export const apiRequest = async (url: string, options: RequestInit = {}) => {
  const headers = await getAuthHeaders();
  
  // Map legacy API calls to Firestore operations
  const method = options.method || 'GET';
  const baseUrl = '/api'; // Use Firebase Hosting proxy
  
  const requestHeaders = {
    'Content-Type': 'application/json',
    ...headers,
    ...(options.headers || {}),
  };
  
  const response = await fetch(`${baseUrl}${url}`, {
    ...options,
    headers: requestHeaders,
  });
  
  if (!response.ok) {
    throw new Error(`API request failed: ${response.statusText}`);
  }
  
  return response.json();
};