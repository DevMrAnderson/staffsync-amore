import React, { useState, useRef, ChangeEvent, FormEvent } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useNotification } from '../../contexts/NotificationContext';
import { uploadJustificationFile } from '../../services/storageService';
import { collection, addDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from '../../services/firebase'; 
import { updateShift } from '../../services/firestoreService';
import { FirebaseCollections } from '../../constants';
import Button from '../common/Button';
import { JustificationStatus, ShiftStatus } from '../../types';
import { format } from 'date-fns';
import { es } from 'date-fns/locale/es';

interface UploadJustificationFormProps {
  shiftId: string; // Recibimos el ID del turno que se justifica
  dateOfAbsence: Date; // Recibimos la fecha exacta de la falta
  onSuccess?: () => void;
}

const UploadJustificationForm: React.FC<UploadJustificationFormProps> = ({ shiftId, dateOfAbsence, onSuccess }) => {
  const { user, userData } = useAuth();
  const { addNotification } = useNotification();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [notes, setNotes] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedFile || !user || !userData) {
      addNotification('Por favor, selecciona un archivo.', 'warning');
      return;
    }
    setIsLoading(true);

    try {
      // 1. Subir el archivo a Storage
      const { downloadURL } = await uploadJustificationFile(selectedFile, user.uid);

      // 2. Crear el documento de justificación en Firestore
      const justificationsCollection = collection(db, FirebaseCollections.JUSTIFICATIONS);
      await addDoc(justificationsCollection, {
        userId: user.uid,
        userName: userData.name,
        shiftId: shiftId, // <-- GUARDAMOS EL ID DEL TURNO
        fileUrl: downloadURL, imageurl: downloadURL, // Usamos el mismo URL para ambos campos
        notes: notes,
        status: JustificationStatus.PENDIENTE,
        dateOfAbsence: Timestamp.fromDate(dateOfAbsence),
        uploadedAt: serverTimestamp(),        
      });

      // 3. Actualizar el estado del turno original
      await updateShift(shiftId, { status: ShiftStatus.JUSTIFICACION_PENDIENTE });

      // No necesitamos la notificación aquí, la manejaremos en el EmpleadoDashboard
      
      // 4. Limpiar formulario y llamar a onSuccess para cerrar el modal
      setSelectedFile(null);
      setNotes('');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      onSuccess?.();

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Ocurrió un error desconocido.';
      addNotification(`Error al subir justificante: ${errorMessage}`, 'error');
      console.error("Error al subir justificante:", err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="p-4 space-y-6">
      <div>
        <label className="block text-sm font-medium text-gray-700">
          Fecha de la Falta a Justificar
        </label>
        {/* Mostramos la fecha automáticamente, no dejamos que el usuario la cambie */}
        <p className="mt-1 text-lg font-semibold text-amore-charcoal">
          {format(dateOfAbsence, 'EEEE, d \'de\' MMMM \'de\' yyyy', { locale: es })}
        </p>
      </div>
      <div>
        <label htmlFor="justification-file" className="block text-sm font-medium text-gray-700 mb-2">
          Seleccionar archivo de justificante
        </label>
        <input 
          id="justification-file" 
          type="file" 
          ref={fileInputRef} 
          onChange={handleFileChange} 
          required 
          className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:font-semibold file:bg-red-50 file:text-amore-red hover:file:bg-red-100 cursor-pointer"
        />
        <p className="mt-2 text-xs text-gray-500">Puedes subir PDF, PNG, JPG.</p>
      </div>
      
      <div>
        <label htmlFor="justification-notes" className="block text-sm font-medium text-gray-700">
          Notas (Opcional)
        </label>
        <textarea id="justification-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm" placeholder="Añade información relevante sobre tu ausencia..."/>
      </div>

      <div className="flex justify-end pt-4">
        <Button 
          type="submit" 
          isLoading={isLoading} 
          disabled={isLoading || !selectedFile}
          variant="primary"
          size="lg"
        >
          {isLoading ? 'Enviando...' : 'Enviar Justificante'}
        </Button>
      </div>
    </form>
  );
};

export default UploadJustificationForm;