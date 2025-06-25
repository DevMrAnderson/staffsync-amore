
import React from 'react';
import { useAuth } from './contexts/AuthContext';
import Login from './components/auth/Login';
import EmpleadoDashboard from './components/empleado/EmpleadoDashboard';
import GerenteDashboard from './components/gerente/GerenteDashboard';
import DuenoDashboard from './components/dueno/DuenoDashboard';
import LoadingSpinner from './components/common/LoadingSpinner';
import NotificationContainer from './components/common/NotificationContainer';
import { UserRole } from './types';

const App: React.FC = () => {
  const { user, loading, userData, logout } = useAuth(); // Destructure logout here

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
          {userData?.role === UserRole.EMPLEADO && <EmpleadoDashboard />}
          {userData?.role === UserRole.GERENTE && <GerenteDashboard />}
          {userData?.role === UserRole.DUENO && <DuenoDashboard />}
          {(!userData || !userData.role) && user && ( // Check for user but no userData/role
             <div className="flex flex-col items-center justify-center flex-grow p-4">
                <h1 className="text-2xl font-bold text-red-600 mb-4">Error de Configuracion de Cuenta</h1>
                <p className="text-center">No se ha podido determinar tu rol o tu perfil no esta completo. Por favor, contacta al administrador.</p>
                <button 
                  onClick={logout} // Use logout from useAuth hook
                  className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                >
                  Cerrar Sesion
                </button>
             </div>
          )}
        </>
      )}
    </div>
  );
};

export default App;