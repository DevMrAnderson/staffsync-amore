import React, { useState, useEffect, useCallback } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';

// --- Contextos y Hooks ---
import { useAuth } from './contexts/AuthContext';
import { useNotification } from './contexts/NotificationContext';

// --- Servicios de Firebase ---
import { auth } from './services/firebase';
import { sendPasswordResetEmail } from 'firebase/auth';
import { updateUser, onUnreadNotificationsSnapshot, markNotificationAsRead, getLatestAnnouncement } from './services/firestoreService';

// --- Tipos de Datos ---
import { UserRole, Notification, Announcement } from './types';

// --- Componentes ---
import Login from './components/auth/Login';
import EmpleadoDashboard from './components/empleado/EmpleadoDashboard';
import GerenteDashboard from './components/gerente/GerenteDashboard';
import DuenoDashboard from './components/dueno/DuenoDashboard';
import LoadingSpinner from './components/common/LoadingSpinner';
import NotificationContainer from './components/common/NotificationContainer';
import Modal from './components/common/Modal';
import Button from './components/common/Button';

// --- Componente para Forzar el Reseteo de Contraseña ---
const ForceResetPassword: React.FC = () => {
  const { user, logout } = useAuth();
  const { addNotification } = useNotification();
  const [emailSent, setEmailSent] = useState(false);

  const handleSendResetEmail = useCallback(async () => {
    if (!user || !user.email) return;
    try {
      await sendPasswordResetEmail(auth, user.email);
      setEmailSent(true);
      addNotification("Correo de restablecimiento enviado. ¡Revisa tu bandeja de entrada!", "success");
      await updateUser(user.uid, { passwordResetRequired: false });
    } catch (error: any) {
      addNotification(`Error al enviar el correo: ${error.message}`, "error");
    }
  }, [user, addNotification]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <div className="p-8 bg-white rounded-xl shadow-lg text-center max-w-md">
        <h1 className="text-2xl font-bold text-amore-charcoal mb-4">Establece tu Contraseña</h1>
        {!emailSent ? (
          <>
            <p className="text-amore-gray mb-6">Por seguridad, debes establecer una contraseña personal. Haz clic abajo para recibir un correo y crear tu nueva contraseña.</p>
            <Button onClick={handleSendResetEmail} variant="primary" fullWidth>Enviar Correo de Restablecimiento</Button>
          </>
        ) : (
          <>
            <p className="text-green-600 font-semibold mb-6">¡Correo enviado! Revisa tu bandeja de entrada (y spam) y sigue las instrucciones. Después, podrás cerrar sesión e iniciar con tu nueva contraseña.</p>
            <Button onClick={logout} variant="secondary" fullWidth>Cerrar Sesión</Button>
          </>
        )}
      </div>
    </div>
  );
};

