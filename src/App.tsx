import React from 'react';
import { useAuth } from './contexts/AuthContext';
import Login from './components/auth/Login';
import EmpleadoDashboard from './components/empleado/EmpleadoDashboard';
import GerenteDashboard from './components/gerente/GerenteDashboard';
import DuenoDashboard from './components/dueno/DuenoDashboard';
import LoadingSpinner from './components/common/LoadingSpinner';
import NotificationContainer from './components/common/NotificationContainer';
import { UserRole } from './types';
import Button from './components/common/Button'; // Importamos nuestro botón personalizado

const App: React.FC = () => {
  const { user, loading, userData, logout } = useAuth();

  // --- INICIO DE LA LÓGICA CORREGIDA ---
  // Creamos una lista con todos los roles que deben ver el panel de empleado.
  const employeeLevelRoles: UserRole[] = [
    UserRole.COCINERO,
    UserRole.AUXILIAR_COCINA,
    UserRole.LAVALOZA,
    UserRole.BARTENDER,
    UserRole.MESERO,
  ];
  // --- FIN DE LA LÓGICA CORREGIDA ---

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 text-gray-800 flex flex-col">
      <NotificationContainer />
      {!user ? (
        <Login />
      ) : (
        <>
          {/* AHORA COMPROBAMOS SI EL ROL ESTÁ EN NUESTRA LISTA DE ROLES DE EMPLEADO */}
          {userData?.role && employeeLevelRoles.includes(userData.role) && <EmpleadoDashboard />}

          {userData?.role === UserRole.GERENTE && <GerenteDashboard />}
          {userData?.role === UserRole.DUENO && <DuenoDashboard />}
          
          {(!userData || !userData.role) && user && (
            <div className="flex flex-col items-center justify-center flex-grow p-4">
              <h1 className="text-2xl font-bold text-amore-red mb-4">Error de Configuración de Cuenta</h1>
              <p className="text-center">No se ha podido determinar tu rol o tu perfil no está completo. Por favor, contacta al administrador.</p>
              {/* Usamos nuestro botón personalizado para consistencia de diseño */}
              <Button 
                onClick={logout}
                variant="primary"
                className="mt-4"
              >
                Cerrar Sesión
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default App;