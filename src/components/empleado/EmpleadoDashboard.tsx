// Ruta del archivo: src/components/empleado/EmpleadoDashboard.tsx
// VERSIÓN CORREGIDA Y LIMPIA

import React, { useState, useEffect } from 'react';
import { Timestamp, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { useAuth } from '../../contexts/AuthContext';
import { Shift, ChangeRequest, ChangeRequestStatus, ShiftStatus, Notification, UserRole } from '../../types';
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
  onProposedChangeRequestsForUserSnapshot,
  onUnreadNotificationsSnapshot,
  markNotificationAsRead,
  getAllUsersByRole
} from '../../services/firestoreService';
import { useNotification as useToastNotification } from '../../contexts/NotificationContext';
import { logUserAction } from '../../services/historyService';
import ProfileManager from './ProfileManager';
import NotificationModal from '../common/NotificationModal';
import { db } from '../../services/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';


type EmpleadoView = 'horario' | 'perfil';

const EmpleadoDashboard: React.FC = () => {
  // =================================================================
  // PASO 1: DECLARACIÓN DE TODOS LOS ESTADOS Y HOOKS
  // =================================================================
  const { user, userData } = useAuth();
  const { addNotification } = useToastNotification();

  const [shifts, setShifts] = useState<Shift[]>([]);
  const [pendingChangeProposals, setPendingChangeProposals] = useState<ChangeRequest[]>([]);
  const [loadingShifts, setLoadingShifts] = useState(true);
  const [loadingProposals, setLoadingProposals] = useState(true);
  const [selectedShift, setSelectedShift] = useState<Shift | null>(null);
  const [isShiftDetailModalOpen, setIsShiftDetailModalOpen] = useState(false);
  const [isJustificationModalOpen, setIsJustificationModalOpen] = useState(false);
  const [currentWeekStart, setCurrentWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [activeView, setActiveView] = useState<EmpleadoView>('horario');
  
  // Estados para el sistema de notificaciones
  const [unreadNotifications, setUnreadNotifications] = useState<Notification[]>([]);
  const [isConfirmingNotif, setIsConfirmingNotif] = useState(false);



  useEffect(() => {
    if (!user) { setLoadingShifts(false); return; }
    const rangeStart = Timestamp.fromDate(startOfWeek(currentWeekStart, { weekStartsOn: 1 }));
    const rangeEnd = Timestamp.fromDate(endOfWeek(currentWeekStart, { weekStartsOn: 1 }));
    const unsubscribe = onShiftsForUserSnapshot(user.uid, rangeStart, rangeEnd, (fetchedShifts) => {
      setShifts(fetchedShifts); setLoadingShifts(false);
    });
    return () => unsubscribe();
  }, [user, currentWeekStart]);

  useEffect(() => {
    if(!user) { setLoadingProposals(false); return; }
    const unsubscribe = onProposedChangeRequestsForUserSnapshot(user.uid, (fetchedProposals) => {
      setPendingChangeProposals(fetchedProposals); setLoadingProposals(false);
    });
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (user) {
      const unsubscribe = onUnreadNotificationsSnapshot(user.uid, (notifications) => {
        setUnreadNotifications(notifications);
      });
      return () => unsubscribe();
    }
  }, [user]);

  // Modifica temporalmente esta función en EmpleadoDashboard.tsx
const handleOpenShiftDetail = (shift: Shift) => {
  // --- INICIO DEL CÓDIGO DE DIAGNÓSTICO ---
  console.log("===================================");
  console.log("Abriendo detalles para este turno:", shift);
  console.log("El objeto shift.shiftType es:", shift.shiftType);
  console.log("===================================");
  // --- FIN DEL CÓDIGO DE DIAGNÓSTICO ---

  setSelectedShift(shift);
  setIsShiftDetailModalOpen(true);
};

  const handleRequestChange = async (shiftToChange: Shift) => {
    if (!user || !userData || !shiftToChange.shiftTypeId) {
      addNotification("No se puede solicitar cambio: faltan datos.", "error");
      return;
    }
    try {
      await updateShift(shiftToChange.id, { status: ShiftStatus.CAMBIO_SOLICITADO });
      const changeRequestData: Omit<ChangeRequest, 'id' | 'requestedAt'> = {
        originalShiftId: shiftToChange.id,
        requestingUserId: user.uid,
        requestingUserName: userData.name,
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
  
  // Reemplaza tu función con esta versión, que ahora es 'async'
  // Reemplaza tu función con esta versión final
const handleProposalDecision = async (changeRequest: ChangeRequest, accepted: boolean) => {
  if (!user || !userData || !changeRequest.originalShiftId) {
    addNotification("Error procesando decision: datos incompletos.", "error");
    return;
  }
  try {
    if (accepted) {
      // 1. Se actualiza el turno y la solicitud (esto ya lo teníamos)
      await updateShift(changeRequest.originalShiftId, { 
          userId: user.uid, 
          userName: userData.name,
          status: ShiftStatus.CONFIRMADO 
      });
      await updateChangeRequest(changeRequest.id, { 
        status: ChangeRequestStatus.APROBADO, 
        resolutionNotes: `Cobertura aceptada por ${userData.name}.` 
      });

      // 2. Se notifica al empleado original (esto ya lo teníamos)
      await addDoc(collection(db, 'notifications'), {
        userId: changeRequest.requestingUserId,
        title: "¡Turno Cubierto!",
        message: `${userData.name} ha aceptado cubrir tu turno del ${format(changeRequest.originalShift.start.toDate(), DATE_FORMAT_SPA_DATETIME, { locale: es })}.`,
        isRead: false,
        createdAt: serverTimestamp(),
        type: 'change_request_covered'
      });
      
      // --- INICIO DE LA LÓGICA AÑADIDA ---
      // 3. Notificamos a todos los gerentes que el proceso se completó
      const managers = await getAllUsersByRole(UserRole.GERENTE);
      const managerNotificationPromises = managers.map(manager => {
        return addDoc(collection(db, 'notifications'), {
          userId: manager.id,
          title: "Cobertura de Turno Finalizada",
          message: `${userData.name} ha aceptado cubrir el turno de ${changeRequest.requestingUserName}. El cambio ha sido completado y los involucrados han sido notificados.`,
          isRead: false,
          createdAt: serverTimestamp(),
          type: 'change_request_finalized_fyi' // Un tipo para "For Your Information"
        });
      });
      await Promise.all(managerNotificationPromises);
      // --- FIN DE LA LÓGICA AÑADIDA ---

      await logUserAction(user.uid, userData.name, HISTORY_ACTIONS.ACCEPT_SHIFT_COVERAGE, { /* ... */ });
      addNotification(`Has aceptado cubrir el turno.`, 'success');

    } else {
      // La lógica de rechazo no cambia
      await updateChangeRequest(changeRequest.id, { 
        status: ChangeRequestStatus.PENDIENTE_GERENTE,
        proposedUserId: '', 
        proposedUserName: '',
        resolutionNotes: "Cobertura rechazada por empleado propuesto."
      });
      addNotification('Has rechazado la cobertura del turno. El gerente será notificado.', 'info');
    }
  } catch (error: any) {
    console.error("Error al procesar decision de propuesta:", error);
    addNotification(`Error al procesar tu decision: ${error.message}`, 'error');
  }
};

const handleConfirmNotification = async (notification: Notification) => {
  if (!userData) {
    addNotification("Error: No se pudo identificar al usuario.", "error");
    return;
  }

  setIsConfirmingNotif(true);
  try {
    // 1. Marcamos la notificación como leída. Esto no cambia.
    await markNotificationAsRead(notification.id);

    // 2. CORRECCIÓN: Primero verificamos que el campo 'type' exista en la notificación.
    if (notification.type && (notification.type.includes('change_request') || notification.type.includes('justification'))) {
      
      // El resto de la lógica para notificar a los gerentes solo se ejecuta si la condición es verdadera.
      const managers = await getAllUsersByRole(UserRole.GERENTE);
      const notificationPromises = managers.map(manager => {
        return addDoc(collection(db, 'notifications'), {
          userId: manager.id,
          title: "Confirmación de Empleado Recibida",
          message: `${userData.name} ha confirmado la recepción de la notificación sobre: "${notification.title}".`,
          isRead: false,
          createdAt: serverTimestamp(),
          type: 'employee_confirmation_receipt'
        });
      });
      await Promise.all(notificationPromises);
    }

    addNotification("Notificación confirmada.", "success");
  } catch (error: any) {
    console.error("Error al procesar confirmación de notificación:", error);
    addNotification(`Error al confirmar la notificación: ${error.message}`, "error");
  } finally {
    setIsConfirmingNotif(false);
  }
};

  const navigateWeek = (direction: 'prev' | 'next') => setCurrentWeekStart(prev => addDays(prev, direction === 'prev' ? -7 : 7));
  const weekDays = Array.from({ length: 7 }).map((_, i) => addDays(currentWeekStart, i));
  const today = new Date();






  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <Navbar title="Mi Panel de Empleado" />
      <main className="container mx-auto p-4 md:p-6 flex-grow">
        
        <aside className="mb-6">
          <div className="bg-white p-3 rounded-xl shadow-lg flex flex-row flex-wrap gap-2 justify-center">
            <Button
              variant={activeView === 'horario' ? 'primary' : 'light'}
              onClick={() => setActiveView('horario')}
              icon={<i className="fas fa-calendar-alt mr-2"></i>}
            >
              Mi Horario
            </Button>
            <Button
              variant={activeView === 'perfil' ? 'primary' : 'light'}
              onClick={() => setActiveView('perfil')}
              icon={<i className="fas fa-user-cog mr-2"></i>}
            >
              Mi Perfil y Preferencias
            </Button>
          </div>
        </aside>

        {activeView === 'perfil' && (
          <section className="animate-fadeIn">
            <ProfileManager />
          </section>
        )}

        {activeView === 'horario' && (
          <section className="animate-fadeIn">
            {loadingProposals ? <LoadingSpinner text="Cargando propuestas..."/> : pendingChangeProposals.length > 0 && (
              <section className="mb-6 p-4 md:p-6 bg-yellow-50 border-l-4 border-yellow-400 rounded-lg shadow-md animate-fadeIn">
                <h2 className="text-xl font-semibold text-yellow-800 mb-3">
                  <i className="fas fa-bell mr-2"></i>Propuestas de Cobertura
                </h2>
                <div className="space-y-3">
                  {pendingChangeProposals.map(req => (
                    <div key={req.id} className="p-3 bg-white rounded-md shadow-sm border border-yellow-200">
                      <p className="font-medium text-gray-700">{req.requestingUserName || 'Un compañero'} te propone cubrir su turno:</p>
                      <p className="text-sm text-gray-600">
                        <span className="font-semibold">{req.originalShift?.shiftTypeName || 'Turno'}</span> - {req.originalShift?.start ? format(req.originalShift.start.toDate(), DATE_FORMAT_SPA_DATETIME, { locale: es }) : 'N/A'}
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

            <section className="bg-white p-4 md:p-6 rounded-xl shadow-lg">
              <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-2">
                <Button onClick={() => navigateWeek('prev')} icon={<i className="fas fa-chevron-left"></i>} variant="light">Anterior</Button>
                <h2 className="text-xl sm:text-2xl font-bold text-center text-amore-charcoal order-first sm:order-none">
                  Semana: {format(weekDays[0], DATE_FORMAT_SPA_DATE_ONLY, { locale: es })} - {format(weekDays[6], DATE_FORMAT_SPA_DATE_ONLY, { locale: es })}
                </h2>
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
                        {dayShifts.length === 0 && (<p className="text-xs text-gray-400 text-center py-4 italic">Sin turnos</p>)}
                        {dayShifts.map(shift => (
                          <div 
                            key={shift.id} 
                            onClick={() => handleOpenShiftDetail(shift)}
                            className={`p-2.5 mb-2 rounded-md shadow-sm cursor-pointer transition-all hover:shadow-lg hover:scale-105
                              ${shift.status === ShiftStatus.CAMBIO_SOLICITADO ? 'bg-yellow-100 border-l-4 border-yellow-400 hover:bg-yellow-200' : 
                                shift.status === ShiftStatus.CAMBIO_EN_PROCESO ? 'bg-orange-100 border-l-4 border-orange-400 hover:bg-orange-200' :
                                'bg-blue-100 border-blue-400 hover:bg-blue-200'} border-l-4
                            `}>
                            <p className="font-semibold text-sm text-blue-800">{shift.shiftTypeName || 'Turno'}</p>
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
            
            <section className="mt-8 bg-white p-4 md:p-6 rounded-xl shadow-lg">
              <h2 className="text-xl font-semibold text-amore-charcoal mb-3">Subir Justificante</h2>
              <p className="text-sm text-gray-600 mb-3">Si necesitas justificar una ausencia, puedes subir el documento correspondiente aqui.</p>
              <Button onClick={() => setIsJustificationModalOpen(true)} variant="info">
                <i className="fas fa-file-upload mr-2"></i>
                Subir Justificante de Falta
              </Button>
            </section>
          </section>
        )}
      </main>

{selectedShift && (
  <ShiftDetailModal
    isOpen={isShiftDetailModalOpen}
    onClose={() => setIsShiftDetailModalOpen(false)}
    shift={selectedShift}
    shiftType={selectedShift.shiftType || {
  id: selectedShift.shiftTypeId,
  name: selectedShift.shiftTypeName || 'Detalles no encontrados',
  checklist: [],
  procedures: []
}}
    onRequestChange={handleRequestChange}
    canRequestChange={selectedShift.status === ShiftStatus.CONFIRMADO}
  />
)}
      
      <Modal
        title="Subir Nuevo Justificante"
        isOpen={isJustificationModalOpen}
        onClose={() => setIsJustificationModalOpen(false)}
      >
        <UploadJustificationForm 
          onSuccess={() => setIsJustificationModalOpen(false)} 
        />
      </Modal>

      {unreadNotifications.length > 0 && (
        <NotificationModal 
          notification={unreadNotifications[0]}
          onConfirm={handleConfirmNotification}
          isProcessing={isConfirmingNotif}
        />
      )}
    </div>
  );
};

export default EmpleadoDashboard;