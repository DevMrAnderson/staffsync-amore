import React, { useEffect, useState, useCallback } from 'react';
import { Shift, ShiftStatus, ShiftTemplate, User, UserRole, PartialShiftForTemplate } from '../../types';
import Button from '../common/Button';
import LoadingSpinner from '../common/LoadingSpinner';
import { useNotification } from '../../contexts/NotificationContext';
import { getShiftTemplates, getAllUsersByRole, replaceShiftsForTemplate, getShiftsForDay, getShiftsForMonth, getShiftsForWeek, updateShift, offerShiftToManagers } from '../../services/firestoreService';
import { useAuth } from '../../contexts/AuthContext';
import { Timestamp } from 'firebase/firestore';
import { startOfWeek, addDays, isEqual, format, parse, endOfWeek, addMonths, subMonths, startOfMonth, subDays } from 'date-fns';
import { es } from 'date-fns/locale/es';
import { DATE_FORMAT_SPA_DATE_ONLY, HISTORY_ACTIONS } from '../../constants';
import Modal from '../common/Modal';
import { logUserAction } from '../../services/historyService';
import MonthView from './MonthView';
import { fillSingleShiftWithAI } from '../../services/aiService';

// Tipos y Constantes
type ShiftAssignments = { [role: string]: string[] };
const PENDING_ASSIGNMENT_ID = 'pending';
interface ScheduleBuilderProps {
  initialTemplate?: PartialShiftForTemplate[] | null;
  onTemplateConsumed?: () => void;
  onShiftClick?: (shift: Shift) => void; // Esta ya debería estar
  currentDate: Date;                     // <-- Añade esta
  onDateChange: (date: Date) => void;  // <-- Y esta
}
type ViewMode = 'week' | 'month';
interface PendingAssignment { userId: string; role: string; }
interface ConfirmModalState {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  confirmText: string;
  confirmVariant: 'primary' | 'danger' | 'warning';
}

