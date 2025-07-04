import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Timestamp, writeBatch, doc, collection } from 'firebase/firestore';
import { format, startOfWeek, addDays, isEqual, endOfWeek, addMonths, subMonths } from 'date-fns';
import { es } from 'date-fns/locale/es';
import { db } from '../../services/firebase'; // <-- AÑADE ESTA LÍNEA

// Hooks y Contextos
import { useAuth } from '../../contexts/AuthContext';
import { useNotification } from '../../contexts/NotificationContext';

// Tipos y Constantes
import { Shift, ChangeRequest, ChangeRequestStatus, ShiftStatus, ShiftTemplate } from '../../types';
import { DATE_FORMAT_SPA_TIME_ONLY } from '../../constants';

// Servicios de Firestore
import { 
  updateChangeRequest, 
  onShiftsForUserSnapshot,
  onProposedChangeRequestsForUserSnapshot,
  onAcceptedChangeRequestsForUserSnapshot,
  markChangeRequestAsNotified,
  getShiftsForMonth,
  getShiftTemplates
} from '../../services/firestoreService';

// Componentes
import Navbar from '../common/Navbar';
import LoadingSpinner from '../common/LoadingSpinner';
import ShiftDetailModal from './ShiftDetailModal';
import UploadJustificationForm from './UploadJustificationForm';
import Modal from '../common/Modal';
import Button from '../common/Button';
import ProfileManager from './ProfileManager';
import MonthView from '../gerente/MonthView';

type EmpleadoView = 'horario' | 'perfil';
type CalendarView = 'week' | 'month';

