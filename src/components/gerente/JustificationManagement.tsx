import React, { useState, useEffect, useCallback } from 'react';
import { useNotification } from '../../contexts/NotificationContext';
import { Justification, JustificationStatus, User, ShiftStatus } from '../../types';
import { HISTORY_ACTIONS } from '../../constants';
import { getJustificationsPage, updateJustification, updateShift } from '../../services/firestoreService';
import Button from '../common/Button';
import Modal from '../common/Modal';
import LoadingSpinner from '../common/LoadingSpinner';
import { format, addDays } from 'date-fns';
import { es } from 'date-fns/locale/es';
import { DATE_FORMAT_SPA_DATETIME } from '../../constants';
import { DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';
import { useAuth } from '../../contexts/AuthContext';
import { logUserAction } from '../../services/historyService';

// Interfaz para el estado de nuestro modal de confirmación
interface ConfirmActionState {
  action: 'approve' | 'reject';
  justification: Justification;
}

const ITEMS_PER_PAGE = 15;

const JustificationManagement: React.FC = () => {
  const { addNotification } = useNotification();
  const { userData } = useAuth();
  
  const [justifications, setJustifications] = useState<Justification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastVisible, setLastVisible] = useState<QueryDocumentSnapshot<DocumentData> | undefined>(undefined);
  const [hasMore, setHasMore] = useState(true);

  const [filters, setFilters] = useState({
    userName: '',
    status: '',
    startDate: '',
    endDate: '',
  });

  const [selectedJustification, setSelectedJustification] = useState<Justification | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ConfirmActionState | null>(null);

  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFilters(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const fetchJustifications = useCallback(async (loadMore = false) => {
    if(!loadMore) setIsLoading(true);

    try {
      const lastDoc = loadMore ? lastVisible : undefined;
      
      const activeFilters: any = {};
      if (filters.userName) activeFilters.userName = filters.userName;
      if (filters.status) activeFilters.status = filters.status;
      if (filters.startDate) activeFilters.startDate = filters.startDate;
      if (filters.endDate) activeFilters.endDate = filters.endDate;

      const { entries, nextLastVisibleDoc } = await getJustificationsPage(ITEMS_PER_PAGE, lastDoc, activeFilters);
      
      setJustifications(prev => loadMore ? [...prev, ...entries] : entries);
      setLastVisible(nextLastVisibleDoc);
      setHasMore(entries.length === ITEMS_PER_PAGE);

    } catch (error: any) {
      addNotification(`Error al cargar justificantes: ${error.message}`, 'error');
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  }, [addNotification, lastVisible, filters]);

  useEffect(() => {
    const handler = setTimeout(() => {
        setLastVisible(undefined);
        setJustifications([]);
        fetchJustifications(false);
    }, 500); // Debounce de 500ms
    return () => clearTimeout(handler);
  }, [filters]);


  const handleOpenDetailModal = (justification: Justification) => {
    setSelectedJustification(justification);
    setIsDetailModalOpen(true);
  };

  // Esta función se ejecuta cuando el gerente hace clic en los botones de "Aprobar" o "Rechazar"
  const handleOpenConfirmModal = (justification: Justification, action: 'approve' | 'reject') => {
    setConfirmAction({ justification, action });
  };

  // Esta función se ejecuta SÓLO cuando se confirma la acción en el modal
  const executeJustificationProcessing = async () => {
    if (!confirmAction || !userData) return;

    const { action, justification } = confirmAction;
    
    setConfirmAction(null); // Cerramos el modal inmediatamente
    setIsDetailModalOpen(false);
    
    setIsProcessing(true);

    const newStatus = action === 'approve' ? JustificationStatus.APROBADO : JustificationStatus.RECHAZADO;
    const historyAction = action === 'approve' ? HISTORY_ACTIONS.APPROVE_JUSTIFICATION : HISTORY_ACTIONS.REJECT_JUSTIFICATION;
    const newShiftStatus = action === 'approve' ? ShiftStatus.AUSENCIA_JUSTIFICADA : ShiftStatus.FALTA_INJUSTIFICADA;

    try {
      await updateJustification(justification.id, {
        status: newStatus,
        reviewedBy: userData.id,
        reviewedByName: userData.name,
      });

      if (action === 'approve' && justification.shiftId) {
      await updateShift(justification.shiftId, { status: ShiftStatus.AUSENCIA_JUSTIFICADA });
    }

      await logUserAction(userData.id, userData.name, historyAction, { justificationId: justification.id });
      addNotification(`Justificante ${action === 'approve' ? 'aprobado' : 'rechazado'} con éxito.`, 'success');
      
      fetchJustifications();
    } catch (error: any) {
      addNotification(`Error al procesar: ${error.message}`, 'error');
    } finally {
      setIsProcessing(false);
    }
  };
  
  const getStatusBadge = (status: JustificationStatus) => {
    switch (status) {
      case JustificationStatus.PENDIENTE: return 'bg-yellow-100 text-yellow-800';
      case JustificationStatus.APROBADO: return 'bg-green-100 text-green-800';
      case JustificationStatus.RECHAZADO: return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (isLoading && justifications.length === 0) return <LoadingSpinner text="Cargando justificantes..." />;

  return (
    <div className="p-2 md:p-4 animate-fadeIn">
      <h2 className="text-2xl font-semibold text-gray-800 mb-6">Gestión de Justificantes</h2>
      
      <div className="mb-6 p-4 bg-gray-50 rounded-lg border grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label htmlFor="userName" className="block text-sm font-medium text-gray-700">Filtrar por Nombre</label>
            <input type="text" name="userName" id="userName" className="mt-1 w-full p-2 border rounded-md" placeholder="Nombre exacto..." value={filters.userName} onChange={handleFilterChange} />
          </div>
          <div>
            <label htmlFor="status" className="block text-sm font-medium text-gray-700">Filtrar por Estado</label>
            <select name="status" id="status" className="mt-1 w-full p-2 border rounded-md bg-white" value={filters.status} onChange={handleFilterChange}>
                <option value="">Todos</option>
                <option value={JustificationStatus.PENDIENTE}>Pendiente</option>
                <option value={JustificationStatus.APROBADO}>Aprobado</option>
                <option value={JustificationStatus.RECHAZADO}>Rechazado</option>
            </select>
          </div>
          <div>
            <label htmlFor="startDate" className="block text-sm font-medium text-gray-700">Desde</label>
            <input type="date" name="startDate" id="startDate" className="mt-1 w-full p-2 border rounded-md" value={filters.startDate} onChange={handleFilterChange} />
          </div>
          <div>
            <label htmlFor="endDate" className="block text-sm font-medium text-gray-700">Hasta</label>
            <input type="date" name="endDate" id="endDate" className="mt-1 w-full p-2 border rounded-md" value={filters.endDate} onChange={handleFilterChange} />
          </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <ul className="divide-y divide-gray-200">
          {justifications.map(just => (
            <li key={just.id} className="p-4 hover:bg-gray-50 flex justify-between items-center flex-wrap gap-2">
              <div>
                <p className="font-semibold text-amore-charcoal">{just.userName}</p>
                <p className="text-sm text-gray-600">Fecha de Falta: {format(just.dateOfAbsence.toDate(), 'P', { locale: es })}</p>
                <p className="text-xs text-gray-400">Enviado: {format(just.uploadedAt.toDate(), 'Pp', { locale: es })}</p>
              </div>
              <div className="flex items-center gap-4">
                <span className={`px-3 py-1 text-xs font-semibold rounded-full ${getStatusBadge(just.status)} capitalize`}>
                  {just.status.replace(/_/g, ' ')}
                </span>
                <Button onClick={() => handleOpenDetailModal(just)} size="sm" variant="light">Ver/Procesar</Button>
              </div>
            </li>
          ))}
        </ul>
        {justifications.length === 0 && !isLoading && <p className="text-center p-8 text-amore-gray">No se encontraron justificantes con los filtros aplicados.</p>}
      </div>

      {hasMore && !isLoading && (
        <div className="mt-4 text-center">
            <Button onClick={() => fetchJustifications(true)} variant="secondary">Cargar Más</Button>
        </div>
      )}

      {selectedJustification && isDetailModalOpen && (
        <Modal
          isOpen={isDetailModalOpen}
          onClose={() => setIsDetailModalOpen(false)}
          title="Revisar Justificante"
          size="lg"
          footer={
  <div className="flex justify-between items-center w-full">
    <Button variant="light" onClick={() => setIsDetailModalOpen(false)}>Cerrar</Button>
    {selectedJustification?.status === JustificationStatus.PENDIENTE && (
      <div className="flex gap-2">
        <Button variant="danger" onClick={() => handleOpenConfirmModal(selectedJustification, 'reject')}>Rechazar</Button>
        <Button variant="success" onClick={() => handleOpenConfirmModal(selectedJustification, 'approve')}>Aprobar</Button>
      </div>
    )}
  </div>
}
        >
          <div className="space-y-4">
            <p><strong>Empleado:</strong> {selectedJustification.userName}</p>
            <p><strong>Notas del empleado:</strong></p>
            <p className="text-sm bg-gray-50 p-3 rounded-md whitespace-pre-wrap">{selectedJustification.notes || "Sin notas adicionales."}</p>
            <div>
              <p><strong>Archivo adjunto:</strong></p>
              <a href={selectedJustification.fileUrl} target="_blank" rel="noopener noreferrer" className="text-amore-red underline hover:opacity-80">
                Ver archivo en nueva pestaña <i className="fas fa-external-link-alt ml-1"></i>
              </a>
            </div>
          </div>
        </Modal>
      )}

      {/* --- NUEVO MODAL DE CONFIRMACIÓN DINÁMICO --- */}
      {confirmAction && (
        <Modal 
          isOpen={!!confirmAction} 
          onClose={() => setConfirmAction(null)}
          title={`Confirmar ${confirmAction.action === 'approve' ? 'Aprobación' : 'Rechazo'}`}
        >
          <div className="p-4 text-center">
            <p className="text-lg text-gray-700">
              ¿Estás seguro de que quieres <strong>{confirmAction.action === 'approve' ? 'APROBAR' : 'RECHAZAR'}</strong> el justificante de 
              <strong className="block my-2 text-xl text-amore-red">{confirmAction.justification.userName}</strong>?
            </p>
            <div className="mt-6 flex justify-end gap-4">
              <Button onClick={() => setConfirmAction(null)} variant="light">Cancelar</Button>
              <Button onClick={executeJustificationProcessing} variant={confirmAction.action === 'approve' ? 'success' : 'danger'} isLoading={isProcessing}>
                Sí, {confirmAction.action === 'approve' ? 'Aprobar' : 'Rechazar'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default JustificationManagement;