import React from 'react';

interface LoadingSpinnerProps {
  text?: string;
  size?: 'sm' | 'md' | 'lg';
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ text, size = 'md' }) => {
  const sizeClasses = {
    sm: 'h-10 w-10',
    md: 'h-14 w-14',
    lg: 'h-20 w-20',
  };

  return (
    <div className="flex flex-col items-center justify-center p-4" aria-live="polite" aria-busy="true">
      <img 
        src="/PNG1.png" 
        alt="Cargando..." 
        // CAMBIO CLAVE: Usamos nuestra nueva clase de animación profesional
        className={`animate-pro-spinner ${sizeClasses[size]}`}
      />
      {text && (
        <p className="mt-4 text-sm text-amore-gray animate-pulse">
          {text}
        </p>
      )}
    </div>
  );
};

export default LoadingSpinner;