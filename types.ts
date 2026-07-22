
export interface Worker {
  id: string;
  name: string;
  email?: string; // Pro párování s Google účtem
  phone: string;
  role: 'Driver' | 'Loader' | 'Boss';
  status: 'Available' | 'On Task' | 'Off';
  photo?: string;
  licenseInfo?: string;
}

export interface Vehicle {
  id: string;
  plate: string;
  model: string;
  capacity: string; // e.g. "12m3"
  status: 'Ready' | 'Maintenance' | 'In Use';
  vin?: string;
  stkExpiration?: string;
  vignetteExpiration?: string;
  insuranceInfo?: string;
  carImage?: string;
  techCertImage?: string;
  assistancePhone?: string;
  // Tire info
  tireSize?: string;
  tireType?: 'Summer' | 'Winter' | 'All-season';
  tireDepth?: string;
}

export interface MoveTask {
  id: string;
  title: string;
  customer: string;
  customerPhone?: string;
  start: Date;
  end: Date;
  from: string;
  to: string;
  assignedWorkers: string[];
  assignedVehicles: string[];
  status: 'Pending' | 'Confirmed' | 'In Progress' | 'Completed';
  type: string; // Druh zakázky
  priority: 'Low' | 'Medium' | 'High' | 'Critical'; // Řídící stupeň
  notes?: string;
  estimatedPrice?: number;
  images?: string[];
}

export interface Transaction {
  id: string;
  type: 'income' | 'expense';
  amount: number;
  description: string;
  category: string;
  method: 'Cash' | 'Card' | 'Transfer';
  date: Date;
  userId: string;
  userName: string;
}

export interface CompanySettings {
  name: string;
  address: string;
  phone: string;
  email: string;
  taxId?: string; // IČO
  vatId?: string; // DIČ
  website?: string;
  logoUrl?: string;
}

export interface MaintenanceRequest {
  id: string;
  reason: string;
  userId: string;
  userName: string;
  createdAt: Date;
  status: 'Pending' | 'Resolved';
}

export interface AppNotification {
  id: string;
  userId: string;
  title: string;
  message: string;
  createdAt: Date;
  read: boolean;
  type: 'task_assigned' | 'task_changed' | 'system';
  taskId?: string;
}

export enum AppTab {
  DASHBOARD = 'dashboard',
  CALENDAR = 'calendar',
  FLEET = 'fleet',
  MAINTENANCE = 'maintenance',
  ANALYSIS = 'analysis',
  PROFILE = 'profile'
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}
