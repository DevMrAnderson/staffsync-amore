import React, { useEffect, useState, useCallback } from 'react';
import { Shift, ShiftStatus, ShiftTemplate, User, UserRole } from '../../types';
import Button from '../common/Button';
import LoadingSpinner from '../common/LoadingSpinner';
import { useNotification } from '../../contexts/NotificationContext';
import { getShiftTemplates, getAllUsersByRole, replaceShiftsForTemplate, getShiftsForDay, getShiftsForMonth } from '../../services/firestoreService';
import { useAuth } from '../../contexts/AuthContext';
import { Timestamp } from 'firebase/firestore';
import { startOfWeek, addDays, isEqual, format, parse, endOfWeek, addMonths, subMonths, startOfMonth, subDays } from 'date-fns';
import { es } from 'date-fns/locale/es';
import { DATE_FORMAT_SPA_DATE_ONLY, HISTORY_ACTIONS } from '../../constants';
import Modal from '../common/Modal';
import { logUserAction } from '../../services/historyService';
import MonthView from './MonthView';

// --- Tipos y Constantes del Componente ---
type ShiftAssignments = { [role: string]: string[] };
const PENDING_ASSIGNMENT_ID = 'pending';
interface ScheduleBuilderProps {
  initialTemplate?: Partial<Shift>[] | null;
  onTemplateConsumed?: () => void;
}
type ViewMode = 'week' | 'month';

interface PendingAssignment {
  userId: string;
  role: string;
}

