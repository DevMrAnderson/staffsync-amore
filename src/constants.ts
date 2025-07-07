import { UserRole } from './types';

export const APP_NAME = "Gestor de Turnos Amore";

export const FirebaseCollections = {
  USERS: 'users',
  SHIFT_TYPES: 'shiftTypes',
  SHIFTS: 'shifts',
  CHANGE_REQUESTS: 'changeRequests',
  JUSTIFICATIONS: 'justifications',
  UNIVERSAL_HISTORY: 'universalHistory',
  SHIFT_TEMPLATES: 'shiftTemplates',
  CHECKLIST_TEMPLATES: 'checklistTemplates',
  SHIFT_CHECKLIST_TEMPLATES: 'shiftChecklistTemplates',
  SHIFT_REPORTS: 'shiftReports',
  MANAGER_SHIFT_OFFERS: 'managerShiftOffers',
  ANNOUNCEMENTS: 'announcements', // Nueva colección para anuncios
  ANALYTICS: 'analytics', // Nueva colección para analíticas
  STATUS: 'status',
};

// Example Shift Type Names (these would ideally be created via an admin interface or seeded)
export const EXAMPLE_SHIFT_TYPE_NAMES = {
  APERTURA_COCINA: "Apertura Cocina",
  CIERRE_SALON: "Cierre Salon",
  TURNO_TARDE_MESERO: "Turno Tarde Mesero",
  TURNO_NOCHE_BAR: "Turno Noche Barra",
};

export const DATE_FORMAT_SPA_DATETIME = "dd/MM/yyyy HH:mm";
export const DATE_FORMAT_SPA_DATE_ONLY = "dd/MM/yyyy";
export const DATE_FORMAT_SPA_TIME_ONLY = "HH:mm";
export const DATE_FORMAT_INPUT_DATE = "yyyy-MM-dd";
export const DATE_FORMAT_INPUT_DATETIME_LOCAL = "yyyy-MM-dd'T'HH:mm";


export const MAX_FILE_UPLOAD_SIZE_MB = 5;
export const MAX_FILE_UPLOAD_SIZE_BYTES = MAX_FILE_UPLOAD_SIZE_MB * 1024 * 1024;

export const HISTORY_ACTIONS = {
  LOGIN: "INICIO_SESION",
  LOGOUT: "CIERRE_SESION",
  CREATE_USER: "CREACION_USUARIO",
  UPDATE_USER_ROLE: "ACTUALIZACION_ROL_USUARIO",
  DEACTIVATE_USER: "DESACTIVACION_USUARIO", // Placeholder if not fully implemented
  PUBLISH_SCHEDULE: "PUBLICACION_HORARIO",
  CREATE_SHIFT_TYPE: "CREACION_TIPO_TURNO",
  REQUEST_SHIFT_CHANGE: "SOLICITUD_CAMBIO_TURNO",
  PROPOSE_SHIFT_COVERAGE: "PROPUESTA_COBERTURA_TURNO",
  ACCEPT_SHIFT_COVERAGE: "ACEPTACION_COBERTURA_TURNO",
  REJECT_SHIFT_COVERAGE: "RECHAZO_COBERTURA_TURNO",
  APPROVE_SHIFT_CHANGE_REQUEST: "APROBACION_SOLICITUD_CAMBIO", // Manager directly approves
  REJECT_SHIFT_CHANGE_REQUEST: "RECHAZO_SOLICITUD_CAMBIO", // Manager directly rejects
  UPLOAD_JUSTIFICATION: "SUBIDA_JUSTIFICANTE",
  APPROVE_JUSTIFICATION: "APROBACION_JUSTIFICANTE",
  REJECT_JUSTIFICATION: "RECHAZO_JUSTIFICANTE",
  MARK_ABSENCE: 'MARCAR_FALTA',
  REMOVE_ABSENCE: 'REMOVER_FALTA',
};

// Define los niveles jerárquicos. Un empleado puede reemplazar a otro de su mismo nivel.
export const ROLE_HIERARCHY = {
  management: [UserRole.GERENTE],
  kitchen_lead: [UserRole.COCINERO],
  operations: [UserRole.MESERO, UserRole.BARTENDER, UserRole.AUXILIAR_COCINA],
  support: [UserRole.LAVALOZA],
};

// Define el orden en que queremos que los roles aparezcan en las listas.
export const ROLE_SORT_ORDER = [
  UserRole.DUENO,
  UserRole.GERENTE,
  UserRole.COCINERO,
  UserRole.AUXILIAR_COCINA,
  UserRole.BARTENDER,
  UserRole.MESERO,
  UserRole.LAVALOZA,
];