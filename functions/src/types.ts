import { Timestamp } from 'firebase-admin/firestore';

// --- Tipos para los Roles de Usuario ---
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
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status?: 'active' | 'inactive';
}

// --- Tipos para los Estados de Turnos ---
export enum ShiftStatus {
  CONFIRMADO = 'confirmado',
  CAMBIO_SOLICITADO = 'cambio_solicitado',
  CAMBIO_APROBADO = 'cambio_aprobado',
  AUSENCIA_JUSTIFICADA = 'ausencia_justificada',
  FALTA_INJUSTIFICADA = 'falta_injustificada',
  JUSTIFICACION_PENDIENTE = 'justificacion_pendiente',
  COMPLETADO = 'completado',
  PENDIENTE = 'pendiente',
  CAMBIO_OFRECIDO_GERENTE = 'cambio_ofrecido_gerente',
}

// --- Tipos para los Estados de Solicitudes de Cambio ---
export enum ChangeRequestStatus {
  PENDIENTE_GERENTE = 'pendiente_gerente',
  PROPUESTO_EMPLEADO = 'propuesto_empleado',
  ACEPTADO_EMPLEADO = 'aceptado_empleado',
  APROBADO_GERENTE = 'aprobado_gerente',
  RECHAZADO_EMPLEADO = 'rechazado_empleado',
  RECHAZADO_GERENTE = 'rechazado_gerente',
}


export interface ConnectionStatus {
  uber_eats: 'online' | 'offline' | 'unknown';
  rappi: 'online' | 'offline' | 'unknown';
  didi_food: 'online' | 'offline' | 'unknown';
  lastUpdated: Timestamp;
}