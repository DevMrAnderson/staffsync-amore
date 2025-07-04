import React, { useState, useEffect } from 'react';
import Modal from './components/common/Modal';

// --- Contextos y Hooks ---
import { useAuth } from './contexts/AuthContext';
import { useNotification } from './contexts/NotificationContext';

// --- Servicios de Firebase ---
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from './services/firebase';
import { updateUser, onUnreadNotificationsSnapshot, markNotificationAsRead, } from './services/firestoreService';

// --- Componentes ---
import Login from './components/auth/Login';
import EmpleadoDashboard from './components/empleado/EmpleadoDashboard';
import GerenteDashboard from './components/gerente/GerenteDashboard';
import DuenoDashboard from './components/dueno/DuenoDashboard';
import LoadingSpinner from './components/common/LoadingSpinner';
import NotificationContainer from './components/common/NotificationContainer';
import Button from './components/common/Button';

// --- Tipos de Datos ---
import { UserRole, Notification } from './types';

const App: React.FC = () => {
  const { user, loading, userData, logout } = useAuth();
  
  // --- ESTADO PARA EL MODAL DE NOTIFICACIÓN ---
  const [modalNotification, setModalNotification] = useState<Notification | null>(null);

  // --- OYENTE DE NOTIFICACIONES ---
  useEffect(() => {
    // Si no hay usuario, no hacemos nada.
    if (!user) return;

    // Escuchamos las notificaciones no leídas del usuario.
    const unsubscribe = onUnreadNotificationsSnapshot(user.uid, (notifications) => {
      // Buscamos la primera notificación que requiera confirmación y que no se esté mostrando ya.
      const firstModalNotification = notifications.find(n => n.requiresConfirmation && n.id !== modalNotification?.id);
      
      if (firstModalNotification) {
        setModalNotification(firstModalNotification); // Si la encontramos, la ponemos en el estado para mostrar el modal.
      }
    });

    // Limpiamos el oyente cuando el componente se desmonta o el usuario cambia.
    return () => unsubscribe();
  }, [user, modalNotification]);


  // --- FUNCIÓN PARA "CONFIRMAR DE ENTERADO" ---
  const handleAcknowledgeNotification = async () => {
    if (!modalNotification) return;
    try {
      await markNotificationAsRead(modalNotification.id); // La marcamos como leída en la base de datos
      setModalNotification(null); // Cerramos el modal
    } catch (error) {
      console.error("Error al marcar la notificación como leída:", error);
    }
  }

  // 2. El "portero" principal: si estamos cargando, no mostramos nada más.
  // Esto es CORRECTO y ya lo tenías.
  if (loading) {
    return <div className="flex items-center justify-center min-h-screen"><LoadingSpinner text="Verificando sesión..." /></div>;
  }

  // 3. Si NO estamos cargando y NO hay usuario, mostramos la pantalla de Login.
  if (!user) {
    return (
      <div className="min-h-screen bg-gray-100 text-gray-800 flex flex-col">
        <NotificationContainer />
        <Login />
      </div>
    );
  }
  
  // 4. Si SÍ hay usuario, pero aún no tenemos sus datos de Firestore (userData),
  // mostramos una carga específica. Este es un estado intermedio que tu código anterior no manejaba explícitamente.
  if (!userData) {
      return (
        <div className="flex items-center justify-center min-h-screen">
          <LoadingSpinner text="Cargando perfil de usuario..." />
        </div>
      );
  }

  // 5. Si el usuario debe cambiar su contraseña, le forzamos a hacerlo y no mostramos nada más.
  if (userData.passwordResetRequired) {
    return <ForceResetPassword />;
  }

  // 6. Función limpia para decidir qué Dashboard mostrar según el rol.
  const renderDashboardByRole = () => {
    switch (userData.role) {
      case UserRole.COCINERO:
      case UserRole.AUXILIAR_COCINA:
      case UserRole.LAVALOZA:
      case UserRole.BARTENDER:
      case UserRole.MESERO:
        return <EmpleadoDashboard />;

      case UserRole.GERENTE:
        return <GerenteDashboard />;
      
      case UserRole.DUENO:
        return <DuenoDashboard />;

      default:
        // Si el usuario no tiene un rol válido, mostramos un error claro.
        return (
          <div className="flex flex-col items-center justify-center flex-grow p-4">
            <h1 className="text-2xl font-bold text-red-600 mb-4">Error de Configuración de Cuenta</h1>
            <p className="text-center">No se ha podido determinar tu rol en el sistema.</p>
            <Button onClick={logout} variant="primary" className="mt-4">Cerrar Sesión</Button>
          </div>
        );
    }
  };



  // 7. Finalmente, renderizamos el contenedor principal con el dashboard correspondiente.
  return (
    <div className="min-h-screen bg-gray-100 text-gray-800 flex flex-col">
      <NotificationContainer />
      {renderDashboardByRole()}

      {/* --- MODAL GENÉRICO DE NOTIFICACIONES --- */}
      {/* Este modal se mostrará encima de cualquier pantalla si hay una notificación que confirmar */}
      <Modal 
        isOpen={!!modalNotification} 
        onClose={handleAcknowledgeNotification} 
        title={modalNotification?.title || 'Notificación'}
      >
        <div className="text-center p-4">
            <h3 className="text-lg font-medium text-gray-900">{modalNotification?.title}</h3>
            <div className="mt-2">
                <p className="text-sm text-gray-600">
                    {modalNotification?.message}
                </p>
            </div>
            <div className="mt-6">
                <Button onClick={handleAcknowledgeNotification} variant="primary" fullWidth>
                    Enterado
                </Button>
            </div>
        </div>
      </Modal>
    </div>
  );
};

export default App;