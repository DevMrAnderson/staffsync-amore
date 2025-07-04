import { 
  collection, 
  addDoc, 
  getDocs, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  OrderByDirection, 
  Timestamp,
  orderBy,
  writeBatch,
  serverTimestamp,
  onSnapshot,
  Unsubscribe,
  DocumentData,
  Query,
  limit,
  startAfter,
  QueryDocumentSnapshot,
  getCountFromServer,
} from 'firebase/firestore';
import { db } from './firebase'; // Ensure db is correctly initialized and exported
import { FirebaseCollections } from '../constants';
import { 
  User, 
  ShiftType, 
  Shift, 
  ShiftReport,
  ChangeRequest, 
  Justification, 
  UniversalHistoryEntry,
  UserRole,
  ChangeRequestStatus,
  ShiftStatus,
  JustificationStatus
} from '../types';
import { startOfDay, endOfDay, startOfMonth, endOfMonth, startOfWeek, addDays, endOfWeek } from 'date-fns'; // Asegúrate de tener esto


/**
 * Escucha en tiempo real las notificaciones NO LEÍDAS de un usuario específico.
 * @param userId El ID del usuario del que queremos las notificaciones.
 * @param callback La función a ejecutar con las notificaciones encontradas.
 * @returns Una función para detener la escucha.
 */
export const onUnreadNotificationsSnapshot = (userId: string, callback: (notifications: Notification[]) => void): Unsubscribe => {
  const q = query(
    collection(db, 'notifications'),
    where('userId', '==', userId),
    where('isRead', '==', false),
    orderBy('createdAt', 'desc')
  );

  return onSnapshot(q, (snapshot) => {
    const notifications = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as Notification));
    callback(notifications);
  });
};

export const getAllUsers = (): Promise<User[]> => {
  // Usamos tu función genérica para traer a todos los usuarios
  return getAllDocuments<User>(FirebaseCollections.USERS, query(collection(db, FirebaseCollections.USERS), orderBy('name')));
};
/**
 * Marca una notificación específica como leída.
 * @param notificationId El ID del documento de la notificación a actualizar.
 */
export const markNotificationAsRead = (notificationId: string): Promise<void> => {
  return updateDocument('notifications', notificationId, { isRead: true });
};

export const getShiftsForMonth = async (date: Date, userId?: string): Promise<Shift[]> => {
  // 1. El '?' hace que el parámetro userId sea OPCIONAL.
  if (!db) throw new Error("Firestore DB no esta inicializada.");

  const monthStart = startOfMonth(date);
  const monthEnd = endOfMonth(date);

  // 2. Creamos la consulta base, solo con el rango de fechas.
  let q = query(
    collection(db, FirebaseCollections.SHIFTS),
    where('start', '>=', Timestamp.fromDate(monthStart)),
    where('start', '<=', Timestamp.fromDate(monthEnd))
  );

  // 3. AÑADIMOS el filtro de 'userId' SOLO SI se nos proporciona uno.
  if (userId) {
    q = query(q, where('userId', '==', userId));
  }

  // Ejecutamos la consulta (ya sea con o sin el filtro de userId)
  return getAllDocuments<Shift>(FirebaseCollections.SHIFTS, q);
};

// Función para obtener una plantilla de checklist específica por su ID
export const getChecklistTemplate = (id: string): Promise<ChecklistTemplate | null> => {
  return getDocument<ChecklistTemplate>(FirebaseCollections.CHECKLIST_TEMPLATES, id);
};

