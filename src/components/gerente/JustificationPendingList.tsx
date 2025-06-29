import React, { useState, useEffect } from 'react';
import { Justification, JustificationStatus } from '../../types';
import Button from '../common/Button';
import LoadingSpinner from '../common/LoadingSpinner';
import Modal from '../common/Modal';
import { useNotification } from '../../contexts/NotificationContext';
import { updateJustification, onPendingJustificationsSnapshot } from '../../services/firestoreService';
import { logUserAction } from '../../services/historyService';
import { useAuth } from '../../contexts/AuthContext';
import { format } from 'date-fns';
import { es } from 'date-fns/locale/es';
import { DATE_FORMAT_SPA_DATE_ONLY, DATE_FORMAT_SPA_DATETIME, HISTORY_ACTIONS } from '../../constants';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../services/firebase';
import JustificationHistory from './JustificationHistory'; // Importamos el nuevo componente
import JustificationPendingList from './JustificationPendingList';

const JustificationPendingList: React.FC = () => {
  const { addNotification } = useNotification();
  const { userData } = useAuth();

  const [justifications, setJustifications] = useState<Justification[]>([]);
  const [loadingJustifications, setLoadingJustifications] = useState(true);
  
  const [selectedJustification, setSelectedJustification] = useState<Justification | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [reviewNotes, setReviewNotes] = useState('');
  const [processingAction, setProcessingAction] = useState(false);

  useEffect(() => {
    setLoadingJustifications(true);
    const unsubscribe = onPendingJustificationsSnapshot((fetchedJustifications) => {
      setJustifications(fetchedJustifications);
      setLoadingJustifications(false);
    });
    return () => unsubscribe();
  }, []);

  const handleOpenJustificationModal = (justification: Justification) => {
    setSelectedJustification(justification);
    setReviewNotes(justification.reviewNotes || ''); // Load existing notes if any
    setIsModalOpen(true);
  };

  const handleProcessJustification = async (approved: boolean) => {
  if (!selectedJustification || !userData) {
    addNotification("No se puede procesar: datos incompletos.", "error");
    return;
  }
  setProcessingAction(true);
  try {
    const newStatus = approved ? JustificationStatus.APROBADO : JustificationStatus.RECHAZADO;

    // --- PASO 1: Actualiza el justificante (ESTO YA LO TENÍAS) ---
    await updateJustification(selectedJustification.id, {
      status: newStatus,
      reviewedBy: userData.id,
      reviewedByName: userData.name,
      reviewNotes: reviewNotes.trim(),
      createdAt: serverTimestamp(), // Añadimos la fecha de resolución
    });

    // --- PASO 2: Guarda el evento en el historial (ESTO YA LO TENÍAS) ---
    await logUserAction(userData.id, userData.name, 
      approved ? HISTORY_ACTIONS.APPROVE_JUSTIFICATION : HISTORY_ACTIONS.REJECT_JUSTIFICATION, 
      { 
        justificationId: selectedJustification.id, 
        employeeId: selectedJustification.userId,
        employeeName: selectedJustification.userName,
        notes: reviewNotes.trim()
      }
    );

    // --- PASO 3: Crear la notificación para el empleado (ESTA ES LA PARTE NUEVA) ---
    await addDoc(collection(db, 'notifications'), {
        userId: selectedJustification.userId, // Para quién es la notificación
        title: `Justificante ${approved ? 'Aprobado' : 'Rechazado'}`,
        message: reviewNotes.trim() || `Tu justificante para la fecha de ausencia ha sido ${approved ? 'aprobado' : 'rechazado'}.`,
        isRead: false,
        createdAt: serverTimestamp(),
        relatedDocId: selectedJustification.id, // ID del justificante relacionado
        type: 'justification_resolution'
    });

    addNotification(`Justificante ${approved ? 'aprobado' : 'rechazado'} exitosamente.`, 'success');
    setIsModalOpen(false);
    setSelectedJustification(null);
  } catch (error: any) {
    addNotification(`Error al procesar el justificante: ${error.message}`, "error");
  } finally {
    setProcessingAction(false);
  }
};

  if (loadingJustifications) return <div className="p-4"><LoadingSpinner text="Cargando justificantes pendientes..." /></div>;

  return (
    <div className="p-2 md:p-4 animate-fadeIn">
      <h2 className="text-2xl font-semibold text-gray-800 mb-6">Gestion de Justificantes Pendientes</h2>
      {justifications.length === 0 ? (
        <p className="text-gray-600 italic text-center py-8">No hay justificantes pendientes de revision.</p>
      ) : (
        <div className="space-y-4">
          {justifications.map(just => (
            <div key={just.id} className="bg-white p-4 rounded-lg shadow-md border-l-4 border-orange-500 hover:shadow-lg transition-shadow">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center">
                <div>
                  <p className="font-semibold text-gray-700">Empleado: <span className="font-normal">{just.userName || just.userId}</span></p>
                  <p className="text-sm text-gray-600">Fecha de Ausencia: {just.dateOfAbsence ? format(just.dateOfAbsence.toDate(), DATE_FORMAT_SPA_DATE_ONLY, { locale: es }) : 'N/A'}</p>
                  <p className="text-xs text-gray-500">Subido: {just.uploadedAt ? format(just.uploadedAt.toDate(), DATE_FORMAT_SPA_DATETIME, { locale: es }) : 'N/A'}</p>
                  {just.notes && <p className="text-xs text-gray-500 mt-1 italic">Notas Empleado: "{just.notes}"</p>}
                </div>
                <Button onClick={() => handleOpenJustificationModal(just)} size="sm" className="mt-2 sm:mt-0" icon={<i className="fas fa-search"></i>}>
                  Revisar
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedJustification && (
        <Modal 
          isOpen={isModalOpen} 
          onClose={() => setIsModalOpen(false)} 
          title="Revisar Justificante" 
          size="md"
          footer={
            <div className="flex flex-wrap justify-end gap-2">
              <Button onClick={() => handleProcessJustification(true)} variant="success" isLoading={processingAction} disabled={processingAction}>Aprobar</Button>
              <Button onClick={() => handleProcessJustification(false)} variant="danger" isLoading={processingAction} disabled={processingAction}>Rechazar</Button>
              <Button onClick={() => setIsModalOpen(false)} variant="light" disabled={processingAction}>Cancelar</Button>
            </div>
          }
        >
          <div className="space-y-3">
            <p><strong>Empleado:</strong> {selectedJustification.userName}</p>
            <p><strong>Fecha de Ausencia:</strong> {selectedJustification.dateOfAbsence ? format(selectedJustification.dateOfAbsence.toDate(), DATE_FORMAT_SPA_DATE_ONLY, { locale: es }): 'N/A'}</p>
            {selectedJustification.notes && <p><strong>Notas del Empleado:</strong> <span className="italic">{selectedJustification.notes}</span></p>}
            <p>
              <strong>Archivo Adjunto:</strong> 
              <a 
                href={selectedJustification.fileUrl} 
                target="_blank" rel="noopener noreferrer" 
                className="text-blue-600 hover:underline ml-2 font-medium"
              >
                Ver Archivo <i className="fas fa-external-link-alt text-xs"></i>
              </a>
            </p>
            
            <div>
              <label htmlFor="reviewNotes" className="block text-sm font-medium text-gray-700 mb-1">
                Notas de Revision (Gerente):
              </label>
              <textarea
                id="reviewNotes"
                rows={3}
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                placeholder="Notas opcionales sobre la decision..."
              />
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default JustificationPendingList;