// --- Componente Principal ---
const ScheduleBuilder: React.FC<ScheduleBuilderProps> = ({ initialTemplate, onTemplateConsumed }) => {
  // --- Estados ---
  const { userData } = useAuth();
  const { addNotification } = useNotification();
  const [shiftTemplates, setShiftTemplates] = useState<ShiftTemplate[]>([]);
  const [employees, setEmployees] = useState<User[]>([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date>(new Date());
  const [selectedTemplate, setSelectedTemplate] = useState<ShiftTemplate | null>(null);
  const [assignments, setAssignments] = useState<ShiftAssignments>({});
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [roleToAssign, setRoleToAssign] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPublishing, setIsPublishing] = useState(false);
  const [shiftsForDay, setShiftsForDay] = useState<Shift[]>([]);
  const [monthlyShifts, setMonthlyShifts] = useState<Shift[]>([]);
  const [isLoadingShifts, setIsLoadingShifts] = useState(false);
  const [isLoadingMonth, setIsLoadingMonth] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [isEditMode, setIsEditMode] = useState(false);
  const [isClopeningConfirmOpen, setIsClopeningConfirmOpen] = useState(false);
  const [pendingAssignment, setPendingAssignment] = useState<PendingAssignment | null>(null);


  // --- Lógica de Carga de Datos ---
  const fetchRequiredData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [templates, users] = await Promise.all([getShiftTemplates(), getAllUsersByRole()]);
      setShiftTemplates(templates);
      setEmployees(users);
    } catch (error: any) {
      addNotification(`Error cargando datos iniciales: ${error.message}`, "error");
    } finally {
      setIsLoading(false);
    }
  }, [addNotification]);

  useEffect(() => {
    fetchRequiredData();
  }, [fetchRequiredData]);

  // Efecto para cargar datos según la vista (semana o mes)
  useEffect(() => {
    const commonCleanup = () => {
      setSelectedTemplate(null);
      setAssignments({});
      setIsEditMode(false);
    };
  
    if (viewMode === 'week') {
      const fetchShiftsForDay = async () => {
        if (!shiftTemplates.length) return;
        setIsLoadingShifts(true);
        commonCleanup();
        try {
          const existingShifts = await getShiftsForDay(selectedDay);
          setShiftsForDay(existingShifts);
        } catch (error: any) {
          addNotification(`Error al cargar los turnos del día: ${error.message}`, 'error');
          console.error("Error en fetchShiftsForDay:", error);
        } finally {
          setIsLoadingShifts(false);
        }
      };
      fetchShiftsForDay();
    } else if (viewMode === 'month') {
      const fetchShiftsForMonth = async () => {
        setIsLoadingMonth(true);
        commonCleanup();
        try {
          const shifts = await getShiftsForMonth(currentDate);
          setMonthlyShifts(shifts);
        } catch (error: any) {
          addNotification(`Error al cargar los turnos del mes: ${error.message}`, 'error');
          console.error("Error en fetchShiftsForMonth:", error);
        } finally {
          setIsLoadingMonth(false);
        }
      };
      fetchShiftsForMonth();
    }
  }, [selectedDay, viewMode, currentDate, shiftTemplates, addNotification]);

  // --- Lógica de Manejo de Acciones ---
  const handlePublishSchedule = async () => {
    if (!selectedDay || !selectedTemplate || !userData) return;
    if (isEditMode && !window.confirm("Ya existe un horario publicado. ¿Estás seguro de que quieres sobreescribirlo?")) {
      return; 
    }
    setIsPublishing(true);
    try {
      const shiftsToCreate: Omit<Shift, 'id' | 'createdAt'>[] = [];
      for (const role in assignments) {
        for (const assignmentId of assignments[role]) {
          const startDate = parse(selectedTemplate.startTime, 'HH:mm', selectedDay);
          const endDate = parse(selectedTemplate.endTime, 'HH:mm', selectedDay);
          let newShift: Omit<Shift, 'id' | 'createdAt'>;
          if (assignmentId === PENDING_ASSIGNMENT_ID) {
            newShift = { userId: '', userName: 'PENDIENTE', shiftTypeId: selectedTemplate.id, shiftTypeName: selectedTemplate.name, start: Timestamp.fromDate(startDate), end: Timestamp.fromDate(endDate), status: ShiftStatus.PENDIENTE, notes: `Asignado a ${role}` };
          } else {
            const employee = employees.find(e => e.id === assignmentId);
            if (!employee) continue;
            newShift = { userId: employee.id, userName: employee.name, shiftTypeId: selectedTemplate.id, shiftTypeName: selectedTemplate.name, start: Timestamp.fromDate(startDate), end: Timestamp.fromDate(endDate), status: ShiftStatus.CONFIRMADO, notes: `Asignado a ${role}` };
          }
          shiftsToCreate.push(newShift);
        }
      }
      await replaceShiftsForTemplate(selectedDay, selectedTemplate.id, shiftsToCreate);
      await logUserAction(userData.id, userData.name, HISTORY_ACTIONS.PUBLISH_SCHEDULE, { date: format(selectedDay, DATE_FORMAT_SPA_DATE_ONLY), template: selectedTemplate.name, shiftCount: shiftsToCreate.length });
      addNotification(`¡Horario actualizado con éxito!`, 'success');
      const existingShifts = await getShiftsForDay(selectedDay);
      setShiftsForDay(existingShifts);
      setSelectedTemplate(null);
      setAssignments({});
      setIsEditMode(false);
    } catch (error: any) {
      console.error("Error publicando horario:", error);
      addNotification(`Error al publicar: ${error.message}`, 'error');
    } finally { setIsPublishing(false); }
  };

  // Esta función ahora SÓLO ejecuta la asignación
  const executeAssignment = (userId: string, role: string) => {
    if (!selectedTemplate) return;
    const requiredCount = selectedTemplate.positionsRequired[role];
    const currentCount = assignments[role]?.length || 0;
    if (currentCount >= requiredCount) {
      addNotification(`El puesto de ${role.replace(/_/g, ' ')} ya está completo.`, 'warning');
      return;
    }
    setAssignments(prev => ({ ...prev, [role]: [...(prev[role] || []), userId] }));
  };

  

  const navigateDate = (direction: 'prev' | 'next') => {
    const newDate = viewMode === 'week' ? addDays(currentDate, direction === 'prev' ? -7 : 7) : direction === 'prev' ? subMonths(currentDate, 1) : addMonths(currentDate, 1);
    setCurrentDate(newDate);
    if (viewMode === 'week') { setSelectedDay(startOfWeek(newDate, { weekStartsOn: 1 })); }
  };
  
  const handleDaySelect = (day: Date) => { setSelectedDay(day); setViewMode('week'); };
  
  const handleTemplateSelect = (template: ShiftTemplate) => {
    setSelectedTemplate(template);
    const newAssignments: ShiftAssignments = {};
    const shiftsForThisTemplate = shiftsForDay.filter(s => s.shiftTypeId === template.id);
    if (shiftsForThisTemplate.length > 0) {
      setIsEditMode(true);
      shiftsForThisTemplate.forEach(shift => {
        const role = shift.notes?.replace('Asignado a ', '') || 'desconocido';
        if (role !== 'desconocido') {
          if (!newAssignments[role]) { newAssignments[role] = []; }
          if (shift.status === ShiftStatus.PENDIENTE) { newAssignments[role].push(PENDING_ASSIGNMENT_ID); }
          else { newAssignments[role].push(shift.userId); }
        }
      });
    } else {
      setIsEditMode(false);
    }
    setAssignments(newAssignments);
  };
  
  const handleOpenAssignModal = (role: string) => { setRoleToAssign(role); setIsAssignModalOpen(true); };