// Función para encontrar el turno activo de un usuario en el momento actual
export const getCurrentActiveShiftForUser = async (userId: string): Promise<Shift | null> => {
  if (!db) throw new Error("Firestore DB no esta inicializada.");

  const now = new Date();
  const nowTimestamp = Timestamp.now();
  
  // --- INICIO DE NUESTROS SENSORES ---
  console.log(`--- DEBUG: Buscando turno activo para el usuario: ${userId} ---`);
  console.log(`Hora actual (local de tu navegador): ${now.toLocaleString('es-MX')}`);
  // --- FIN DE NUESTROS SENSORES ---

  const q = query(
    collection(db, FirebaseCollections.SHIFTS),
    where('userId', '==', userId),
    where('start', '<=', nowTimestamp),
    orderBy('start', 'desc'),
    limit(1)
  );

  const querySnapshot = await getDocs(q);
  
  console.log(`DEBUG: La consulta encontró ${querySnapshot.size} turno(s) que ya empezaron.`);

  if (!querySnapshot.empty) {
    const shiftDoc = querySnapshot.docs[0];
    const shift = { id: shiftDoc.id, ...shiftDoc.data() } as Shift;
    
    console.log("DEBUG: Turno encontrado:", {
      nombre: shift.userName,
      hora_inicio_guardada: shift.start.toDate().toLocaleString('es-MX'),
      hora_fin_guardada: shift.end.toDate().toLocaleString('es-MX')
    });

    if (shift.end.toDate() > now) {
      console.log("DEBUG: VERIFICACIÓN: La hora de fin es posterior a la actual. ¡Este es un turno activo!");
      return shift;
    } else {
      console.log("DEBUG: VERIFICACIÓN: La hora de fin ya pasó. Este turno ya terminó.");
      return null;
    }
  }

  console.log("DEBUG: VERIFICACIÓN: No se encontró ningún turno que ya haya comenzado para este usuario.");
  return null;
};

// Añade esta nueva función a tu firestoreService.ts

// Busca el reporte del turno que terminó justo antes de la hora de inicio dada
export const getPreviousShiftReport = async (currentShiftStartTime: Timestamp): Promise<ShiftReport | null> => {
  if (!db) throw new Error("Firestore DB no esta inicializada.");

  // Buscamos el turno más reciente que haya terminado ANTES de que el actual comience
  const q = query(
    collection(db, FirebaseCollections.SHIFTS),
    where('end', '<', currentShiftStartTime),
    orderBy('end', 'desc'),
    limit(1)
  );

  const shiftsSnapshot = await getDocs(q);

  if (shiftsSnapshot.empty) {
    console.log("No se encontró un turno previo.");
    return null;
  }

  const previousShift = shiftsSnapshot.docs[0];
  
  // Una vez que tenemos el turno previo, buscamos su reporte de checklist
  console.log(`Turno previo encontrado: ${previousShift.id}. Buscando su reporte...`);
  return getShiftReport(previousShift.id);
};

export const getShiftsForDay = async (day: Date): Promise<Shift[]> => {
  if (!db) throw new Error("Firestore DB no esta inicializada.");

  // Creamos el rango de búsqueda: desde el inicio del día hasta el final del día
  const start = Timestamp.fromDate(startOfDay(day));
  const end = Timestamp.fromDate(endOfDay(day));

  // Creamos la consulta a Firestore
  const q = query(
    collection(db, FirebaseCollections.SHIFTS),
    where('start', '>=', start),
    where('start', '<=', end)
  );

  // Usamos nuestra función genérica para obtener los documentos
  return getAllDocuments<Shift>(FirebaseCollections.SHIFTS, q);
};

export const getShiftsForWeek = async (startDate: Date, endDate: Date): Promise<Shift[]> => {
  if (!db) throw new Error("Firestore DB no esta inicializada.");

  const startTimestamp = Timestamp.fromDate(startOfWeek(startDate, { weekStartsOn: 1 }));
  const endTimestamp = Timestamp.fromDate(endOfWeek(endDate, { weekStartsOn: 1 }));

  // --- SENSORES DE DEPURACIÓN ---
  console.log("--- DEBUG [firestoreService]: Buscando turnos entre... ---");
  console.log("Desde:", startTimestamp.toDate());
  console.log("Hasta:", endTimestamp.toDate());
  // --- FIN DE SENSORES ---

  const q = query(
    collection(db, FirebaseCollections.SHIFTS),
    where('start', '>=', startTimestamp),
    where('start', '<=', endTimestamp)
  );
  
  return getAllDocuments<Shift>(FirebaseCollections.SHIFTS, q);
};


