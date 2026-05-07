export enum UserRole {
  ADMIN = 'admin',
  PROJECT_MANAGER = 'project_manager',
  CLIENT = 'client',
  SUBCONTRACTOR = 'subcontractor',
  DESIGNER = 'designer',
  ACCOUNTANT = 'accountant'
}

export function normalizeRole(role: string): UserRole | null {
  const normalized = role.toLowerCase().trim();
  
  switch (normalized) {
    case 'admin':
      return UserRole.ADMIN;
    case 'project_manager':
    case 'pm':
    case 'manager':
      return UserRole.PROJECT_MANAGER;
    case 'client':
    case 'customer':
      return UserRole.CLIENT;
    case 'subcontractor':
    case 'sub':
    case 'contractor':
      return UserRole.SUBCONTRACTOR;
    case 'designer':
    case 'architect':
      return UserRole.DESIGNER;
    case 'accountant':
    case 'accounting':
      return UserRole.ACCOUNTANT;
    default:
      return null;
  }
}