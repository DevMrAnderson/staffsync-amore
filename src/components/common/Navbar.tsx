import React from 'react';
import { useAuth } from '../../contexts/AuthContext';
import Button from './Button';
import { APP_NAME } from '../../constants';
import { UserRole } from '../../types';

interface NavbarProps {
  title?: string;
}

const Navbar: React.FC<NavbarProps> = ({ title }) => {
  const { userData, logout } = useAuth();

  const getRoleDisplayName = (role?: UserRole) => {
    if (!role) return '';
    return role.charAt(0).toUpperCase() + role.slice(1);
  };

  return (
    // ¡Volvemos a usar nuestra clase personalizada!
    <nav className="bg-amore-red shadow-lg p-4 sticky top-0 z-50">
      <div className="container mx-auto flex flex-wrap justify-between items-center">

        <div className="flex items-center">
          {/* PASO FINAL DEL LOGO: Un div contenedor con fondo blanco y forma de círculo */}
          <div className="h-10 w-10 bg-white rounded-full flex items-center justify-center p-1 mr-3 shadow-inner">
            <img 
              src="/PNG1.png" 
              alt="Logo Cocina Amore" 
              className="h-full w-full object-contain animate-heartbeat" 
            />
          </div>

          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
            {title || APP_NAME}
          </h1>
        </div>

        {userData && (
          <div className="flex items-center space-x-3 sm:space-x-4 mt-2 sm:mt-0">
            <div className="text-right">
              <p className="text-white text-sm font-semibold">{userData.name}</p>
              <p className="text-red-100 text-xs">{getRoleDisplayName(userData.role)}</p>
            </div>
            <Button onClick={logout} variant="light" size="sm" icon={<i className="fas fa-sign-out-alt"></i>}>
              Salir
            </Button>
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navbar;