// Helper to convert Firestore Timestamps to Dates in nested objects (if needed for some libraries)
// For most internal logic, keeping Timestamps is fine.
const convertTimestamps = (data: any): any => {
  if (data instanceof Timestamp) {
    return data.toDate();
  }
  if (Array.isArray(data)) {
    return data.map(convertTimestamps);
  }
  if (typeof data === 'object' && data !== null) {
    return Object.keys(data).reduce((acc, key) => {
      acc[key] = convertTimestamps(data[key]);
      return acc;
    }, {} as any);
  }
  return data;
};

// Generic add document
export const addDocument = async <T extends { id?: string }>(
  collectionName: string, 
  data: Omit<T, 'id' | 'createdAt' | 'requestedAt' | 'uploadedAt' | 'timestamp'>
): Promise<string> => {
  if (!db) throw new Error("Firestore DB no esta inicializada.");
  
  const dataWithTimestamp: any = { ...data };
  
  // Add appropriate timestamp based on collection
  if (collectionName === FirebaseCollections.USERS || 
      collectionName === FirebaseCollections.SHIFT_TYPES ||
      collectionName === FirebaseCollections.SHIFTS) {
    dataWithTimestamp.createdAt = serverTimestamp();
  } else if (collectionName === FirebaseCollections.CHANGE_REQUESTS) {
    dataWithTimestamp.requestedAt = serverTimestamp();
  } else if (collectionName === FirebaseCollections.JUSTIFICATIONS) {
    dataWithTimestamp.uploadedAt = serverTimestamp();
    dataWithTimestamp.createdAt = serverTimestamp(); // Also add createdAt for consistency
  } else if (collectionName === FirebaseCollections.UNIVERSAL_HISTORY) {
    dataWithTimestamp.timestamp = serverTimestamp();
  } else {
     dataWithTimestamp.createdAt = serverTimestamp(); // Default
  }

  const docRef = await addDoc(collection(db, collectionName), dataWithTimestamp);
  return docRef.id;
};

// Generic get document
export const getDocument = async <T extends { id: string }>(collectionName: string, id: string): Promise<T | null> => {
  if (!db) throw new Error("Firestore DB no esta inicializada.");
  const docRef = doc(db, collectionName, id);
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) {
    return { id: docSnap.id, ...docSnap.data() } as T;
  }
  return null;
};

// Generic get all documents (use with caution for large collections, consider pagination)
export const getAllDocuments = async <T extends { id: string }>(collectionName: string, q?: Query): Promise<T[]> => {
  if (!db) throw new Error("Firestore DB no esta inicializada.");
  const queryToExecute = q || query(collection(db, collectionName));
  const querySnapshot = await getDocs(queryToExecute);
  return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as T));
};

// Generic update document
export const updateDocument = async <T>(collectionName: string, id: string, data: Partial<T>): Promise<void> => {
  if (!db) throw new Error("Firestore DB no esta inicializada.");
  const docRef = doc(db, collectionName, id);
  await updateDoc(docRef, data);
};

// Generic delete document
export const deleteDocument = async (collectionName: string, id: string): Promise<void> => {
  if (!db) throw new Error("Firestore DB no esta inicializada.");
  const docRef = doc(db, collectionName, id);
  await deleteDoc(docRef);
};

