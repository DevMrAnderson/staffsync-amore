import { addHistoryEntry } from './firestoreService';
import { UniversalHistoryEntry } from '../types';
// serverTimestamp is handled by addDocument in firestoreService

export const logUserAction = async (
  actorId: string, 
  actorName: string, 
  action: string, // Use HISTORY_ACTIONS from constants.ts
  details?: Record<string, any>
): Promise<void> => {
  try {
    const historyEntryData: Omit<UniversalHistoryEntry, 'id' | 'timestamp'> = {
      actorId,
      actorName,
      action,
      details,
    };
    await addHistoryEntry(historyEntryData);
  } catch (error) {
    console.error("Error al registrar la accion en el historial universal:", error, { actorId, actorName, action, details });
    // Optionally, notify admin or retry, but avoid breaking user flow for logging failures.
    // In a production app, you might queue these logs or use a more robust logging system.
  }
};
