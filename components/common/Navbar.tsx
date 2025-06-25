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
    switch (role) {
      case UserRole.EMPLEADO: return 'Empleado';
      case UserRole.GERENTE: return 'Gerente';
      case UserRole.DUENO: return 'Dueno';
      default: 
        const _exhaustiveCheck: never = role;
        return _exhaustiveCheck;
    }
  };

  return (
    <nav className="bg-gradient-to-r from-blue-700 via-indigo-700 to-purple-800 shadow-lg p-4 sticky top-0 z-[100]">
      <div className="container mx-auto flex flex-wrap justify-between items-center">
        <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">{title || APP_NAME}</h1>
        {userData && (
          <div className="flex items-center space-x-3 sm:space-x-4 mt-2 sm:mt-0">
            <div className="text-right">
              <p className="text-white text-sm font-semibold">{userData.name}</p>
              <p className="text-indigo-200 text-xs">{getRoleDisplayName(userData.role)}</p>
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