// --- Specific User functions ---
export const getUser = (id: string): Promise<User | null> => getDocument<User>(FirebaseCollections.USERS, id);
export const getAllUsersByRole = (role?: UserRole): Promise<User[]> => {
  let q = query(collection(db, FirebaseCollections.USERS));
  if (role) {
    q = query(q, where('role', '==', role));
  }
  return getAllDocuments<User>(FirebaseCollections.USERS, q);
};
export const updateUser = (id: string, data: Partial<User>): Promise<void> => updateDocument<User>(FirebaseCollections.USERS, id, data);
// User creation should be: 1. Firebase Auth creates user. 2. Then, create Firestore doc with UID.
export const createUserDocument = (uid: string, data: Omit<User, 'id' | 'createdAt'>): Promise<void> => {
  if (!db) throw new Error("Firestore DB no esta inicializada.");
  const userDocRef = doc(db, FirebaseCollections.USERS, uid);
  // Usamos setDoc para CREAR el documento.
  return setDoc(userDocRef, { ...data, createdAt: serverTimestamp() });
};


// --- Specific ShiftType functions ---
export const addShiftType = (data: Omit<ShiftType, 'id' | 'createdAt'>): Promise<string> => addDocument<ShiftType>(FirebaseCollections.SHIFT_TYPES, data);
export const getAllShiftTypes = (): Promise<ShiftType[]> => getAllDocuments<ShiftType>(FirebaseCollections.SHIFT_TYPES, query(collection(db, FirebaseCollections.SHIFT_TYPES), orderBy('name')));
export const getShiftType = (id: string): Promise<ShiftType | null> => getDocument<ShiftType>(FirebaseCollections.SHIFT_TYPES, id);

// --- Specific Shift functions ---
// Reemplaza la vieja función publishShiftsBatch con esta
export const replaceShiftsForTemplate = async (
  day: Date,
  templateId: string,
  shiftsToCreate: Omit<Shift, 'id' | 'createdAt'>[]
) => {
  if (!db) throw new Error("Firestore DB no esta inicializada.");

  const startOfDayTimestamp = Timestamp.fromDate(startOfDay(day));
  const endOfDayTimestamp = Timestamp.fromDate(endOfDay(day));

  // 1. Encontrar todos los turnos existentes para este día y esta plantilla
  const shiftsCollectionRef = collection(db, FirebaseCollections.SHIFTS);
  const q = query(
    shiftsCollectionRef,
    where('start', '>=', startOfDayTimestamp),
    where('start', '<=', endOfDayTimestamp),
    where('shiftTypeId', '==', templateId)
  );

  const existingShiftsSnapshot = await getDocs(q);

  // 2. Crear un "batch" para realizar múltiples operaciones a la vez
  const batch = writeBatch(db);

  // 3. Añadir una operación de borrado por cada turno existente
  existingShiftsSnapshot.forEach(document => {
    batch.delete(document.ref);
  });

  // 4. Añadir una operación de creación por cada nuevo turno que queremos guardar
  shiftsToCreate.forEach(shiftData => {
    const newShiftRef = doc(shiftsCollectionRef); // Firestore genera un nuevo ID
    batch.set(newShiftRef, { ...shiftData, createdAt: serverTimestamp() });
  });

  // 5. Ejecutar todas las operaciones (borrar y crear) de forma atómica
  await batch.commit();
};
export const getShift = (id: string): Promise<Shift | null> => getDocument<Shift>(FirebaseCollections.SHIFTS, id);
export const updateShift = (id: string, data: Partial<Shift>): Promise<void> => updateDocument<Shift>(FirebaseCollections.SHIFTS, id, data);

// Real-time listener for shifts for a specific user within a date range
export const onShiftsForUserSnapshot = (userId: string, rangeStart: Timestamp, rangeEnd: Timestamp, callback: (shifts: Shift[]) => void): Unsubscribe => {
  if (!db) throw new Error("Firestore DB no esta inicializada.");
  const q = query(
    collection(db, FirebaseCollections.SHIFTS),
    where('userId', '==', userId),
    where('start', '>=', rangeStart),
    where('start', '<=', rangeEnd), // Shifts starting within the range
    orderBy('start')
  );
  return onSnapshot(q, async (snapshot) => {
    const shiftsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Shift));
    // Optionally populate shiftType details here if needed for immediate display
    const populatedShifts = await Promise.all(shiftsData.map(async (s) => {
        if (s.shiftTypeId && !s.shiftType) {
            const st = await getShiftType(s.shiftTypeId);
            return { ...s, shiftType: st || undefined };
        }
        return s;
    }));
    callback(populatedShifts);
  }, (error) => {
    console.error("Error en onShiftsForUserSnapshot:", error);
    callback([]); // Send empty array on error
  });
};

