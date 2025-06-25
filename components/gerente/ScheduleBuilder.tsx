import React, { useEffect, useState, useCallback } from 'react';
import { PartialShiftForTemplate, Shift, ShiftStatus, ShiftType, User, UserRole } from '../../types';
import Button from '../common/Button';
import LoadingSpinner from '../common/LoadingSpinner';
import { useNotification } from '../../contexts/NotificationContext';
import { getAllUsersByRole, getAllShiftTypes, publishShiftsBatch } from '../../services/firestoreService';
import { logUserAction } from '../../services/historyService';
import { useAuth } from '../../contexts/AuthContext';
import { Timestamp } from 'firebase/firestore';
import { format, startOfWeek, addDays, isEqual, set } from 'date-fns';
import { es } from 'date-fns/locale/es';
import { DATE_FORMAT_SPA_DATE_ONLY, DATE_FORMAT_INPUT_DATETIME_LOCAL, HISTORY_ACTIONS } from '../../constants';
import Modal from '../common/Modal';

interface ScheduleBuilderProps {
  initialTemplate?: PartialShiftForTemplate[] | null;
  onTemplateConsumed?: () => void;
}

interface NewShiftData {
  userId: string;
  shiftTypeId: string;
  start: string; // ISO format string from datetime-local input
  end: string;   // ISO format string from datetime-local input
  notes?: string;
}

