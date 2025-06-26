import React, { useState, useEffect, useCallback } from 'react';
import { Timestamp } from 'firebase/firestore';
import { useAuth } from '../../contexts/AuthContext';
import { Shift, ShiftType, ChangeRequest, ChangeRequestStatus, ShiftStatus } from '../../types';
import Navbar from '../common/Navbar';
import LoadingSpinner from '../common/LoadingSpinner';
import ShiftDetailModal from './ShiftDetailModal';
import UploadJustificationForm from './UploadJustificationForm';
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
  
  const [currentWeekStart, setCurrentWeekStart] = useState(() => 
    startOfWeek(new Date(), { weekStartsOn: 1 }) // Monday as start of the week
  );

  // Listener for user's shifts
  useEffect(() => {
    if (!user || !userData) {
      setLoadingShifts(false);
      return;
    }
    setLoadingShifts(true);
    const rangeStart = Timestamp.fromDate(startOfWeek(currentWeekStart, { weekStartsOn: 1 }));
    const rangeEnd = Timestamp.fromDate(endOfWeek(currentWeekStart, { weekStartsOn: 1 }));

    const unsubscribeShifts = onShiftsForUserSnapshot(user.uid, rangeStart, rangeEnd, (fetchedShifts) => {
      setShifts(fetchedShifts);
      setLoadingShifts(false);
    });

    return () => unsubscribeShifts();
  }, [user, userData, currentWeekStart]);

  // Listener for proposals for this user
  useEffect(() => {
    if(!user || !userData) {
      setLoadingProposals(false);
      return;
    }
    setLoadingProposals(true);
    const unsubscribeProposals = onProposedChangeRequestsForUserSnapshot(user.uid, (fetchedProposals) => {
      setPendingChangeProposals(fetchedProposals);
      setLoadingProposals(false);
    });
    return () => unsubscribeProposals();
  }, [user, userData]);


  const handleOpenShiftDetail = (shift: Shift) => {
    if (!shift.shiftType) {
        addNotification("Detalles del tipo de turno no cargados completamente.", "warning");
        // Potentially fetch shiftType again here if missing, though onShiftsForUserSnapshot should populate it.
    }
    setSelectedShift(shift);
    setIsShiftDetailModalOpen(true);
  };

  const handleRequestChange = async (shiftToChange: Shift) => {
    if (!user || !userData || !shiftToChange.shiftType) {
      addNotification("No se puede solicitar cambio: faltan datos.", "error");
      return;
    }
    try {
      await updateShift(shiftToChange.id, { status: ShiftStatus.CAMBIO_SOLICITADO });
      const changeRequestData: Omit<ChangeRequest, 'id' | 'requestedAt'> = {
        originalShiftId: shiftToChange.id,
        requestingUserId: user.uid,
        requestingUserName: userData.name, // userName should be available from userData
        status: ChangeRequestStatus.PENDIENTE_GERENTE,
      };
      const crId = await addChangeRequest(changeRequestData);
      await logUserAction(user.uid, userData.name, HISTORY_ACTIONS.REQUEST_SHIFT_CHANGE, { shiftId: shiftToChange.id, changeRequestId: crId });
      addNotification('Solicitud de cambio enviada exitosamente.', 'success');
      setIsShiftDetailModalOpen(false);
    } catch (error: any) {
      console.error("Error al solicitar cambio:", error);
      addNotification(`Error al enviar la solicitud: ${error.message}`, 'error');
    }
  };
  
  const handleProposalDecision = async (changeRequest: ChangeRequest, accepted: boolean) => {
    if (!user || !userData || !changeRequest.originalShiftId) {
      addNotification("Error procesando decision: datos incompletos.", "error");
      return;
    }

    try {
      if (accepted) {
        // Update original shift with new user
        await updateShift(changeRequest.originalShiftId, { 
            userId: user.uid, 
            userName: userData.name,
            status: ShiftStatus.CONFIRMADO 
        });
        await updateChangeRequest(changeRequest.id, { status: ChangeRequestStatus.APROBADO, resolutionNotes: "Cobertura aceptada por empleado." });
        await logUserAction(user.uid, userData.name, HISTORY_ACTIONS.ACCEPT_SHIFT_COVERAGE, { changeRequestId: changeRequest.id, originalShiftId: changeRequest.originalShiftId, acceptedForUserId: changeRequest.requestingUserId });
        addNotification(`Has aceptado cubrir el turno.`, 'success');
      } else {
        // Revert status so manager can find another person, clear proposed user from CR
        await updateChangeRequest(changeRequest.id, { 
            status: ChangeRequestStatus.PENDIENTE_GERENTE, // Back to manager
            proposedUserId: '', 
            proposedUserName: '',
            resolutionNotes: "Cobertura rechazada por empleado propuesto."
        });
        // Original shift status might need to be reverted too by manager or a different flow
        // For now, let's assume manager handles the original shift if this is rejected.
        await logUserAction(user.uid, userData.name, HISTORY_ACTIONS.REJECT_SHIFT_COVERAGE, { changeRequestId: changeRequest.id });
        addNotification('Has rechazado la cobertura del turno. El gerente sera notificado.', 'info');
      }
    } catch (error: any) {
      console.error("Error al procesar decision de propuesta:", error);
      addNotification(`Error al procesar tu decision: ${error.message}`, 'error');
    }
  };

  const navigateWeek = (direction: 'prev' | 'next') => {
    setCurrentWeekStart(prev => addDays(prev, direction === 'prev' ? -7 : 7));
  };
  
  const weekDays = Array.from({ length: 7 }).map((_, i) => addDays(currentWeekStart, i));

  const today = new Date();

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <Navbar title="Mi Panel de Empleado" />
      <main className="container mx-auto p-4 md:p-6 flex-grow">
        
        {/* Pending Proposals Section */}
        {loadingProposals ? <LoadingSpinner text="Cargando propuestas..."/> : pendingChangeProposals.length > 0 && (
            <section className="mb-6 p-4 md:p-6 bg-yellow-50 border-l-4 border-yellow-400 rounded-lg shadow-md animate-fadeIn">
                <h2 className="text-xl font-semibold text-yellow-800 mb-3">
                  <i className="fas fa-bell mr-2"></i>Propuestas de Cobertura Pendientes
                </h2>
                <div className="space-y-3">
                  {pendingChangeProposals.map(req => (
                      <div key={req.id} className="p-3 bg-white rounded-md shadow-sm border border-yellow-200">
                          <p className="font-medium text-gray-700">
                              {req.requestingUserName || 'Un companero'} te propone cubrir su turno:
                          </p>
                          <p className="text-sm text-gray-600">
                              <span className="font-semibold">{req.originalShift?.shiftType?.name || 'Turno'}</span> - 
                              {req.originalShift?.start ? format(req.originalShift.start.toDate(), DATE_FORMAT_SPA_DATETIME, { locale: es }) : 'N/A'}
                          </p>
                          <div className="mt-3 flex space-x-2">
                              <Button onClick={() => handleProposalDecision(req, true)} variant="success" size="sm" icon={<i className="fas fa-check"></i>}>Aceptar</Button>
                              <Button onClick={() => handleProposalDecision(req, false)} variant="danger" size="sm" icon={<i className="fas fa-times"></i>}>Rechazar</Button>
                          </div>
                      </div>
                  ))}
                </div>
            </section>
        )}

        {/* Schedule Section */}
        <section className="bg-white p-4 md:p-6 rounded-xl shadow-lg">
          <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-2">
            <Button onClick={() => navigateWeek('prev')} icon={<i className="fas fa-chevron-left"></i>} variant="secondary">Anterior</Button>
            <h2 className="text-xl sm:text-2xl font-bold text-center text-gray-700 order-first sm:order-none">
              Semana: {format(weekDays[0], DATE_FORMAT_SPA_DATE_ONLY, { locale: es })} - {format(weekDays[6], DATE_FORMAT_SPA_DATE_ONLY, { locale: es })}
            </h2>
            <Button onClick={() => navigateWeek('next')} icon={<i className="fas fa-chevron-right after:content-['_']"></i>} variant="secondary">Siguiente</Button>
          </div>

          {loadingShifts ? (
            <LoadingSpinner text="Cargando tus turnos..." />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3 sm:gap-4">
              {weekDays.map(day => {
                const dayShifts = shifts.filter(s => s.start && isEqual(s.start.toDate().setHours(0,0,0,0), day.setHours(0,0,0,0)));
                const isToday = isEqual(day.setHours(0,0,0,0), today.setHours(0,0,0,0));
                return (
                  <div key={day.toISOString()} className={`p-3 rounded-lg shadow min-h-[150px] ${isToday ? 'bg-indigo-50 border-2 border-indigo-400' : 'bg-gray-50'}`}>
                    <h3 className={`font-semibold text-center mb-1 capitalize ${isToday ? 'text-indigo-700' : 'text-gray-600'}`}>
                      {format(day, 'eee', { locale: es })}
                    </h3>
                    <p className={`text-sm text-center mb-2 ${isToday ? 'text-indigo-600 font-medium' : 'text-gray-500'}`}>{format(day, 'd MMM', { locale: es })}</p>
                    {dayShifts.length === 0 && (
                       <p className="text-xs text-gray-400 text-center py-4 italic">Sin turnos</p>
                    )}
                    {dayShifts.map(shift => (
                      <div 
                        key={shift.id} 
                        onClick={() => handleOpenShiftDetail(shift)}
                        className={`p-2.5 mb-2 rounded-md shadow-sm cursor-pointer transition-all hover:shadow-lg hover:scale-105
                          ${shift.status === ShiftStatus.CAMBIO_SOLICITADO ? 'bg-yellow-100 border-yellow-400 hover:bg-yellow-200' : 
                            shift.status === ShiftStatus.CAMBIO_EN_PROCESO ? 'bg-orange-100 border-orange-400 hover:bg-orange-200' :
                            'bg-blue-100 border-blue-400 hover:bg-blue-200'} border-l-4
                        `}>
                        <p className="font-semibold text-sm text-blue-800">{shift.shiftType?.name || 'Turno'}</p>
                        <p className="text-xs text-gray-700">
                          {shift.start ? format(shift.start.toDate(), DATE_FORMAT_SPA_TIME_ONLY, { locale: es }) : ''} - {shift.end ? format(shift.end.toDate(), DATE_FORMAT_SPA_TIME_ONLY, { locale: es }) : ''}
                        </p>
                         {shift.status === ShiftStatus.CAMBIO_SOLICITADO && <p className="text-xs text-yellow-700 mt-1 font-medium">Cambio Solicitado</p>}
                         {shift.status === ShiftStatus.CAMBIO_EN_PROCESO && <p className="text-xs text-orange-700 mt-1 font-medium">Cambio en Proceso</p>}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Justification Section */}
        <section className="mt-8 bg-white p-4 md:p-6 rounded-xl shadow-lg">
            <h2 className="text-xl font-semibold text-gray-700 mb-3">Subir Justificante</h2>
            <p className="text-sm text-gray-600 mb-3">Si necesitas justificar una ausencia, puedes subir el documento correspondiente aqui.</p>
            <Button onClick={() => setIsJustificationModalOpen(true)} variant="info" icon={<i className="fas fa-file-upload mr-2"></i>}>
                Subir Justificante de Falta
            </Button>
        </section>
      </main>

      {selectedShift && selectedShift.shiftType && (
        <ShiftDetailModal
          isOpen={isShiftDetailModalOpen}
          onClose={() => setIsShiftDetailModalOpen(false)}
          shift={selectedShift}
          shiftType={selectedShift.shiftType}
          onRequestChange={handleRequestChange}
          canRequestChange={selectedShift.status === ShiftStatus.CONFIRMADO}
        />
      )}

      <UploadJustificationForm
        isOpen={isJustificationModalOpen}
        onClose={() => setIsJustificationModalOpen(false)}
      />
    </div>
  );
};

export default EmpleadoDashboard;