// Real-time listener for ALL shifts within a date range (for Gerente/Dueño)
export const onAllShiftsInRangeSnapshot = (rangeStart: Timestamp, rangeEnd: Timestamp, callback: (shifts: Shift[]) => void): Unsubscribe => {
  if (!db) throw new Error("Firestore DB no esta inicializada.");
  const q = query(
    collection(db, FirebaseCollections.SHIFTS),
    where('start', '>=', rangeStart),
    where('start', '<=', rangeEnd),
    orderBy('start')
  );
  return onSnapshot(q, async (snapshot) => {
    const shiftsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Shift));
     const populatedShifts = await Promise.all(shiftsData.map(async (s) => {
        if (s.shiftTypeId && !s.shiftType) {
            const st = await getShiftType(s.shiftTypeId);
            return { ...s, shiftType: st || undefined };
        }
        if (s.userId && !s.userName) {
            const user = await getUser(s.userId);
            return { ...s, userName: user?.name || 'Desconocido'};
        }
        return s;
    }));
    callback(populatedShifts);
  }, (error) => {
    console.error("Error en onAllShiftsInRangeSnapshot:", error);
    callback([]);
  });
};


// --- Specific ChangeRequest functions ---
export const addChangeRequest = (data: Omit<ChangeRequest, 'id' | 'requestedAt'>): Promise<string> => addDocument<ChangeRequest>(FirebaseCollections.CHANGE_REQUESTS, data);
export const getChangeRequest = (id: string): Promise<ChangeRequest | null> => getDocument<ChangeRequest>(FirebaseCollections.CHANGE_REQUESTS, id);
export const updateChangeRequest = (id: string, data: Partial<ChangeRequest>): Promise<void> => updateDocument<ChangeRequest>(FirebaseCollections.CHANGE_REQUESTS, id, data);

// Listener for change requests relevant to a specific employee (proposed to them)
export const onProposedChangeRequestsForUserSnapshot = (userId: string, callback: (requests: ChangeRequest[]) => void): () => void => {
  const q = query(
    collection(db, 'changeRequests'),
    where('proposedUserId', '==', userId),
    where('status', '==', ChangeRequestStatus.PROPUESTO_EMPLEADO)
  );

  return onSnapshot(q, async (snapshot) => {
    // 1. Obtenemos las solicitudes como antes
    const requestsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as ChangeRequest);

    // 2. "Poblamos" cada solicitud con los datos del turno original
    const populatedRequests = await Promise.all(
      requestsData.map(async (req) => {
        // Si no tenemos el objeto originalShift pero sí su ID, lo buscamos
        if (req.originalShiftId && !req.originalShift) {
          const shiftDoc = await getDoc(doc(db, 'shifts', req.originalShiftId));
          if (shiftDoc.exists()) {
            // Incrustamos el objeto completo del turno en la solicitud
            return { ...req, originalShift: { id: shiftDoc.id, ...shiftDoc.data() } as Shift };
          }
        }
        return req; // Devolvemos la solicitud como estaba si no hay nada que poblar
      })
    );
    
    // 3. Enviamos las solicitudes ya completas al componente
    callback(populatedRequests);
  });
};

// Listener para solicitudes que TÚ hiciste y ya fueron aceptadas
export const onAcceptedChangeRequestsForUserSnapshot = (userId: string, callback: (requests: ChangeRequest[]) => void): () => void => {
  const q = query(
    collection(db, 'changeRequests'),
    where('requestingUserId', '==', userId),
    where('status', '==', ChangeRequestStatus.APROBADO_GERENTE),
    where('requestingUserNotified', '==', false)
  );
  return onSnapshot(q, (snapshot) => {
    const requests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as ChangeRequest);
    callback(requests);
  });
};

