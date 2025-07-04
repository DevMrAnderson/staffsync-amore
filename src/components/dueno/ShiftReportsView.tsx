import React, { useState, useEffect, useCallback } from 'react';
import { useNotification } from '../../contexts/NotificationContext';
import { ShiftReport } from '../../types';
import { getShiftReportsPage } from '../../services/firestoreService';
import Button from '../common/Button';
import Modal from '../common/Modal';
import LoadingSpinner from '../common/LoadingSpinner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale/es';
import { DATE_FORMAT_SPA_DATETIME } from '../../constants';
import { DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';

const ITEMS_PER_PAGE = 10;

const ShiftReportsView: React.FC = () => {
  const { addNotification } = useNotification();
  const [reports, setReports] = useState<ShiftReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastVisible, setLastVisible] = useState<QueryDocumentSnapshot<DocumentData> | undefined>(undefined);
  const [hasMore, setHasMore] = useState(true);
  const [totalReports, setTotalReports] = useState(0);
  const [selectedReport, setSelectedReport] = useState<ShiftReport | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const fetchReports = useCallback(async (loadMore = false) => {
    setIsLoading(true);
    try {
      const { entries, nextLastVisibleDoc, totalCount } = await getShiftReportsPage(ITEMS_PER_PAGE, loadMore ? lastVisible : undefined);
      setReports(prev => loadMore ? [...prev, ...entries] : entries);
      setLastVisible(nextLastVisibleDoc);
      setTotalReports(totalCount);
      setHasMore(loadMore ? (reports.length + entries.length < totalCount) : entries.length < totalCount);
    } catch (error: any) {
      addNotification(`Error al cargar los reportes: ${error.message}`, 'error');
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  }, [addNotification, lastVisible, reports.length]);

  useEffect(() => {
    fetchReports();
  }, []); 

  const handleViewDetails = (report: ShiftReport) => {
    setSelectedReport(report);
    setIsModalOpen(true);
  };

  if (isLoading && reports.length === 0) return <LoadingSpinner text="Cargando reportes de turno..." />;

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-semibold text-amore-charcoal">Reportes de Turno ({totalReports})</h3>
      </div>
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <ul className="divide-y divide-gray-200">
          {reports.map(report => {
            const hasSnapshot = report.checklistSnapshot && report.checklistSnapshot.length > 0;
  const completedCount = hasSnapshot 
    ? report.checklistSnapshot.filter(item => item.done).length
    : Object.values(report.completedTasks || {}).filter(Boolean).length;
  
  const totalTasks = hasSnapshot 
    ? report.checklistSnapshot.length 
    : Object.keys(report.completedTasks || {}).length;
            return (
              <li key={report.id} className="p-4 hover:bg-gray-50 flex items-center justify-between flex-wrap gap-2">
                <div>
                  <p className="font-semibold text-amore-charcoal">
                    {report.shiftTypeName || 'Reporte de Turno'}
                  </p>
                  <p className="text-sm text-amore-gray">
                    Por: {report.managerName || 'Desconocido'}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    {format(report.lastUpdated.toDate(), DATE_FORMAT_SPA_DATETIME, { locale: es })}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                    <div className="text-right">
                        <p className="font-semibold text-lg text-green-600">{completedCount}/{totalTasks}</p>
                        <p className="text-xs text-gray-500">Tareas completadas</p>
                    </div>
                    <Button onClick={() => handleViewDetails(report)} variant="light" size="sm">Ver Detalles</Button>
                </div>
              </li>
            )
          })}
        </ul>
        {reports.length === 0 && !isLoading && <p className="text-center p-8 text-amore-gray">No se ha encontrado ningún reporte de turno.</p>}
      </div>

      {hasMore && !isLoading && (
        <div className="mt-4 text-center"><Button onClick={() => fetchReports(true)} variant="secondary">Cargar Más</Button></div>
      )}

      {selectedReport && isModalOpen && (
        <Modal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title={`Detalle del Reporte`}
          size="lg"
          footer={<div className="flex justify-end"><Button variant="light" onClick={() => setIsModalOpen(false)}>Cerrar</Button></div>}
        >
          <div className="space-y-4">
            <div>
                <h4 className="font-semibold text-amore-charcoal">Resumen</h4>
                <p className="text-sm text-amore-gray">Turno: {selectedReport.shiftTypeName || 'No especificado'}</p>
                <p className="text-sm text-amore-gray">Gerente: {selectedReport.managerName || selectedReport.managerId}</p>
                <p className="text-sm text-amore-gray">Fecha: {format(selectedReport.lastUpdated.toDate(), DATE_FORMAT_SPA_DATETIME, { locale: es })}</p>
            </div>
            <div className="border-t pt-4">
  <h4 className="font-semibold text-amore-charcoal mb-2">Checklist</h4>
  <div className="space-y-2">
    {/* --- LÓGICA CORREGIDA --- */}
    {/* Primero, revisamos si el reporte tiene el nuevo 'checklistSnapshot' */}
    {selectedReport.checklistSnapshot ? (
      // Si es un reporte NUEVO, iteramos sobre el snapshot
      selectedReport.checklistSnapshot.map((item, index) => (
        <div key={index} className="flex items-center">
          <input type="checkbox" checked={item.done} readOnly disabled className="h-4 w-4 rounded cursor-not-allowed"/>
          <label className={`ml-2 text-sm ${item.done ? 'text-gray-500 line-through' : 'text-amore-charcoal'}`}>
            {item.task}
          </label>
        </div>
      ))
    ) : (
      // Si es un reporte ANTIGUO, mantenemos la lógica vieja para compatibilidad
      <>
        <p className="p-2 text-xs bg-yellow-100 text-yellow-800 rounded-md mb-3 italic">
          Aviso: Este es un reporte antiguo y podría mostrar tareas desactualizadas.
        </p>
        {Object.entries(selectedReport.completedTasks || {}).map(([task, isDone]) => (
          <div key={task} className="flex items-center">
            <input type="checkbox" checked={isDone} readOnly disabled className="h-4 w-4 rounded cursor-not-allowed"/>
            <label className={`ml-2 text-sm ${isDone ? 'text-gray-500 line-through' : 'text-amore-charcoal'}`}>{task}</label>
          </div>
        ))}
      </>
    )}
    {/* ------------------------- */}
  </div>
</div>
            {selectedReport.notes && (
                <div className="border-t pt-4">
                    <h4 className="font-semibold text-amore-charcoal mb-2">Notas del Turno</h4>
                    <p className="text-sm bg-gray-50 p-3 rounded-md whitespace-pre-wrap">{selectedReport.notes}</p>
                </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
};

export default ShiftReportsView;