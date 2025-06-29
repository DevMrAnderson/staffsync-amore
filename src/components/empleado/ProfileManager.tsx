import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useNotification } from '../../contexts/NotificationContext';
import { updateUser } from '../../services/firestoreService';
import Button from '../common/Button';
import LoadingSpinner from '../common/LoadingSpinner';

const ProfileManager: React.FC = () => {
  const { user, userData } = useAuth();
  const { addNotification } = useNotification();

  // Estados para manejar los campos del formulario
  const [preferences, setPreferences] = useState('');
  const [availability, setAvailability] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Cuando los datos del usuario cargan, llenamos el formulario
  useEffect(() => {
    if (userData) {
      setPreferences(userData.schedulePreferences || '');
      setAvailability(userData.availabilityNotes || '');
    }
  }, [userData]);

  // Función que se ejecuta al guardar el formulario
  const handleSaveChanges = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      addNotification("No se puede guardar, no estás autenticado.", "error");
      return;
    }

    setIsLoading(true);
    try {
      // Creamos el objeto con los datos a actualizar
      const dataToUpdate = {
        schedulePreferences: preferences,
        availabilityNotes: availability,
      };

      // Llamamos a la función del servicio para actualizar en Firestore
      await updateUser(user.uid, dataToUpdate);

      addNotification("Perfil actualizado con éxito.", "success");
    } catch (error) {
      console.error("Error actualizando el perfil:", error);
      addNotification("Hubo un error al guardar los cambios.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  if (!userData) {
    return <LoadingSpinner text="Cargando perfil..." />;
  }

  return (
    <div className="bg-white p-6 rounded-xl shadow-lg animate-fadeIn">
      <h3 className="text-xl font-semibold text-amore-charcoal mb-4">Mis Preferencias y Disponibilidad</h3>
      <form onSubmit={handleSaveChanges} className="space-y-4">
        <div>
          <label htmlFor="preferences" className="block text-sm font-medium text-amore-gray mb-1">
            Preferencias de Horario
          </label>
          <textarea
            id="preferences"
            value={preferences}
            onChange={(e) => setPreferences(e.target.value)}
            rows={3}
            className="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-2 focus:ring-red-200 focus:border-amore-red"
            placeholder="Ej: Prefiero turnos de tarde, me gustaría trabajar los fines de semana..."
          />
          <p className="text-xs text-amore-gray mt-1 italic">
    Nota: Esto no garantiza la asignación de horarios preferidos, pero se usará para crear el mejor horario posible para todo el equipo.
  </p>

        </div>

        <div>
          <label htmlFor="availability" className="block text-sm font-medium text-amore-gray mb-1">
            Disponibilidad General
          </label>
          <textarea
            id="availability"
            value={availability}
            onChange={(e) => setAvailability(e.target.value)}
            rows={3}
            className="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-2 focus:ring-red-200 focus:border-amore-red"
            placeholder="Ej: No disponible los martes por la mañana. Totalmente disponible de viernes a domingo."
          />
        </div>
        <div className="text-right">
          <Button type="submit" variant="primary" isLoading={isLoading} icon={<i className="fas fa-save mr-2"></i>}>
            {isLoading ? "Guardando..." : "Guardar Cambios"}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default ProfileManager;