// Listener for change requests pending manager action
export const onPendingManagerChangeRequestsSnapshot = (callback: (requests: ChangeRequest[]) => void): Unsubscribe => {
  if (!db) throw new Error("Firestore DB no esta inicializada.");
  const q = query(
    collection(db, FirebaseCollections.CHANGE_REQUESTS),
    where('status', '==', ChangeRequestStatus.PENDIENTE_GERENTE),
    orderBy('requestedAt', 'desc')
  );
  return onSnapshot(q, async (snapshot) => {
    const requests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ChangeRequest));
    const populatedRequests = await Promise.all(requests.map(async req => {
        const originalShift = req.originalShiftId ? await getShift(req.originalShiftId) : null;
        const requestingUser = req.requestingUserId ? await getUser(req.requestingUserId) : null;
        const shiftType = originalShift?.shiftTypeId ? await getShiftType(originalShift.shiftTypeId) : null;
        return { 
             ...req, 
            originalShift: originalShift ? {...originalShift, shiftType: shiftType || undefined } : undefined, 
            requestingUserName: requestingUser?.name || 'Desconocido'
        };
    }));
    callback(populatedRequests);
  }, (error) => console.error("Error en onPendingManagerChangeRequestsSnapshot:", error));
};


// --- Specific Justification functions ---
export const addJustification = (data: Omit<Justification, 'id' | 'uploadedAt' | 'createdAt'>): Promise<string> => addDocument<Justification>(FirebaseCollections.JUSTIFICATIONS, data);
export const updateJustification = (id: string, data: Partial<Justification>): Promise<void> => {
  return updateDocument<Justification>(FirebaseCollections.JUSTIFICATIONS, id, data);
};

// Listener for justifications pending manager review
export const onPendingJustificationsSnapshot = (callback: (justifications: Justification[]) => void): Unsubscribe => {
  if (!db) throw new Error("Firestore DB no esta inicializada.");
  const q = query(
    collection(db, FirebaseCollections.JUSTIFICATIONS),
    where('status', '==', JustificationStatus.PENDIENTE),
    orderBy('uploadedAt', 'desc')
  );
  return onSnapshot(q, (snapshot) => {
    const justifications = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Justification));
    callback(justifications);
  });
};

// --- Universal History ---
export const addHistoryEntry = (data: Omit<UniversalHistoryEntry, 'id' | 'timestamp'>): Promise<string> => addDocument<UniversalHistoryEntry>(FirebaseCollections.UNIVERSAL_HISTORY, data);

// Paginated history fetching
export const getUniversalHistoryPage = async (
  itemsPerPage: number, 
  lastVisibleDoc?: QueryDocumentSnapshot<DocumentData>,
  // Ahora el objeto de filtros es más potente
  filters?: { 
    actorName?: string;
    startDate?: string;
    endDate?: string;
  }
): Promise<{ entries: UniversalHistoryEntry[], nextLastVisibleDoc?: QueryDocumentSnapshot<DocumentData>, totalCount: number }> => {
  if (!db) throw new Error("Firestore DB no esta inicializada.");

  const historyCollection = collection(db, FirebaseCollections.UNIVERSAL_HISTORY);
  let q: Query<DocumentData> = historyCollection; // Empezamos con la colección base

  // --- LÓGICA DE FILTRADO MEJORADA ---
  // Aplicamos los filtros que vienen en el objeto
  if (filters?.actorName) {
    q = query(q, where('actorName', '==', filters.actorName));
  }
  if (filters?.startDate) {
    q = query(q, where('timestamp', '>=', new Date(filters.startDate)));
  }
  if (filters?.endDate) {
    // Añadimos 1 día para incluir el día completo en la búsqueda
    const endOfDay = addDays(new Date(filters.endDate), 1);
    q = query(q, where('timestamp', '<', endOfDay));
  }

  // La consulta del conteo total no usará filtros para seguir mostrando el total general
  const countSnapshot = await getCountFromServer(historyCollection);
  const totalCount = countSnapshot.data().count;

  // Aplicamos el ordenamiento y la paginación a nuestra consulta ya filtrada
  q = query(q, orderBy('timestamp', 'desc'), limit(itemsPerPage));

  if (lastVisibleDoc) {
    q = query(q, startAfter(lastVisibleDoc));
  }

  const querySnapshot = await getDocs(q);
  const entries = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as UniversalHistoryEntry));
  const nextLastVisibleDoc = querySnapshot.docs[querySnapshot.docs.length - 1];

  return { entries, nextLastVisibleDoc, totalCount };
};

