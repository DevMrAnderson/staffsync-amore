import React, { ReactNode, useEffect } from 'react';
import { createPortal } from 'react-dom';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | 'full';
  footer?: ReactNode;
  hideCloseButton?: boolean;
}

const Modal: React.FC<ModalProps> = ({ 
    isOpen, 
    onClose, 
    title, 
    children, 
    size = 'md', 
    footer,
    hideCloseButton = false 
}) => {
  useEffect(() => {
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEsc);
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'auto';
    }
    return () => {
      document.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = 'auto';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const sizeClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
    '3xl': 'max-w-3xl',
    full: 'max-w-full h-full rounded-none',
  };

  return createPortal(
    <div 
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black bg-opacity-60 p-4 transition-opacity duration-300 ease-in-out animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div 
        className={`bg-white rounded-lg shadow-xl w-full ${sizeClasses[size]} flex flex-col max-h-[90vh] transform transition-all duration-300 ease-in-out animate-scaleUp`}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-between items-center p-4 md:p-5 border-b rounded-t">
          <h3 id="modal-title" className="text-xl font-semibold text-gray-900">
            {title}
          </h3>
          {!hideCloseButton && (
            <button
              type="button"
              onClick={onClose}
              className="text-gray-400 bg-transparent hover:bg-gray-200 hover:text-gray-900 rounded-lg text-sm w-8 h-8 ms-auto inline-flex justify-center items-center"
              aria-label="Cerrar modal"
            >
              <i className="fas fa-times text-lg"></i>
            </button>
          )}
        </div>
        
        <div className="p-4 md:p-5 space-y-4 overflow-y-auto flex-grow">
          {children}
        </div>
        
        {footer && (
          <div className="flex items-center justify-end p-4 md:p-5 border-t border-gray-200 rounded-b">
            {footer}
          </div>
        )}
      </div>
    </div>, // <--- LA COMA CORREGIDA ESTÁ AQUÍ
    document.body
  );
};

export default Modal;