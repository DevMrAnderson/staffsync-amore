// En: src/components/dueno/AnnouncementManager.tsx
import React, { useState, useEffect } from 'react';
import { useNotification } from '../../contexts/NotificationContext';
import { createAnnouncement, getAllUsersByRole } from '../../services/firestoreService';
import Button from '../common/Button';
import Modal from '../common/Modal';
import { httpsCallable, functions } from 'firebase/functions';
import { functions } from '../../services/firebase';
import { UserRole, User } from '../../types';
import { useMemo } from 'react';

const AnnouncementManager: React.FC = () => {
  const { addNotification } = useNotification();
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [employees, setEmployees] = useState<User[]>([]);
  const [isUserListVisible, setIsUserListVisible] = useState(false);
  const [recipientPreview, setRecipientPreview] = useState<string[]>([]);
  const [filters, setFilters] = useState({
  target: 'all', // Opciones: 'all', 'role', 'activeShift', 'specificShift', 'individual'
  role: '',
  shiftId: '',
  userName: '',
});


  // --- AÑADE ESTA LÓGICA DE FILTRADO ---
  const filteredEmployees = useMemo(() => {
    const searchTerm = filters.userName.trim().toLowerCase();
    if (!searchTerm) {
      return []; // Si no hay nada escrito, no mostramos a nadie
    }
    return employees.filter(emp => 
      emp.name.toLowerCase().includes(searchTerm)
    );
  }, [filters.userName, employees]);


  // --- AÑADE ESTE USEEFFECT PARA CARGAR LOS EMPLEADOS ---
  useEffect(() => {
    // Solo cargamos los usuarios una vez, cuando el componente se monta
    getAllUsersByRole()
      .then(setEmployees)
      .catch(err => addNotification("No se pudo cargar la lista de empleados.", "error"));
  }, []); // El array vacío asegura que solo se ejecute una vez


  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
  setFilters(prev => ({ ...prev, [e.target.name]: e.target.value }));
};



  /**
   * Esta función se ejecuta cuando se envía el formulario.
   * Su única tarea es abrir el modal de confirmación.
   */
  // Reemplaza tu handleSubmit actual con este
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!title || !message) {
    addNotification("El título y el mensaje no pueden estar vacíos.", "warning");
    return;
  }
  
  setLoading(true); // Mostramos que estamos "cargando" la vista previa
  try {
    // 1. Llamamos a la nueva función para obtener la lista de destinatarios
    const getRecipientsCallable = httpsCallable(functions, 'getAnnouncementRecipients');
    const result = await getRecipientsCallable({ filters });
    const data = result.data as { userNames: string[] };

    if (data.userNames.length === 0) {
      addNotification("Ningún usuario coincide con los filtros seleccionados.", "info");
      setLoading(false);
      return;
    }
    
    // 2. Guardamos la lista en nuestro estado
    setRecipientPreview(data.userNames);
    // 3. Abrimos el modal de confirmación
    setIsConfirmModalOpen(true);

  } catch (error: any) {
    addNotification(`Error al obtener destinatarios: ${error.message}`, 'error');
  } finally {
    setLoading(false);
  }
};

  /**
   * Esta función se ejecuta solo cuando se hace clic en "Confirmar" en el modal.
   * Contiene la lógica para guardar en la base de datos.
   */
  const executeSend = async () => {
    setIsConfirmModalOpen(false);
    setLoading(true);
    try {
      // Llamamos a nuestra nueva Cloud Function con los filtros
      const sendAnnouncementCallable = httpsCallable(functions, 'sendTargetedAnnouncement');
      await sendAnnouncementCallable({ title, message, filters });

      addNotification("¡Anuncio enviado con éxito!", "success");
      setTitle('');
      setMessage('');
      // Aquí podrías resetear los filtros también si quieres
      setFilters({      target: 'all', role: '', shiftId: '', userName: '' });
      // Podrías resetear los filtros también si quieres

    } catch (error: any) {
      addNotification(`Error al enviar el anuncio: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 bg-white rounded-xl shadow-lg">
      <h2 className="text-2xl font-bold text-amore-charcoal mb-4">Enviar Anuncio Global</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="title" className="block text-sm font-medium text-gray-700">Título</label>
          <input
            type="text" id="title" value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full p-2 border rounded-md"
            placeholder="Ej: Junta General Obligatoria"
          />
        </div>
        <div>
          <label htmlFor="message" className="block text-sm font-medium text-gray-700">Mensaje</label>
          <textarea
            id="message" value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={5} className="mt-1 w-full p-2 border rounded-md"
            placeholder="Escribe aquí los detalles del anuncio..."
          />
        </div>

        {/* --- NUEVA SECCIÓN DE FILTROS --- */}
  <div className="p-4 border-t">
    <h3 className="font-semibold text-lg text-amore-charcoal mb-2">Destinatarios del Anuncio</h3>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div>
        <label htmlFor="target" className="block text-sm font-medium text-gray-700">Enviar a:</label>
        <select name="target" value={filters.target} onChange={handleFilterChange} className="mt-1 w-full p-2 border rounded-md">
          <option value="all">Todos los Usuarios</option>
          <option value="role">Un Rol Específico</option>
          <option value="activeShift">Solo a los que tienen turno ACTIVO AHORA</option>
          <option value="individual">Un Usuario Específico</option>
        </select>
      </div>

      {/* --- Controles Condicionales --- */}
      {filters.target === 'role' && (
        <div>
          <label htmlFor="role" className="block text-sm font-medium text-gray-700">Selecciona el Rol:</label>
          <select name="role" value={filters.role} onChange={handleFilterChange} className="mt-1 w-full p-2 border rounded-md capitalize">
            {/* Aquí necesitarás mapear sobre tu enum UserRole */}
            <option value="">-- Roles --</option>
            {Object.values(UserRole).map(r => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}
          </select>
        </div>
      )}
      {filters.target === 'individual' && (
  <div className="relative">
    <label htmlFor="userName" className="block text-sm font-medium text-gray-700">Buscar por Nombre:</label>
    <input
      type="text"
      name="userName"
      value={filters.userName}
      onChange={handleFilterChange}
      className="mt-1 w-full p-2 border rounded-md"
      placeholder="Escribe para buscar un empleado..."
      autoComplete="off"
      onFocus={() => setIsUserListVisible(true)}
      onBlur={() => {
        // Usamos un pequeño delay para permitir que el clic en la lista se registre
    // antes de que desaparezca. Es un truco estándar de UX.
    setTimeout(() => {
      setIsUserListVisible(false);
    }, 150);
  }}
    />
    {/* --- LISTA DE RESULTADOS --- */}
    {isUserListVisible && filteredEmployees.length > 0 && (
      <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-48 overflow-y-auto">
        {filteredEmployees.map(emp => (
          <div
            key={emp.id}
            onClick={() => {
              // Al hacer clic, actualizamos el filtro con el nombre completo y cerramos la lista
              handleFilterChange({ target: { name: 'userName', value: emp.name } } as any);
              setIsUserListVisible(false); // <-- AÑADIDO: Oculta la lista al seleccionar
            }}
            className="p-2 hover:bg-amore-red-soft cursor-pointer"
          >
            {emp.name}
          </div>
        ))}
      </div>
    )}
  </div>
)}
    </div>
  </div>

  <div className="text-right">
    <Button type="submit" isLoading={loading} variant="primary">
      {loading ? "Enviando..." : "Enviar Anuncio"}
    </Button>
  </div>
</form>


      {/* --- MODAL DE CONFIRMACIÓN PARA ENVIAR ANUNCIO --- */}
      <Modal
        isOpen={isConfirmModalOpen}
        onClose={() => setIsConfirmModalOpen(false)}
        title="Confirmar Envío de Anuncio"
      >
        <div className="p-4">
          {/* --- VISTA PREVIA DEL ANUNCIO --- */}
    <h4 className="font-bold text-lg text-amore-charcoal mb-2">Revisa el anuncio:</h4>
    <div className="my-2 p-3 bg-gray-50 rounded-md border max-h-48 overflow-y-auto">
      <p className="font-semibold text-amore-charcoal">{title}</p>
      <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{message}</p>
    </div>
    {/* ----------------------------------- */}
          {/* --- NUEVA SECCIÓN DE DESTINATARIOS --- */}
    <div className="mt-4 pt-4 border-t">
      <h4 className="font-semibold text-amore-charcoal mb-2">
        Se enviará a <span className="font-bold text-amore-red">{recipientPreview.length}</span> usuario(s):
      </h4>
      <div className="max-h-32 overflow-y-auto bg-gray-50 p-2 rounded-md text-sm text-gray-600">
        {recipientPreview.join(', ')}
      </div>
    </div>
    
    <p className="text-center text-red-600 font-semibold mt-4">
      ¿Estás seguro de que quieres continuar?
    </p>
    <div className="mt-6 flex justify-end gap-4">
      <Button onClick={() => setIsConfirmModalOpen(false)} variant="light">
        Cancelar
      </Button>
      <Button onClick={executeSend} variant="primary">
        Sí, Enviar a Todos
      </Button>
    </div>
  </div>
</Modal>


    </div>
  );
};

export default AnnouncementManager;