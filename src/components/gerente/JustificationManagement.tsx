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

  const handleProcessJustification = async (approved: boolean) => {
    if (!selectedJustification || !userData) return;

    setIsProcessing(true);
    const newStatus = approved ? JustificationStatus.APROBADO : JustificationStatus.RECHAZADO;
    const action = approved ? HISTORY_ACTIONS.APPROVE_JUSTIFICATION : HISTORY_ACTIONS.REJECT_JUSTIFICATION;
    const newShiftStatus = approved ? ShiftStatus.AUSENCIA_JUSTIFICADA : ShiftStatus.FALTA_INJUSTIFICADA;

    try {
      await updateJustification(selectedJustification.id, {
        status: newStatus,
        reviewedBy: userData.id,
        reviewedByName: userData.name,
      });

      if (selectedJustification.shiftId) {
        await updateShift(selectedJustification.shiftId, { status: newShiftStatus });
      }

      await logUserAction(userData.id, userData.name, action, { justificationId: selectedJustification.id });
      addNotification(`Justificante ${approved ? 'aprobado' : 'rechazado'} con éxito.`, 'success');
      
      setIsDetailModalOpen(false);
      fetchJustifications(); // Recargamos la lista para ver los cambios
    } catch (error: any) {
      addNotification(`Error al procesar el justificante: ${error.message}`, 'error');
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
            <div className="flex justify-end gap-2">
              <Button variant="light" onClick={() => setIsDetailModalOpen(false)} disabled={isProcessing}>Cerrar</Button>
              <Button variant="danger" onClick={() => handleProcessJustification(false)} isLoading={isProcessing} disabled={selectedJustification.status !== JustificationStatus.PENDIENTE || isProcessing}>Rechazar</Button>
              <Button variant="success" onClick={() => handleProcessJustification(true)} isLoading={isProcessing} disabled={selectedJustification.status !== JustificationStatus.PENDIENTE || isProcessing}>Aprobar</Button>
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
    </div>
  );
};

export default JustificationManagement;