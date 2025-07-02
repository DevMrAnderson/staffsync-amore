import type { Timestamp } from 'firebase/firestore';

export enum UserRole {
  COCINERO = 'cocinero',
  AUXILIAR_COCINA = 'auxiliar_cocina',
  LAVALOZA = 'lavaloza',
  BARTENDER = 'bartender',
  MESERO = 'mesero',
  GERENTE = 'gerente',
  DUENO = 'dueno',
}

export interface User {
  id: string; // Firebase Auth UID
  email: string;
  name: string;
  role: UserRole;
  createdAt: Timestamp;
  status?: 'active' | 'inactive';
  passwordResetRequired?: boolean;
}

export interface ChecklistItem {
  task: string;
  done: boolean; // This will be ephemeral UI state, not stored per shift instance
}

export type Justification = {
  id: string;
  employeeId: string;
  employeeName: string;
  fileUrl: string;
  fileName: string;
  status: 'pendiente' | 'aprovado' | 'rechazado';
  managerNotes?: string; // Las notas del gerente son opcionales
  submittedAt: Date;
  createdAt?: Date; // La fecha de resolución es opcional
};

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
  CAMBIO_SOLICITADO = 'cambio_solicitado',
  CAMBIO_EN_PROCESO = 'cambio_en_proceso',
  COMPLETADO = 'completado',
  AUSENCIA_JUSTIFICADA = 'ausencia_justificada',
  FALTA_INJUSTIFICADA = 'falta_injustificada',
  PENDIENTE = 'pendiente',
  JUSTIFICACION_PENDIENTE = 'justificacion_pendiente', // <-- NUEVO ESTADO
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
  REVISADO = 'revisado', 
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

export interface ShiftTemplate {
  id: string;
  name: string;
  startTime: string; // e.g., "07:30"
  endTime: string;   // e.g., "16:00"
  positionsRequired: {
    [role: string]: number; // e.g., { cocinero: 1, mesero: 2 }
  };
}

export interface ChecklistTemplate {
  id: string;
  name: string;
  description: string;
  tasks: string[];
  createdAt?: Timestamp; // El '?' significa que es opcional
}

export type Notification = {
  id: string;
  userId: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: any; // Se guardará como Timestamp, pero puede leerse como objeto
  type: string;
  relatedDocId?: string;
};

export interface ShiftReport {
  id: string; // Será el mismo que el ID del Turno (Shift)
  shiftId: string;
  managerId: string;
  managerName?: string;
  templateId: string;
  shiftTypeName?: string;
  // Guardaremos un mapa de tareas y su estado (completada o no)
  completedTasks: {
    [task: string]: boolean;
  };
  notes?: string;
  lastUpdated: Timestamp;
}