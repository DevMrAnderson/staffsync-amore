import React from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import Button from './Button';

const ThemeToggleButton: React.FC = () => {
  const { theme, toggleTheme } = useTheme();

  return (
    <Button
      variant="light"
      size="sm"
      onClick={toggleTheme}
      // Usamos ! para sobreescribir la sombra y p-2 para hacerlo más cuadrado
      className="!shadow-none p-2 rounded-full" 
      aria-label="Cambiar tema de la aplicación"
      title="Cambiar tema de la aplicación"
    >
      {/* Mostramos un ícono diferente dependiendo del tema actual */}
      {theme === 'light' ? (
        <i className="fas fa-moon text-lg text-amore-charcoal"></i>
      ) : (
        <i className="fas fa-sun text-lg text-yellow-400"></i>
      )}
    </Button>
  );
};

export default ThemeToggleButton;