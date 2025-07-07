import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import { startOfWeek, endOfWeek, subDays, isSameDay } from "date-fns";
import { onSchedule } from "firebase-functions/v2/scheduler";
import * as puppeteer from "puppeteer";

// Importamos todos los tipos necesarios desde nuestro archivo local de tipos
import { ChangeRequestStatus, ShiftStatus, User, UserRole } from "./types";

// Inicializamos la conexión de administrador a Firebase
admin.initializeApp();
const db = admin.firestore();

/**
 * Función auxiliar para crear notificaciones de forma centralizada y segura.
 */
const createNotification = (
  userId: string,
  title: string,
  message: string,
  type: "success" | "error" | "info" | "warning" = "info",
  requiresConfirmation = false
) => {
  if (!userId) {
    logger.warn("Se intentó crear una notificación sin un userId válido.");
    return null;
  }
  return db.collection("notifications").add({
    userId,
    title,
    message,
    type,
    isRead: false,
    requiresConfirmation,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
};


/**
 * Cloud Function #1: Automatiza el flujo de cambios de turno.
 * Se activa cada vez que un documento en 'changeRequests' es ACTUALIZADO.
 */
export const processShiftChange = onDocumentUpdated({ region: "us-east1", document: "changeRequests/{requestId}" }, async (event) => {
  if (!event.data) {
    logger.error("No data associated with the event, skipping.");
    return;
  }

  const beforeData = event.data.before.data();
  const afterData = event.data.after.data();

  if (beforeData.status === afterData.status) {
    return;
  }

  const newStatus = afterData.status as ChangeRequestStatus;
  logger.info(`Procesando request ${event.params.requestId} al nuevo estado: ${newStatus}`);

  try {
    switch (newStatus) {
      case ChangeRequestStatus.ACEPTADO_EMPLEADO:
        await createNotification(afterData.managerId, "Propuesta Aceptada", `${afterData.proposedUserName} aceptó cubrir el turno. Se requiere tu aprobación final.`, "info", true);
        break;

      // Versión mejorada y completa
case ChangeRequestStatus.RECHAZADO_EMPLEADO:
  // 1. Notificamos al gerente que la propuesta fue rechazada.
  await createNotification(
    afterData.managerId, 
    "Propuesta Rechazada",
    `${afterData.proposedUserName} ha rechazado la propuesta para cubrir el turno. La solicitud ha vuelto a tu lista de pendientes.`,
    "warning", 
    true
  );

  // --- LÓGICA DE REVERSIÓN ---
  // Obtenemos la referencia al mismo documento que se actualizó.
  const requestRef = db.collection("changeRequests").doc(event.params.requestId);
  // Lo revertimos a su estado anterior, limpiando los datos del empleado que rechazó.
  await requestRef.update({
    status: ChangeRequestStatus.PENDIENTE_GERENTE,
    proposedUserId: admin.firestore.FieldValue.delete(),
    proposedUserName: admin.firestore.FieldValue.delete(),
    managerId: admin.firestore.FieldValue.delete() // Limpiamos también el managerId por si acaso
  });
  // ---------------------------
  break;

      case ChangeRequestStatus.APROBADO_GERENTE:
        const shiftRef = db.collection("shifts").doc(afterData.originalShiftId);
        await shiftRef.update({
          userId: afterData.proposedUserId,
          userName: afterData.proposedUserName,
          status: ShiftStatus.CAMBIO_APROBADO,
        });
        await Promise.all([
          createNotification(afterData.requestingUserId, "¡Cambio Aprobado!", `Tu solicitud fue aprobada. ${afterData.proposedUserName} cubrirá tu turno.`, "success", true),
          createNotification(afterData.proposedUserId, "¡Turno Asignado!", `El gerente aprobó tu cobertura. El turno que solicitó ${afterData.requestingUserName} ahora es tuyo.`, "success", true)
        ]);
        break;

      case ChangeRequestStatus.RECHAZADO_GERENTE:
  const originalShiftRef = db.collection("shifts").doc(afterData.originalShiftId);
  // Devolvemos el turno a su estado normal para el empleado original
  await originalShiftRef.update({ status: ShiftStatus.CONFIRMADO });
  
  // 1. Creamos un mensaje base
  let rejectionMessage = "Tu solicitud de cambio de turno fue rechazada por el gerente.";
  // 2. Si el gerente dejó una nota, la añadimos al mensaje
  if (afterData.rejectionReason) {
    rejectionMessage += ` Motivo: "${afterData.rejectionReason}"`;
  }
  
  // 3. Enviamos la notificación completa al empleado
  await createNotification(
    afterData.requestingUserId,
    "Solicitud Rechazada",
    rejectionMessage, // <-- El mensaje ahora incluye la nota
    "error",
    true // Requiere confirmación
  );
  break;
    }
  } catch (error) {
    logger.error(`Error al procesar el cambio de turno para ${event.params.requestId}:`, error);
  }
});


/**
 * Cloud Function #2: Busca y clasifica empleados para cubrir un turno.
 * Es llamada directamente desde la aplicación del gerente.
 */
export const findAvailableSubstitutes = onCall({ region: "us-east1" }, async (request) => {
  // --- Verificación de Permisos (sin cambios) ---
  if (!request.auth) { throw new HttpsError("unauthenticated", "Debes estar autenticado."); }
  const callerUid = request.auth.uid;
  const userDoc = await db.collection("users").doc(callerUid).get();
  if (!userDoc.exists || (userDoc.data()?.role !== 'gerente' && userDoc.data()?.role !== 'dueno')) {
    throw new HttpsError("permission-denied", "No tienes los permisos necesarios.");
  }
  
  const { shiftToCover } = request.data;
  if (!shiftToCover || !shiftToCover.start?.seconds || !shiftToCover.role) {
    throw new HttpsError("invalid-argument", "Faltan datos del turno a cubrir (start, role).");
  }

  try {
    const shiftToCoverStart = new Date(shiftToCover.start.seconds * 1000);
    const weekStart = startOfWeek(shiftToCoverStart, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(shiftToCoverStart, { weekStartsOn: 1 });
    
    const [usersSnapshot, weekShiftsSnapshot] = await Promise.all([
      db.collection("users").where('status', '==', 'active').get(),
      db.collection("shifts").where('start', '>=', weekStart).where('start', '<=', weekEnd).get()
    ]);

    const allEmployees = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as User);
    const weekShifts = weekShiftsSnapshot.docs.map(doc => doc.data() as any);
    
    const idealSubstitutes: any[] = [];
    const alternativeSubstitutes: any[] = [];
    const unavailableEmployees: any[] = [];
    const originalShiftRole = shiftToCover.role;

    const alternativeRoles = (originalShiftRole === UserRole.MESERO) ? [UserRole.BARTENDER, UserRole.AUXILIAR_COCINA] : [];

    for (const employee of allEmployees) {
      if (employee.id === shiftToCover.userId) continue;

      const isIdeal = employee.role === originalShiftRole;
      const isAlternative = alternativeRoles.includes(employee.role as UserRole);
      
      if (!isIdeal && !isAlternative) continue;

      const employeeShiftsThisWeek = weekShifts.filter(s => s.userId === employee.id);

      // Verificación 1: ¿Conflicto de horario en el mismo día?
      const conflictingShift = employeeShiftsThisWeek.find(s => {
        const shiftStart = s.start.toDate();
        const shiftEnd = s.end.toDate();
        const shiftToCoverEnd = new Date(shiftToCover.end.seconds * 1000);
        return shiftStart < shiftToCoverEnd && shiftEnd > shiftToCoverStart;
      });

      if (conflictingShift) {
        const time = `${conflictingShift.start.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} - ${conflictingShift.end.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
        unavailableEmployees.push({ ...employee, reason: "Ya tiene un turno", conflictingShift: time });
        continue;
      }
      
      // Verificación 2: ¿Es un "Clopening"?
      let isClopening = false;
      if (shiftToCover.shiftTypeId === 'matutino') {
        const previousDay = subDays(shiftToCoverStart, 1);
        if (employeeShiftsThisWeek.some(s => isSameDay(s.start.toDate(), previousDay) && s.shiftTypeId === 'vespertino')) {
          isClopening = true;
        }
      }

      // Clasificación final
      const candidateData = { 
        ...employee, 
        isClopening, 
        shiftsThisWeek: employeeShiftsThisWeek.length 
      };

      if (isIdeal) idealSubstitutes.push(candidateData);
      else if (isAlternative) alternativeSubstitutes.push(candidateData);
    }
    
    // Devolvemos las tres listas
    return { idealSubstitutes, alternativeSubstitutes, unavailableEmployees };

  } catch (error) {
    logger.error("Error al buscar sustitutos:", error);
    throw new HttpsError("internal", "Ocurrió un error al buscar sustitutos.");
  }
});










// --- NUEVA FUNCIÓN PARA MARCAR UN TURNO COMO COMPLETADO ---
export const completeShift = onCall({ region: "us-east1" }, async (request) => {
  // Solo usuarios autenticados pueden llamar a esta función
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Debes estar autenticado.");
  }

  const { shiftId } = request.data;
  if (!shiftId || typeof shiftId !== 'string') {
    throw new HttpsError("invalid-argument", "Se requiere un 'shiftId' válido.");
  }

  try {
    const shiftRef = db.collection("shifts").doc(shiftId);
    const shiftDoc = await shiftRef.get();

    // Doble verificación: solo actualizamos si el turno existe y sigue 'confirmado'
    if (shiftDoc.exists && shiftDoc.data()?.status === "confirmado") {
      await shiftRef.update({ status: ShiftStatus.COMPLETADO });
      logger.info(`Turno ${shiftId} marcado como COMPLETADO por ${request.auth.uid}.`);
      return { success: true, message: `Turno ${shiftId} completado.` };
    }
    
    // Si el turno ya no estaba 'confirmado', no hacemos nada.
    return { success: false, message: "El turno no requería actualización." };

  } catch (error) {
    logger.error(`Error al completar el turno ${shiftId}:`, error);
    throw new HttpsError("internal", "No se pudo actualizar el estado del turno.");
  }
});

/**
 * Cloud Function que se activa cuando una oferta de turno de gerente es actualizada (reclamada).
 * Se encarga de reasignar el turno y notificar.
 */
export const processManagerShiftSwap = onDocumentUpdated({ region: "us-east1", document: "managerShiftOffers/{offerId}" }, async (event) => {
  if (!event.data) return;

  const beforeData = event.data.before.data();
  const afterData = event.data.after.data();

  // Nos aseguramos de que solo se active cuando el estado cambie a 'reclamado'
  if (beforeData.status !== 'disponible' || afterData.status !== 'reclamado') {
    return;
  }

  const { shiftId, claimingManagerId, claimingManagerName, offeringManagerId, offeringManagerName } = afterData;

  if (!shiftId || !claimingManagerId) {
    logger.error("Faltan datos en la oferta de turno reclamada:", afterData);
    return;
  }

  logger.info(`Procesando intercambio de turno. Turno ID: ${shiftId}, reclamado por: ${claimingManagerName}`);

  try {
    const shiftRef = db.collection("shifts").doc(shiftId);

    // 1. Reasignamos el turno al gerente que lo reclamó
    await shiftRef.update({
      userId: claimingManagerId,
      userName: claimingManagerName,
      status: ShiftStatus.CONFIRMADO,
    });
    
    // 2. Notificamos a ambos gerentes
    await Promise.all([
      createNotification(
        offeringManagerId, "¡Turno Cubierto!",
        `${claimingManagerName} ha cubierto tu turno ofrecido. Tu horario ha sido actualizado.`, "success", true
      ),
      createNotification(
        claimingManagerId, "¡Turno Asignado!",
        `Has cubierto exitosamente el turno de ${offeringManagerName}. El horario se ha actualizado.`, "success", true
      )
    ]);

  } catch (error) {
    logger.error(`Error al procesar el intercambio de turno para la oferta ${event.params.offerId}:`, error);
  }
});

// En: functions/src/index.ts

// Esta función se activa cada vez que un documento en 'users' es ACTUALIZADO
// Esta función se activa cada vez que un documento en 'users' es ACTUALIZADO
export const onUserStatusChange = onDocumentUpdated({ region: "us-east1", document: "users/{userId}" }, async (event) => {
  if (!event.data) return;

  const beforeData = event.data.before.data() as User;
  const afterData = event.data.after.data() as User;

  // Nos interesa solo el cambio de 'active' a 'inactive'
  if (beforeData.status !== 'active' || afterData.status !== 'inactive') {
    return; // No es el cambio que nos interesa, no hacemos nada.
  }
  
  const userId = event.params.userId;
  logger.info(`Detectada desactivación de ${afterData.name} (ID: ${userId}). Buscando turnos futuros...`);
  
  try {
    const shiftsRef = db.collection("shifts");
    const now = admin.firestore.Timestamp.now();

    // Buscamos todos los turnos futuros asignados a este usuario
    const q = shiftsRef.where("userId", "==", userId).where("start", ">", now);
    const futureShiftsSnapshot = await q.get();

    if (futureShiftsSnapshot.empty) {
      logger.info(`El usuario ${afterData.name} no tiene turnos futuros que reasignar.`);
      return;
    }

    const batch = db.batch();
    
    futureShiftsSnapshot.forEach(doc => {
      
      // Simplemente actualizamos el turno existente para marcarlo como pendiente
      batch.update(doc.ref, {
        userId: '',
        userName: 'PENDIENTE',
        status: ShiftStatus.PENDIENTE,
        notes: `Puesto por cubrir (antes de ${afterData.name})`,
      });
      logger.info(`Turno ${doc.id} de ${afterData.name} ahora está PENDIENTE.`);
    });
    
    await batch.commit();

    // --- LÓGICA MEJORADA PARA NOTIFICAR A TODOS LOS GERENTES ---
    logger.info("Buscando a todos los gerentes para notificarles...");

    // 1. Buscamos a TODOS los usuarios con el rol de 'gerente'
    const managersQuery = db.collection("users").where("role", "==", "gerente");
    const managersSnapshot = await managersQuery.get();

    if (managersSnapshot.empty) {
      logger.warn("No se encontraron gerentes a quienes notificar.");
      return;
    }
      // 2. Creamos una promesa de notificación para cada gerente encontrado
    const notificationPromises = managersSnapshot.docs.map(doc => {
      const managerId = doc.id;
      logger.info(`Creando notificación para el gerente con ID: ${managerId}`);
      return createNotification(
  managerId,
  "Empleado Desactivado",
  `El empleado ${afterData.name} ha sido desactivado. Se han desasignado ${futureShiftsSnapshot.size} de sus turnos. Revisa el horario para cubrirlos.`,
  "warning",
  true // <-- ¡ESTE ES EL CAMBIO CLAVE!
);
    });

    // 3. Enviamos todas las notificaciones en paralelo para máxima eficiencia
    await Promise.all(notificationPromises);
    logger.info(`Se enviaron ${notificationPromises.length} notificaciones a los gerentes.`);
    // --- FIN DE LA LÓGICA MEJORADA ---

  } catch (error) {
    logger.error(`Error al procesar la desactivación de ${afterData.name}:`, error);
  }
});


// Esta función se activa cada vez que un 'justification' se actualiza
export const onJustificationStatusChange = onDocumentUpdated({ region: "us-east1", document: "justifications/{justificationId}" }, async (event) => {
  if (!event.data) return;

  const beforeData = event.data.before.data();
  const afterData = event.data.after.data();

  // Nos interesa solo cuando el estado cambia a 'aprobado'
  if (beforeData.status !== 'pendiente' || afterData.status !== 'aprobado') {
    return;
  }
  
  const { shiftId, userName } = afterData;
  if (!shiftId) {
    logger.error(`La justificación ${event.params.justificationId} no tiene un shiftId.`);
    return;
  }

  logger.info(`Justificante aprobado para ${userName}. Actualizando estado del turno ${shiftId}...`);

  try {
    const shiftRef = db.collection("shifts").doc(shiftId);
    
    // Cambiamos el estado del turno a 'FALTA_JUSTIFICADA'
    await shiftRef.update({
      status: ShiftStatus.AUSENCIA_JUSTIFICADA,
    });
    
    // (Opcional) Enviar notificación de éxito al empleado
    await createNotification(
      afterData.userId, 
      "Justificante Aprobado",
      `Tu justificante para el turno del ${shiftId} ha sido aprobado por el gerente.`,
      "success"
    );

  } catch (error) {
    logger.error(`Error al actualizar el turno ${shiftId} desde la justificación:`, error);
  }
});



export const sendTargetedAnnouncement = onCall({ region: "us-east1" }, async (request) => {
  // Verificación de que solo un 'dueño' puede llamar a esta función
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Debes estar autenticado para realizar esta acción.");
  }

  // 1. Obtenemos el ID del usuario que llama a la función.
  const callerUid = request.auth.uid;
  const userDocRef = db.collection("users").doc(callerUid);
  
  // 2. Buscamos su documento en la base de datos para ver su rol.
  const userDoc = await userDocRef.get();

  if (!userDoc.exists || userDoc.data()?.role !== 'dueno') {
    throw new HttpsError("permission-denied", "Solo el dueño puede enviar anuncios.");
  }
  // --- FIN DE LA VERIFICACIÓN ---

  const { title, message, filters } = request.data;
  if (!title || !message || !filters) {
    throw new HttpsError("invalid-argument", "Faltan datos para el anuncio.");
  }

  let targetUsersQuery = db.collection("users").where('status', '==', 'active');
  const now = admin.firestore.Timestamp.now();

  // --- LÓGICA DE FILTRADO EN EL BACKEND ---
  switch (filters.target) {
    case 'role':
      if (filters.role) targetUsersQuery = targetUsersQuery.where('role', '==', filters.role);
      break;
    case 'activeShift':
      // Esta es una consulta compleja: primero buscamos los turnos activos
      const activeShiftsSnap = await db.collection('shifts').where('start', '<=', now).where('end', '>', now).get();
      const activeUserIds = activeShiftsSnap.docs.map(doc => doc.data().userId);
      if (activeUserIds.length > 0) {
        targetUsersQuery = targetUsersQuery.where(admin.firestore.FieldPath.documentId(), 'in', activeUserIds);
      } else {
        return { success: true, message: "Anuncio no enviado, no hay nadie en turno." };
      }
      break;
    case 'individual':
      if (filters.userName) targetUsersQuery = targetUsersQuery.where('name', '==', filters.userName);
      break;
    // El caso 'all' no necesita más filtros
  }
  
  const usersSnapshot = await targetUsersQuery.get();
  if (usersSnapshot.empty) {
    throw new HttpsError("not-found", "No se encontraron usuarios que coincidan con los filtros.");
  }

  // Creamos una notificación para cada usuario encontrado
  const notificationPromises = usersSnapshot.docs.map(userDoc => {
    return createNotification(userDoc.id, title, message, "info", true); // Requiere confirmación
  });
  
  await Promise.all(notificationPromises);

  return { success: true, message: `Anuncio enviado a ${usersSnapshot.size} usuario(s).` };
});

// --- NUEVA FUNCIÓN PARA OBTENER VISTA PREVIA DE DESTINATARIOS ---
export const getAnnouncementRecipients = onCall({ region: "us-east1" }, async (request) => {
  // Verificación de permisos (solo el dueño puede hacerlo)
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Debes estar autenticado para realizar esta acción.");
  }

  // 1. Obtenemos el ID del usuario que llama a la función.
  const callerUid = request.auth.uid;
  const userDocRef = db.collection("users").doc(callerUid);
  
  // 2. Buscamos su documento en la base de datos para ver su rol.
  const userDoc = await userDocRef.get();

  if (!userDoc.exists || userDoc.data()?.role !== 'dueno') {
    throw new HttpsError("permission-denied", "Solo el dueño puede enviar anuncios.");
  }
  // --- FIN DE LA VERIFICACIÓN ---

  const { filters } = request.data;
  if (!filters) {
    throw new HttpsError("invalid-argument", "Se requieren filtros.");
  }

  let targetUsersQuery = db.collection("users").where('status', '==', 'active');
  const now = admin.firestore.Timestamp.now();

  // La lógica de filtrado es IDÉNTICA a la de 'sendTargetedAnnouncement'
  switch (filters.target) {
    case 'role':
      if (filters.role) targetUsersQuery = targetUsersQuery.where('role', '==', filters.role);
      break;
    case 'activeShift':
      const activeShiftsSnap = await db.collection('shifts').where('start', '<=', now).where('end', '>', now).get();
      const activeUserIds = activeShiftsSnap.docs.map(doc => doc.data().userId).filter(id => id);
      if (activeUserIds.length > 0) {
        targetUsersQuery = targetUsersQuery.where(admin.firestore.FieldPath.documentId(), 'in', activeUserIds);
      } else {
        return { userNames: [] }; // Devuelve un array vacío si no hay nadie en turno
      }
      break;
    case 'individual':
      if (filters.userName) targetUsersQuery = targetUsersQuery.where('name', '==', filters.userName);
      break;
  }
  
  const usersSnapshot = await targetUsersQuery.get();
  
  // En lugar de enviar notificaciones, solo devolvemos los nombres.
  const userNames = usersSnapshot.docs.map(doc => doc.data().name);
  
  return { userNames };
});



// Se ejecuta todos los días a las 3:00 AM (zona horaria del servidor de Google)

export const generateAnalyticsReport = onSchedule("every day 03:00", async (event) => {
  logger.info("Iniciando tarea de agregación de métricas de ÉLITE...");
  
  try {
    const now = new Date();
    // Analizaremos los datos de los últimos 30 días para tener un buen rango
    const startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30);
    
    const [shiftsSnap, requestsSnap, justsSnap, usersSnap] = await Promise.all([
      db.collection("shifts").where('start', '>=', startDate).get(),
      db.collection("changeRequests").where('requestedAt', '>=', startDate).get(),
      db.collection("justifications").where('uploadedAt', '>=', startDate).get(),
      db.collection("users").where('status', '==', 'active').get()
    ]);

    // --- Contenedores para nuestros cálculos ---
    const dailyMetrics: { [dateStr: string]: { date: Date, totalHours: number, shiftCount: number } } = {};
    const employeeMetrics: { [id: string]: any } = {};
    usersSnap.forEach(doc => {
        const user = doc.data() as User;
        employeeMetrics[doc.id] = { userId: doc.id, name: user.name, totalHours: 0, totalShifts: 0, changeRequestCount: 0, justifiedAbsenceCount: 0, unjustifiedAbsenceCount: 0 };
    });

    // --- Procesamiento de Datos ---
    shiftsSnap.forEach(doc => {
      const shift = doc.data();
      const dateStr = shift.start.toDate().toISOString().split('T')[0];
      if (!dailyMetrics[dateStr]) dailyMetrics[dateStr] = { date: shift.start.toDate(), totalHours: 0, shiftCount: 0 };
      
      const hours = (shift.end.toMillis() - shift.start.toMillis()) / (1000 * 60 * 60);
      dailyMetrics[dateStr].totalHours += hours;
      dailyMetrics[dateStr].shiftCount += 1;

      if (shift.userId && employeeMetrics[shift.userId]) {
        employeeMetrics[shift.userId].totalHours += hours;
        employeeMetrics[shift.userId].totalShifts += 1;
        if(shift.status === 'falta_injustificada') employeeMetrics[shift.userId].unjustifiedAbsenceCount += 1;
        if(shift.status === 'ausencia_justificada') employeeMetrics[shift.userId].justifiedAbsenceCount += 1;
      }
    });

    requestsSnap.forEach(doc => {
        const req = doc.data();
        if(req.requestingUserId && employeeMetrics[req.requestingUserId]) {
            employeeMetrics[req.requestingUserId].changeRequestCount += 1;
        }
    });

    const totalChangeRequests = requestsSnap.size;
    const totalJustifications = justsSnap.size;
    
    // --- Guardado del Reporte Final ---
    const summaryData = {
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      dailyMetrics: Object.values(dailyMetrics).sort((a,b) => a.date.getTime() - b.date.getTime()),
      employeeMetrics: Object.values(employeeMetrics),
      totalChangeRequests_30d: totalChangeRequests,
      totalJustifications_30d: totalJustifications,
    };
    
    await db.collection("analytics").doc("summary").set(summaryData);
    logger.info("Reporte de métricas de élite generado con éxito.");

  } catch (error) {
    logger.error("Error al generar reporte de métricas:", error);
  }
});



// --- FUNCIÓN PARA REPORTAR UNA FALLA DE APP ---
// Es llamada por el gerente desde el "Centro de Control"
export const reportAppOutage = onCall({ region: "us-east1" }, async (request) => {
  // 1. Verificación de Seguridad: Solo Gerentes o Dueños pueden reportar
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Debes estar autenticado.");
  }
  const callerUid = request.auth.uid;
  const userDoc = await db.collection("users").doc(callerUid).get();
  if (!userDoc.exists) {
    throw new HttpsError("not-found", "No se encontró tu perfil de usuario.");
  }
  const callerRole = userDoc.data()?.role;
  if (callerRole !== 'gerente' && callerRole !== 'dueno') {
    throw new HttpsError("permission-denied", "No tienes los permisos de Gerente o Dueño para esta acción.");
  }
  // --- FIN DEL BLOQUE DE SEGURIDAD ---
  
  // 2. Lógica Principal
  const { appName } = request.data;
  if (!appName) {
    throw new HttpsError("invalid-argument", "Se requiere el nombre de la aplicación (appName).");
  }

  try {
    // Actualiza el documento de estado
    const statusRef = db.collection("status").doc("connections");
    await statusRef.set({ [appName]: 'offline', lastUpdated: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });

    // Registra la acción en el historial universal
    await db.collection("universalHistory").add({
        actorId: callerUid,
        actorName: userDoc.data()?.name || 'Desconocido',
        action: 'FALLA_DE_APP_REPORTADA',
        details: { app: appName, message: "Se reportó una desconexión" },
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    // Notifica al Dueño
    const ownerQuery = db.collection("users").where("role", "==", "dueno").limit(1);
    const ownerSnapshot = await ownerQuery.get();
    if (!ownerSnapshot.empty) {
        const ownerId = ownerSnapshot.docs[0].id;
        await createNotification(
            ownerId,
            `ALERTA: Falla en ${appName}`,
            `${userDoc.data()?.name} ha reportado una falla en la conexión de ${appName}.`,
            "error",
            true
        );
    }

    return { success: true, message: "Falla reportada con éxito." };
  } catch (error) {
    logger.error(`Error al reportar falla para ${appName}:`, error);
    throw new HttpsError("internal", "Ocurrió un error inesperado.");
  }
});


// --- FUNCIÓN PARA RESOLVER UNA FALLA DE APP ---
// Es llamada por el gerente desde el "Centro de Control"
export const resolveAppOutage = onCall({ region: "us-east1" }, async (request) => {
  // 1. Verificación de Seguridad (idéntica a la anterior)
  if (!request.auth) { throw new HttpsError("unauthenticated", "Debes estar autenticado."); }
  const callerUid = request.auth.uid;
  const userDoc = await db.collection("users").doc(callerUid).get();
  if (!userDoc.exists || (userDoc.data()?.role !== 'gerente' && userDoc.data()?.role !== 'dueno')) {
    throw new HttpsError("permission-denied", "No tienes permiso para resolver fallas.");
  }

  // 2. Lógica Principal
  const { appName } = request.data;
  if (!appName) {
    throw new HttpsError("invalid-argument", "Se requiere el nombre de la aplicación (appName).");
  }

  try {
    // Actualiza el documento de estado a 'online'
    const statusRef = db.collection("status").doc("connections");
    await statusRef.set({ [appName]: 'online', lastUpdated: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });

    // Registra la resolución en el historial universal
    await db.collection("universalHistory").add({
        actorId: callerUid,
        actorName: userDoc.data()?.name || 'Desconocido',
        action: 'FALLA_DE_APP_RESUELTA',
        details: { app: appName, message: "Se marcó la conexión como resuelta" },
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { success: true, message: "Falla marcada como resuelta." };
  } catch (error) {
    logger.error(`Error al resolver falla para ${appName}:`, error);
    throw new HttpsError("internal", "Ocurrió un error inesperado.");
  }
});

// --- NUEVA FUNCIÓN "VIGILANTE" ---
// Se ejecuta cada 15 minutos desde la región 'us-east1'
export const checkDeliveryAppStatus = onSchedule({
    schedule: "every 15 minutes",
    region: "us-east1",
    timeZone: "America/Chihuahua", // <-- MUY IMPORTANTE: ajusta la zona horaria a la de tu restaurante
    memory: "1GiB",
    timeoutSeconds: 300,
}, async (event) => {
    
    logger.info("Ejecutando Vigilante de Conexiones...");

    // 1. OBTENEMOS EL HORARIO DE OPERACIÓN DESDE FIRESTORE
    const hoursDoc = await db.collection("config").doc("operatingHours").get();
    if (!hoursDoc.exists) {
        logger.error("No se encontró el documento de horarios de operación.");
        return;
    }
    const operatingHours = hoursDoc.data();
    if (!operatingHours) {
        logger.error("El documento de horarios de operación está vacío.");
        return; // Usamos return vacío
    }

    // 2. OBTENEMOS LA HORA Y DÍA ACTUAL EN LA ZONA HORARIA CORRECTA
    const now = new Date();
    const dayOfWeek = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: "America/Chihuahua" }).format(now).toLowerCase(); // ej: "monday"
    const currentTime = now.getHours() * 60 + now.getMinutes(); // ej: 14:30 -> 870

    const dayHours = operatingHours[dayOfWeek]; // ej: "13:00-22:00"
    if (!dayHours) {
        logger.info(`Hoy es ${dayOfWeek}, el restaurante está cerrado según el horario.`);
        return;
    }

    // 3. VERIFICAMOS SI DEBERÍA ESTAR ABIERTO
    const [openTimeStr, closeTimeStr] = dayHours.split('-');
    const openTime = parseInt(openTimeStr.split(':')[0]) * 60 + parseInt(openTimeStr.split(':')[1]);
    const closeTime = parseInt(closeTimeStr.split(':')[0]) * 60 + parseInt(closeTimeStr.split(':')[1]);

    const isSupposedToBeOpen = currentTime >= openTime && currentTime < closeTime;

    if (!isSupposedToBeOpen) {
        logger.info("El restaurante está fuera del horario de operación. No se realizarán verificaciones.");
        return;
    }
    
    // 4. SI DEBERÍA ESTAR ABIERTO, PROCEDEMOS A VERIFICAR LAS APPS
    logger.info("El restaurante debería estar abierto. Verificando estado en las apps...");

    const appsToCheck = [
        { name: 'uber_eats', url: 'https://www.ubereats.com/mx/store/cocina-amore/6HWspo-vUj2OHic3eqx6jw', closedKeywords: ['No disponible en este momento', 'actualmente cerrado', 'No disponible', 'Cerrado','temporalmente no disponible', 'tienda cerrada', 'no puedes pedir ahora', 'restaurante cerrado'] },
        { name: 'rappi', url: 'https://www.rappi.com.mx/restaurantes/1930059533-cocina-amore-restaurant', closedKeywords: ['No disponible en este momento', 'actualmente cerrado','No disponible','Cerrado por hoy', 'Cerrado', 'temporalmente no disponible','tienda cerrada', 'no puedes pedir ahora', 'restaurante cerrado'] },
    ];

    const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
    const statusRef = db.collection("status").doc("connections");

    for (const app of appsToCheck) {
        const page = await browser.newPage();
        try {
            await page.goto(app.url, { waitUntil: 'networkidle0' });
            const pageContent = await page.content();
            const lowerCaseContent = pageContent.toLowerCase();

            // Verificamos si alguna palabra clave de "cerrado" aparece en la página
            const isClosed = app.closedKeywords.some(keyword => lowerCaseContent.includes(keyword.toLowerCase()));

            if (isClosed) {
                logger.warn(`¡ALERTA! ${app.name} parece estar CERRADO.`);
                // Llamamos a la lógica que ya teníamos para reportar una falla
                await statusRef.set({ [app.name]: 'offline', lastUpdated: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
                // Aquí podrías añadir una notificación específica para el gerente en turno si quieres
            } else {
                // Si no está cerrado, nos aseguramos de que su estado sea 'online'
                await statusRef.set({ [app.name]: 'online', lastUpdated: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
                logger.info(`${app.name} está EN LÍNEA.`);
            }

        } catch (error) {
            logger.error(`Error al verificar ${app.name}:`, error);
        } finally {
            await page.close();
        }
    }

    await browser.close();
    return;
});