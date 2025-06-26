import { 
  collection, 
  addDoc, 
  getDocs, 
  doc, 
  getDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
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
  getCountFromServer
} from 'firebase/firestore';
import { db } from './firebase'; // Ensure db is correctly initialized and exported
import { FirebaseCollections } from '../constants';
import { 
  User, 
  ShiftType, 
  Shift, 
  ChangeRequest, 
  Justification, 
  UniversalHistoryEntry,
  UserRole,
  ChangeRequestStatus,
  JustificationStatus
} from '../types';

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
  return updateDoc(userDocRef, { ...data, createdAt: serverTimestamp() }, { merge: true }); // Use updateDoc with merge for safety or setDoc
};


// --- Specific ShiftType functions ---
export const addShiftType = (data: Omit<ShiftType, 'id' | 'createdAt'>): Promise<string> => addDocument<ShiftType>(FirebaseCollections.SHIFT_TYPES, data);
export const getAllShiftTypes = (): Promise<ShiftType[]> => getAllDocuments<ShiftType>(FirebaseCollections.SHIFT_TYPES, query(collection(db, FirebaseCollections.SHIFT_TYPES), orderBy('name')));
export const getShiftType = (id: string): Promise<ShiftType | null> => getDocument<ShiftType>(FirebaseCollections.SHIFT_TYPES, id);

// --- Specific Shift functions ---
// For publishing a batch of shifts (e.g., a week's schedule)
export const publishShiftsBatch = async (shifts: Omit<Shift, 'id' | 'createdAt'>[]): Promise<void> => {
  if (!db) throw new Error("Firestore DB no esta inicializada.");
  const batch = writeBatch(db);
  shifts.forEach(shiftData => {
    const newShiftRef = doc(collection(db, FirebaseCollections.SHIFTS)); // Auto-generate ID
    batch.set(newShiftRef, { ...shiftData, createdAt: serverTimestamp() });
  });
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
export const onProposedChangeRequestsForUserSnapshot = (userId: string, callback: (requests: ChangeRequest[]) => void): Unsubscribe => {
  if (!db) throw new Error("Firestore DB no esta inicializada.");
  const q = query(
    collection(db, FirebaseCollections.CHANGE_REQUESTS),
    where('proposedUserId', '==', userId),
    where('status', '==', ChangeRequestStatus.PENDIENTE_ACEPTACION_EMPLEADO),
    orderBy('requestedAt', 'desc')
  );
  return onSnapshot(q, async (snapshot) => {
    const requests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ChangeRequest));
    // Populate with original shift details and requesting user name
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
  }, (error) => console.error("Error en onProposedChangeRequestsForUserSnapshot:", error));
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
export const updateJustification = (id: string, data: Partial<Justification>): Promise<void> => updateDocument<Justification>(FirebaseCollections.JUSTIFICATIONS, id, data);

// Listener for justifications pending manager review
export const onPendingJustificationsSnapshot = (callback: (justifications: Justification[]) => void): Unsubscribe => {
  if (!db) throw new Error("Firestore DB no esta inicializada.");
  const q = query(
    collection(db, FirebaseCollections.JUSTIFICATIONS),
    where('status', '==', JustificationStatus.PENDIENTE),
    orderBy('uploadedAt', 'desc')
  );
  return onSnapshot(q, async (snapshot) => {
    const justifications = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Justification));
    // Populate userName
    const populatedJustifications = await Promise.all(justifications.map(async j => {
        const user = j.userId ? await getUser(j.userId) : null;
        return { ...j, userName: user?.name || 'Desconocido' };
    }));
    callback(populatedJustifications);
  }, (error) => console.error("Error en onPendingJustificationsSnapshot:", error));
};

// --- Universal History ---
export const addHistoryEntry = (data: Omit<UniversalHistoryEntry, 'id' | 'timestamp'>): Promise<string> => addDocument<UniversalHistoryEntry>(FirebaseCollections.UNIVERSAL_HISTORY, data);

// Paginated history fetching
export const getUniversalHistoryPage = async (
    itemsPerPage: number, 
    lastVisibleDoc?: QueryDocumentSnapshot<DocumentData>
): Promise<{ entries: UniversalHistoryEntry[], nextLastVisibleDoc?: QueryDocumentSnapshot<DocumentData>, totalCount: number }> => {
  if (!db) throw new Error("Firestore DB no esta inicializada.");
  
  const historyCollection = collection(db, FirebaseCollections.UNIVERSAL_HISTORY);
  
  // Get total count (consider if this is too slow for very large collections)
  const countSnapshot = await getCountFromServer(historyCollection);
  const totalCount = countSnapshot.data().count;

  let q = query(historyCollection, orderBy('timestamp', 'desc'), limit(itemsPerPage));
  
  if (lastVisibleDoc) {
    q = query(q, startAfter(lastVisibleDoc));
  }
  
  const querySnapshot = await getDocs(q);
  const entries = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as UniversalHistoryEntry));
  const nextLastVisibleDoc = querySnapshot.docs[querySnapshot.docs.length - 1];
  
  return { entries, nextLastVisibleDoc, totalCount };
};