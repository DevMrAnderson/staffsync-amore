import React, { useState, useEffect, useCallback } from 'react';
import { Timestamp } from 'firebase/firestore';
import { useAuth } from '../../contexts/AuthContext';
import { Shift, ShiftType, ChangeRequest, ChangeRequestStatus, ShiftStatus, Justification } from '../../types';
import Navbar from '../common/Navbar';
import LoadingSpinner from '../common/LoadingSpinner';
import ShiftDetailModal from './ShiftDetailModal';
import UploadJustificationForm from './UploadJustificationForm';
import Modal from '../common/Modal';
import Button from '../common/Button';
import { format, startOfWeek, addDays, isEqual, endOfWeek } from 'date-fns';
import { es } from 'date-fns/locale/es';
import { DATE_FORMAT_SPA_DATETIME, DATE_FORMAT_SPA_DATE_ONLY, DATE_FORMAT_SPA_TIME_ONLY, HISTORY_ACTIONS } from '../../constants';
import { 
  updateShift, 
  addChangeRequest, 
  updateChangeRequest, 
  onShiftsForUserSnapshot,
  onProposedChangeRequestsForUserSnapshot
} from '../../services/firestoreService';
import { useNotification } from '../../contexts/NotificationContext';
import { logUserAction } from '../../services/historyService';
import ProfileManager from './ProfileManager';

type EmpleadoView = 'horario' | 'perfil';