const ScheduleBuilder: React.FC<ScheduleBuilderProps> = ({ initialTemplate, onTemplateConsumed }) => {
  const { addNotification } = useNotification();
  const { userData } = useAuth();
  
  const [users, setUsers] = useState<User[]>([]);
  const [shiftTypes, setShiftTypes] = useState<ShiftType[]>([]);
  const [currentShifts, setCurrentShifts] = useState<Shift[]>([]); // This would be populated from Firestore for the selected week
  
  const [isLoading, setIsLoading] = useState(true); // For initial data load
  const [isPublishing, setIsPublishing] = useState(false);
  
  const [currentWeekStart, setCurrentWeekStart] = useState(() => 
    startOfWeek(new Date(), { weekStartsOn: 1 }) // Monday
  );

  // For adding a new shift
  const [isAddShiftModalOpen, setIsAddShiftModalOpen] = useState(false);
  const [newShiftForm, setNewShiftForm] = useState<NewShiftData>({
    userId: '', shiftTypeId: '', start: '', end: '', notes: ''
  });
  const [selectedDayForNewShift, setSelectedDayForNewShift] = useState<Date | null>(null);


  const fetchRequiredData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [fetchedUsers, fetchedShiftTypes] = await Promise.all([
        getAllUsersByRole(UserRole.EMPLEADO), // Or all relevant roles
        getAllShiftTypes()
      ]);
      setUsers(fetchedUsers);
      setShiftTypes(fetchedShiftTypes);
    } catch (error: any) {
      addNotification(`Error cargando datos iniciales: ${error.message}`, "error");
    } finally {
      setIsLoading(false);
    }
  }, [addNotification]);

  useEffect(() => {
    fetchRequiredData();
  }, [fetchRequiredData]);

  // Handle incoming AI template
  useEffect(() => {
    if (initialTemplate && initialTemplate.length > 0) {
      addNotification(`Plantilla con ${initialTemplate.length} turnos sugeridos por IA cargada.`, 'info');
      // For now, just log. A real implementation would convert these to UI elements.
      console.log("Plantilla Inicial de IA Recibida:", initialTemplate);
      // Example: Convert to currentShifts (this is simplified)
      const templateShifts: Shift[] = initialTemplate.map((ps, index) => ({
          id: `temp-ai-${index}`, // Temporary ID
          userId: ps.suggestedUserId || '', // Might need a way to assign these
          userName: ps.suggestedUserName || 'IA Sugerido',
          start: ps.start instanceof Timestamp ? ps.start : Timestamp.fromDate(ps.start || new Date()),
          end: ps.end instanceof Timestamp ? ps.end : Timestamp.fromDate(ps.end || new Date()),
          shiftTypeId: ps.shiftTypeId || '',
          status: ShiftStatus.CONFIRMADO, // Default for new template shifts
          notes: ps.notes || 'Sugerencia de IA',
      }));
      // This simple merge just adds them. A real app might need smarter merging logic.
      setCurrentShifts(prev => [...prev.filter(s => !s.id.startsWith('temp-ai-')), ...templateShifts]);

      if (onTemplateConsumed) {
        onTemplateConsumed();
      }
    }
  }, [initialTemplate, onTemplateConsumed, addNotification]);

  const handlePublishSchedule = async () => {
    if (currentShifts.length === 0) {
      addNotification("No hay turnos para publicar.", "warning");
      return;
    }
    if (!userData) {
      addNotification("No se puede publicar: usuario no autenticado.", "error");
      return;
    }

    setIsPublishing(true);
    const shiftsToPublish: Omit<Shift, 'id' | 'createdAt'>[] = currentShifts.map(s => {
      // Ensure required fields are present
      if (!s.userId || !s.shiftTypeId) {
        throw new Error(`Turno incompleto: ${s.id} - ${s.userName}`);
      }
      return {
        userId: s.userId,
        userName: users.find(u => u.id === s.userId)?.name || s.userName, // Ensure userName is fresh
        start: s.start,
        end: s.end,
        shiftTypeId: s.shiftTypeId,
        status: s.status,
        notes: s.notes,
      };
    });

    try {
      await publishShiftsBatch(shiftsToPublish);
      await logUserAction(userData.id, userData.name, HISTORY_ACTIONS.PUBLISH_SCHEDULE, { 
        weekStart: format(currentWeekStart, DATE_FORMAT_SPA_DATE_ONLY), 
        shiftCount: shiftsToPublish.length 
      });
      addNotification('Horario publicado con exito.', 'success');
      setCurrentShifts([]); // Clear after publishing for this demo
    } catch (error: any) {
      console.error("Error publicando horario:", error);
      addNotification(`Error al publicar el horario: ${error.message}`, 'error');
    } finally {
      setIsPublishing(false);
    }
  };

  const handleAddShiftClick = (day: Date) => {
    setSelectedDayForNewShift(day);
    // Pre-fill start/end times if desired, e.g., 9 AM to 5 PM on selected day
    const defaultStartTime = set(day, { hours: 9, minutes: 0, seconds: 0, milliseconds: 0 });
    const defaultEndTime = set(day, { hours: 17, minutes: 0, seconds: 0, milliseconds: 0 });
    
    setNewShiftForm({
      userId: users[0]?.id || '', // Default to first user or leave empty
      shiftTypeId: shiftTypes[0]?.id || '', // Default to first shift type
      start: format(defaultStartTime, DATE_FORMAT_INPUT_DATETIME_LOCAL),
      end: format(defaultEndTime, DATE_FORMAT_INPUT_DATETIME_LOCAL),
      notes: ''
    });
    setIsAddShiftModalOpen(true);
  };
  
  const handleNewShiftFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setNewShiftForm(prev => ({ ...prev, [name]: value }));
  };

  const handleSaveNewShift = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newShiftForm.userId || !newShiftForm.shiftTypeId || !newShiftForm.start || !newShiftForm.end) {
      addNotification("Por favor completa todos los campos requeridos para el turno.", "warning");
      return;
    }
    const selectedUser = users.find(u => u.id === newShiftForm.userId);
    if (!selectedUser) {
        addNotification("Usuario seleccionado no valido.", "error");
        return;
    }

    const newShift: Shift = {
      id: `new-${Date.now()}`, // Temporary client-side ID
      userId: newShiftForm.userId,
      userName: selectedUser.name,
      shiftTypeId: newShiftForm.shiftTypeId,
      start: Timestamp.fromDate(new Date(newShiftForm.start)),
      end: Timestamp.fromDate(new Date(newShiftForm.end)),
      status: ShiftStatus.CONFIRMADO,
      notes: newShiftForm.notes,
    };
    // Basic validation: end time must be after start time
    if (newShift.end.toMillis() <= newShift.start.toMillis()) {
        addNotification("La hora de fin debe ser posterior a la hora de inicio.", "error");
        return;
    }

    setCurrentShifts(prev => [...prev, newShift]);
    setIsAddShiftModalOpen(false);
    setNewShiftForm({ userId: '', shiftTypeId: '', start: '', end: '', notes: '' }); // Reset
    addNotification("Turno agregado localmente. Recuerda publicar los cambios.", "info");
  };


  const navigateWeek = (direction: 'prev' | 'next') => {
    setCurrentWeekStart(prev => addDays(prev, direction === 'prev' ? -7 : 7));
    setCurrentShifts([]); // Clear shifts when navigating weeks for this demo; a real app would fetch.
  };

  const weekDays = Array.from({ length: 7 }).map((_, i) => addDays(currentWeekStart, i));
  const today = new Date();

  if (isLoading) return <LoadingSpinner text="Cargando datos del constructor..." />;

  return (
    <div className="p-2 md:p-4 animate-fadeIn">
      <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-2">
        <Button onClick={() => navigateWeek('prev')} icon={<i className="fas fa-chevron-left"></i>} variant="secondary">Anterior</Button>
        <h2 className="text-xl sm:text-2xl font-bold text-center text-gray-700 order-first sm:order-none">
          Horario Semana: {format(currentWeekStart, DATE_FORMAT_SPA_DATE_ONLY, { locale: es })}
        </h2>
        <Button onClick={() => navigateWeek('next')} icon={<i className="fas fa-chevron-right"></i>} variant="secondary">Siguiente</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3 sm:gap-4 mb-6">
        {weekDays.map(day => {
          const dayShifts = currentShifts.filter(s => s.start && isEqual(s.start.toDate().setHours(0,0,0,0), day.setHours(0,0,0,0)));
          const isToday = isEqual(day.setHours(0,0,0,0), today.setHours(0,0,0,0));
          return (
            <div key={day.toISOString()} className={`p-3 rounded-lg shadow min-h-[200px] flex flex-col ${isToday ? 'bg-indigo-100 border-2 border-indigo-400' : 'bg-gray-100'}`}>
              <h3 className={`font-semibold text-center mb-1 capitalize ${isToday ? 'text-indigo-700' : 'text-gray-600'}`}>
                {format(day, 'eee', { locale: es })}
              </h3>
              <p className={`text-sm text-center mb-2 ${isToday ? 'text-indigo-600 font-medium' : 'text-gray-500'}`}>{format(day, 'd MMM', { locale: es })}</p>
              <div className="space-y-2 flex-grow">
                {dayShifts.map(shift => (
                  <div key={shift.id} className="p-2 bg-blue-100 rounded border-l-4 border-blue-500 shadow-sm text-xs">
                    <p className="font-semibold text-blue-800">{shiftTypes.find(st => st.id === shift.shiftTypeId)?.name || 'Turno'}</p>
                    <p>{users.find(u => u.id === shift.userId)?.name || shift.userName}</p>
                    <p>{format(shift.start.toDate(), 'HH:mm')} - {format(shift.end.toDate(), 'HH:mm')}</p>
                    {shift.notes && <p className="italic text-gray-600 truncate" title={shift.notes}>{shift.notes}</p>}
                    {/* Add delete button or edit functionality here */}
                     <Button 
                        size="xs" 
                        variant="danger" 
                        onClick={() => setCurrentShifts(prev => prev.filter(s => s.id !== shift.id))} 
                        className="mt-1 opacity-70 hover:opacity-100"
                        title="Eliminar este turno (localmente)"
                    >
                        <i className="fas fa-trash-alt"></i>
                    </Button>
                  </div>
                ))}
              </div>
              <Button size="sm" variant="light" onClick={() => handleAddShiftClick(day)} className="mt-auto w-full">
                <i className="fas fa-plus mr-1"></i> Añadir Turno
              </Button>
            </div>
          );
        })}
      </div>
      
      {currentShifts.length > 0 && (
          <div className="mt-8 flex justify-end">
            <Button onClick={handlePublishSchedule} variant="success" size="lg" isLoading={isPublishing} icon={<i className="fas fa-paper-plane mr-2"></i>}>
              {isPublishing ? 'Publicando...' : `Publicar ${currentShifts.length} Turno(s)`}
            </Button>
          </div>
      )}
      {currentShifts.length === 0 && !isLoading && (
          <p className="text-center text-gray-500 italic my-8">No hay turnos para esta semana. Comienza añadiendo turnos a los dias.</p>
      )}

      {isAddShiftModalOpen && selectedDayForNewShift && (
        <Modal 
            isOpen={isAddShiftModalOpen} 
            onClose={() => setIsAddShiftModalOpen(false)} 
            title={`Añadir Turno para ${format(selectedDayForNewShift, DATE_FORMAT_SPA_DATE_ONLY, {locale: es})}`}
            footer={
                <div className="flex justify-end space-x-2">
                    <Button variant="light" onClick={() => setIsAddShiftModalOpen(false)}>Cancelar</Button>
                    <Button type="submit" form="addShiftForm" variant="primary">Guardar Turno</Button>
                </div>
            }
        >
          <form id="addShiftForm" onSubmit={handleSaveNewShift} className="space-y-4">
            <div>
              <label htmlFor="userId" className="block text-sm font-medium text-gray-700">Empleado</label>
              <select id="userId" name="userId" value={newShiftForm.userId} onChange={handleNewShiftFormChange} required className="mt-1 block w-full p-2 border-gray-300 rounded-md shadow-sm focus:border-indigo-500 focus:ring-indigo-500">
                <option value="" disabled>Selecciona un empleado</option>
                {users.map(user => <option key={user.id} value={user.id}>{user.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="shiftTypeId" className="block text-sm font-medium text-gray-700">Tipo de Turno</label>
              <select id="shiftTypeId" name="shiftTypeId" value={newShiftForm.shiftTypeId} onChange={handleNewShiftFormChange} required className="mt-1 block w-full p-2 border-gray-300 rounded-md shadow-sm focus:border-indigo-500 focus:ring-indigo-500">
                <option value="" disabled>Selecciona un tipo de turno</option>
                {shiftTypes.map(st => <option key={st.id} value={st.id}>{st.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                    <label htmlFor="start" className="block text-sm font-medium text-gray-700">Inicio</label>
                    <input type="datetime-local" id="start" name="start" value={newShiftForm.start} onChange={handleNewShiftFormChange} required className="mt-1 block w-full p-2 border-gray-300 rounded-md shadow-sm focus:border-indigo-500 focus:ring-indigo-500"/>
                </div>
                <div>
                    <label htmlFor="end" className="block text-sm font-medium text-gray-700">Fin</label>
                    <input type="datetime-local" id="end" name="end" value={newShiftForm.end} onChange={handleNewShiftFormChange} required className="mt-1 block w-full p-2 border-gray-300 rounded-md shadow-sm focus:border-indigo-500 focus:ring-indigo-500"/>
                </div>
            </div>
            <div>
              <label htmlFor="notes" className="block text-sm font-medium text-gray-700">Notas (Opcional)</label>
              <textarea id="notes" name="notes" value={newShiftForm.notes} onChange={handleNewShiftFormChange} rows={2} className="mt-1 block w-full p-2 border-gray-300 rounded-md shadow-sm focus:border-indigo-500 focus:ring-indigo-500"></textarea>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};

export default ScheduleBuilder;
