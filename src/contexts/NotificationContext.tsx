import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { NotificationMessage } from '../types';

interface NotificationContextType {
  notifications: NotificationMessage[];
  addNotification: (message: string, type: NotificationMessage['type'], duration?: number) => void;
  removeNotification: (id: string) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<NotificationMessage[]>([]);

  const removeNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const addNotification = useCallback((message: string, type: NotificationMessage['type'], duration: number = 5000) => {
    const id = Date.now().toString() + Math.random().toString(36).substring(2, 9);
    setNotifications(prev => [...prev, { id, message, type, timestamp: Date.now() }]);
    
    if (duration > 0) {
        setTimeout(() => {
          removeNotification(id);
        }, duration);
    }
  }, [removeNotification]);


  return (
    <NotificationContext.Provider value={{ notifications, addNotification, removeNotification }}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotification = (): NotificationContextType => {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotification debe usarse dentro de un NotificationProvider');
  }
  return context;
};