import { ShiftTemplate, User, Shift } from '../types';
import { formatISO } from 'date-fns';

type Assignments = { [role: string]: string[] };

/**
 * Nuestro "Cerebro de IA" simulado. Rellena los puestos para un único turno.
 * @param employees - La lista de todos los empleados activos.
 * @param shiftTemplate - La plantilla del turno a rellenar (Matutino/Vespertino).
 * @param existingShiftsForDay - Los turnos ya asignados para ese día, para evitar conflictos.
 * @returns Un objeto con las asignaciones para ese turno.
 */
export const fillSingleShiftWithAI = (
  employees: User[],
  shiftTemplate: ShiftTemplate,
  existingShiftsForDay: Shift[]
): Assignments => {
  const newAssignments: Assignments = {};
  
  // Hacemos una copia del workload para no modificar el original si lo hubiera
  const employeeWorkload: { [userId: string]: number } = {};
  employees.forEach(emp => {
    employeeWorkload[emp.id] = existingShiftsForDay.filter(s => s.userId === emp.id).length;
  });

  // Para cada puesto requerido en la plantilla...
  for (const role in shiftTemplate.positionsRequired) {
    const requiredCount = shiftTemplate.positionsRequired[role];
    newAssignments[role] = [];

    // Buscamos a los mejores candidatos
    const candidates = employees
      // Filtramos por el rol correcto
      .filter(emp => emp.role === role)
      // Filtramos a los que ya tienen un turno ese día
      .filter(emp => !existingShiftsForDay.some(s => s.userId === emp.id))
      // Ordenamos por el que menos ha trabajado esa semana (simulado por el conteo del día)
      .sort((a, b) => employeeWorkload[a.id] - employeeWorkload[b.id]);

    // Asignamos a los mejores N candidatos
    const assignedEmployees = candidates.slice(0, requiredCount);
    for (const assignedEmp of assignedEmployees) {
      newAssignments[role].push(assignedEmp.id);
    }
  }

  return newAssignments;
};