const EmpleadoDashboard: React.FC = () => {
  const { user, userData } = useAuth();
  const { addNotification } = useNotification();
  
  const [activeView, setActiveView] = useState<EmpleadoView>('horario');
  const [calendarView, setCalendarView] = useState<CalendarView>('week');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [loading, setLoading] = useState(true);

  const [shifts, setShifts] = useState<Shift[]>([]);
  const [monthlyShifts, setMonthlyShifts] = useState<Shift[]>([]);
  const [shiftTemplates, setShiftTemplates] = useState<ShiftTemplate[]>([]);
  const [pendingChangeProposals, setPendingChangeProposals] = useState<ChangeRequest[]>([]);

  const [selectedShift, setSelectedShift] = useState<Shift | null>(null);
  const [selectedProposal, setSelectedProposal] = useState<ChangeRequest | null>(null);
  const [isShiftDetailModalOpen, setIsShiftDetailModalOpen] = useState(false);
  const [isJustificationModalOpen, setIsJustificationModalOpen] = useState(false);
  const [justifyingShift, setJustifyingShift] = useState<Shift | null>(null);

  const [acceptedChange, setAcceptedChange] = useState<ChangeRequest | null>(null);
  const [isChangeAcceptedModalOpen, setIsChangeAcceptedModalOpen] = useState(false);

  useEffect(() => {
    if (!user || !user.uid) {
      setLoading(false);
      return;
    }
    setLoading(true);
    let unsubscribeShifts: () => void = () => {};

    if (calendarView === 'week') {
      const rangeStart = Timestamp.fromDate(startOfWeek(currentDate, { weekStartsOn: 1 }));
      const rangeEnd = Timestamp.fromDate(endOfWeek(currentDate, { weekStartsOn: 1 }));

      // --- SENSOR #2: ¿QUÉ RANGO DE FECHAS ESTAMOS USANDO PARA LA SEMANA? ---
    console.log('%c[VISTA SEMANA] Buscando turnos en el rango:', 'color: #28a745; font-weight: bold;', {
      desde: rangeStart.toDate(),
      hasta: rangeEnd.toDate()
    });
    // --- FIN DEL SENSOR ---


      unsubscribeShifts = onShiftsForUserSnapshot(user.uid, rangeStart, rangeEnd, (fetchedShifts) => {
        setShifts(fetchedShifts);
        setLoading(false);
      });
    } else {
      getShiftsForMonth(currentDate, user.uid).then(setMonthlyShifts);
      getShiftTemplates().then(setShiftTemplates);
      setLoading(false);
    }

    const unsubscribeProposals = onProposedChangeRequestsForUserSnapshot(user.uid, setPendingChangeProposals);
    const unsubscribeAcceptedChanges = onAcceptedChangeRequestsForUserSnapshot(user.uid, (requests) => {
      if (requests.length > 0 && !isChangeAcceptedModalOpen) {
        setAcceptedChange(requests[0]);
        setIsChangeAcceptedModalOpen(true);
      }
    });

    return () => {
      unsubscribeShifts();
      unsubscribeProposals();
      unsubscribeAcceptedChanges();
    };
  }, [user, currentDate, calendarView, addNotification, isChangeAcceptedModalOpen]);

  const handleOpenShiftDetail = useCallback((shift: Shift) => {
    setSelectedProposal(null);
    setSelectedShift(shift);
    setIsShiftDetailModalOpen(true);
  }, []);
  
  const handleOpenProposalDetail = useCallback((proposal: ChangeRequest) => {
    setSelectedProposal(proposal);
    setSelectedShift(proposal.originalShift || null);
    setIsShiftDetailModalOpen(true);
  }, []);
  
  const handleOpenUploadForm = useCallback((shift: Shift) => {
    setJustifyingShift(shift);
    setIsJustificationModalOpen(true);
  }, []);

  const handleProposalDecision = useCallback(async (accepted: boolean) => {
    if (!selectedProposal || !user) return;
    const status = accepted ? ChangeRequestStatus.ACEPTADO_EMPLEADO : ChangeRequestStatus.RECHAZADO_EMPLEADO;
    try {
      await updateChangeRequest(selectedProposal.id, { status: status });
      addNotification(`Has ${accepted ? 'aceptado' : 'rechazado'} la propuesta. El gerente será notificado.`, 'success');
      setIsShiftDetailModalOpen(false);
    } catch (error: any) {
      addNotification(`Error al procesar la decisión: ${error.message}`, 'error');
    }
  }, [selectedProposal, user, addNotification]);
  
  const handleRequestChange = useCallback(async (shiftToChange: Shift) => {
    if (!user || !userData) {
      addNotification('No se pudo identificar al usuario.', 'error');
      return;
    }

    const batch = writeBatch(db);

    const shiftRef = doc(db, 'shifts', shiftToChange.id);
    batch.update(shiftRef, { status: ShiftStatus.CAMBIO_SOLICITADO });

    const changeRequestRef = doc(collection(db, 'changeRequests'));
    const newRequest: Omit<ChangeRequest, 'id' | 'requestedAt'> = {
      originalShiftId: shiftToChange.id,
      requestingUserId: user.uid,
      requestingUserName: userData.name,
      status: ChangeRequestStatus.PENDIENTE_GERENTE,
    };
    batch.set(changeRequestRef, { ...newRequest, requestedAt: Timestamp.now() });
    
    try {
      await batch.commit();
      addNotification('Tu solicitud de cambio ha sido enviada al gerente.', 'success');
      setIsShiftDetailModalOpen(false);
    } catch (error: any) {
      addNotification(`Error al enviar la solicitud: ${error.message}`, 'error');
    }
  }, [user, userData, addNotification]);

  const handleAcknowledgeChange = useCallback(async () => {
    if (!acceptedChange) return;
    try {
      await markChangeRequestAsNotified(acceptedChange.id);
      setIsChangeAcceptedModalOpen(false);
      setAcceptedChange(null);
    } catch (error: any) {
      addNotification(`Error al confirmar: ${error.message}`, 'error');
    }
  }, [acceptedChange, addNotification]);

  const navigateCalendar = useCallback((direction: 'prev' | 'next') => {
    const newDate = calendarView === 'week' 
      ? addDays(currentDate, direction === 'prev' ? -7 : 7)
      : addMonths(currentDate, direction === 'prev' ? -1 : 1);
    setCurrentDate(newDate);
  }, [currentDate, calendarView]);

  const handleDayClickFromMonth = useCallback((day: Date) => {
    const shiftsOnDay = monthlyShifts.filter(s => s.start && isEqual(s.start.toDate().setHours(0,0,0,0), day.setHours(0,0,0,0)));


     // --- SENSOR #1: ¿QUÉ TURNO ESTAMOS VIENDO EN EL MES? ---
  console.log('%c[VISTA MES] Clic en el día:', 'color: #007bff; font-weight: bold;', {
    diaSeleccionado: day,
    turnosEncontrados: shiftsOnDay.length,
    // Si hay turnos, muestra la hora exacta de inicio del primero
    horaInicioTurno: shiftsOnDay.length > 0 ? shiftsOnDay[0].start.toDate() : 'Ninguno'
  });
  // --- FIN DEL SENSOR --


    if (shiftsOnDay.length === 1) {
      handleOpenShiftDetail(shiftsOnDay[0]);
    } else {
      setCurrentDate(day);
      setCalendarView('week');
    }
  }, [monthlyShifts, handleOpenShiftDetail]);
  
  const currentWeekStart = useMemo(() => startOfWeek(currentDate, { weekStartsOn: 1 }), [currentDate]);
  const weekDays = useMemo(() => Array.from({ length: 7 }).map((_, i) => addDays(currentWeekStart, i)), [currentWeekStart]);
  const today = new Date();

  const renderWeekView = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-7 gap-3 sm:gap-4">
      {weekDays.map(day => {
        const dayShifts = shifts.filter(s => s.start && isEqual(s.start.toDate().setHours(0,0,0,0), day.setHours(0,0,0,0)));
        const isToday = isEqual(day.setHours(0,0,0,0), today.setHours(0,0,0,0));
        return (
          <div key={day.toISOString()} className={`p-3 rounded-lg shadow-sm min-h-[150px] flex flex-col ${isToday ? 'bg-red-50 border-2 border-amore-red' : 'bg-gray-50'}`}>
            <h3 className={`font-semibold text-center mb-1 capitalize ${isToday ? 'text-amore-red' : 'text-gray-600'}`}>{format(day, 'eee', { locale: es })}</h3>
            <p className={`text-sm text-center mb-2 ${isToday ? 'text-amore-red font-medium' : 'text-gray-400'}`}>{format(day, 'd MMM', { locale: es })}</p>
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
                  </div>
                  {shift.status === ShiftStatus.FALTA_INJUSTIFICADA && (<Button onClick={() => handleOpenUploadForm(shift)} size="xs" variant="info" className="mt-2 w-full">Subir Justificante</Button>)}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );

  const renderHorarioView = () => (
    <div className="animate-fadeIn space-y-8">
      {!loading && pendingChangeProposals.length > 0 && (
        <section className="p-4 md:p-6 bg-yellow-100 border-l-4 border-yellow-400 rounded-lg shadow-md">
          <h2 className="text-xl font-semibold text-yellow-800 mb-3"><i className="fas fa-bell mr-2 animate-pulse"></i>Propuestas de Cobertura Pendientes</h2>
          {pendingChangeProposals.map(req => (
            <div key={req.id} className="p-3 bg-white rounded-md shadow-sm border flex justify-between items-center mt-2">
              <p className="font-medium text-gray-700">{req.requestingUserName} te propone cubrir su turno.</p>
              <Button onClick={() => handleOpenProposalDetail(req)} variant="primary" size="sm">Revisar</Button>
            </div>
          ))}
        </section>
      )}
      <section className="bg-white p-4 md:p-6 rounded-xl shadow-lg">
        <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
          <div className="flex items-center gap-2">
            <Button onClick={() => navigateCalendar('prev')} icon={<i className="fas fa-chevron-left"></i>} />
            <h2 className="text-xl sm:text-2xl font-bold text-center text-amore-charcoal">
              {calendarView === 'week' ? `Semana del ${format(currentWeekStart, 'd \'de\' MMMM', { locale: es })}` : format(currentDate, 'MMMM yyyy', { locale: es }).replace(/^\w/, c => c.toUpperCase())}
            </h2>
            <Button onClick={() => navigateCalendar('next')} icon={<i className="fas fa-chevron-right"></i>} />
          </div>
          <div className="bg-gray-200 p-1 rounded-lg flex items-center">
             <Button size="sm" onClick={() => setCalendarView('week')} className={`px-4 py-1 rounded-md transition-colors ${calendarView === 'week' ? 'bg-white shadow text-amore-red font-semibold' : 'text-gray-600'}`}>Semana</Button>
             <Button size="sm" onClick={() => setCalendarView('month')} className={`px-4 py-1 rounded-md transition-colors ${calendarView === 'month' ? 'bg-white shadow text-amore-red font-semibold' : 'text-gray-600'}`}>Mes</Button>
          </div>
        </div>
        {loading ? <LoadingSpinner text="Cargando horario..." /> : (
          calendarView === 'week' 
            ? renderWeekView() 
            : <MonthView currentDate={currentDate} shifts={monthlyShifts} templates={shiftTemplates} onShiftClick={handleDayClickFromMonth} />
        )}
      </section>
    </div>
  );

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <Navbar />
      <main className="container mx-auto p-4 md:p-6 flex-grow">
        <aside className="mb-6">
          <div className="bg-white p-3 rounded-xl shadow-lg flex flex-row flex-wrap gap-2 justify-center">
            <Button variant={activeView === 'horario' ? 'primary' : 'light'} onClick={() => setActiveView('horario')} icon={<i className="fas fa-calendar-alt mr-2"></i>}>Mi Horario</Button>
            <Button variant={activeView === 'perfil' ? 'primary' : 'light'} onClick={() => setActiveView('perfil')} icon={<i className="fas fa-user-cog mr-2"></i>}>Mi Perfil</Button>
          </div>
        </aside>

        {activeView === 'perfil' && ( <section className="animate-fadeIn"><ProfileManager /></section> )}
        {activeView === 'horario' && renderHorarioView()}
      </main>

      {isShiftDetailModalOpen && selectedShift && (
        <ShiftDetailModal 
          isOpen={isShiftDetailModalOpen} 
          onClose={() => setIsShiftDetailModalOpen(false)} 
          shift={selectedShift} 
          isProposal={!!selectedProposal}
          onProposalDecision={selectedProposal ? handleProposalDecision : undefined}
          onRequestChange={!selectedProposal ? handleRequestChange : undefined}
          canRequestChange={!selectedProposal && selectedShift.status === ShiftStatus.CONFIRMADO}
        />
      )}
      
      <Modal isOpen={isJustificationModalOpen} onClose={() => setIsJustificationModalOpen(false)} title="Subir Justificante de Ausencia">
        {justifyingShift && (
          <UploadJustificationForm 
            shiftId={justifyingShift.id} 
            dateOfAbsence={justifyingShift.start.toDate()} 
            onSuccess={() => { setIsJustificationModalOpen(false); addNotification('Justificante enviado correctamente.', 'success'); }} 
          />
        )}
      </Modal>

      {acceptedChange && (
         <Modal isOpen={isChangeAcceptedModalOpen} onClose={handleAcknowledgeChange} title="¡Cambio de Turno Confirmado!">
            <div className="text-center">
                <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100">
                    <i className="fas fa-check text-2xl text-green-600"></i>
                </div>
                <h3 className="text-lg leading-6 font-medium text-gray-900 mt-4">¡Tu solicitud fue aceptada!</h3>
                <div className="mt-2 px-7 py-3">
                    <p className="text-sm text-gray-600">
                        Tu cambio para el turno del <strong>{acceptedChange.originalShift ? format(acceptedChange.originalShift.start.toDate(), 'eeee d \'de\' MMMM', { locale: es }) : 'N/A'}</strong> ha sido cubierto por <strong>{acceptedChange.proposedUserName}</strong>.
                    </p>
                </div>
                <div className="items-center px-4 py-3">
                    <Button onClick={handleAcknowledgeChange} variant="primary" className="w-full">
                        Enterado
                    </Button>
                </div>
            </div>
         </Modal>
      )}
    </div>
  );
};

export default EmpleadoDashboard;