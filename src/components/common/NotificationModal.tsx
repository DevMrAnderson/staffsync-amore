// Nuevo Archivo: src/components/common/NotificationModal.tsx

import React from 'react';
import { Notification } from '../../types';
import Button from './Button';
import Modal from './Modal'; // Usamos el componente Modal que ya tienes

interface NotificationModalProps {
  notification: Notification;
  onConfirm: (notificationId: string) => void;
}

const NotificationModal: React.FC<NotificationModalProps> = ({ notification, onConfirm }) => {
  
  const getIcon = () => {
    if (notification.title.toLowerCase().includes('aprobado')) {
      return 'fas fa-check-circle text-green-500';
    }
    if (notification.title.toLowerCase().includes('rechazado')) {
      return 'fas fa-times-circle text-red-500';
    }
    return 'fas fa-info-circle text-blue-500';
  };

  return (
    // Este Modal es especial: no tiene un prop 'onClose' para que no se pueda cerrar con la 'X' o haciendo clic fuera.
    <Modal isOpen={true} title={notification.title} iconClass={getIcon()}>
      <div className="text-center">
        <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-gray-100 mb-4">
            <i className={`${getIcon()} text-3xl`}></i>
        </div>
        <h3 className="text-lg leading-6 font-medium text-gray-900">{notification.title}</h3>
        <div className="mt-2 px-7 py-3">
          <p className="text-sm text-gray-500">
            {notification.message}
          </p>
        </div>
        <div className="mt-4">
          <Button
            onClick={() => onConfirm(notification)}
            variant="primary"
            size="lg"
          >
            Entendido
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default NotificationModal;