const EmpleadoDashboard: React.FC = () => {
  const { user, userData } = useAuth();
  const { addNotification } = useNotification();
  
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [pendingChangeProposals, setPendingChangeProposals] = useState<ChangeRequest[]>([]);
  const [loadingShifts, setLoadingShifts] = useState(true);
  const [loadingProposals, setLoadingProposals] = useState(true);
  const [selectedShift, setSelectedShift] = useState<Shift | null>(null);
  const [isShiftDetailModalOpen, setIsShiftDetailModalOpen] = useState(false);
  const [isJustificationModalOpen, setIsJustificationModalOpen] = useState(false);
  const [currentWeekStart, setCurrentWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [activeView, setActiveView] = useState<EmpleadoView>('horario');
  const [justifyingShift, setJustifyingShift] = useState<Shift | null>(null);

  useEffect(() => {
    if (!user) { setLoadingShifts(false); return; }
    setLoadingShifts(true);
    const rangeStart = Timestamp.fromDate(startOfWeek(currentWeekStart, { weekStartsOn: 1 }));
    const rangeEnd = Timestamp.fromDate(endOfWeek(currentWeekStart, { weekStartsOn: 1 }));
    const unsubscribeShifts = onShiftsForUserSnapshot(user.uid, rangeStart, rangeEnd, (fetchedShifts) => {
      setShifts(fetchedShifts);
      setLoadingShifts(false);
    });
    return () => unsubscribeShifts();
  }, [user, currentWeekStart]);

  useEffect(() => {
    if(!user) { setLoadingProposals(false); return; }
    setLoadingProposals(true);
    const unsubscribeProposals = onProposedChangeRequestsForUserSnapshot(user.uid, (fetchedProposals) => {
      setPendingChangeProposals(fetchedProposals);
      setLoadingProposals(false);
    });
    return () => unsubscribeProposals();
  }, [user]);

  const handleOpenShiftDetail = (shift: Shift) => {
    setSelectedShift(shift);
    setIsShiftDetailModalOpen(true);
  };
  
  // --- FUNCIÓN RENOMBRADA Y CORRECTA PARA ESTE COMPONENTE ---
  const handleOpenUploadForm = (shift: Shift) => {
    setJustifyingShift(shift);
    setIsJustificationModalOpen(true);
  };

  const handleRequestChange = async (shiftToChange: Shift) => {
    if (!user || !userData || !shiftToChange.shiftTypeId) { addNotification("No se puede solicitar cambio: faltan datos.", "error"); return; }
    try {
      await updateShift(shiftToChange.id, { status: ShiftStatus.CAMBIO_SOLICITADO });
      const changeRequestData: Omit<ChangeRequest, 'id' | 'requestedAt'> = {
        originalShiftId: shiftToChange.id, requestingUserId: user.uid, requestingUserName: userData.name, status: ChangeRequestStatus.PENDIENTE_GERENTE,
      };
      const crId = await addChangeRequest(changeRequestData);
      await logUserAction(user.uid, userData.name, HISTORY_ACTIONS.REQUEST_SHIFT_CHANGE, { shiftId: shiftToChange.id, changeRequestId: crId });
      addNotification('Solicitud de cambio enviada exitosamente.', 'success');
      setIsShiftDetailModalOpen(false);
    } catch (error: any) {
      addNotification(`Error al enviar la solicitud: ${error.message}`, 'error');
    }
  };
  
  const handleProposalDecision = async (changeRequest: ChangeRequest, accepted: boolean) => { /* ...código sin cambios... */ };
  const navigateWeek = (direction: 'prev' | 'next') => { setCurrentWeekStart(prev => addDays(prev, direction === 'prev' ? -7 : 7)); };
  
  const weekDays = Array.from({ length: 7 }).map((_, i) => addDays(currentWeekStart, i));
  const today = new Date();

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <Navbar title="Mi Panel de Empleado" />
      <main className="container mx-auto p-4 md:p-6 flex-grow">
        <aside className="mb-6">
          <div className="bg-white p-3 rounded-xl shadow-lg flex flex-row flex-wrap gap-2 justify-center">
            <Button variant={activeView === 'horario' ? 'primary' : 'light'} onClick={() => setActiveView('horario')} icon={<i className="fas fa-calendar-alt mr-2"></i>}>Mi Horario</Button>
            <Button variant={activeView === 'perfil' ? 'primary' : 'light'} onClick={() => setActiveView('perfil')} icon={<i className="fas fa-user-cog mr-2"></i>}>Mi Perfil y Preferencias</Button>
          </div>
        </aside>

        {activeView === 'perfil' && ( <section className="animate-fadeIn"><ProfileManager /></section> )}
        {activeView === 'horario' && (
          <div className="animate-fadeIn space-y-8">
            {loadingProposals ? <LoadingSpinner text="Cargando propuestas..."/> : pendingChangeProposals.length > 0 && (
              <section className="p-4 md:p-6 bg-yellow-100 border-l-4 border-yellow-400 rounded-lg shadow-md">
                <h2 className="text-xl font-semibold text-yellow-800 mb-3"><i className="fas fa-bell mr-2"></i>Propuestas de Cobertura Pendientes</h2>
                {/* ... JSX de las propuestas sin cambios ... */}
              </section>
            )}
            <section className="bg-white p-4 md:p-6 rounded-xl shadow-lg">
              <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-2">
                <Button onClick={() => navigateWeek('prev')} icon={<i className="fas fa-chevron-left"></i>} variant="light">Anterior</Button>
                <h2 className="text-xl sm:text-2xl font-bold text-center text-amore-charcoal order-first sm:order-none">Semana: {format(weekDays[0], DATE_FORMAT_SPA_DATE_ONLY, { locale: es })} - {format(weekDays[6], DATE_FORMAT_SPA_DATE_ONLY, { locale: es })}</h2>
                <Button onClick={() => navigateWeek('next')} icon={<i className="fas fa-chevron-right"></i>} variant="light">Siguiente</Button>
              </div>
              {loadingShifts ? <LoadingSpinner text="Cargando tus turnos..." /> : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3 sm:gap-4">
                  {weekDays.map(day => {
                    const dayShifts = shifts.filter(s => s.start && isEqual(s.start.toDate().setHours(0,0,0,0), day.setHours(0,0,0,0)));
                    const isToday = isEqual(day.setHours(0,0,0,0), today.setHours(0,0,0,0));
                    return (
                      <div key={day.toISOString()} className={`p-3 rounded-lg shadow min-h-[150px] flex flex-col ${isToday ? 'bg-amore-red-soft border-2 border-amore-red' : 'bg-gray-50'}`}>
                        <h3 className={`font-semibold text-center mb-1 capitalize ${isToday ? 'text-amore-red' : 'text-amore-gray'}`}>{format(day, 'eee', { locale: es })}</h3>
                        <p className={`text-sm text-center mb-2 ${isToday ? 'text-amore-red font-medium' : 'text-gray-500'}`}>{format(day, 'd MMM', { locale: es })}</p>
                        {dayShifts.map(shift => {
                          let cardClasses = 'bg-blue-100 border-blue-400 hover:bg-blue-200';
                          if (shift.status === ShiftStatus.CAMBIO_SOLICITADO || shift.status === ShiftStatus.JUSTIFICACION_PENDIENTE) { cardClasses = 'bg-yellow-100 border-yellow-400 hover:bg-yellow-200'; } 
                          else if (shift.status === ShiftStatus.FALTA_INJUSTIFICADA) { cardClasses = 'bg-red-100 border-red-400 hover:bg-red-200'; }
                          else if (shift.status === ShiftStatus.AUSENCIA_JUSTIFICADA) { cardClasses = 'bg-green-100 border-green-400 hover:bg-green-200'; }
                          return (
                            <div key={shift.id} className={`p-2.5 mb-2 rounded-md shadow-sm border-l-4 transition-all ${cardClasses}`}>
                              <div onClick={() => handleOpenShiftDetail(shift)} className="cursor-pointer">
                                <p className="font-semibold text-sm text-gray-800">{shift.shiftTypeName || 'Turno'}</p>
                                <p className="text-xs text-gray-700">{shift.start ? format(shift.start.toDate(), DATE_FORMAT_SPA_TIME_ONLY, { locale: es }) : ''} - {shift.end ? format(shift.end.toDate(), DATE_FORMAT_SPA_TIME_ONLY, { locale: es }) : ''}</p>
                                {shift.status === ShiftStatus.FALTA_INJUSTIFICADA && <p className="text-xs text-red-700 mt-1 font-bold">Falta Injustificada</p>}
                                {shift.status === ShiftStatus.JUSTIFICACION_PENDIENTE && <p className="text-xs text-yellow-700 mt-1 font-bold">Justificación Pendiente</p>}
                                {shift.status === ShiftStatus.AUSENCIA_JUSTIFICADA && <p className="text-xs text-green-700 mt-1 font-bold">Falta Justificada</p>}
                              </div>
                              {shift.status === ShiftStatus.FALTA_INJUSTIFICADA && (
                                <Button onClick={() => handleOpenUploadForm(shift)} size="xs" variant="info" className="mt-2 w-full">Subir Justificante</Button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        )}
      </main>
      <Modal isOpen={isJustificationModalOpen} onClose={() => setIsJustificationModalOpen(false)} title="Subir Justificante de Ausencia">
        {justifyingShift && (
          <UploadJustificationForm shiftId={justifyingShift.id} dateOfAbsence={justifyingShift.start.toDate()} onSuccess={() => { setIsJustificationModalOpen(false); addNotification('Justificante enviado correctamente.', 'success'); }} />
        )}
      </Modal>
    </div>
  );
};

export default EmpleadoDashboard;