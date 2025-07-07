import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useNotification } from '../../contexts/NotificationContext';
import { ChangeRequest, ChangeRequestStatus, User, Shift } from '../../types';
import { onPendingManagerChangeRequestsSnapshot, updateChangeRequest } from '../../services/firestoreService';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../services/firebase';
import { format } from 'date-fns';
import { es } from 'date-fns/locale/es';

// Componentes comunes
import LoadingSpinner from '../common/LoadingSpinner';
import Button from '../common/Button';
import Modal from '../common/Modal';

//========================================================================
// --- Sub-componente: Modal Inteligente para Asignar Sustitutos ---
//========================================================================
interface AssignSubstituteModalProps {
  isOpen: boolean;
  onClose: () => void;
  shiftToCover?: Shift;
  onAssign: (employee: User) => void;
}

const AssignSubstituteModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  shiftToCover?: Shift;
  onAssign: (employee: User) => void;
}> = ({ isOpen, onClose, shiftToCover, onAssign }) => {
  
  const [substitutes, setSubstitutes] = useState<{ 
    ideal: any[], 
    alternative: any[], 
    unavailable: any[] 
  }>({ ideal: [], alternative: [], unavailable: [] });

  const [loading, setLoading] = useState(true);
  const [confirmingUser, setConfirmingUser] = useState<User | null>(null);

  useEffect(() => {
    if (isOpen && shiftToCover) {
      setLoading(true);
      // Reseteamos el estado para no mostrar datos de una búsqueda anterior
      setSubstitutes({ ideal: [], alternative: [], unavailable: [] }); 

      const findSubs = httpsCallable(functions, 'findAvailableSubstitutes');
      findSubs({ shiftToCover })
        .then(result => {
          const data = result.data as any;
          
          // --- LA CORRECCIÓN ESTÁ AQUÍ ---
          // Mapeamos los datos recibidos (ej. data.idealSubstitutes)
          // a nuestro estado local correctamente (ej. ideal: ...)
          setSubstitutes({
            ideal: data.idealSubstitutes || [],
            alternative: data.alternativeSubstitutes || [],
            unavailable: data.unavailableEmployees || [],
          });
          // ---------------------------------
        })
        .catch(err => {
          console.error("Error al buscar sustitutos inteligentes:", err);
          // Aquí puedes usar tu 'addNotification' si la pasas como prop
        })
        .finally(() => setLoading(false));
    }
  }, [isOpen, shiftToCover]);
  
  const handleConfirmAndPropose = () => {
    if (!confirmingUser) return;
    onAssign(confirmingUser);
    setConfirmingUser(null);
  };

  const EmployeeList: React.FC<{ title: string, employees: any[], category: 'ideal' | 'alternative' }> = ({ title, employees, category }) => (
    <div>
      <h4 className={`font-bold mb-2 text-lg ${category === 'ideal' ? 'text-green-600' : 'text-blue-600'}`}>{title}</h4>
      <div className="space-y-3">
        {employees.map(emp => (
          <div key={emp.id} className={`p-3 rounded-lg border-l-4 ${emp.isClopening ? 'bg-orange-50 border-orange-400' : 'bg-gray-50 border-gray-200'}`}>
            <div className="flex justify-between items-center">
              <p className="font-bold text-amore-charcoal">{emp.name}</p>
              <Button onClick={() => setConfirmingUser(emp)} size="sm" variant={category === 'ideal' ? 'success' : 'primary'}>Proponer</Button>
            </div>
            <div className="text-xs text-gray-600 mt-2 pt-2 border-t space-y-1">
              <p><i className="far fa-calendar-alt w-4 mr-1"></i>{emp.shiftsThisWeek} turno(s) esta semana</p>
              {emp.isClopening && <p className="font-bold text-orange-600"><i className="fas fa-exclamation-triangle w-4 mr-1"></i>Posible Clopening</p>}
              {emp.availabilityNotes && <p className="text-green-600"><i className="fas fa-check-circle w-4 mr-1"></i>Disponible: {emp.availabilityNotes}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );



  // --- AÑADE ESTE COMPONENTE AQUÍ ---
  const UnavailableList: React.FC<{ employees: (User & { reason: string, conflictingShift?: string })[] }> = ({ employees }) => (
    <div>
      <h4 className="font-bold text-red-600 mb-2 text-lg">❌ No Disponibles</h4>
      <div className="space-y-2">
        {employees.map(emp => (
           <div key={emp.id} className="flex justify-between items-center p-3 bg-red-50 rounded-lg text-sm">
            <span className="text-gray-500 line-through">{emp.name}</span>
            <span className="text-red-700 font-semibold text-xs">{emp.conflictingShift ? emp.conflictingShift : emp.reason}</span>
          </div>
        ))}
      </div>
    </div>
  );

  // --- FIN DEL NUEVO COMPONENTE ---

  return (
    <>
      <Modal isOpen={isOpen && !confirmingUser} onClose={onClose} title="Asistente de Reemplazos" size="lg">
        {/* --- CONTENIDO DEL MODAL PRINCIPAL --- */}
        <div className="p-4">

          {/* --- NUEVA SECCIÓN DE DETALLES DEL TURNO --- */}
          {shiftToCover && (
            <div className="p-4 mb-6 bg-gray-50 rounded-lg border">
              <h3 className="font-bold text-lg text-amore-charcoal">Buscando cobertura para el turno de:</h3>
              <p className="font-semibold text-amore-red text-xl">{shiftToCover.userName}</p>
              <div className="mt-2 text-sm text-gray-600 space-y-1">
                 <p><i className="fas fa-calendar-day w-5 text-gray-400"></i> {format(shiftToCover.start.toDate(), 'eeee, d \'de\' MMMM', { locale: es })}</p>
                 <p><i className="far fa-clock w-5 text-gray-400"></i> {shiftToCover.shiftTypeName} ({format(shiftToCover.start.toDate(), 'p', { locale: es })} - {format(shiftToCover.end.toDate(), 'p', { locale: es })})</p>
                 <p className="capitalize"><i className="fas fa-user-tag w-5 text-gray-400"></i>Puesto: {shiftToCover.role}</p>
              </div>
            </div>
          )}
          {/* --- FIN DE LA NUEVA SECCIÓN --- */}

          {loading ? <LoadingSpinner text="Buscando candidatos..." /> : (
            <div className="space-y-6 max-h-[50vh] overflow-y-auto pr-2">
              {substitutes.ideal.length > 0 && <EmployeeList employees={substitutes.ideal} title="✅ Reemplazos Ideales" category="ideal" />}
              {substitutes.alternative.length > 0 && <EmployeeList employees={substitutes.alternative} title="👍 Reemplazos Alternativos" category="alternative" />}
              {substitutes.unavailable.length > 0 && <UnavailableList employees={substitutes.unavailable} />}
              {!loading && substitutes.ideal.length === 0 && substitutes.alternative.length === 0 && (
                <p className="text-center text-gray-500 py-8">No se encontraron empleados disponibles con un rol compatible.</p>
              )}
            </div>
          )}
        </div>
      </Modal>

    {/* --- EL NUEVO MODAL DE CONFIRMACIÓN --- */}
      <Modal isOpen={!!confirmingUser} onClose={() => setConfirmingUser(null)} title="Confirmar Propuesta">
        <div className="p-4 text-center">
          <p className="text-lg">
            ¿Estás seguro de que quieres proponer a <strong className="text-amore-red">{confirmingUser?.name}</strong> para cubrir este turno?
          </p>
          <div className="mt-6 flex justify-end gap-4">
            <Button onClick={() => setConfirmingUser(null)} variant="light">Cancelar</Button>
            <Button onClick={handleConfirmAndPropose} variant="primary">Sí, Proponer</Button>
          </div>
        </div>
      </Modal>
    </>
  );
};




//========================================================================
// --- Componente Principal: ChangeRequestManagement ---
//========================================================================
const ChangeRequestManagement: React.FC = () => {
  const { addNotification } = useNotification();
  const { userData } = useAuth();

  const [requests, setRequests] = useState<ChangeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<ChangeRequest | null>(null);

  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [requestToReject, setRequestToReject] = useState<ChangeRequest | null>(null);
  

  // Efecto que escucha en tiempo real las solicitudes pendientes para el gerente
  useEffect(() => {
    setLoading(true);
    const unsubscribe = onPendingManagerChangeRequestsSnapshot((fetchedRequests) => {
      setRequests(fetchedRequests);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleOpenRejectModal = (request: ChangeRequest) => {
  setRequestToReject(request);
  setRejectionReason(''); // Reseteamos la nota anterior
  setIsRejectModalOpen(true);
};

// Esta función se ejecuta al CONFIRMAR el rechazo desde el modal
const handleConfirmRejection = async () => {
  if (!requestToReject) return;

  try {
    // Guardamos el nuevo estado Y la nota de rechazo
    await updateChangeRequest(requestToReject.id, { 
      status: ChangeRequestStatus.RECHAZADO_GERENTE,
      rejectionReason: rejectionReason,
    });
    addNotification('La solicitud ha sido rechazada.', 'success');
  } catch (error: any) {
    addNotification(`Error al rechazar: ${error.message}`, 'error');
  } finally {
    setIsRejectModalOpen(false); // Cerramos el modal
    setRequestToReject(null);
  }
};

  // Abre el modal inteligente para proponer un sustituto
  const handleOpenAssignModal = useCallback((request: ChangeRequest) => {
    if (!request.originalShift) {
        addNotification("Error: Los detalles del turno original no están disponibles.", "error");
        return;
    }
    setSelectedRequest(request);
    setIsAssignModalOpen(true);
  }, []);

  // Se ejecuta cuando el gerente selecciona un empleado en el modal
  const handleAssignReplacement = useCallback(async (proposedEmployee: User) => {
    if (!selectedRequest || !userData) return;

    const dataToUpdate = {
      proposedUserId: proposedEmployee.id,
      proposedUserName: proposedEmployee.name,
      managerId: userData.id,
      status: ChangeRequestStatus.PROPUESTO_EMPLEADO,
    };
    
    try {
      await updateChangeRequest(selectedRequest.id, dataToUpdate);
      addNotification(`Propuesta enviada a ${proposedEmployee.name}.`, 'success');
    } catch (error: any) {
      addNotification(`Error al enviar la propuesta: ${error.message}`, 'error');
    } finally {
      setIsAssignModalOpen(false);
      setSelectedRequest(null);
    }
  }, [selectedRequest, userData, addNotification]);
  
  

  if (loading) return <LoadingSpinner text="Cargando solicitudes..." />;

  return (
    <div className="animate-fadeIn">
      <h2 className="text-2xl font-bold text-amore-charcoal mb-4">Solicitudes de Cambio Pendientes</h2>
      {requests.length === 0 ? (
        <p className="text-center text-gray-500 italic py-8">No hay solicitudes que requieran tu atención.</p>
      ) : (
        <div className="space-y-4">
          {requests.map(request => (
            <div key={request.id} className="p-4 bg-white rounded-lg shadow-md border-l-4 border-yellow-500">
  <div className="flex flex-col sm:flex-row justify-between items-start">
    {/* --- SECCIÓN DE INFORMACIÓN DEL TURNO --- */}
    <div>
      <p className="font-bold text-gray-800">{request.requestingUserName}</p>
      <p className="text-sm text-gray-600">
        Solicita cambiar el siguiente turno:
      </p>
      {/* Verificamos que 'originalShift' exista antes de mostrar sus detalles */}
      {request.originalShift ? (
        <div className="mt-2 pl-3 border-l-2 border-gray-200 text-sm text-gray-700 space-y-1">
          <p><strong>Turno:</strong> {request.originalShift.shiftTypeName}</p>
          <p><strong>Fecha:</strong> {format(request.originalShift.start.toDate(), 'eeee, d \'de\' MMMM', { locale: es })}</p>
          <p><strong>Horario:</strong> {format(request.originalShift.start.toDate(), 'p', { locale: es })} - {format(request.originalShift.end.toDate(), 'p', { locale: es })}</p>
          <p className="capitalize"><strong>Puesto:</strong> {request.originalShift.role}</p>
        </div>
      ) : (
        <p className="text-sm text-red-500 italic mt-2">Error: No se pudieron cargar los detalles del turno.</p>
      )}
    </div>
    
    {/* --- SECCIÓN DE BOTONES DE ACCIÓN --- */}
    <div className="mt-4 sm:mt-0 flex flex-col items-end gap-2 shrink-0">
      {request.status === ChangeRequestStatus.PENDIENTE_GERENTE && (
        <div className="flex gap-2">
          <Button onClick={() => handleOpenRejectModal(request, 'reject')} variant="danger" size="sm">Rechazar</Button>
          <Button onClick={() => handleOpenAssignModal(request)} variant="primary" size="sm">
            <i className="fas fa-users mr-2"></i>Proponer Sustituto
          </Button>
        </div>
      )}
      {request.status === ChangeRequestStatus.ACEPTADO_EMPLEADO && (
        <div className="text-right">
          <p className="text-sm font-semibold text-green-600">
            <i className="fas fa-check-circle mr-1"></i>Aceptado por: {request.proposedUserName}
          </p>
          <div className="flex gap-2 mt-1">
            <Button onClick={() => updateChangeRequest(request.id, { status: ChangeRequestStatus.APROBADO_GERENTE })} variant="success" size="sm">Aprobación Final</Button>
            <Button onClick={() => handleOpenRejectModal(request, 'reject')} variant="danger" size="sm">Rechazar</Button>
          </div>
        </div>
      )}
    </div>
  </div>
</div>
          ))}
        </div>
      )}

      <Modal
  isOpen={isRejectModalOpen}
  onClose={() => setIsRejectModalOpen(false)}
  title="Confirmar Rechazo de Solicitud"
>
  <div className="p-4 space-y-4">
    <p className="text-gray-700">
      Estás a punto de rechazar esta solicitud de cambio. Esta acción es definitiva.
    </p>
    <div>
      <label htmlFor="rejectionReason" className="block text-sm font-medium text-gray-700">
        Añadir una nota (opcional):
      </label>
      <textarea
        id="rejectionReason"
        value={rejectionReason}
        onChange={(e) => setRejectionReason(e.target.value)}
        rows={3}
        className="mt-1 w-full p-2 border rounded-md shadow-sm"
        placeholder="Ej: No hay personal disponible..."
      />
    </div>
    <div className="flex justify-end gap-4">
      <Button onClick={() => setIsRejectModalOpen(false)} variant="light">Cancelar</Button>
      <Button onClick={handleConfirmRejection} variant="danger">Confirmar Rechazo</Button>
    </div>
  </div>
</Modal>

      {/* El modal inteligente se renderiza aquí */}
      {selectedRequest && (
        <AssignSubstituteModal
          isOpen={isAssignModalOpen}
          onClose={() => setIsAssignModalOpen(false)}
          shiftToCover={selectedRequest.originalShift}
          onAssign={handleAssignReplacement}
        />
      )}
    </div>
  );
};

export default ChangeRequestManagement;