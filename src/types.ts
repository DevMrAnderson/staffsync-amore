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


// --- AÑADE ESTA NUEVA INTERFAZ ---
export interface Announcement {
  id: string;
  title: string;
  message: string;
  createdAt: Timestamp;
}


export interface User {
  id: string; // Firebase Auth UID
  email: string;
  name: string;
  role: UserRole;
  createdAt: Timestamp;
  status?: 'active' | 'inactive';
  passwordResetRequired?: boolean;
  schedulePreferences?: string;
  lastAnnouncementRead?: Timestamp; // Guarda la fecha del último anuncio leído
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
  checklistTemplateId?: string; // Template for checklist
  procedures: ProcedureItem[];
}

export enum ShiftStatus {
  CONFIRMADO = 'confirmado',
  CAMBIO_SOLICITADO = 'cambio_solicitado',
  CAMBIO_EN_PROCESO = 'cambio_en_proceso',
  CAMBIO_APROBADO = 'cambio_aprobado',
  COMPLETADO = 'completado',
  AUSENCIA_JUSTIFICADA = 'ausencia_justificada',
  FALTA_INJUSTIFICADA = 'falta_injustificada',
  PENDIENTE = 'pendiente',
  JUSTIFICACION_PENDIENTE = 'justificacion_pendiente',
  CAMBIO_OFRECIDO_GERENTE = 'cambio_ofrecido_gerente', // <-- NUEVO ESTADO
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
  PENDIENTE_GERENTE = 'pendiente_gerente',         // El gerente debe proponer un sustituto
  PROPUESTO_EMPLEADO = 'propuesto_empleado',       // <-- NUEVO Y MEJORADO: Se propuso a un empleado y está pendiente de su respuesta
  ACEPTADO_EMPLEADO = 'aceptado_empleado',         // <-- NUEVO Y MEJORADO: El empleado aceptó, ahora el gerente debe confirmar
  APROBADO_GERENTE = 'aprobado_gerente',           // <-- NUEVO Y MEJORADO: El gerente dio la aprobación final
  RECHAZADO_EMPLEADO = 'rechazado_empleado',       // <-- NUEVO Y MEJORADO: El empleado propuesto rechazó la cobertura
  RECHAZADO_GERENTE = 'rechazado_gerente',         // <-- NUEVO Y MEJORADO: El gerente rechazó el cambio
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
  rejectionReason?: string;
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
  userId: string;       // ID del usuario que RECIBIRÁ la notificación.
  title: string;        // Título corto. Ej: "Propuesta Aceptada"
  message: string;
  isRead: boolean;
  createdAt: any; // Se guardará como Timestamp, pero puede leerse como objeto
  type: string;
  relatedDocId?: string;      // Mensaje detallado. Ej: "Juan Pérez ha aceptado cubrir tu turno."
  link?: string;         // (Opcional) Un enlace para llevar al usuario a la página relevante.
  isRead: boolean;      // Para saber si el usuario ya la vio.
  createdAt: Timestamp;   // Para ordenarlas cronológicamente.
  type: 'info' | 'success' | 'warning' | 'error'; // Para darle un estilo visual.
};

export interface ShiftReport {
  id: string;
  shiftId: string;
  managerId: string;
  managerName?: string;
  templateId: string;
  shiftTypeName?: string;
  notes?: string;
  lastUpdated: Timestamp;
  // Este es el cambio clave:
  completedTasks?: { [task: string]: boolean; };
  checklistSnapshot: {
    task: string;
    done: boolean;
  }[];
}

// --- AÑADE ESTA NUEVA INTERFAZ AL FINAL ---

export interface ShiftOffer {
  id: string;                  // El ID de la propia oferta
  shiftId: string;             // El ID del turno que se está ofreciendo
  offeringManagerId: string;   // Quien ofrece el turno
  offeringManagerName: string;
  offeredAt: Timestamp;
  status: 'disponible' | 'reclamado'; // Estado de la oferta
  
  // Estos campos son opcionales porque solo existen cuando alguien reclama el turno
  claimingManagerId?: string;  
  claimingManagerName?: string;

  // Este campo es opcional porque lo "poblamos" en el frontend para mostrar los detalles
  shiftDetails?: Shift;
}


export interface DailyMetric {
  date: string; // Formato 'YYYY-MM-DD'
  totalHours: number;
  changeRequestCount: number;
}

export interface EmployeeMetric {
  userId: string;
  name: string;
  totalHours: number;
  totalShifts: number;
  changeRequestCount: number;
  justifiedAbsenceCount: number;
}

export interface AnalyticsSummary {
  lastUpdated: Timestamp;
  monthlyHours: { month: string, hours: number }[];
  employeeMetrics: EmployeeMetric[];
}