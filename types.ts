import type { Timestamp } from 'firebase/firestore';

export enum UserRole {
  EMPLEADO = 'empleado',
  GERENTE = 'gerente',
  DUENO = 'dueno', // Using 'dueno' instead of 'dueño' for compatibility
}

export interface User {
  id: string; // Firebase Auth UID
  email: string;
  name: string;
  role: UserRole;
  createdAt: Timestamp;
}

export interface ChecklistItem {
  task: string;
  done: boolean; // This will be ephemeral UI state, not stored per shift instance
}

export interface ProcedureItem {
  task: string;
  guide: string;
  videoUrl?: string;
}

export interface ShiftType {
  id: string;
  name: string;
  checklist: ChecklistItem[]; // Template for checklist
  procedures: ProcedureItem[];
}

export enum ShiftStatus {
  CONFIRMADO = 'confirmado',
  CAMBIO_SOLICITADO = 'cambio_solicitado', // Employee requested a change
  CAMBIO_EN_PROCESO = 'cambio_en_proceso', // Manager proposed to another employee
}

export interface Shift {
  id: string;
  userId: string;
  userName: string;
  start: Timestamp;
  end: Timestamp;
  shiftTypeId: string;
  shiftType?: ShiftType; // Populated for display logic
  status: ShiftStatus;
  notes?: string; // Optional notes for the shift
}

// Used for AI suggestions for schedule templates
export type PartialShiftForTemplate = Partial<Omit<Shift, 'id' | 'userId' | 'userName' | 'status'>> & {
  start?: Date | Timestamp; // Allow Date for easier creation in UI before converting to Timestamp
  end?: Date | Timestamp; // Allow Date for easier creation in UI before converting to Timestamp
  // It might also suggest a user or role type
  suggestedUserId?: string;
  suggestedUserName?: string; 
};


export enum ChangeRequestStatus {
  PENDIENTE_GERENTE = 'pendiente_gerente',
  PENDIENTE_ACEPTACION_EMPLEADO = 'pendiente_aceptacion_empleado',
  APROBADO = 'aprobado',
  RECHAZADO = 'rechazado',
}

export interface ChangeRequest {
  id: string;
  originalShiftId: string;
  originalShift?: Shift; // Populated for display
  requestingUserId: string;
  requestingUserName?: string; // Populated
  proposedUserId?: string; // User ID of the employee proposed to cover
  proposedUserName?: string; // Name of the proposed employee
  status: ChangeRequestStatus;
  requestedAt: Timestamp;
  managerNotes?: string; // Optional notes from manager when processing
  resolutionNotes?: string; // Notes on approval/rejection
}

export enum JustificationStatus {
  PENDIENTE = 'pendiente',
  REVISADO = 'revisado', // Manager has seen it, but not yet approved/rejected
  APROBADO = 'aprobado',
  RECHAZADO = 'rechazado',
}

export interface Justification {
  id: string;
  userId: string;
  userName?: string; // Populated for display
  dateOfAbsence: Timestamp;
  fileUrl: string; // From Firebase Storage
  notes: string;
  uploadedAt: Timestamp;
  status: JustificationStatus;
  reviewedBy?: string; // Manager's user ID
  reviewedByName?: string; // Manager's name
  reviewNotes?: string;
}

export interface UniversalHistoryEntry {
  id: string;
  actorId: string; // User ID of the person who performed the action
  actorName: string;
  action: string; // e.g., "LOGIN", "CREATE_SHIFT", "REQUEST_SHIFT_CHANGE"
  timestamp: Timestamp;
  details?: Record<string, any>; // Contextual details about the action
}

export interface NotificationMessage {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
  timestamp: number; // For sorting or auto-dismissal
}