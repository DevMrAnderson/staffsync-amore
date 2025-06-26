import React from 'react';

const LoadingSpinner: React.FC<{ text?: string }> = ({ text = "Cargando..." }) => {
  return (
    <div className="flex flex-col justify-center items-center p-4">
      <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-b-4 border-blue-600 mb-3"></div>
      {text && <p className="text-lg text-gray-700">{text}</p>}
    </div>
  );
};

export default LoadingSpinner;
