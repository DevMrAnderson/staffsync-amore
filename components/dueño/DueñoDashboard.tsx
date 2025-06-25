import React, { useState } from 'react';
import Navbar from '../common/Navbar';
import Button from '../common/Button';
import { useAuth } from '../../contexts/AuthContext';
import LoadingSpinner from '../common/LoadingSpinner';

// Placeholder components for sections a Dueño might access
// These would be more complex in a real app, possibly reusing Gerente components or having enhanced versions.
const UserManagementView: React.FC = () => (
  <div className="p-4 bg-white rounded-lg shadow">
    <h3 className="text-xl font-semibold mb-3 text-gray-700">Gestión de Usuarios</h3>
    <p className="text-gray-600">Aquí el dueño podría crear, editar, y desactivar cuentas de usuario (empleados, gerentes).</p>
    <ul className="list-disc list-inside mt-2 text-sm text-gray-500">
        <li>Ver lista de usuarios</li>
        <li>Filtrar por rol</li>
        <li>Botón para "Nuevo Usuario" (abriría un formulario)</li>
        <li>Acciones por usuario: Editar Rol, Desactivar, Resetear Contraseña</li>
    </ul>
    <Button variant="primary" className="mt-4">Agregar Nuevo Usuario (Simulado)</Button>
  </div>
);

const UniversalHistoryView: React.FC = () => (
  <div className="p-4 bg-white rounded-lg shadow">
    <h3 className="text-xl font-semibold mb-3 text-gray-700">Historial Universal</h3>
    <p className="text-gray-600">Aquí el dueño podría ver un registro de todas las acciones importantes en el sistema.</p>
    <ul className="list-disc list-inside mt-2 text-sm text-gray-500">
        <li>Filtros por fecha, usuario, tipo de acción.</li>
        <li>Tabla o lista de entradas del historial.</li>
        <li>Detalles de cada acción.</li>
    </ul>
     <Button variant="secondary" className="mt-4">Cargar Historial (Simulado)</Button>
  </div>
);

const FullScheduleView: React.FC = () => (
  <div className="p-4 bg-white rounded-lg shadow">
    <h3 className="text-xl font-semibold mb-3 text-gray-700">Visibilidad Total de Horarios</h3>
    <p className="text-gray-600">El dueño tendría acceso para ver y editar todos los horarios, similar al gerente pero sin restricciones de equipo si las hubiera.</p>
    {/* This might reuse or extend the Gerente's ScheduleBuilder or a read-only full view */}
    <div className="mt-2 p-4 bg-gray-50 rounded min-h-[200px] flex items-center justify-center">
        <p className="text-gray-400 italic">Vista de calendario completa aquí...</p>
    </div>
  </div>
);


type DuenioView = 'userManagement' | 'universalHistory' | 'fullScheduleView' | 'managerFunctions';


const DueñoDashboard: React.FC = () => {
  const { userData } = useAuth();
  const [activeView, setActiveView] = useState<DuenioView>('fullScheduleView');


  if (!userData) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner />
      </div>
    );
  }

  const renderView = () => {
    switch (activeView) {
      case 'userManagement':
        return <UserManagementView />;
      case 'universalHistory':
        return <UniversalHistoryView />;
      case 'fullScheduleView':
        return <FullScheduleView />;
      case 'managerFunctions':
        // This is a conceptual placeholder. In a real app, you might embed GerenteDashboard or its parts,
        // or provide direct navigation to Gerente-like views with elevated permissions.
        return (
            <div className="p-4 bg-white rounded-lg shadow">
                <h3 className="text-xl font-semibold mb-3 text-gray-700">Funciones de Gerente</h3>
                <p className="text-gray-600">El dueño tiene acceso a todas las funcionalidades de un gerente. Esta sección podría replicar el panel de gerente o enlazar a sus componentes.</p>
                <Button variant="primary" className="mt-2" onClick={() => alert("Navegar a vista de Gerente (simulado)")}>
                    Acceder a Panel de Gerente (Simulado)
                </Button>
            </div>
        );
      default:
        return <FullScheduleView />;
    }
  };


  return (
    <div className="min-h-screen bg-gray-100">
      <Navbar title="Panel de Dueño" />
      <div className="container mx-auto p-4 md:p-6">
         <aside className="mb-6">
          <div className="bg-white p-3 md:p-4 rounded-xl shadow-lg flex flex-col sm:flex-row flex-wrap gap-2 justify-center md:justify-start">
            <Button 
              variant={activeView === 'fullScheduleView' ? 'primary' : 'secondary'}
              onClick={() => setActiveView('fullScheduleView')}
              icon={<i className="fas fa-calendar-check mr-2"></i>}
              className="flex-grow sm:flex-grow-0"
            >
              Horarios (Todos)
            </Button>
             <Button 
              variant={activeView === 'userManagement' ? 'primary' : 'secondary'}
              onClick={() => setActiveView('userManagement')}
              icon={<i className="fas fa-users-cog mr-2"></i>}
              className="flex-grow sm:flex-grow-0"
            >
              Gestión de Usuarios
            </Button>
            <Button 
              variant={activeView === 'universalHistory' ? 'primary' : 'secondary'}
              onClick={() => setActiveView('universalHistory')}
              icon={<i className="fas fa-history mr-2"></i>}
              className="flex-grow sm:flex-grow-0"
            >
              Historial Universal
            </Button>
             <Button 
              variant={activeView === 'managerFunctions' ? 'primary' : 'secondary'}
              onClick={() => setActiveView('managerFunctions')}
              icon={<i className="fas fa-user-tie mr-2"></i>}
              className="flex-grow sm:flex-grow-0"
            >
              Funciones de Gerente
            </Button>
          </div>
        </aside>

        <main className="bg-white p-4 sm:p-6 rounded-xl shadow-lg">
            {renderView()}
        </main>

      </div>
    </div>
  );
};

export default DueñoDashboard;
