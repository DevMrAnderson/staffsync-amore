import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ChangeRequest, ChangeRequestStatus, Shift, User, UserRole, ShiftStatus } from '../../types';
import Button from '../common/Button';
import LoadingSpinner from '../common/LoadingSpinner';
import Modal from '../common/Modal';
import { useNotification } from '../../contexts/NotificationContext';
import { 
  updateChangeRequest, 
  getShiftsForDay, 
  getAllUsersByRole,
  updateShift, 
  onPendingManagerChangeRequestsSnapshot 
} from '../../services/firestoreService';
import { logUserAction } from '../../services/historyService';
import { useAuth } from '../../contexts/AuthContext';
import { format } from 'date-fns';
import { es } from 'date-fns/locale/es';
import { DATE_FORMAT_SPA_DATETIME, HISTORY_ACTIONS, ROLE_HIERARCHY } from '../../constants';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../../services/firebase';

interface CategorizedEmployees {
  ideal: User[]; // Mismo Rol
  alternative: User[]; // Mismo Nivel, Diferente Rol
  unavailable: { user: User; reason: string }[];
}

const ChangeRequestManagement: React.FC = () => {
  const { addNotification } = useNotification();
  const { userData } = useAuth(); 

  const [requests, setRequests] = useState<ChangeRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [allEmployees, setAllEmployees] = useState<User[]>([]);
  
  const [selectedRequest, setSelectedRequest] = useState<ChangeRequest | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  const [categorizedEmployees, setCategorizedEmployees] = useState<CategorizedEmployees | null>(null);
  const [isLoadingReplacements, setIsLoadingReplacements] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    const unsubscribe = onPendingManagerChangeRequestsSnapshot((fetchedRequests) => {
      setRequests(fetchedRequests);
      setLoadingRequests(false);
    });
    getAllUsersByRole().then(setAllEmployees).catch(console.error);
    return () => unsubscribe();
  }, []);

  const findAndCategorizeReplacements = async (shiftToReplace: Shift) => {
    setIsLoadingReplacements(true);
    setCategorizedEmployees(null);
    try {
      const allUsers = await getAllUsersByRole();
      const shiftsForDay = await getShiftsForDay(shiftToReplace.start.toDate());
      const requestingUser = allUsers.find(u => u.id === shiftToReplace.userId);
      if (!requestingUser) throw new Error("No se pudo encontrar al empleado original.");

      const requestingUserRole = requestingUser.role;

      const hierarchyLevel = (Object.keys(ROLE_HIERARCHY) as Array<keyof typeof ROLE_HIERARCHY>)
        .find(level => ROLE_HIERARCHY[level].includes(requestingUserRole));

      if (!hierarchyLevel) {
        setCategorizedEmployees({ ideal: [], alternative: [], unavailable: [] });
        setIsLoadingReplacements(false);
        return;
      }
      
      const validReplacementRoles = ROLE_HIERARCHY[hierarchyLevel];
      const ideal: User[] = [];
      const alternative: User[] = [];
      const unavailable: { user: User; reason: string }[] = [];

      for (const user of allUsers) {
        if (user.id === requestingUser.id || user.role === UserRole.DUENO) continue;
        
        const conflictingShift = shiftsForDay.find(s => s.userId === user.id);
        
        if (conflictingShift) {
          unavailable.push({ user, reason: `Ya trabaja de ${format(conflictingShift.start.toDate(), 'HH:mm')} a ${format(conflictingShift.end.toDate(), 'HH:mm')}` });
        } else if (validReplacementRoles.includes(user.role)) {
          // Si no tiene conflicto Y su rol es del mismo nivel...
          if (user.role === requestingUserRole) {
            ideal.push(user); // ...si es el mismo rol, es ideal.
          } else {
            alternative.push(user); // ...si es otro rol del mismo nivel, es alternativo.
          }
        } else {
          unavailable.push({ user, reason: "Rol no compatible" });
        }
      }
      setCategorizedEmployees({ ideal, alternative, unavailable });
    } catch (error: any) {
      addNotification(`Error al buscar reemplazos: ${error.message}`, 'error');
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
    setIsModalOpen(true);
    findAndCategorizeReplacements(request.originalShift);
  };

  const handleAssignReplacement = async (proposedUser: User) => {
    if (!selectedRequest || !proposedUser || !userData) return;
    setActionLoading(true);
    try {
      await updateChangeRequest(selectedRequest.id, {
        proposedUserId: proposedUser.id,
        proposedUserName: proposedUser.name,
        status: ChangeRequestStatus.PROPUESTO_EMPLEADO, // Cambiamos el estado a PROPUESTO_EMPLEADO
        managerNotes: "Propuesto por selección manual del gerente.",
      });
      await updateShift(selectedRequest.originalShiftId, { status: ShiftStatus.CAMBIO_EN_PROCESO });
      await logUserAction(userData.id, userData.name, HISTORY_ACTIONS.PROPOSE_SHIFT_COVERAGE, { 
        changeRequestId: selectedRequest.id, 
        originalShiftId: selectedRequest.originalShiftId,
        requestingUserId: selectedRequest.requestingUserId,
        proposedUserId: proposedUser.id 
      });
      await addDoc(collection(db, 'notifications'), {
        userId: proposedUser.id,
        title: "Propuesta de Cobertura de Turno",
        message: `${selectedRequest.requestingUserName} necesita que cubras su turno. Por favor, revisa tus propuestas pendientes.`,
        isRead: false,
        createdAt: serverTimestamp(),
        type: 'change_request_proposal'
      });
      addNotification(`Reemplazo propuesto a ${proposedUser.name}. Esperando aceptación.`, 'success');
      setIsModalOpen(false);
      setSelectedRequest(null); 
    } catch (error: any) {
      addNotification(`Error al asignar reemplazo: ${error.message}`, "error");
    } finally {
      setActionLoading(false);
    }
  };
  
  const handleRejectRequest = async (reason: string = "No aprobado por gerencia.") => {
    if (!selectedRequest || !userData) return;
    setActionLoading(true);
    try {
      await updateChangeRequest(selectedRequest.id, { 
          status: ChangeRequestStatus.RECHAZADO, 
          managerNotes: reason,
          resolutionNotes: reason,
      });
      await updateShift(selectedRequest.originalShiftId, { status: ShiftStatus.CONFIRMADO });
      await logUserAction(userData.id, userData.name, HISTORY_ACTIONS.REJECT_SHIFT_CHANGE_REQUEST, { /*...*/ });
      await addDoc(collection(db, 'notifications'), {
        userId: selectedRequest.requestingUserId,
        title: "Solicitud de Cambio Rechazada",
        message: `Tu solicitud para cambiar tu turno ha sido rechazada. Notas: "${reason}"`,
        isRead: false,
        createdAt: serverTimestamp(),
        type: 'change_request_resolution'
      });
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
      <h2 className="text-2xl font-semibold text-gray-800 mb-6">Gestión de Solicitudes de Cambio</h2>
      {requests.length === 0 ? (
        <p className="text-gray-600 italic text-center py-8">No hay solicitudes pendientes.</p>
      ) : (
        <div className="space-y-4">
          {requests.map(req => (
            <div key={req.id} className="bg-white p-4 rounded-lg shadow-md border-l-4 border-yellow-500 hover:shadow-lg transition-shadow">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center">
                <div>
                  <p className="font-semibold text-gray-700">Solicitante: <span className="font-normal">{req.requestingUserName}</span></p>
                  <p className="text-sm text-gray-600">
                    Turno: {req.originalShift?.shiftTypeName || 'ID: ' + req.originalShiftId} 
                    {req.originalShift?.start && ` (${format(req.originalShift.start.toDate(), DATE_FORMAT_SPA_DATETIME, { locale: es })})`}
                  </p>
                </div>
                <Button onClick={() => handleOpenRequestModal(req)} size="sm" className="mt-2 sm:mt-0" icon={<i className="fas fa-search mr-2"></i>}>
                  Revisar y Buscar Reemplazo
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
            {isLoadingReplacements && <LoadingSpinner text="Analizando disponibilidad y roles..." />}
            
            {categorizedEmployees && (
              <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
                <h3 className="text-lg font-semibold text-green-700 border-b pb-2">Reemplazos Disponibles (Mismo Nivel Jerárquico)</h3>
                {categorizedEmployees.ideal.length > 0 ? categorizedEmployees.ideal.map(user => (
                  <div key={user.id} className="flex justify-between items-center p-2 bg-green-50 rounded">
                    <span>{user.name} <span className="text-xs text-gray-500 capitalize">({user.role})</span></span>
                    <Button size="sm" variant="success" onClick={() => handleAssignReplacement(user)} disabled={actionLoading}>Proponer</Button>
                  </div>
                )) : <p className="text-sm text-gray-500 italic">No hay empleados disponibles con un rol compatible.</p>}

                <h3 className="text-lg font-semibold text-blue-700 border-b pb-2 mt-4">Alternativas (Mismo Nivel)</h3>
                {categorizedEmployees.alternative.length > 0 ? categorizedEmployees.alternative.map(user => (
                  <div key={user.id} className="flex justify-between items-center p-2 bg-blue-50 rounded">
                    <span>{user.name} <span className="text-xs text-gray-500 capitalize">({user.role})</span></span>
                    <Button size="sm" variant="primary" onClick={() => handleAssignReplacement(user)} disabled={actionLoading}>Proponer</Button>
                  </div>
                )) : <p className="text-sm text-gray-500 italic">No hay otras opciones compatibles.</p>}

                <h3 className="text-lg font-semibold text-red-700 border-b pb-2 mt-4">No Disponibles</h3>
                {categorizedEmployees.unavailable.length > 0 ? categorizedEmployees.unavailable.map(({user, reason}) => (
                  <div key={user.id} className="flex justify-between items-center p-2 bg-red-50 rounded opacity-80">
                    <span className="text-gray-800 line-through">{user.name}</span>
                    <span className="text-xs text-red-600">{reason}</span>
                  </div>
                )) : <p className="text-sm text-gray-500 italic">El resto de los empleados no tienen conflictos.</p>}
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