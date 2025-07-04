// En: functions/src/index.ts

import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";

admin.initializeApp();
const db = admin.firestore();

// Helper function to create notifications
const createNotification = (data: any) => {
  const ref = db.collection("notifications").doc();
  // Using a batch just in case we need to create multiple notifications later
  const batch = db.batch();
  batch.set(ref, { 
    ...data, 
    isRead: false, 
    createdAt: admin.firestore.FieldValue.serverTimestamp() 
  });
  return batch.commit();
};


// --- Cloud Function rewritten with modern v2 syntax ---
export const handleRequestStatusChange = onDocumentUpdated("changeRequests/{requestId}", async (event) => {
  // Check if data exists, which it always should for an update event
  if (!event.data) {
    logger.error("No data associated with the event");
    return;
  }

  // Correctly access the data before and after the change
  const beforeData = event.data.before.data();
  const afterData = event.data.after.data();

  // If the status didn't change, do nothing
  if (beforeData.status === afterData.status) {
    logger.info("Status did not change, no notification needed.");
    return;
  }

  const status = afterData.status;
  const proposedUserName = afterData.proposedUserName || "un compañero";
  
  let notificationPayload: any = null;

  switch (status) {
    // Case: The proposed employee ACCEPTS the shift
    case "aceptado_empleado":
      notificationPayload = {
        userId: afterData.managerId, // Notify the manager
        title: "Propuesta Aceptada",
        message: `${proposedUserName} ha aceptado la propuesta. Se requiere tu aprobación final.`,
        type: "info",
        requiresConfirmation: true,
      };
      break;

    // Case: The proposed employee REJECTS the shift
    case "rechazado_empleado":
      notificationPayload = {
        userId: afterData.managerId, // Notify the manager
        title: "Propuesta Rechazada",
        message: `${proposedUserName} ha rechazado la propuesta. Debes proponer a otro sustituto.`,
        type: "warning",
        requiresConfirmation: true,
      };
      break;

    // Case: The MANAGER gives final approval
    case "aprobado_gerente":
      const batch = db.batch();

      // Notification for the original requester
      const requesterNotif = {
        userId: afterData.requestingUserId,
        title: "¡Cambio Aprobado!",
        message: `Tu solicitud ha sido aprobada. ${proposedUserName} cubrirá tu turno.`,
        type: "success",
        requiresConfirmation: true,
      };
      const reqRef = db.collection("notifications").doc();
      batch.set(reqRef, { ...requesterNotif, isRead: false, createdAt: admin.firestore.FieldValue.serverTimestamp() });

      // Notification for the substitute
      const proposedNotif = {
        userId: afterData.proposedUserId,
        title: "¡Turno Asignado!",
        message: "El gerente ha aprobado tu cobertura. El turno ahora es tuyo.",
        type: "success",
        requiresConfirmation: true,
      };
      const propRef = db.collection("notifications").doc();
      batch.set(propRef, { ...proposedNotif, isRead: false, createdAt: admin.firestore.FieldValue.serverTimestamp() });
      
      logger.info("Sending notifications for final approval.");
      return batch.commit();

    // Add other cases as needed
  }

  if (notificationPayload) {
    logger.info(`Creating single notification for userId: ${notificationPayload.userId}`);
    return createNotification(notificationPayload);
  }

  return;
});