const ScheduleBuilder: React.FC<ScheduleBuilderProps & { onShiftClick?: (shift: Shift) => void }> = ({ initialTemplate, onTemplateConsumed, onShiftClick, currentDate, onDateChange }) => {
  // Estados
  const { userData } = useAuth();
  const { addNotification } = useNotification();
  const [loading, setLoading] = useState(true);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [shiftTemplates, setShiftTemplates] = useState<ShiftTemplate[]>([]);
  const [employees, setEmployees] = useState<User[]>([]);
  const [selectedDay, setSelectedDay] = useState<Date>(new Date());
  const [selectedTemplate, setSelectedTemplate] = useState<ShiftTemplate | null>(null);
  const [assignments, setAssignments] = useState<ShiftAssignments>({});
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [roleToAssign, setRoleToAssign] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isAutoFilling, setIsAutoFilling] = useState(false);
  const [shiftsForDay, setShiftsForDay] = useState<Shift[]>([]);
  const [monthlyShifts, setMonthlyShifts] = useState<Shift[]>([]);
  const [shiftsForWeek, setShiftsForWeek] = useState<Shift[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [isEditMode, setIsEditMode] = useState(false);
  const [isClopeningConfirmOpen, setIsClopeningConfirmOpen] = useState(false);
  const [pendingAssignment, setPendingAssignment] = useState<PendingAssignment | null>(null);
  const [confirmModalState, setConfirmModalState] = useState<ConfirmModalState | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedShiftForDetail, setSelectedShiftForDetail] = useState<Shift | null>(null);
  const [isOfferModalOpen, setIsOfferModalOpen] = useState(false);
  const [shiftToOffer, setShiftToOffer] = useState<Shift | null>(null);

  useEffect(() => {
  const fetchMonthlyShifts = async () => {
    setLoading(true);
    try {
      // Llamamos a la función SIN el segundo parámetro 'userId'.
      // Gracias a nuestra modificación, ahora traerá los turnos de TODOS.
      const fetchedShifts = await getShiftsForMonth(currentDate); 
      setShifts(fetchedShifts); // Guardamos los turnos en el estado local
    } catch (error: any) {
      addNotification(`Error al cargar turnos del mes: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  fetchMonthlyShifts();
}, [currentDate, addNotification]); // Se ejecuta cada vez que cambia el mes

  // Lógica de Carga de Datos
  useEffect(() => {
    const fetchRequiredData = async () => {
      setIsLoading(true);
      try {
        const [templates, users] = await Promise.all([getShiftTemplates(), getAllUsersByRole()]);
        setShiftTemplates(templates);
        setEmployees(users);
      } catch (error: any) { addNotification(`Error cargando datos esenciales: ${error.message}`, "error"); } 
      finally { setIsLoading(false); }
    };
    fetchRequiredData();
  }, [addNotification]);

  useEffect(() => {
    const commonCleanup = () => { setSelectedTemplate(null); setAssignments({}); setIsEditMode(false); };
    
    if (initialTemplate && initialTemplate.length > 0) {
      // No hacemos nada aquí, un nuevo useEffect se encargará de esto
      return;
    }
    
    const fetchViewData = async () => {
      if (!shiftTemplates.length) return;
      setIsLoadingData(true);
      commonCleanup();
      if (viewMode === 'week') {
        try {
          const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
          const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
          const [dayShifts, weekShifts] = await Promise.all([getShiftsForDay(selectedDay), getShiftsForWeek(weekStart, weekEnd)]);
          setShiftsForDay(dayShifts);
          setShiftsForWeek(weekShifts);
        } catch (error: any) { addNotification(`Error al cargar datos de semana: ${error.message}`, 'error'); }
      } else if (viewMode === 'month') {
        try {
          const shifts = await getShiftsForMonth(currentDate);
          setMonthlyShifts(shifts);
        } catch (error: any) { addNotification(`Error al cargar turnos del mes: ${error.message}`, 'error'); }
      }
      setIsLoadingData(false);
    };
    fetchViewData();
  }, [selectedDay, viewMode, currentDate, shiftTemplates.length, addNotification]);

  // useEffect para procesar la plantilla de la IA
  useEffect(() => {
    if (initialTemplate && initialTemplate.length > 0 && employees.length > 0) {
      const firstDayOfTemplate = initialTemplate[0].start.toDate();
      const weekStartOfTemplate = startOfWeek(firstDayOfTemplate, { weekStartsOn: 1 });
      onDateChange(weekStartOfTemplate);
      setSelectedDay(firstDayOfTemplate);
      const newAssignments: ShiftAssignments = {};
      initialTemplate.forEach(shift => {
        const role = shift.notes?.replace('Asignado a ', '');
        if (role && shift.userId) {
          if (!newAssignments[role]) { newAssignments[role] = []; }
          newAssignments[role].push(shift.userId);
        }
      });
      setAssignments(newAssignments);
      setIsEditMode(true);
      onTemplateConsumed?.();
    }
  }, [initialTemplate, employees.length, onTemplateConsumed]);

  // Lógica de Acciones
  const executePublish = async () => {
    if (!selectedDay || !selectedTemplate || !userData) return;
    setIsPublishing(true);
    try {
      const shiftsToCreate: Omit<Shift, 'id' | 'createdAt'>[] = [];
      for (const role in assignments) {
        for (const assignmentId of assignments[role]) {
          const startDate = parse(selectedTemplate.startTime, 'HH:mm', selectedDay);
          const endDate = parse(selectedTemplate.endTime, 'HH:mm', selectedDay);
          let newShift: Omit<Shift, 'id' | 'createdAt'>;
          if (assignmentId === PENDING_ASSIGNMENT_ID) {
            newShift = { userId: '', userName: 'PENDIENTE', shiftTypeId: selectedTemplate.id, shiftTypeName: selectedTemplate.name, start: Timestamp.fromDate(startDate), end: Timestamp.fromDate(endDate), status: ShiftStatus.PENDIENTE, notes: `Asignado a ${role}`, role: role as UserRole };
          } else {
            const employee = employees.find(e => e.id === assignmentId);
            if (!employee) continue;
            newShift = { userId: employee.id, userName: employee.name, shiftTypeId: selectedTemplate.id, shiftTypeName: selectedTemplate.name, start: Timestamp.fromDate(startDate), end: Timestamp.fromDate(endDate), status: ShiftStatus.CONFIRMADO, notes: `Asignado a ${role}`, role: role as UserRole };
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
    } catch (error: any) { addNotification(`Error al publicar: ${error.message}`, 'error'); } 
    finally { setIsPublishing(false); }
  };
  
  const handlePublishSchedule = () => {
    if (!isScheduleComplete) {
      addNotification("Debes cubrir todos los puestos requeridos para poder publicar.", "warning");
      return;
    }
    const isOverwriting = shiftsForDay.some(s => s.shiftTypeId === selectedTemplate?.id);
    if (isEditMode || isOverwriting) {
      setConfirmModalState({ isOpen: true, title: "Confirmar Cambios", message: "Ya existe un horario publicado para este turno. ¿Estás seguro de que quieres sobreescribirlo?", confirmText: "Sí, Sobrescribir", confirmVariant: 'primary', onConfirm: executePublish });
    } else {
      executePublish();
    }
  };

  const handleToggleAbsence = (shiftToUpdate: Shift) => {
  // Determinamos la acción y el mensaje basados en el estado actual del turno
  const isMarkingAbsence = shiftToUpdate.status === ShiftStatus.CONFIRMADO;
  
  const title = isMarkingAbsence ? "Confirmar Falta" : "Confirmar Eliminación de Falta";
  const message = isMarkingAbsence 
    ? `¿Estás seguro de que quieres marcar una FALTA INJUSTIFICADA para ${shiftToUpdate.userName}?`
    : `¿Estás seguro de que quieres QUITAR la falta injustificada para ${shiftToUpdate.userName}? El turno volverá a su estado normal.`;
  const confirmText = isMarkingAbsence ? 'Sí, Marcar Falta' : 'Sí, Quitar Falta';
  const confirmVariant = isMarkingAbsence ? 'danger' : 'success';
  const newStatus = isMarkingAbsence ? ShiftStatus.FALTA_INJUSTIFICADA : ShiftStatus.CONFIRMADO;

  // Usamos el modal de confirmación que ya tienes
  setConfirmModalState({
    isOpen: true,
    title: title,
    message: message,
    confirmText: confirmText,
    confirmVariant: confirmVariant,
    onConfirm: async () => {
      if (!userData) return;
      try {
        await updateShift(shiftToUpdate.id, { status: newStatus });
        await logUserAction(
          userData.id, 
          userData.name, 
          isMarkingAbsence ? HISTORY_ACTIONS.MARK_ABSENCE : HISTORY_ACTIONS.REMOVE_ABSENCE, // Asumiendo que tienes esta nueva acción
          { shiftId: shiftToUpdate.id, employeeName: shiftToUpdate.userName }
        );
        addNotification(`Acción completada para ${shiftToUpdate.userName}.`, 'success');
        // Forzamos la recarga de los datos para ver el cambio visual al instante
        const updatedDayShifts = await getShiftsForDay(selectedDay);
        setShiftsForDay(updatedDayShifts);
      } catch (error: any) { 
        addNotification(`Error al actualizar el turno: ${error.message}`, 'error'); 
      }
    }
  });
};

  const executeAssignment = (userId: string, role: string) => { if (!selectedTemplate) return; const requiredCount = selectedTemplate.positionsRequired[role]; const currentCount = assignments[role]?.length || 0; if (currentCount >= requiredCount) { addNotification(`El puesto de ${role.replace(/_/g, ' ')} ya está completo.`, 'warning'); return; } setAssignments(prev => ({ ...prev, [role]: [...(prev[role] || []), userId] })); };
  
  const handleAssignEmployee = async (userId: string) => {
    if (!roleToAssign || !selectedTemplate || !selectedDay) return;
    setIsAssignModalOpen(false);
    if (selectedTemplate.id === 'matutino') {
      const previousDay = subDays(selectedDay, 1);
      const previousDayShifts = await getShiftsForDay(previousDay);
      const workedVespertino = previousDayShifts.some(s => s.userId === userId && s.shiftTypeId === 'vespertino');
      if (workedVespertino) {
        setPendingAssignment({ userId, role: roleToAssign });
        setIsClopeningConfirmOpen(true);
      } else { executeAssignment(userId, roleToAssign); }
    } else { executeAssignment(userId, roleToAssign); }
    setRoleToAssign(null);
  };

  const handleAutoFillShift = () => {
    if (!selectedTemplate) return;
    setIsAutoFilling(true);
    addNotification("IA está buscando las mejores asignaciones...", "info");
    try {
      const existingShiftsForDay = shiftsForDay.filter(s => s.shiftTypeId !== selectedTemplate.id);
      const aiAssignments = fillSingleShiftWithAI(employees, selectedTemplate, existingShiftsForDay);
      setAssignments(prev => ({ ...prev, ...aiAssignments }));
      addNotification("¡Llenado automático completado!", "success");
    } catch (error: any) {
      addNotification(`Error en llenado automático: ${error.message}`, 'error');
    } finally {
      setIsAutoFilling(false);
    }
  };

  const handleOpenShiftDetails = (shift: Shift) => {
  setSelectedShiftForDetail(shift);
  setIsDetailModalOpen(true);
};

const handleOpenOfferModal = (shift: Shift) => {
  // Cerramos el modal de detalles y abrimos el de confirmación
  setIsDetailModalOpen(false);
  // Un pequeño delay para que la transición sea suave
  setTimeout(() => {
    setShiftToOffer(shift);
    setIsOfferModalOpen(true);
  }, 150);
};

const executeOfferShift = async () => {
  if (!shiftToOffer || !userData) return;
  setIsOfferModalOpen(false);
  try {
    // Estas funciones deben existir en tu firestoreService
    await offerShiftToManagers(shiftToOffer, userData.id, userData.name);
    await updateShift(shiftToOffer.id, { status: ShiftStatus.CAMBIO_OFRECIDO_GERENTE });
    addNotification("Tu turno ha sido ofrecido a los demás gerentes.", "success");
    // Volvemos a cargar los datos para reflejar el cambio de estado
    const updatedDayShifts = await getShiftsForDay(selectedDay);
    setShiftsForDay(updatedDayShifts);
  } catch (error: any) {
    addNotification(`Error al ofrecer el turno: ${error.message}`, 'error');
  }
};

  const navigateDate = (direction: 'prev' | 'next') => { const newDate = viewMode === 'week' ? addDays(currentDate, direction === 'prev' ? -7 : 7) : subMonths(currentDate, 1); onDateChange(newDate); };
  const handleDaySelect = (day: Date) => { setSelectedDay(day); if (viewMode === 'month') { setViewMode('week'); onDateChange(day); } };
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
          if (shift.status === ShiftStatus.PENDIENTE) { newAssignments[role].push(PENDING_ASSIGNMENT_ID); } else { newAssignments[role].push(shift.userId); }
        }
      });
    } else { setIsEditMode(false); }
    setAssignments(newAssignments);
  };
  const handleOpenAssignModal = (role: string) => { setRoleToAssign(role); setIsAssignModalOpen(true); };
  const handleMarkAsPending = () => { if (!roleToAssign || !selectedTemplate) return; const requiredCount = selectedTemplate.positionsRequired[roleToAssign]; const currentCount = assignments[roleToAssign]?.length || 0; if (currentCount >= requiredCount) { addNotification(`El puesto de ${roleToAssign.replace(/_/g, ' ')} ya está completo.`, 'warning'); setIsAssignModalOpen(false); return; } setAssignments(prev => ({ ...prev, [roleToAssign]: [...(prev[roleToAssign] || []), PENDING_ASSIGNMENT_ID] })); setIsAssignModalOpen(false); setRoleToAssign(null); };
  const handleUnassign = (role: string, index: number) => { setAssignments(prev => { const newAssigned = [...(prev[role] || [])]; newAssigned.splice(index, 1); return { ...prev, [role]: newAssigned }; }); };
  
  // Variables Calculadas
  const currentWeekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }).map((_, i) => addDays(currentWeekStart, i));
  const allAssignedInCurrentSchedule = Object.values(assignments).flat();
  const employeeIdsWithShiftsOnSelectedDay = shiftsForDay.filter(shift => selectedTemplate ? shift.shiftTypeId !== selectedTemplate.id : true).map(shift => shift.userId);
  const assignableEmployees = roleToAssign ? employees.filter(emp => emp.role === roleToAssign && !allAssignedInCurrentSchedule.includes(emp.id) && !employeeIdsWithShiftsOnSelectedDay.includes(emp.id)) : [];
  let isScheduleComplete = false; if (selectedTemplate) { isScheduleComplete = Object.entries(selectedTemplate.positionsRequired).every(([role, count]) => (assignments[role]?.length || 0) >= count); }
  let isShiftInPast = false; if (selectedTemplate) { const shiftStartTime = parse(selectedTemplate.startTime, 'HH:mm', selectedDay); if (new Date(selectedDay).setHours(0,0,0,0) < new Date().setHours(0,0,0,0) && !isEqual(new Date(selectedDay).setHours(0,0,0,0), new Date().setHours(0,0,0,0))) { isShiftInPast = true; } }

  if (isLoading) return <LoadingSpinner text="Cargando plantillas y empleados..." />;

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
          <div className="grid grid-cols-7 gap-2 mb-6">{weekDays.map(day => { const isSelected = isEqual(day, selectedDay); return ( <button key={day.toISOString()} onClick={() => handleDaySelect(day)} className={`p-3 rounded-lg shadow text-center transition-all duration-200 ${isSelected ? 'bg-[#B91C1C] text-white scale-105 shadow-xl' : 'bg-white hover:bg-gray-100 text-[#1F2937]'}`}><p className="font-semibold capitalize">{format(day, 'eee', { locale: es })}</p><p className="text-sm">{format(day, 'd')}</p></button> )})}</div>
          {isLoadingData ? <div className="text-center p-4"><LoadingSpinner text="Cargando turnos..." /></div> : (selectedDay && !selectedTemplate && (<div className="p-4 bg-gray-50 rounded-lg shadow-inner animate-fadeIn"><h3 className="text-lg font-semibold text-[#1F2937] mb-3 text-center">Turnos para el <span className="text-[#B91C1C]">{format(selectedDay, 'eeee, d \'de\' MMMM', { locale: es })}</span></h3><div className="flex justify-center gap-4">{shiftTemplates.map(template => { const hasShifts = shiftsForDay.some(s => s.shiftTypeId === template.id); return (<Button key={template.id} className={`relative ${hasShifts ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-[#1F2937] text-white hover:bg-gray-700'}`} size="lg" onClick={() => handleTemplateSelect(template)}>{hasShifts && <span className="absolute -top-1 -right-1 flex h-3 w-3"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span><span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span></span>} {template.name}</Button>); })}</div></div>))}
          {selectedTemplate && (
            <>
              <div className={`mt-6 p-6 bg-white rounded-xl shadow-lg`}>
                {isShiftInPast && (<div className="p-3 mb-4 bg-gray-200 border-l-4 border-gray-500 text-gray-700 rounded-md" role="alert"><p className="font-bold">Turno Bloqueado</p><p className="text-sm">Este turno ya ha comenzado y no puede ser modificado.</p></div>)}
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-xl font-bold text-amore-charcoal">Asignación para: <span className="text-amore-red">{selectedTemplate.name}</span></h3>
                  <Button onClick={handleAutoFillShift} isLoading={isAutoFilling} disabled={isShiftInPast} variant="light" icon={<i className="fas fa-magic mr-2"></i>}>Llenado Automático con IA</Button>
                </div>
                <div className="space-y-4">
                  {Object.entries(selectedTemplate.positionsRequired).map(([role, count]) => {
                    const assignedForRole = assignments[role] || []; const assignedCount = assignedForRole.length; const isFulfilled = assignedCount >= count;
                    const getBackgroundColor = () => { if (isShiftInPast) return 'bg-gray-100'; if (!isFulfilled) return 'bg-gray-100'; if (assignedForRole.includes(PENDING_ASSIGNMENT_ID)) return 'bg-yellow-100 border-l-4 border-yellow-400'; return 'bg-green-100 border-l-4 border-green-500'; };
                    return (
                      <div key={role} className={`p-3 rounded-lg transition-colors ${getBackgroundColor()}`}>
                        <div className="flex items-center justify-between mb-2">
                          <div><p className="font-bold text-lg text-amore-charcoal capitalize">{role.replace(/_/g, ' ')}</p><p className={`text-sm font-medium ${isFulfilled ? 'text-green-600' : 'text-amore-gray'}`}>{assignedCount} de {count} asignado(s)</p></div>
                          <Button onClick={() => handleOpenAssignModal(role)} disabled={isFulfilled || isShiftInPast} variant={isFulfilled ? 'success' : 'primary'}>{isFulfilled ? 'Completo' : 'Asignar'}</Button>
                        </div>
                        <div className="pl-2 border-l-2 border-gray-200 space-y-1 mt-2">{assignedForRole.map((assignmentId, index) => {
                          if (assignmentId === PENDING_ASSIGNMENT_ID) { return ( <div 
  key={`${assignmentId}-${index}`} 
  onClick={() => shift && onShiftClick?.(shift)}
  className="flex items-center justify-between text-sm p-1 -m-1 rounded-md hover:bg-gray-200 cursor-pointer"
><span className="italic text-yellow-600">Puesto Pendiente</span><button onClick={() => handleUnassign(role, index)} disabled={isShiftInPast} className="text-red-500 hover:text-red-700 text-xs px-2 disabled:text-gray-300 disabled:cursor-not-allowed"><i className="fas fa-times-circle"></i></button></div> ); }
                          const employee = employees.find(e => e.id === assignmentId);
                          const shift = shiftsForDay.find(s => s.userId === assignmentId && s.shiftTypeId === selectedTemplate.id);
                          let statusStyle = 'text-amore-charcoal';
                          if (shift?.status === ShiftStatus.FALTA_INJUSTIFICADA) { statusStyle = 'text-red-500 line-through'; } else if (shift?.status === ShiftStatus.JUSTIFICACION_PENDIENTE) { statusStyle = 'text-yellow-600 italic'; } else if (shift?.status === ShiftStatus.AUSENCIA_JUSTIFICADA) { statusStyle = 'text-green-600'; }
                          return (
                            <div 
  key={`${assignmentId}-${index}`} 
  onClick={() => shift && onShiftClick?.(shift)}
  className="flex items-center justify-between text-sm p-1 -m-1 rounded-md hover:bg-gray-200 cursor-pointer"
>
                              <span className={statusStyle}>{employee?.name || 'Empleado Desconocido'}{shift?.status === ShiftStatus.JUSTIFICACION_PENDIENTE && <span className="text-xs ml-2">(Justificación Pendiente)</span>}{shift?.status === ShiftStatus.AUSENCIA_JUSTIFICADA && <span className="text-xs ml-2 font-semibold">(Falta Justificada)</span>}</span>
                              {/* --- BOTÓN INTELIGENTE DE FALTA/ASISTENCIA --- */}
{(isShiftInPast && (shift?.status === ShiftStatus.CONFIRMADO || shift?.status === ShiftStatus.FALTA_INJUSTIFICADA)) ? (
  <Button 
    onClick={() => handleToggleAbsence(shift!)}
    size="xs"
    // El color y el texto del botón cambian según el estado actual
    variant={shift.status === ShiftStatus.FALTA_INJUSTIFICADA ? 'success' : 'danger'}
    className="ml-2"
  >
    {shift.status === ShiftStatus.FALTA_INJUSTIFICADA ? 'Quitar Falta' : 'Marcar Falta'}
  </Button>
) : (
  // El botón para desasignar un turno futuro no cambia
  <button onClick={(e) => { e.stopPropagation(); handleUnassign(role, index); }} disabled={isShiftInPast} className="...">
    <i className="fas fa-times-circle"></i>
  </button>
)}
                            </div>
                          );
                        })}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
              {selectedTemplate && !isShiftInPast && (<div className="mt-8 flex justify-end"><Button onClick={handlePublishSchedule} variant="success" size="lg" isLoading={isPublishing} icon={<i className="fas fa-paper-plane mr-2"></i>} disabled={!isScheduleComplete || isPublishing} title={!isScheduleComplete ? 'Debes cubrir todos los puestos' : 'Publicar horario'}>{isPublishing ? 'Publicando...' : 'Publicar Horario'}</Button></div>)}
            </>
          )}
        </>
      )}
      {viewMode === 'month' && (<MonthView currentDate={currentDate} shifts={monthlyShifts} templates={shiftTemplates} onDayClick={handleDaySelect} />)}
      {isAssignModalOpen && roleToAssign && (<Modal isOpen={isAssignModalOpen} onClose={() => setIsAssignModalOpen(false)} title={`Asignar Empleado para: ${roleToAssign.replace(/_/g, ' ')}`} size="lg">{<div className="flex flex-col space-y-2"><Button onClick={handleMarkAsPending} variant='warning' icon={<i className="fas fa-clock mr-2"></i>}>Marcar como Pendiente</Button><hr className="my-2"/>{assignableEmployees.length > 0 ? (<div className="space-y-3 max-h-96 overflow-y-auto p-1">{assignableEmployees.map(emp => { const shiftCountForWeek = shiftsForWeek.filter(shift => String(shift.userId).trim() === String(emp.id).trim()).length; let countText = ''; let badgeClasses = ''; if (shiftCountForWeek === 0) { countText = 'Sin turnos esta semana'; badgeClasses = 'bg-gray-200 text-gray-700'; } else if (shiftCountForWeek === 1) { countText = 'Asignado a 1 turno'; badgeClasses = 'bg-[#1F2937] text-white'; } else { countText = `Asignado a ${shiftCountForWeek} turnos`; badgeClasses = 'bg-[#B91C1C] text-white'; } return ( <div key={emp.id} className="p-3 bg-gray-50 rounded-lg border border-gray-200"><div className="flex justify-between items-center"><div className="flex items-center gap-2 flex-wrap"><p className="font-bold text-amore-charcoal">{emp.name}</p><span className={`text-xs font-semibold px-2 py-1 rounded-full ${badgeClasses}`}>{countText}</span></div><Button onClick={() => handleAssignEmployee(emp.id)} size="sm" variant="success">Asignar</Button></div>{(emp.schedulePreferences || emp.availabilityNotes) && (<div className="mt-2 text-xs space-y-1 border-t pt-2">{emp.schedulePreferences && (<p className="text-blue-600"><i className="fas fa-star mr-1 opacity-70"></i> <strong>Prefiere:</strong> {emp.schedulePreferences}</p>)}{emp.availabilityNotes && (<p className="text-green-600"><i className="fas fa-check-circle mr-1 opacity-70"></i> <strong>Disponible:</strong> {emp.availabilityNotes}</p>)}</div>)}</div>); })}</div>) : (<p className="text-center text-amore-gray p-4">No hay más empleados disponibles.</p>)}</div>}</Modal>)}
      {isClopeningConfirmOpen && pendingAssignment && (<Modal isOpen={isClopeningConfirmOpen} onClose={() => setIsClopeningConfirmOpen(false)} title="⚠️ Advertencia de Turnos Consecutivos" size="md" footer={<div className="flex justify-end gap-2"><Button variant="light" onClick={() => setIsClopeningConfirmOpen(false)}>Cancelar</Button><Button variant="warning" onClick={() => { if (pendingAssignment) { executeAssignment(pendingAssignment.userId, pendingAssignment.role); } setIsClopeningConfirmOpen(false); setPendingAssignment(null); }}>Asignar de Todos Modos</Button></div>}><p className="text-amore-gray">Este empleado trabajó en el turno vespertino del día anterior. ¿Estás seguro?</p></Modal>)}
      {confirmModalState?.isOpen && (<Modal isOpen={confirmModalState.isOpen} onClose={() => setConfirmModalState(null)} title={confirmModalState.title} size="md" footer={<div className="flex justify-end gap-2"><Button variant="light" onClick={() => setConfirmModalState(null)}>Cancelar</Button><Button variant={confirmModalState.confirmVariant} isLoading={isPublishing} onClick={() => { confirmModalState.onConfirm(); setConfirmModalState(null); }}>{confirmModalState.confirmText}</Button></div>}><p className="text-amore-gray">{confirmModalState.message}</p></Modal>)}
    </div>
  );
};

export default ScheduleBuilder;