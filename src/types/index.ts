export type PaidPlan = 'single' | 'monthly';

export interface User {
  id: string;
  email: string;
  name: string;
  subscriptionStatus: 'active' | 'trial' | 'expired';
  subscriptionPlan: 'trial' | PaidPlan;
  subscriptionExpiry?: Date;
  documentCredits: number;
  appliedPaymentIds: string[];
}

export interface Lawyer {
  id: string;
  slug: string;
  name: string;
  title: string;
  bio: string;
  practiceAreas: string[];
  languages: string[];
  experienceYears: number;
  barCouncil: string;
  enrollmentNumber: string;
  fee: number;
  rating: number;
  reviewCount: number;
  isVerified: boolean;
  avatarUrl?: string;
}

export interface Consultation {
  id: string;
  startsAt: string;
  endsAt: string;
  topic: string;
  notes: string;
  mode: 'chat' | 'call';
  status: 'booked' | 'cancelled' | 'completed';
  meetingUrl?: string;
  lawyer: Lawyer;
}

export interface ConsultationMessage {
  id: string;
  consultationId: string;
  sender: 'user' | 'lawyer' | 'system';
  content: string;
  createdAt: string;
}

export interface LegalTemplate {
  id: string;
  name: string;
  category: string;
  description: string;
  content: string;
  fields: TemplateField[];
}

export interface TemplateField {
  id: string;
  name: string;
  type: 'text' | 'textarea' | 'date' | 'number' | 'select';
  placeholder?: string;
  required: boolean;
  options?: string[];
}

export interface Document {
  id: string;
  title: string;
  content: string;
  templateId?: string;
  category?: string;
  createdAt: Date;
  updatedAt: Date;
  userId: string;
}

export interface TranscriptionSession {
  id: string;
  documentId: string;
  isRecording: boolean;
  isPaused: boolean;
  language: string;
  outputLanguage: string;
  apiKey: string;
}

export interface Language {
  code: string;
  name: string;
  nativeName: string;
}

export interface ExportFormat {
  type: 'docx' | 'pdf' | 'markdown';
  filename: string;
}