import { ShiftTemplate } from '../types'; // Asegúrate de importar el nuevo tipo
import { fsync } from 'fs';

export const getShiftTemplates = (): Promise<ShiftTemplate[]> => {
  // Creamos una consulta que pide las plantillas y las ordena por hora de inicio
  const q = query(collection(db, FirebaseCollections.SHIFT_TEMPLATES), orderBy('startTime'));
  // Usamos nuestra función genérica que ya existe para traer todos los documentos
  return getAllDocuments<ShiftTemplate>(FirebaseCollections.SHIFT_TEMPLATES, q);
};

// --- Specific ChecklistTemplate functions ---

export const getChecklistTemplates = (): Promise<ChecklistTemplate[]> => {
  const q = query(collection(db, FirebaseCollections.CHECKLIST_TEMPLATES), orderBy('name'));
  return getAllDocuments<ChecklistTemplate>(FirebaseCollections.CHECKLIST_TEMPLATES, q);
};

export const addChecklistTemplate = (data: Omit<ChecklistTemplate, 'id' | 'createdAt'>): Promise<string> => {
  return addDocument<ChecklistTemplate>(FirebaseCollections.CHECKLIST_TEMPLATES, data);
};

export const updateChecklistTemplate = (id: string, data: Partial<ChecklistTemplate>): Promise<void> => {
  return updateDocument<ChecklistTemplate>(FirebaseCollections.CHECKLIST_TEMPLATES, id, data);
};

export const deleteChecklistTemplate = (id: string): Promise<void> => {
  return deleteDocument(FirebaseCollections.CHECKLIST_TEMPLATES, id);
};

/**
 * Obtiene todos los justificantes que ya han sido resueltos (aprobados o rechazados).
 * @returns Una promesa con la lista de justificantes históricos.
 */
export const getResolvedJustifications = async () => {
  const justificationsRef = collection(db, 'justifications');

  // LA CONSULTA CORRECTA:
  const q = query(
    justificationsRef,
    // Usamos 'in' para traer ambos estados: 'approved' (aprobado) y 'rejected' (rechazado)
    // ¡Asegúrate de que los valores 'approved' y 'rejected' coincidan con los que guardas en la base de datos!
    where('status', 'in', ['aprobado', 'rechazado']), 
    // Ordenamos por fecha de creación para tener un historial cronológico
    orderBy('createdAt', 'desc') 
  );

  const querySnapshot = await getDocs(q);
  
  // Mapeamos los documentos al tipo Justification
  const history = querySnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  })) as Justification[]; // Aseguramos el tipo de dato

  return history;
};

// --- Specific ShiftReport functions ---

// Obtiene el reporte de un turno específico
export const getShiftReport = (shiftId: string): Promise<ShiftReport | null> => {
  // Usamos la función genérica getDocument que ya tenemos
  return getDocument<ShiftReport>(FirebaseCollections.SHIFT_REPORTS, shiftId);
};

