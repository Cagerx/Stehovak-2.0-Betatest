
import React from 'react';
import { 
  Home, 
  Calendar, 
  Truck, 
  Sparkles, 
  User, 
  Plus, 
  ChevronRight, 
  Camera, 
  Map, 
  Phone, 
  MessageSquare, 
  Maximize, 
  Image as ImageIcon, 
  Volume2, 
  StopCircle, 
  Zap,
  BookOpen,
  Trash,
  AlertTriangle
} from 'lucide-react';

export const COLORS = {
  primary: '#3b82f6', // Brighter Blue for Dark Mode
  accent: '#e11d48',  // Action Red
  secondary: '#1e40af', // Deep Blue
  success: '#10b981',
  danger: '#f43f5e',
  warning: '#fbbf24',
  bg: '#0f172a',      // Dark Slate 950
  surface: '#1e293b',  // Dark Slate 800
  text: '#f8fafc',    // Slate 50
  muted: '#94a3b8'    // Slate 400
};

export const Icons = {
  Home: Home,
  Calendar: Calendar,
  Truck: Truck,
  Sparkles: Sparkles,
  User: User,
  Plus: Plus,
  ChevronRight: ChevronRight,
  Camera: Camera,
  Map: Map,
  Phone: Phone,
  WhatsApp: Phone, // Lucide doesn't have a specific WhatsApp icon in the basic set, using Phone as fallback or could use MessageSquare
  Message: MessageSquare,
  AspectRatio: Maximize,
  ImageEdit: ImageIcon,
  Speaker: Volume2,
  StopCircle: StopCircle,
  Zap: Zap,
  BookOpen: BookOpen,
  Trash: Trash,
  AlertTriangle: AlertTriangle
};

