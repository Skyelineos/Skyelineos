import { randomUUID } from 'crypto';

/**
 * Generate a unique UUID for estimate items
 * Each item gets a truly unique ID that never collides
 */
export function generateUniqueItemId(): string {
  return randomUUID();
}

/**
 * Check if a string is a valid UUID format
 */
export function isUuidFormat(id: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
}