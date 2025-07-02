import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useNotification } from '../../contexts/NotificationContext';
import { updateUser } from '../../services/firestoreService';
import Button from '../common/Button';
import LoadingSpinner from '../common/LoadingSpinner';
import Modal from '../common/Modal'; // <-- Importamos el Modal
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../../services/firebase';

const ProfileManager: React.FC = () => {
  const { user, userData } = useAuth();
  const { addNotification } = useNotification();

  const [preferences, setPreferences] = useState('');
  const [availability, setAvailability] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  // --- NUEVO ESTADO para controlar el modal de confirmación ---
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  useEffect(() => {
    if (userData) {
      setPreferences(userData.schedulePreferences || '');
      setAvailability(userData.availabilityNotes || '');
    }
  }, [userData]);

  const handleSaveChanges = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      addNotification("No se puede guardar, no estás autenticado.", "error");
      return;
    }
    setIsLoading(true);
    try {
      await updateUser(user.uid, {
        schedulePreferences: preferences,
        availabilityNotes: availability,
      });
      addNotification("Perfil actualizado con éxito.", "success");
    } catch (error) {
      addNotification("Hubo un error al guardar los cambios.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  // --- LÓGICA REFACTORIZADA ---

  // 1. La lógica de enviar el correo ahora está en su propia función
  const executePasswordReset = async () => {
    if (!user || !user.email) {
      addNotification("No se pudo encontrar tu email para enviar el correo.", "error");
      return;
    }
    try {
      await sendPasswordResetEmail(auth, user.email);
      addNotification(`Correo de restablecimiento enviado a ${user.email}. ¡Revisa tu bandeja de entrada!`, "success");
    } catch (error: any) {
      addNotification(`Error al enviar el correo: ${error.message}`, "error");
    }
  };

  // 2. El manejador del botón ahora solo abre el modal
  const handlePasswordReset = () => {
    setIsConfirmOpen(true);
  };

  if (!userData) {
    return <LoadingSpinner text="Cargando perfil..." />;
  }

  return (
    <>
      <div className="bg-white p-6 rounded-xl shadow-lg animate-fadeIn">
        <h3 className="text-xl font-semibold text-amore-charcoal mb-4">Mis Preferencias y Disponibilidad</h3>
        <form onSubmit={handleSaveChanges} className="space-y-4">
          <div>
            <label htmlFor="preferences" className="block text-sm font-medium text-amore-gray mb-1">
              Preferencias de Horario
            </label>
            <p className="text-xs text-amore-gray mt-1 mb-2 italic">
              Nota: Esto no garantiza la asignación de horarios preferidos, pero se usará para crear el mejor horario posible para todo el equipo.
            </p>
            <textarea
              id="preferences"
              value={preferences}
              onChange={(e) => setPreferences(e.target.value)}
              rows={3}
              className="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-2 focus:ring-red-200 focus:border-amore-red"
              placeholder="Ej: Prefiero turnos de tarde, me gustaría trabajar los fines de semana..."
            />
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
          <div className="flex justify-between items-center pt-2">
            <Button type="button" onClick={handlePasswordReset} variant="light" icon={<i className="fas fa-key mr-2"></i>}>
              Cambiar Contraseña
            </Button>
            <Button type="submit" variant="primary" isLoading={isLoading} icon={<i className="fas fa-save mr-2"></i>}>
              {isLoading ? "Guardando..." : "Guardar Cambios"}
            </Button>
          </div>
        </form>
      </div>

      {/* --- NUESTRO MODAL DE CONFIRMACIÓN --- */}
      <Modal
        isOpen={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        title="Confirmar Restablecimiento de Contraseña"
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="light" onClick={() => setIsConfirmOpen(false)}>Cancelar</Button>
            <Button
              variant="warning"
              onClick={() => {
                executePasswordReset();
                setIsConfirmOpen(false);
              }}
            >
              Sí, Enviar Correo
            </Button>
          </div>
        }
      >
        <p className="text-amore-gray">
          Se enviará un correo electrónico a tu dirección para que puedas crear una nueva contraseña. ¿Estás seguro de que quieres continuar?
        </p>
      </Modal>
    </>
  );
};

export default ProfileManager;