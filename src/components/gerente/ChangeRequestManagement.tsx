import React, { useState, useEffect, useCallback } from 'react';
import { ChangeRequest, ChangeRequestStatus, Shift, User, UserRole, ShiftStatus } from '../../types';
import Button from '../common/Button';
import LoadingSpinner from '../common/LoadingSpinner';
import Modal from '../common/Modal';
import { useNotification } from '../../contexts/NotificationContext';
import { 
  updateChangeRequest, 
  updateShift,
  onPendingManagerChangeRequestsSnapshot 
} from '../../services/firestoreService';
import { findOptimalReplacement } from '../../services/aiService';
import { logUserAction } from '../../services/historyService';
import { useAuth } from '../../contexts/AuthContext';
import { format } from 'date-fns';
import { es } from 'date-fns/locale/es';
import { DATE_FORMAT_SPA_DATETIME, HISTORY_ACTIONS } from '../../constants';

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

  useEffect(() => {
    setLoadingRequests(true);
    const unsubscribe = onPendingManagerChangeRequestsSnapshot((fetchedRequests) => {
      setRequests(fetchedRequests);
      setLoadingRequests(false);
    });
    return () => unsubscribe();
  }, []);

  const handleOpenRequestModal = (request: ChangeRequest) => {
    if (!request.originalShift) {
        addNotification("Datos del turno original no disponibles.", "error");
        return;
    }
    setSelectedRequest(request);
    setPotentialReplacements([]); // Reset previous suggestions
    setIsModalOpen(true);
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
      // Optionally update original shift status to CAMBIO_EN_PROCESO
      await updateShift(selectedRequest.originalShiftId, { status: ShiftStatus.CAMBIO_EN_PROCESO });

      await logUserAction(userData.id, userData.name, HISTORY_ACTIONS.PROPOSE_SHIFT_COVERAGE, { 
        changeRequestId: selectedRequest.id, 
        originalShiftId: selectedRequest.originalShiftId,
        requestingUserId: selectedRequest.requestingUserId,
        proposedUserId: proposedUser.id 
      });
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
        // Revert original shift status to CONFIRMADO
        await updateShift(selectedRequest.originalShiftId, { status: ShiftStatus.CONFIRMADO });
        await logUserAction(userData.id, userData.name, HISTORY_ACTIONS.REJECT_SHIFT_CHANGE_REQUEST, { 
            changeRequestId: selectedRequest.id,
            originalShiftId: selectedRequest.originalShiftId,
            requestingUserId: selectedRequest.requestingUserId,
            reason
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
            title="Detalle de Solicitud de Cambio" 
            size="lg"
            footer={
                 <div className="flex flex-wrap justify-end gap-2">
                    <Button onClick={() => handleRejectRequest()} variant="danger" isLoading={actionLoading} disabled={actionLoading}>Rechazar Solicitud</Button>
                    <Button onClick={() => setIsModalOpen(false)} variant="light" disabled={actionLoading}>Cerrar</Button>
                </div>
            }
        >
          <div className="space-y-4">
            <p><strong>Solicitante:</strong> {selectedRequest.requestingUserName}</p>
            <p><strong>Turno Original:</strong> {selectedRequest.originalShift.shiftType?.name} ({format(selectedRequest.originalShift.start.toDate(), DATE_FORMAT_SPA_DATETIME, { locale: es })} - {format(selectedRequest.originalShift.end.toDate(), 'HH:mm', { locale: es })})</p>
            <p><strong>Estado Actual Turno:</strong> <span className={`font-semibold ${selectedRequest.originalShift.status === ShiftStatus.CAMBIO_SOLICITADO ? 'text-yellow-600' : ''}`}>{selectedRequest.originalShift.status}</span></p>
            
            <Button 
                onClick={handleFindReplacementWithAI} 
                variant="info" 
                isLoading={findingReplacementsLoading}
                icon={<i className="fas fa-brain mr-2"></i>}
                disabled={actionLoading}
            >
              {findingReplacementsLoading ? 'Buscando con IA...' : 'Buscar Reemplazos con IA'}
            </Button>

            {potentialReplacements.length > 0 && (
              <div className="mt-4 p-3 bg-gray-50 rounded-md">
                <h4 className="font-semibold mb-2 text-gray-700">Reemplazos Sugeridos por IA (Simulado):</h4>
                <ul className="space-y-2 max-h-48 overflow-y-auto">
                  {potentialReplacements.map(user => (
                    <li key={user.id} className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-2 bg-gray-100 rounded hover:bg-gray-200">
                      <div>
                        <span className="font-medium">{user.name}</span>
                        <span className="text-xs text-gray-500 block sm:inline sm:ml-2">({user.email})</span>
                      </div>
                      <Button 
                        onClick={() => handleAssignReplacement(user)} 
                        size="sm" 
                        variant="success" 
                        isLoading={actionLoading}
                        disabled={actionLoading}
                        className="mt-1 sm:mt-0"
                      >
                        Proponer a {user.name.split(' ')[0]}
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
             {potentialReplacements.length === 0 && !findingReplacementsLoading && selectedRequest.originalShift /* To ensure AI button was clicked */ && (
                <p className="text-sm text-gray-500 mt-2 italic">La IA no encontro sugerencias o aun no se ha ejecutado la busqueda.</p>
            )}
            {/* TODO: Add manual selection of employee if AI doesn't find or manager wants to override */}
          </div>
        </Modal>
      )}
    </div>
  );
};

export default ChangeRequestManagement;