// --- Componente Principal de la Aplicación ---
const App: React.FC = () => {
  const { user, userData, loading, logout } = useAuth();
  const [announcementModal, setAnnouncementModal] = useState<Announcement | null>(null);
  
  // Estado para manejar el modal de notificaciones que requieren confirmación
  const [modalNotification, setModalNotification] = useState<Notification | null>(null);


  useEffect(() => {
  // Si tenemos datos del usuario, verificamos si hay un anuncio nuevo para él
  if (userData) {
    const checkAnnouncement = async () => {
      const latestAnnouncement = await getLatestAnnouncement();
      if (latestAnnouncement) {
        // Comparamos la fecha del anuncio con la del último anuncio leído por el usuario
        const lastRead = userData.lastAnnouncementRead?.toDate() || new Date(0);
        if (latestAnnouncement.createdAt.toDate() > lastRead) {
          setAnnouncementModal(latestAnnouncement);
        }
      }
    };
    checkAnnouncement();
  }
}, [userData]); // Se ejecuta cada vez que userData cambia


  // useEffect que escucha en tiempo real las notificaciones del usuario
  useEffect(() => {
    if (!user) return; // Si no hay usuario, no hay nada que escuchar

    // Escuchamos las notificaciones no leídas
    const unsubscribe = onUnreadNotificationsSnapshot(user.uid, (notifications) => {
      // Buscamos la primera notificación que requiera confirmación y que no estemos mostrando ya
      const firstModalNotification = notifications.find(n => n.requiresConfirmation && n.id !== modalNotification?.id);
      
      if (firstModalNotification) {
        setModalNotification(firstModalNotification);
      }
    });

    // Limpiamos el "oyente" cuando el componente se desmonta o el usuario cambia
    return () => unsubscribe();
  }, [user, modalNotification]); // Se vuelve a ejecutar si el usuario cambia

  // Función para cuando el usuario hace clic en "Enterado"
  const handleAcknowledgeNotification = useCallback(async () => {
    if (!modalNotification) return;
    try {
      await markNotificationAsRead(modalNotification.id);
      setModalNotification(null); // Cerramos el modal
    } catch (error) {
      console.error("Error al marcar la notificación como leída:", error);
    }
  }, [modalNotification]);



  const handleAcknowledgeAnnouncement = async () => {
  if (!announcementModal || !user) return;
  try {
    // Marcamos el anuncio como leído actualizando la fecha en el perfil del usuario
    await updateUser(user.uid, { lastAnnouncementRead: announcementModal.createdAt });
    setAnnouncementModal(null); // Cerramos el modal
  } catch (error) {
    console.error("Error al confirmar anuncio:", error);
  }
};

  // Muestra una pantalla de carga global mientras se verifica la sesión
  if (loading) {
    return <div className="flex items-center justify-center min-h-screen"><LoadingSpinner text="Cargando StaffSync..." /></div>;
  }

  const renderDashboardByRole = () => {
    if (!userData) { // Si el usuario está logueado pero no tiene datos, es un estado de error
      return (
        <div className="flex flex-col items-center justify-center min-h-screen p-4">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Error de Cuenta</h1>
          <p className="text-center">Tu usuario está autenticado pero no se encontró un perfil en la base de datos.</p>
          <Button onClick={logout} variant="danger" className="mt-4">Cerrar Sesión</Button>
        </div>
      );
    }
    
    // Si se requiere reseteo de contraseña, esta vista tiene prioridad
    if (userData.passwordResetRequired) {
      return <ForceResetPassword />;
    }

    // Renderizado basado en rol
    switch (userData.role) {
      case UserRole.MESERO:
      case UserRole.BARTENDER:
      case UserRole.COCINERO:
      case UserRole.AUXILIAR_COCINA:
      case UserRole.LAVALOZA:
        return <EmpleadoDashboard />;
      case UserRole.GERENTE:
        return <GerenteDashboard />;
      case UserRole.DUENO:
        return <DuenoDashboard />;
      default:
        return (
          <div className="flex flex-col items-center justify-center min-h-screen p-4">
            <h1 className="text-2xl font-bold text-red-600 mb-4">Rol No Válido</h1>
            <p className="text-center">Tu cuenta no tiene un rol asignado válido.</p>
            <Button onClick={logout} variant="danger" className="mt-4">Cerrar Sesión</Button>
          </div>
        );
    }
  };

  return (
    <Router>
      {/* Contenedor global de notificaciones tipo "toast" */}
      <NotificationContainer />

      {/* Modal global de notificaciones de confirmación */}
      {modalNotification && (
        <Modal 
          isOpen={!!modalNotification} 
          onClose={handleAcknowledgeNotification} 
          title={modalNotification.title}
        >
          <div className="text-center p-4">
            <p className="text-gray-600">{modalNotification.message}</p>
            <div className="mt-6">
              <Button onClick={handleAcknowledgeNotification} variant="primary" fullWidth>
                Enterado
              </Button>
            </div>
          </div>
        </Modal>
      )}



      {/* Modal para Anuncios Globales */}
{announcementModal && (
  <Modal 
    isOpen={!!announcementModal} 
    onClose={handleAcknowledgeAnnouncement} 
    title="Anuncio de la Administración" // <-- CAMBIO A UN TÍTULO FIJO Y OFICIAL
  >
    <div className="p-4">
      {/* Añadimos el título original del mensaje DENTRO del contenido */}
      <h3 className="font-bold text-lg text-amore-charcoal mb-2">{announcementModal.title}</h3>
      <p className="text-gray-700 whitespace-pre-wrap">{announcementModal.message}</p>
      <div className="mt-6 text-center">
        <Button onClick={handleAcknowledgeAnnouncement} variant="primary" fullWidth>
          Enterado
        </Button>
      </div>
    </div>
  </Modal>
)}



      {/* Sistema de Rutas */}
      <Routes>
        <Route path="/login" element={!user ? <Login /> : <Navigate to="/" />} />
        <Route path="/*" element={user ? renderDashboardByRole() : <Navigate to="/login" />} />
      </Routes>
    </Router>
  );
};

export default App;