import React, { useState } from 'react';
import { useAuth } from './contexts/AuthContext';
import Login from './components/auth/Login';
import EmpleadoDashboard from './components/empleado/EmpleadoDashboard';
import GerenteDashboard from './components/gerente/GerenteDashboard';
import DuenoDashboard from './components/dueno/DuenoDashboard';
import LoadingSpinner from './components/common/LoadingSpinner';
import NotificationContainer from './components/common/NotificationContainer';
import { UserRole } from './types';
import Button from './components/common/Button';
import { sendPasswordResetEmail } from 'firebase/auth'; // Importamos la función de Firebase
import { auth } from './services/firebase'; // Importamos nuestra instancia de auth
import { useNotification } from './contexts/NotificationContext';
import { updateUser } from './services/firestoreService';

// --- Nuevo Componente para Forzar el Reseteo de Contraseña ---
const ForceResetPassword: React.FC = () => {
    const { user, logout } = useAuth();
    const { addNotification } = useNotification();
    const [emailSent, setEmailSent] = useState(false);

    const handleSendResetEmail = async () => {
        if (!user || !user.email) return;
        try {
            await sendPasswordResetEmail(auth, user.email);
            setEmailSent(true);
            addNotification("Correo de restablecimiento enviado. ¡Revisa tu bandeja de entrada!", "success");
            // Quitamos la marca para que no vuelva a ver esta pantalla la próxima vez
            await updateUser(user.uid, { passwordResetRequired: false });
        } catch (error: any) {
            addNotification(`Error al enviar el correo: ${error.message}`, "error");
        }
    };

    return (
        <div className="flex items-center justify-center min-h-screen bg-gray-100">
            <div className="p-8 bg-white rounded-xl shadow-lg text-center max-w-md">
                <img src="/PNG1.png" alt="Logo" className="mx-auto h-20 w-20 mb-4 animate-pulse-fast" />
                <h1 className="text-2xl font-bold text-amore-charcoal mb-4">¡Bienvenido/a a StaffSync!</h1>
                {!emailSent ? (
                    <>
                        <p className="text-amore-gray mb-6">Por tu seguridad, en tu primer inicio de sesión debes establecer una contraseña personal. Haz clic en el botón para recibir un correo y crear tu nueva contraseña.</p>
                        <Button onClick={handleSendResetEmail} variant="primary" fullWidth>Restablecer Contraseña Ahora</Button>
                    </>
                ) : (
                    <>
                        <p className="text-green-600 font-semibold mb-6">¡Correo enviado! Por favor, revisa tu bandeja de entrada (y la carpeta de spam) y sigue las instrucciones. Después de cambiarla, podrás cerrar sesión aquí e iniciar sesión con tu nueva contraseña.</p>
                        <Button onClick={logout} variant="secondary" fullWidth>Cerrar Sesión</Button>
                    </>
                )}
            </div>
        </div>
    );
};


const App: React.FC = () => {
  const { user, loading, userData, logout } = useAuth();

  const employeeLevelRoles: UserRole[] = [
    UserRole.COCINERO, UserRole.AUXILIAR_COCINA, UserRole.LAVALOZA,
    UserRole.BARTENDER, UserRole.MESERO,
  ];

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen"><LoadingSpinner /></div>;
  }

  return (
    <div className="min-h-screen bg-gray-100 text-gray-800 flex flex-col">
      <NotificationContainer />
      {!user ? (
        <Login />
      ) : (
        <>
          {/* --- NUEVA LÓGICA DE INTERCEPCIÓN --- */}
          {/* Si el usuario está marcado, le mostramos la pantalla de reseteo y nada más */}
          {user && userData?.passwordResetRequired ? (
            <ForceResetPassword />
          ) : (
            <>
              {/* Si no, continuamos con la lógica de roles normal */}
              {userData?.role && employeeLevelRoles.includes(userData.role) && <EmpleadoDashboard />}
              {userData?.role === UserRole.GERENTE && <GerenteDashboard />}
              {userData?.role === UserRole.DUENO && <DuenoDashboard />}
              
              {(!userData || !userData.role) && user && !userData?.passwordResetRequired && (
                <div className="flex flex-col items-center justify-center flex-grow p-4">
                  <h1 className="text-2xl font-bold text-red-600 mb-4">Error de Configuración de Cuenta</h1>
                  <p className="text-center">No se ha podido determinar tu rol o tu perfil no está completo.</p>
                  <Button onClick={logout} variant="primary" className="mt-4">Cerrar Sesión</Button>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
};

export default App;