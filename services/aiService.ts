// This service simulates AI functionalities.
// In a real application, this would interact with the Gemini API.
// import { GoogleGenAI } from "@google/genai"; // If using Gemini
import { Shift, User, UserRole, PartialShiftForTemplate, ShiftType } from '../types';
import { getAllUsersByRole, getAllShiftTypes } from './firestoreService'; // To get a list of potential users and shift types
import { Timestamp } from 'firebase/firestore';
import { addDays, setHours, setMinutes, setSeconds, setMilliseconds, startOfDay } from 'date-fns';


// const API_KEY = "YOUR_GEMINI_API_KEY"; // Replace with your actual Gemini API key
// if (!API_KEY || API_KEY === "YOUR_GEMINI_API_KEY") {
//   console.warn("GEMINI_API_KEY no esta configurado o usa valor placeholder. Las funciones de IA usaran datos simulados.");
// }
// const ai = new GoogleGenAI({apiKey: API_KEY!}); // The '!' asserts API_KEY is non-null if used

/**
 * Simulates finding optimal replacements for a given shift.
 * Considers only employees of the same role for simplicity.
 */
export const findOptimalReplacement = async (shiftToReplace: Shift): Promise<User[]> => {
  console.log(`[AI Simulation] Buscando reemplazo para el turno: ${shiftToReplace.shiftType?.name} (Usuario: ${shiftToReplace.userName})`);
  
  await new Promise(resolve => setTimeout(resolve, 800 + Math.random() * 500)); // Simulate API call delay

  try {
    // For simulation, let's assume we are looking for other 'empleado' role users.
    const potentialUsers = await getAllUsersByRole(UserRole.EMPLEADO);
    
    const replacements = potentialUsers
      .filter(user => user.id !== shiftToReplace.userId) // Not the original user
      .sort(() => 0.5 - Math.random()) // Randomize for simulation
      .slice(0, 3); // Return up to 3 simulated options
    
    if (replacements.length > 0) {
      console.log(`[AI Simulation] Reemplazos simulados encontrados: ${replacements.map(u=>u.name).join(', ')}`);
    } else {
      console.log(`[AI Simulation] No se encontraron reemplazos simulados.`);
    }
    return replacements;
  } catch (error) {
    console.error("[AI Simulation] Error al obtener usuarios para reemplazo:", error);
    return []; 
  }
};

/**
 * Simulates generating an optimized schedule template for a few days.
 */
export const getOptimizedScheduleTemplate = async (): Promise<PartialShiftForTemplate[]> => {
  console.log("[AI Simulation] Generando plantilla de horario optimizado...");
  await new Promise(resolve => setTimeout(resolve, 1200 + Math.random() * 800)); // Simulate API call delay

  try {
    const shiftTypes = await getAllShiftTypes();
    if (shiftTypes.length === 0) {
      console.warn("[AI Simulation] No hay tipos de turno definidos. No se puede generar plantilla.");
      return [];
    }

    const mockTemplate: PartialShiftForTemplate[] = [];
    const today = startOfDay(new Date());

    // Simulate a few shifts for the next 3 days
    for (let i = 0; i < 3; i++) {
      const day = addDays(today, i + 1); // Start from tomorrow

      // Simulate a morning shift
      const morningShiftType = shiftTypes[Math.floor(Math.random() * shiftTypes.length)];
      mockTemplate.push({
        shiftTypeId: morningShiftType.id,
        start: Timestamp.fromDate(setHours(setMinutes(setSeconds(setMilliseconds(day,0),0),0), 9)), // 9 AM
        end: Timestamp.fromDate(setHours(setMinutes(setSeconds(setMilliseconds(day,0),0),0), 17)), // 5 PM
        notes: `Sugerencia IA: Cubrir manana (${morningShiftType.name})`,
      });

      // Simulate an evening shift if there's another shift type
      if (shiftTypes.length > 1) {
        let eveningShiftType = shiftTypes[Math.floor(Math.random() * shiftTypes.length)];
        // Ensure it's different if possible, or just pick one
        if (eveningShiftType.id === morningShiftType.id && shiftTypes.length > 1) {
            eveningShiftType = shiftTypes.find(st => st.id !== morningShiftType.id) || eveningShiftType;
        }
        mockTemplate.push({
          shiftTypeId: eveningShiftType.id,
          start: Timestamp.fromDate(setHours(setMinutes(setSeconds(setMilliseconds(day,0),0),0), 17)), // 5 PM
          end: Timestamp.fromDate(setHours(setMinutes(setSeconds(setMilliseconds(day,0),0),0), 23)), // 11 PM
          notes: `Sugerencia IA: Refuerzo tarde/noche (${eveningShiftType.name})`,
        });
      }
    }
    
    console.log(`[AI Simulation] Plantilla generada con ${mockTemplate.length} turnos simulados.`);
    return mockTemplate;
  } catch (error) {
    console.error("[AI Simulation] Error al generar plantilla de horario:", error);
    return [];
  }
};

