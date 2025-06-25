import React from 'react';
import { useNotification } from '../../contexts/NotificationContext';
import { NotificationMessage } from '../../types';

const NotificationItem: React.FC<{ notification: NotificationMessage; onRemove: (id: string) => void }> = ({ notification, onRemove }) => {
  const baseStyle = "p-4 mb-3 rounded-lg shadow-xl text-sm relative transition-all duration-300 ease-in-out transform";
  const typeStyles = {
    success: "bg-green-500 border-green-700 text-white",
    error: "bg-red-500 border-red-700 text-white",
    info: "bg-blue-500 border-blue-700 text-white",
    warning: "bg-yellow-500 border-yellow-700 text-black",
  };

  const iconStyles = {
    success: "fas fa-check-circle",
    error: "fas fa-exclamation-circle",
    info: "fas fa-info-circle",
    warning: "fas fa-exclamation-triangle",
  }

  // Animation states could be more complex (e.g., using a library like framer-motion)
  // For simplicity, using CSS transitions (could add enter/exit animations)
  const [isVisible, setIsVisible] = React.useState(false);
  React.useEffect(() => {
    setIsVisible(true); // Trigger fade-in/slide-in
  }, []);

  return (
    <div 
        className={`${baseStyle} ${typeStyles[notification.type]} ${isVisible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-full'}`}
        role="alert"
    >
      <div className="flex items-center">
        <i className={`${iconStyles[notification.type]} mr-3 text-xl`}></i>
        <span>{notification.message}</span>
      </div>
      <button 
        onClick={() => {
            setIsVisible(false); // Trigger fade-out/slide-out
            setTimeout(() => onRemove(notification.id), 300); // Remove after animation
        }} 
        className="absolute top-1 right-1 text-inherit hover:opacity-75 p-1 rounded-full"
        aria-label="Cerrar notificacion"
      >
        <i className="fas fa-times"></i>
      </button>
    </div>
  );
};

const NotificationContainer: React.FC = () => {
  const { notifications, removeNotification } = useNotification();

  if (!notifications.length) {
    return null;
  }

  return (
    <div className="fixed top-5 right-5 z-[2000] w-full max-w-sm">
      {notifications.map((notification) => (
        <NotificationItem key={notification.id} notification={notification} onRemove={removeNotification} />
      ))}
    </div>
  );
};

export default NotificationContainer;
