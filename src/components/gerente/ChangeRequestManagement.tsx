import React, { useState, useEffect, useCallback } from 'react';
import { ChangeRequest, ChangeRequestStatus, Shift, User, UserRole, ShiftStatus } from '../../types';
import Button from '../common/Button';
import LoadingSpinner from '../common/LoadingSpinner';
import Modal from '../common/Modal';
import { useNotification } from '../../contexts/NotificationContext';
import { 
  updateChangeRequest, getShiftsForDay, getAllUsers, getAllUsersByRole, addDoc, collection, serverTimestamp,
  updateShift, onPendingManagerChangeRequestsSnapshot 
} from '../../services/firestoreService';
import { findOptimalReplacement } from '../../services/aiService';
import { logUserAction } from '../../services/historyService';
import { useAuth } from '../../contexts/AuthContext';
import { format } from 'date-fns';
import { es } from 'date-fns/locale/es';
import { DATE_FORMAT_SPA_DATETIME, HISTORY_ACTIONS } from '../../constants';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../../services/firebase';


// Objeto para guardar los empleados clasificados
interface CategorizedEmployees {
  ideal: User[];
  available: User[];
  unavailable: { user: User; reason: string }[];
}

const ChangeRequestManagement: React.FC = () => {
  const { addNotification } = useNotification();
  const { userData } = useAuth(); 

  const [requests, setRequests] = useState<ChangeRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(true);
  
  const [selectedRequest, setSelectedRequest] = useState<ChangeRequest | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  const [potentialReplacements, setPotentialReplacements] = useState<User[]>([]);
  const [findingReplacementsLoading, setFindingReplacementsLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false); // For assign/reject actions
  const [categorizedEmployees, setCategorizedEmployees] = useState<CategorizedEmployees | null>(null);
  const [isLoadingReplacements, setIsLoadingReplacements] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  

  useEffect(() => {
    setLoadingRequests(true);
    const unsubscribe = onPendingManagerChangeRequestsSnapshot((fetchedRequests) => {
      setRequests(fetchedRequests);
      setLoadingRequests(false);
    });
    return () => unsubscribe();
  }, []);

  const findAndCategorizeReplacements = async (shiftToReplace: Shift) => {
  setIsLoadingReplacements(true);
  setCategorizedEmployees(null);

  try {
    const allUsers = await getAllUsersByRole();
    const shiftsForDay = await getShiftsForDay(shiftToReplace.start.toDate());

    // --- LÓGICA MEJORADA ---
    // 1. Encontramos al empleado que originalmente tiene el turno para saber su rol.
    const requestingUser = allUsers.find(u => u.id === shiftToReplace.userId);

    if (!requestingUser) {
      addNotification("No se pudo encontrar al empleado original del turno.", "error");
      setIsLoadingReplacements(false);
      return;
    }
    const idealRole = requestingUser.role;
    // --- FIN LÓGICA MEJORADA ---

    const ideal: User[] = [];
    const available: User[] = [];
    const unavailable: { user: User; reason: string }[] = [];

    for (const user of allUsers) {
      // Omitimos al mismo empleado que solicita el cambio
      if (user.id === requestingUser.id) continue;

      // Verificamos si tiene un turno que choque
      const conflictingShift = shiftsForDay.find(s => s.userId === user.id);
      
      if (conflictingShift) {
        unavailable.push({ user, reason: `Ya trabaja de ${format(conflictingShift.start.toDate(), 'HH:mm')} a ${format(conflictingShift.end.toDate(), 'HH:mm')}` });
      } else {
        // --- LÓGICA MEJORADA ---
        // 2. Comparamos el rol de cada empleado con el rol del empleado original.
        if (user.role === idealRole) {
          ideal.push(user);
        } else {
          available.push(user);
        }
        // --- FIN LÓGICA MEJORADA ---
      }
    }

    setCategorizedEmployees({ ideal, available, unavailable });

  } catch (error: any) {
    addNotification(`Error al buscar reemplazos: ${error.message}`, 'error');
    console.error("Error categorizando empleados:", error);
  } finally {
    setIsLoadingReplacements(false);
  }
};

  const handleOpenRequestModal = (request: ChangeRequest) => {
    if (!request.originalShift) {
        addNotification("Datos del turno original no disponibles.", "error");
        return;
    }
    setSelectedRequest(request);
    setPotentialReplacements([]); // Reset previous suggestions
    setIsModalOpen(true);
    findAndCategorizeReplacements(request.originalShift);
  };

  const handleFindReplacementWithAI = async () => {
    if (!selectedRequest || !selectedRequest.originalShift) {
      addNotification("No hay solicitud seleccionada o faltan datos del turno original.", "error");
      return;
    }
    setFindingReplacementsLoading(true);
    setPotentialReplacements([]);
    try {
      const foundUsers = await findOptimalReplacement(selectedRequest.originalShift);
      setPotentialReplacements(foundUsers);
      if (foundUsers.length === 0) {
        addNotification("IA no encontro reemplazos optimos esta vez (simulado).", "info");
      } else {
        addNotification(`IA sugirio ${foundUsers.length} reemplazo(s) (simulado).`, "success");
      }
    } catch (error: any) {
      addNotification(`Error al buscar reemplazos con IA: ${error.message}`, "error");
      console.error("AI replacement error:", error);
    } finally {
      setFindingReplacementsLoading(false);
    }
  };

  const handleAssignReplacement = async (proposedUser: User) => {
    if (!selectedRequest || !proposedUser || !userData) {
        addNotification("Datos invalidos para proponer reemplazo.", "error");
        return;
    }
    setActionLoading(true);
    try {
      await updateChangeRequest(selectedRequest.id, {
        proposedUserId: proposedUser.id,
        proposedUserName: proposedUser.name,
        status: ChangeRequestStatus.PENDIENTE_ACEPTACION_EMPLEADO,
        managerNotes: "Propuesto por gerente via IA (simulado) o seleccion manual.",
      });
      await updateShift(selectedRequest.originalShiftId, { status: ShiftStatus.CAMBIO_EN_PROCESO });

      await logUserAction(userData.id, userData.name, HISTORY_ACTIONS.PROPOSE_SHIFT_COVERAGE, { 
        changeRequestId: selectedRequest.id, 
        originalShiftId: selectedRequest.originalShiftId,
        requestingUserId: selectedRequest.requestingUserId,
        proposedUserId: proposedUser.id 
      });

      // --- INICIO DE LA LÓGICA AÑADIDA ---
      // 1. CREAR NOTIFICACIÓN para el empleado al que se le propone el turno
      await addDoc(collection(db, 'notifications'), {
        userId: proposedUser.id, // Notificación para el empleado propuesto
        title: "Propuesta de Cobertura de Turno",
        message: `${selectedRequest.requestingUserName} necesita que cubras su turno. Por favor, revisa tus propuestas pendientes.`,
        isRead: false,
        createdAt: serverTimestamp(),
        type: 'change_request_proposal'
      });

      // 2. (Opcional) Notificar al empleado original que ya se está gestionando
      await addDoc(collection(db, 'notifications'), {
        userId: selectedRequest.requestingUserId,
        title: "Solicitud de Cambio en Proceso",
        message: `Hemos propuesto a ${proposedUser.name} que cubra tu turno. Te notificaremos su respuesta.`,
        isRead: false,
        createdAt: serverTimestamp(),
        type: 'change_request_update'
      });
      // --- FIN DE LA LÓGICA AÑADIDA ---

      addNotification(`Reemplazo propuesto a ${proposedUser.name}. Esperando aceptacion.`, 'success');
      setIsModalOpen(false);
      setSelectedRequest(null); 
    } catch (error: any) {
      addNotification(`Error al asignar reemplazo: ${error.message}`, "error");
    } finally {
      setActionLoading(false);
    }
  };
  
  const handleRejectRequest = async (reason: string = "No aprobado por gerencia.") => {
    if (!selectedRequest || !userData) {
      addNotification("No hay solicitud seleccionada para rechazar.", "error");
      return;
    }
    setActionLoading(true);
    try {
      await updateChangeRequest(selectedRequest.id, { 
          status: ChangeRequestStatus.RECHAZADO, 
          managerNotes: reason,
          resolutionNotes: reason,
      });
      await updateShift(selectedRequest.originalShiftId, { status: ShiftStatus.CONFIRMADO });
      await logUserAction(userData.id, userData.name, HISTORY_ACTIONS.REJECT_SHIFT_CHANGE_REQUEST, { 
          changeRequestId: selectedRequest.id,
          originalShiftId: selectedRequest.originalShiftId,
          requestingUserId: selectedRequest.requestingUserId,
          reason
      });

      // --- INICIO DE LA LÓGICA AÑADIDA ---
      // CREAR NOTIFICACIÓN para el empleado original informando del rechazo
      await addDoc(collection(db, 'notifications'), {
        userId: selectedRequest.requestingUserId, // Notificación para el empleado que pidió el cambio
        title: "Solicitud de Cambio Rechazada",
        message: `Tu solicitud para cambiar tu turno ha sido rechazada por el gerente. Notas: "${reason}"`,
        isRead: false,
        createdAt: serverTimestamp(),
        type: 'change_request_resolution'
      });
      // --- FIN DE LA LÓGICA AÑADIDA ---

      addNotification(`Solicitud de ${selectedRequest.requestingUserName} rechazada.`, 'info');
      setIsModalOpen(false);
      setSelectedRequest(null);
    } catch(error: any) {
      addNotification(`Error al rechazar la solicitud: ${error.message}`, "error");
    } finally {
      setActionLoading(false);
    }
  };

  if (loadingRequests) return <div className="p-4"><LoadingSpinner text="Cargando solicitudes de cambio..." /></div>;

  return (
    <div className="p-2 md:p-4 animate-fadeIn">
      <h2 className="text-2xl font-semibold text-gray-800 mb-6">Gestion de Solicitudes de Cambio</h2>
      {requests.length === 0 ? (
        <p className="text-gray-600 italic text-center py-8">No hay solicitudes de cambio pendientes de revision por el gerente.</p>
      ) : (
        <div className="space-y-4">
          {requests.map(req => (
            <div key={req.id} className="bg-white p-4 rounded-lg shadow-md border-l-4 border-yellow-500 hover:shadow-lg transition-shadow">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center">
                <div>
                  <p className="font-semibold text-gray-700">Solicitante: <span className="font-normal">{req.requestingUserName || req.requestingUserId}</span></p>
                  <p className="text-sm text-gray-600">
                    Turno Original: {req.originalShift?.shiftType?.name || 'ID: ' + req.originalShiftId} 
                    {req.originalShift?.start && ` (${format(req.originalShift.start.toDate(), DATE_FORMAT_SPA_DATETIME, { locale: es })})`}
                  </p>
                  <p className="text-xs text-gray-500">Solicitado: {req.requestedAt ? format(req.requestedAt.toDate(), DATE_FORMAT_SPA_DATETIME, { locale: es }) : 'N/A'}</p>
                </div>
                <Button onClick={() => handleOpenRequestModal(req)} size="sm" className="mt-2 sm:mt-0" icon={<i className="fas fa-search"></i>}>
                  Revisar
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedRequest && selectedRequest.originalShift && (
        <Modal 
          isOpen={isModalOpen} 
          onClose={() => setIsModalOpen(false)} 
          title="Buscar Reemplazo para Turno" 
          size="lg"
        >
          <div className="space-y-4">
            <p>Buscando reemplazo para <strong>{selectedRequest.requestingUserName}</strong> en el turno de <strong>{selectedRequest.originalShift.shiftTypeName}</strong>.</p>
            {isLoadingReplacements && <LoadingSpinner text="Analizando disponibilidad..." />}
            
            {categorizedEmployees && (
              <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
                
                <h3 className="text-lg font-semibold text-green-700 border-b pb-2">Reemplazos Ideales (Mismo Rol)</h3>
                {categorizedEmployees.ideal.length > 0 ? categorizedEmployees.ideal.map(user => (
                  <div key={user.id} className="flex justify-between items-center p-2 bg-green-50 rounded">
                    <span>{user.name}</span>
                    <Button size="sm" variant="success" onClick={() => handleAssignReplacement(user)} disabled={actionLoading}>Proponer</Button>
                  </div>
                )) : <p className="text-sm text-gray-500 italic">No hay empleados disponibles con este rol.</p>}

                <h3 className="text-lg font-semibold text-blue-700 border-b pb-2 mt-4">Otras Opciones Disponibles</h3>
                {categorizedEmployees.available.length > 0 ? categorizedEmployees.available.map(user => (
                  <div key={user.id} className="flex justify-between items-center p-2 bg-blue-50 rounded">
                    <span>{user.name} ({user.role})</span>
                    <Button size="sm" variant="primary" onClick={() => handleAssignReplacement(user)} disabled={actionLoading}>Proponer</Button>
                  </div>
                )) : <p className="text-sm text-gray-500 italic">No hay otros empleados disponibles.</p>}

                <h3 className="text-lg font-semibold text-red-700 border-b pb-2 mt-4">No Disponibles</h3>
                {categorizedEmployees.unavailable.length > 0 ? categorizedEmployees.unavailable.map(({user, reason}) => (
                  <div key={user.id} className="flex justify-between items-center p-2 bg-red-50 rounded opacity-70">
                    <span className="text-red-800 line-through">{user.name}</span>
                    <span className="text-xs text-red-600">{reason}</span>
                  </div>
                )) : <p className="text-sm text-gray-500 italic">Todos los demás empleados están disponibles.</p>}

              </div>
            )}
            <div className="flex justify-end pt-4 border-t mt-4">
                <Button variant="light" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
                <Button variant="danger" className="ml-2" onClick={() => handleRejectRequest()}>Rechazar Solicitud</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default ChangeRequestManagement;