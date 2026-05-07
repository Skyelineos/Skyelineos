// PostgreSQL Schema Definition for Financial Data (Server-side)
// This mirrors the shared schema but can be used for server-side operations

import { pgTable, serial, integer, text, decimal, timestamp } from 'drizzle-orm/pg-core';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';

// Financial tracking table for project expenses and income
export const financials = pgTable('financials', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').notNull(),
  lineItem: text('line_item').notNull(),
  category: text('category').notNull(),
  amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
  paidToDate: decimal('paid_to_date', { precision: 12, scale: 2 }).default('0.00').notNull(),
  dateIncurred: text('date_incurred').notNull(), // Format: YYYY-MM-DD
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Insert schema validation
export const insertFinancialSchema = createInsertSchema(financials).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Type definitions
export type Financial = typeof financials.$inferSelect;
export type InsertFinancial = z.infer<typeof insertFinancialSchema>;

// Firebase Financial Document interface (matches Firestore structure)
export interface FirebaseFinancial {
  id: string;
  projectId: number;
  lineItem: string;
  category: string;
  amount: number;
  paidToDate: number;
  dateIncurred: string; // YYYY-MM-DD format
}

// Database indexes that should be created for optimal performance
export const requiredIndexes = [
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_financials_project_id ON financials(project_id);',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_financials_date_incurred ON financials(date_incurred DESC);',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_financials_category ON financials(category);',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_financials_project_date_category ON financials(project_id, date_incurred DESC, category);',
] as const;