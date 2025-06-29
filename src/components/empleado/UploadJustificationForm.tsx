// Ruta del archivo: src/components/empleado/UploadJustificationForm.tsx

import React, { useState, useRef, ChangeEvent, FormEvent } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useNotification } from '../../contexts/NotificationContext';
import { uploadJustificationFile } from '../../services/storageService';
import { collection, addDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
// ¡IMPORTANTE! Verifica que esta ruta a tu archivo de config de Firebase sea la correcta.
// La encontramos en un paso anterior.
import { db } from '../../services/firebase'; 
import Button from '../common/Button';
import { JustificationStatus } from '../../types';

// Definimos los props que el componente puede recibir.
// Esto es útil si usas este formulario dentro de un Modal que necesita ser cerrado.
interface UploadJustificationFormProps {
  onSuccess?: () => void;
}
const UploadJustificationForm: React.FC<UploadJustificationFormProps> = ({ onSuccess }) => {

   // --- CORRECCIÓN FINAL: ORDEN DE DECLARACIÓN ---

  // 1. DECLARAMOS TODOS LOS ESTADOS Y HOOKS PRIMERO
  const { user, userData } = useAuth();
  const { addNotification } = useNotification();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [notes, setNotes] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Estados para los menús desplegables. Es crucial declararlos ANTES de usarlos.
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [month, setMonth] = useState(String(new Date().getMonth() + 1));
  const [day, setDay] = useState(String(new Date().getDate()));
  
  // 2. AHORA CALCULAMOS LOS VALORES DERIVADOS, ya que 'year' y 'month' existen.
  const years = [year, String(Number(year) - 1)];
  const months = Array.from({ length: 12 }, (_, i) => ({
    value: String(i + 1),
    label: new Date(2000, i).toLocaleString('es-MX', { month: 'long' }),
  }));
  const daysInMonth = new Date(Number(year), Number(month), 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => String(i + 1));
  

  /**
   * Esta función se ejecuta cada vez que el usuario elige un archivo de su computadora.
   */
  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      // Si el usuario selecciona un archivo, lo guardamos en nuestro estado.
      setSelectedFile(e.target.files[0]);
    } else {
      // Si cancela, nos aseguramos de que el estado esté limpio.
      setSelectedFile(null);
    }
  };

  /**
   * Esta función se ejecuta cuando el usuario envía el formulario.
   */
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    
    // Validaciones iniciales.
    if (!selectedFile) {
      addNotification('Por favor, selecciona un archivo.', 'warning');
      return;
    }

    if (!user || !userData) {
      addNotification('Error de autenticación. Por favor, inicia sesión de nuevo.', 'error');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // 1. Subimos el archivo a Firebase Storage.
      // La función nos devuelve la URL de descarga y el nombre del archivo.
      const { downloadURL, fileName } = await uploadJustificationFile(selectedFile, user.uid);

      // --- CORRECCIÓN DE FECHA ---
      // Reconstruimos la fecha a partir de los estados separados
      const formattedMonth = month.padStart(2, '0');
      const formattedDay = day.padStart(2, '0');
      // La "T12:00:00" evita problemas con zonas horarias
      const fullDateString = `${year}-${formattedMonth}-${formattedDay}T12:00:00`;
      // --- FIN DE LA CORRECCIÓN DE FECHA ---

      // 2. Creamos un nuevo documento en la colección "justifications" en Firestore.
      const justificationsCollection = collection(db, 'justifications');
      await addDoc(justificationsCollection, {
        userId: user.uid, // Tu panel usa 'userId'
        userName: userData.name || 'Nombre no disponible',
        fileUrl: downloadURL,
        fileName: fileName,
        notes: notes,
        status: JustificationStatus.PENDIENTE, // Tu enum probablemente usa 'pending'
        dateOfAbsence: Timestamp.fromDate(new Date(fullDateString)),
        uploadedAt: serverTimestamp(), // Tu panel ordena por 'uploadedAt'
      });

      // 3. Damos feedback de éxito al usuario.
      addNotification('Justificante enviado para revisión con éxito.', 'success');
      
      // 4. Limpiamos el formulario.
      const today = new Date();
      setSelectedFile(null);
      setNotes('');
      // Reseteamos la fecha a hoy
      setDay(String(today.getDate()));
      setMonth(String(today.getMonth() + 1));
      setYear(String(today.getFullYear()));

      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      
      onSuccess?.();

    } catch (err) {
      // Si algo falla, capturamos el error y se lo mostramos al usuario.
      const errorMessage = err instanceof Error ? err.message : 'Ocurrió un error desconocido.';
      setError(`Error al subir justificante: ${errorMessage}`);
      addNotification(`Error al subir justificante: ${errorMessage}`, 'error');
      console.error("Error al subir justificante:", err);
    } finally {
      // 6. Pase lo que pase, dejamos de mostrar el estado de "cargando".
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="p-4 space-y-6 bg-white rounded-lg">
      <div>
        <label className="block text-sm font-medium text-gray-700">
          Fecha de la Ausencia
        </label>
        <div className="mt-1 grid grid-cols-3 gap-3">
          {/* Día */}
          <select id="day" value={day} onChange={(e) => setDay(e.target.value)} className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500">
            {days.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          {/* Mes */}
          <select id="month" value={month} onChange={(e) => setMonth(e.target.value)} className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500">
            {months.map(m => <option key={m.value} value={m.value} className="capitalize">{m.label}</option>)}
          </select>
          {/* Año */}
          <select id="year" value={year} onChange={(e) => setYear(e.target.value)} className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500">
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label htmlFor="justification-file" className="block text-sm font-medium text-gray-700 mb-2">
          Seleccionar archivo de justificante
        </label>
        <div className="mt-1">
          <input
            id="justification-file"
            name="justification-file"
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-100 file:text-blue-700 hover:file:bg-blue-200 cursor-pointer"
          />
        </div>
        <p className="mt-2 text-xs text-gray-500">Puedes subir archivos PDF, PNG, JPG.</p>
      </div>

      {selectedFile && (
        <div className="p-2 bg-gray-50 rounded-md">
          <p className="text-sm font-medium text-gray-700">
            Archivo seleccionado: <span className="text-gray-900">{selectedFile.name}</span>
          </p>
        </div>
      )}
      
      <div>
        <label htmlFor="justification-notes" className="block text-sm font-medium text-gray-700">
          Notas (Opcional)
        </label>
        <div className="mt-1">
          <textarea
            id="justification-notes"
            name="justification-notes"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            placeholder="Añade cualquier información relevante sobre tu ausencia o justificante."
          />
        </div>
      </div>

      {error && <p className="text-sm text-red-600 font-medium text-center">{error}</p>}

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