// Crea o actualiza el reporte de un turno
export const upsertShiftReport = (
  shiftId: string, 
  data: Partial<Omit<ShiftReport, 'id' | 'lastUpdated'>>
): Promise<void> => {
  if (!db) throw new Error("Firestore DB no esta inicializada.");
  if (!shiftId) throw new Error("Se requiere un shiftId para crear/actualizar un reporte.");

  const reportDocRef = doc(db, FirebaseCollections.SHIFT_REPORTS, shiftId);

  // --- LÓGICA MEJORADA ---
  // Creamos un objeto limpio, asegurando que no haya campos undefined
  const dataToSave = {
    shiftId: data.shiftId || shiftId,
    managerId: data.managerId || '',
    managerName: data.managerName || 'No disponible',
    templateId: data.templateId || '',
    shiftTypeName: data.shiftTypeName || 'No especificado',
    completedTasks: data.completedTasks || {},
    notes: data.notes || '',
    lastUpdated: serverTimestamp() // Siempre actualizamos la fecha
  };

  // Usamos setDoc con 'merge: true'. Esto es más seguro.
  // Crea el documento si no existe, o actualiza los campos si ya existe.
  return setDoc(reportDocRef, dataToSave, { merge: true });
};

// --- Añade esta nueva función al final de firestoreService.ts ---

// Paginated ShiftReport fetching
export const getShiftReportsPage = async (
  itemsPerPage: number, 
  lastVisibleDoc?: QueryDocumentSnapshot<DocumentData>
): Promise<{ entries: ShiftReport[], nextLastVisibleDoc?: QueryDocumentSnapshot<DocumentData>, totalCount: number }> => {
  if (!db) throw new Error("Firestore DB no esta inicializada.");
  
  const reportsCollection = collection(db, FirebaseCollections.SHIFT_REPORTS);
  
  // Obtenemos el conteo total de reportes
  const countSnapshot = await getCountFromServer(reportsCollection);
  const totalCount = countSnapshot.data().count;

  // Creamos la consulta para obtener una página de reportes, ordenados por el más reciente
  let q = query(reportsCollection, orderBy('lastUpdated', 'desc'), limit(itemsPerPage));
  
  if (lastVisibleDoc) {
    q = query(q, startAfter(lastVisibleDoc));
  }
  
  const querySnapshot = await getDocs(q);
  const entries = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ShiftReport));
  const nextLastVisibleDoc = querySnapshot.docs[querySnapshot.docs.length - 1];
  
  return { entries, nextLastVisibleDoc, totalCount };
};

// Añade esta nueva función
export const getJustificationsPage = async (
  itemsPerPage: number, 
  lastVisibleDoc?: QueryDocumentSnapshot<DocumentData>,
  filters?: { userName?: string; status?: JustificationStatus; startDate?: string; endDate?: string }
): Promise<{ entries: Justification[], nextLastVisibleDoc?: QueryDocumentSnapshot<DocumentData> }> => {
  if (!db) throw new Error("Firestore DB no esta inicializada.");

  let q: Query<DocumentData> = collection(db, FirebaseCollections.JUSTIFICATIONS);

  // Aplicamos filtros si existen
  if (filters?.userName) {
    q = query(q, where('userName', '==', filters.userName));
  }
  if (filters?.status) {
    q = query(q, where('status', '==', filters.status));
  }
  if (filters?.startDate) {
    q = query(q, where('uploadedAt', '>=', new Date(filters.startDate)));
  }
  if (filters?.endDate) {
    const endOfDay = addDays(new Date(filters.endDate), 1);
    q = query(q, where('uploadedAt', '<', endOfDay));
  }

  // Aplicamos ordenamiento y paginación
  q = query(q, orderBy('uploadedAt', 'desc'), limit(itemsPerPage));
  if (lastVisibleDoc) {
    q = query(q, startAfter(lastVisibleDoc));
  }

  const querySnapshot = await getDocs(q);
  const entries = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Justification));
  const nextLastVisibleDoc = querySnapshot.docs[querySnapshot.docs.length - 1];

  return { entries, nextLastVisibleDoc };
};


// Función para marcar la notificación como vista
export const markChangeRequestAsNotified = async (requestId: string): Promise<void> => {
  const requestRef = doc(db, 'changeRequests', requestId);
  await updateDoc(requestRef, {
    requestingUserNotified: true
  });
};