// --- Example structure for a real Gemini API call ---
//
// const GEMINI_MODEL_TEXT = 'gemini-2.5-flash-preview-04-17'; // Or your preferred model
//
// const generatePromptForShiftReplacement = (shift: Shift, availableUsers: User[]): string => {
//   const availableUserList = availableUsers
//     .map(u => `- ${u.name} (ID: ${u.id}, Rol: ${u.role})`)
//     .join('\\n');
//
//   return \`Eres un asistente de programacion de horarios para un restaurante.
//   Necesito encontrar reemplazos para el siguiente turno:
//   - Empleado Original: ${shift.userName} (ID: ${shift.userId})
//   - Tipo de Turno: ${shift.shiftType?.name || shift.shiftTypeId}
//   - Fecha y Hora de Inicio: ${shift.start.toDate().toLocaleString('es-ES')}
//   - Fecha y Hora de Fin: ${shift.end.toDate().toLocaleString('es-ES')}
//
//   Lista de empleados potencialmente disponibles (considera su rol y evita sobrecarlos):
//   ${availableUserList}
//
//   Por favor, sugiere hasta 3 empleados (solo sus IDs) que serian los mejores reemplazos.
//   Prioriza empleados con el rol 'empleado'.
//   Devuelve tu respuesta como un array JSON de IDs. Ejemplo: ["id1", "id2", "id3"].
//   Si no encuentras reemplazos adecuados, devuelve un array JSON vacio: [].
//   \`;
// };
//
// export const findOptimalReplacementWithGemini = async (shift: Shift): Promise<string[]> => {
//   if (!ai || API_KEY === "YOUR_GEMINI_API_KEY") {
//     console.warn("Gemini API no configurada. Usando simulacion.");
//     const users = await findOptimalReplacement(shift); // Fallback to simulation
//     return users.map(u => u.id);
//   }
//
//   try {
//     const allEmployees = await getAllUsersByRole(UserRole.EMPLEADO);
//     const availableUsers = allEmployees.filter(u => u.id !== shift.userId);
//
//     if (availableUsers.length === 0) return [];
//
//     const prompt = generatePromptForShiftReplacement(shift, availableUsers);
//
//     const response = await ai.models.generateContent({
//       model: GEMINI_MODEL_TEXT,
//       contents: prompt,
//       config: { responseMimeType: "application/json" } // Request JSON output
//     });
//
//     let jsonStr = response.text.trim();
//     const fenceRegex = /^\\\`\\\`\\\`(\\w*)?\\s*\\n?(.*?)\\n?\\s*\\\`\\\`\\\`$/s;
//     const match = jsonStr.match(fenceRegex);
//     if (match && match[2]) {
//       jsonStr = match[2].trim();
//     }
//
//     const suggestedIds = JSON.parse(jsonStr);
//     if (Array.isArray(suggestedIds) && suggestedIds.every(id => typeof id === 'string')) {
//       return suggestedIds;
//     }
//     return [];
//   } catch (error) {
//     console.error("Error al llamar a Gemini API para reemplazos:", error);
//     return []; // Fallback on error
//   }
// };
