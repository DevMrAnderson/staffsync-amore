
import React, { useState } from 'react';
import { Timestamp } from 'firebase/firestore';
import { useAuth } from '../../contexts/AuthContext';
import { uploadJustificationFile } from '../../services/storageService';
import { addJustification } from '../../services/firestoreService';
import { logUserAction } from '../../services/historyService';
import Modal from '../common/Modal';
import Button from '../common/Button';
import { useNotification } from '../../contexts/NotificationContext';
import { MAX_FILE_UPLOAD_SIZE_MB, MAX_FILE_UPLOAD_SIZE_BYTES, HISTORY_ACTIONS, DATE_FORMAT_INPUT_DATE } from '../../constants';
import { JustificationStatus } from '../../types'; // Import JustificationStatus
import { format } from 'date-fns';

interface UploadJustificationFormProps {
  isOpen: boolean;
  onClose: () => void;
}

const UploadJustificationForm: React.FC<UploadJustificationFormProps> = ({ isOpen, onClose }) => {
  const { user, userData } = useAuth();
  const { addNotification } = useNotification();
  
  const [file, setFile] = useState<File | null>(null);
  const [dateOfAbsence, setDateOfAbsence] = useState<string>(format(new Date(), DATE_FORMAT_INPUT_DATE));
  const [notes, setNotes] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const resetForm = () => {
    setFile(null);
    setDateOfAbsence(format(new Date(), DATE_FORMAT_INPUT_DATE));
    setNotes('');
    setLoading(false);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
       if (selectedFile.size > MAX_FILE_UPLOAD_SIZE_BYTES) {
        addNotification(`El archivo es demasiado grande. Maximo ${MAX_FILE_UPLOAD_SIZE_MB}MB.`, 'error');
        setFile(null);
        e.target.value = ''; // Clear the input
        return;
      }
      setFile(selectedFile);
    } else {
      setFile(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !dateOfAbsence || !user || !userData) {
      addNotification('Por favor, completa todos los campos requeridos y selecciona un archivo.', 'warning');
      return;
    }
    setLoading(true);
    try {
      const fileUrl = await uploadJustificationFile(user.uid, file);
      // Ensure dateOfAbsence is treated as local date then converted to Timestamp at start of day UTC for consistency
      const localDate = new Date(dateOfAbsence + 'T00:00:00'); // Treat as local time start of day
      const justificationData = {
        userId: user.uid,
        userName: userData.name,
        dateOfAbsence: Timestamp.fromDate(localDate),
        fileUrl,
        notes,
        status: JustificationStatus.PENDIENTE, // Use enum value
      };
      const justificationId = await addJustification(justificationData);
      await logUserAction(user.uid, userData.name, HISTORY_ACTIONS.UPLOAD_JUSTIFICATION, { 
        justificationId, 
        dateOfAbsence: dateOfAbsence, 
        fileName: file.name 
      });
      addNotification('Justificante subido con exito. Sera revisado por un gerente.', 'success');
      handleClose();
    } catch (error: any) {
      console.error("Error al subir justificante:", error);
      addNotification(`Error al subir justificante: ${error.message || 'Intentalo de nuevo.'}`, 'error');
      setLoading(false); // Keep modal open on error for correction
    }
  };
  
  const modalFooter = (
     <div className="flex justify-end space-x-2">
        <Button type="button" variant="light" onClick={handleClose} disabled={loading}>
          Cancelar
        </Button>
        <Button type="submit" form="justificationForm" variant="primary" isLoading={loading} disabled={loading || !file}>
          {loading ? 'Subiendo...' : 'Subir Justificante'}
        </Button>
      </div>
  );

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Subir Justificante de Falta" footer={modalFooter}>
      <form onSubmit={handleSubmit} id="justificationForm" className="space-y-4">
        <div>
          <label htmlFor="dateOfAbsence" className="block text-sm font-medium text-gray-700">
            Fecha de la Falta <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            id="dateOfAbsence"
            value={dateOfAbsence}
            onChange={(e) => setDateOfAbsence(e.target.value)}
            required
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
          />
        </div>
        <div>
          <label htmlFor="file" className="block text-sm font-medium text-gray-700">
            Archivo del Justificante (PDF, JPG, PNG - Max {MAX_FILE_UPLOAD_SIZE_MB}MB) <span className="text-red-500">*</span>
          </label>
          <input
            type="file"
            id="file"
            onChange={handleFileChange}
            accept=".pdf,.jpg,.jpeg,.png"
            required
            className="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer"
          />
           {file && <p className="text-xs text-gray-500 mt-1">{file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)</p>}
        </div>
        <div>
          <label htmlFor="notes" className="block text-sm font-medium text-gray-700">
            Notas Adicionales
          </label>
          <textarea
            id="notes"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            placeholder="Ej: Cita medica, emergencia familiar, etc. (Opcional)"
          />
        </div>
      </form>
    </Modal>
  );
};

export default UploadJustificationForm;