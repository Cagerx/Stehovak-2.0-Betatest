
export interface Worker {
  id: string;
  name: string;
  email?: string; // Pro párování s Google účtem
  phone: string;
  role: 'Driver' | 'Loader' | 'Specialist';
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

export enum AppTab {
  DASHBOARD = 'dashboard',
  CALENDAR = 'calendar',
  FLEET = 'fleet',
  AI_LAB = 'ai_lab',
  PROFILE = 'profile'
}