// Esta función AHORA decide si asignar directamente o pedir confirmación
const handleAssignEmployee = async (userId: string) => {
  if (!roleToAssign || !selectedTemplate || !selectedDay) return;

  // Cerramos el modal de selección de empleado inmediatamente
  setIsAssignModalOpen(false);
  setRoleToAssign(null);

  // Lógica de Alerta de "Cierre y Apertura"
  if (selectedTemplate.id === 'matutino') {
    const previousDay = subDays(selectedDay, 1);
    const previousDayShifts = await getShiftsForDay(previousDay);
    const workedVespertino = previousDayShifts.some(s => s.userId === userId && s.shiftTypeId === 'vespertino');

    if (workedVespertino) {
      // Si hay conflicto, guardamos la asignación y abrimos nuestro modal de confirmación
      setPendingAssignment({ userId, role: roleToAssign });
      setIsClopeningConfirmOpen(true);
    } else {
      // Si no hay conflicto, asignamos directamente
      executeAssignment(userId, roleToAssign);
    }
  } else {
    // Si no es turno matutino, asignamos directamente
    executeAssignment(userId, roleToAssign);
  }
};

  const handleMarkAsPending = () => {
    if (!roleToAssign || !selectedTemplate) return;
    const requiredCount = selectedTemplate.positionsRequired[roleToAssign];
    const currentCount = assignments[roleToAssign]?.length || 0;
    if (currentCount >= requiredCount) {
      addNotification(`El puesto de ${roleToAssign.replace(/_/g, ' ')} ya está completo.`, 'warning');
      setIsAssignModalOpen(false); return;
    }
    setAssignments(prev => ({ ...prev, [roleToAssign]: [...(prev[roleToAssign] || []), PENDING_ASSIGNMENT_ID] }));
    setIsAssignModalOpen(false); setRoleToAssign(null);
  };

  const handleUnassign = (role: string, index: number) => {
    setAssignments(prev => {
      const newAssigned = [...(prev[role] || [])];
      newAssigned.splice(index, 1);
      return { ...prev, [role]: newAssigned };
    });
  };

  // --- Lógica de variables calculadas ---
  const currentWeekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }).map((_, i) => addDays(currentWeekStart, i));
  const allAssignedInCurrentSchedule = Object.values(assignments).flat();
  const employeeIdsWithShiftsToday = shiftsForDay.map(shift => shift.userId);
  const assignableEmployees = roleToAssign ? employees.filter(emp => emp.role === roleToAssign && !allAssignedInCurrentSchedule.includes(emp.id) && !employeeIdsWithShiftsToday.includes(emp.id)) : [];
  let isScheduleComplete = false; if (selectedTemplate) { isScheduleComplete = Object.entries(selectedTemplate.positionsRequired).every(([role, count]) => (assignments[role]?.length || 0) >= count); }
  const totalAssignments = Object.values(assignments).flat().length;
  let isShiftInPast = false; if (selectedTemplate && selectedDay) { const shiftStartTime = parse(selectedTemplate.startTime, 'HH:mm', selectedDay); if (shiftStartTime < new Date()) { isShiftInPast = true; } }

  if (isLoading) return <LoadingSpinner text="Cargando plantillas y empleados..." />;

  // --- JSX / Renderizado ---
  return (
    <div className="p-2 md:p-4 animate-fadeIn">
      <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
        <div className="flex items-center gap-2">
          <Button onClick={() => navigateDate('prev')} icon={<i className="fas fa-chevron-left"></i>} variant="light">Anterior</Button>
          <h2 className="text-xl sm:text-2xl font-bold text-center text-amore-charcoal whitespace-nowrap">{viewMode === 'week' ? `Semana del ${format(currentWeekStart, DATE_FORMAT_SPA_DATE_ONLY, { locale: es })}` : format(currentDate, 'MMMM yyyy', { locale: es }).replace(/^\w/, c => c.toUpperCase())}</h2>
          <Button onClick={() => navigateDate('next')} icon={<i className="fas fa-chevron-right"></i>} variant="light">Siguiente</Button>
        </div>
        <div className="bg-gray-200 p-1 rounded-lg flex items-center">
          <Button size="sm" onClick={() => setViewMode('week')} className={`px-4 py-1 rounded-md transition-colors ${viewMode === 'week' ? 'bg-white shadow text-amore-red font-semibold' : 'bg-transparent text-gray-600'}`}>Semana</Button>
          <Button size="sm" onClick={() => setViewMode('month')} className={`px-4 py-1 rounded-md transition-colors ${viewMode === 'month' ? 'bg-white shadow text-amore-red font-semibold' : 'bg-transparent text-gray-600'}`}>Mes</Button>
        </div>
      </div>

      {viewMode === 'week' && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2 mb-6">{weekDays.map(day => { const isSelected = isEqual(day.setHours(0,0,0,0), selectedDay.setHours(0,0,0,0)); return ( <button key={day.toISOString()} onClick={() => handleDaySelect(day)} className={`p-3 rounded-lg shadow text-center transition-all duration-200 ${isSelected ? 'bg-[#B91C1C] text-white scale-105 shadow-xl' : 'bg-white hover:bg-gray-100 text-[#1F2937]'}`}><p className="font-semibold capitalize">{format(day, 'eee', { locale: es })}</p><p className="text-sm">{format(day, 'd')}</p></button> )})}</div>
          {isLoadingShifts ? <div className="text-center p-4"><LoadingSpinner text="Cargando turnos existentes..." /></div> : ( selectedDay && !selectedTemplate && ( <div className="p-4 bg-gray-50 rounded-lg shadow-inner animate-fadeIn"><h3 className="text-lg font-semibold text-[#1F2937] mb-3 text-center">Turnos para el <span className="text-[#B91C1C]">{format(selectedDay, 'eeee, d \'de\' MMMM', { locale: es })}</span></h3><div className="flex justify-center gap-4">{shiftTemplates.map(template => { const hasShifts = shiftsForDay.some(s => s.shiftTypeId === template.id); return (<Button key={template.id} className={`relative ${hasShifts ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-[#1F2937] text-white hover:bg-gray-700'}`} size="lg" onClick={() => handleTemplateSelect(template)}>{hasShifts && <span className="absolute -top-1 -right-1 flex h-3 w-3"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span><span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span></span>} {template.name}</Button>); })}</div></div> ) )}
          {selectedTemplate && (
            <>
              <div className={`mt-6 p-6 bg-white rounded-xl shadow-lg animate-fadeIn ${isShiftInPast ? 'opacity-60 cursor-not-allowed' : ''}`}>
                {isEditMode && !isShiftInPast && (<div className="p-3 mb-4 bg-orange-100 border-l-4 border-orange-500 text-orange-800 rounded-md" role="alert"><p className="font-bold">Modo de Edición</p><p className="text-sm">Estás modificando un horario ya publicado.</p></div>)}
                {isShiftInPast && (<div className="p-3 mb-4 bg-gray-200 border-l-4 border-gray-500 text-gray-700 rounded-md" role="alert"><p className="font-bold">Turno Bloqueado</p><p className="text-sm">Este turno ya ha comenzado y no puede ser modificado.</p></div>)}
                <h3 className="text-xl font-bold text-amore-charcoal mb-4">Asignación para: <span className="text-amore-red">{selectedTemplate.name}</span></h3>
                <div className="space-y-4">
                  {Object.entries(selectedTemplate.positionsRequired).map(([role, count]) => {
                    const assignedForRole = assignments[role] || []; const assignedCount = assignedForRole.length; const isFulfilled = assignedCount >= count;
                    const getBackgroundColor = () => { if (!isFulfilled) return 'bg-gray-100'; if (assignedForRole.includes(PENDING_ASSIGNMENT_ID)) return 'bg-yellow-100 border-l-4 border-yellow-400'; return 'bg-green-100 border-l-4 border-green-500'; };
                    return (
                      <div key={role} className={`p-3 rounded-lg transition-colors ${getBackgroundColor()}`}>
                        <div className="flex items-center justify-between mb-2">
                          <div><p className="font-bold text-lg text-amore-charcoal capitalize">{role.replace(/_/g, ' ')}</p><p className={`text-sm font-medium ${isFulfilled ? 'text-green-600' : 'text-amore-gray'}`}>{assignedCount} de {count} asignado(s)</p></div>
                          <Button onClick={() => handleOpenAssignModal(role)} disabled={isFulfilled || isShiftInPast} variant={isFulfilled ? 'success' : 'primary'}>{isFulfilled ? 'Completo' : 'Asignar'}</Button>
                        </div>
                        <div className="pl-2 border-l-2 border-gray-200 space-y-1 mt-2">{assignedForRole.map((assignmentId, index) => ( <div key={`${assignmentId}-${index}`} className="flex items-center justify-between text-sm">{assignmentId === PENDING_ASSIGNMENT_ID ? (<span className="italic text-yellow-600">Puesto Pendiente</span>) : (<span className="text-amore-charcoal">{employees.find(e => e.id === assignmentId)?.name || 'Empleado Desconocido'}</span>)}<button onClick={() => handleUnassign(role, index)} disabled={isShiftInPast} className="text-red-500 hover:text-red-700 text-xs px-2 disabled:text-gray-300 disabled:cursor-not-allowed"><i className="fas fa-times-circle"></i></button></div>))}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
              {totalAssignments > 0 && (<div className="mt-8 flex justify-end"><Button onClick={handlePublishSchedule} variant="success" size="lg" isLoading={isPublishing} icon={<i className="fas fa-paper-plane mr-2"></i>} disabled={!isScheduleComplete || isPublishing || isShiftInPast} title={isShiftInPast ? 'Este turno ya no puede ser modificado' : !isScheduleComplete ? 'Debes cubrir todos los puestos para poder publicar' : 'Publicar horario'}>{isPublishing ? 'Publicando...' : `Publicar Horario`}</Button></div>)}
            </>
          )}
        </>
      )}
      {/* --- NUEVO MODAL DE CONFIRMACIÓN DE "CLOPENING" --- */}
      {isClopeningConfirmOpen && pendingAssignment && (
        <Modal
  isOpen={isClopeningConfirmOpen}
  onClose={() => setIsClopeningConfirmOpen(false)}
  title="⚠️ Advertencia de Turnos Consecutivos"
  size="md"
  footer={
    <div className="flex justify-end gap-2">
      <Button variant="light" onClick={() => setIsClopeningConfirmOpen(false)}>Cancelar</Button>
      <Button 
        variant="warning" // Usamos la variante de advertencia
        onClick={() => {
          if (pendingAssignment) {
            executeAssignment(pendingAssignment.userId, pendingAssignment.role);
          }
          setIsClopeningConfirmOpen(false);
          setPendingAssignment(null);
        }}
      >
        Asignar de Todos Modos
      </Button>
    </div>
  }
>
  <p className="text-amore-gray">
    Este empleado trabajó en el turno vespertino del día anterior. 
    ¿Estás seguro de que quieres asignarle el turno matutino de hoy?
  </p>
</Modal>
      )}
      {viewMode === 'month' && ( <MonthView currentDate={currentDate} shifts={monthlyShifts} templates={shiftTemplates} onShiftClick={handleDaySelect} /> )}
      {isAssignModalOpen && roleToAssign && ( <Modal isOpen={isAssignModalOpen} onClose={() => setIsAssignModalOpen(false)} title={`Asignar Empleado para: ${roleToAssign.replace(/_/g, ' ')}`}>{<div className="flex flex-col space-y-2"><Button onClick={handleMarkAsPending} variant='warning' icon={<i className="fas fa-clock mr-2"></i>}>Marcar como Pendiente</Button><hr className="my-2"/>{assignableEmployees.length > 0 ? (<ul className="space-y-2 max-h-60 overflow-y-auto">{assignableEmployees.map(emp => (<li key={emp.id}><button onClick={() => handleAssignEmployee(emp.id)} className="w-full text-left p-3 rounded-md hover:bg-gray-100 transition-colors">{emp.name}</button></li>))}</ul>) : (<p className="text-center text-amore-gray p-4">No hay más empleados disponibles con este rol para asignar a este turno.</p>)}</div>}</Modal> )}
    </div>
  );
};

export default ScheduleBuilder;