// En: src/components/gerente/ConnectionStatusWidget.tsx
import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useNotification } from '../../contexts/NotificationContext';
import { onConnectionStatusSnapshot, reportAppOutage, resolveAppOutage } from '../../services/firestoreService'; // Funciones que crearemos
import { ConnectionStatus } from '../../types';
import Button from '../common/Button';
import LoadingSpinner from '../common/LoadingSpinner';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../services/firebase'; // Importamos la instancia de functions

const ConnectionStatusWidget: React.FC = () => {
  const { addNotification } = useNotification();
  const [status, setStatus] = useState<Partial<ConnectionStatus>>({});
  const [loading, setLoading] = useState(true);
  const [processingApp, setProcessingApp] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onConnectionStatusSnapshot((newStatus) => {
      setStatus(newStatus || {});
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleReportOutage = async (app: keyof ConnectionStatus) => {
    setProcessingApp(app);
    try {
      // Usamos la función importada para preparar la llamada
      const report = httpsCallable(functions, 'reportAppOutage');
      await report({ appName: app });
      addNotification(`Falla reportada para ${app}. El Dueño será notificado.`, 'warning');
    } catch (error: any) {
      addNotification(`Error al reportar falla: ${error.message}`, 'error');
    } finally {
      setProcessingApp(null);
    }
  };

  const handleResolveOutage = async (app: keyof ConnectionStatus) => {
    setProcessingApp(app);
    try {
      // Y aquí también
      const resolve = httpsCallable(functions, 'resolveAppOutage');
      await resolve({ appName: app });
      addNotification(`${app} marcada como resuelta.`, 'success');
    } catch (error: any) {
      addNotification(`Error al resolver falla: ${error.message}`, 'error');
    } finally {
      setProcessingApp(null);
    }
  };

  const appMap = {
    uber_eats: { name: 'Uber Eats', icon: 'fas fa-car' },
    rappi: { name: 'Rappi', icon: 'fas fa-motorcycle' },
  };

  return (
    <div className="p-4 bg-white rounded-xl shadow-lg">
      <h2 className="text-2xl font-bold text-amore-charcoal mb-4">Estado de Conexiones de Delivery</h2>
      {loading ? <LoadingSpinner /> : (
        <div className="space-y-3">
          {Object.keys(appMap).map((appKey) => {
            const currentStatus = status[appKey as keyof ConnectionStatus];
            const isOffline = currentStatus === 'offline';
            return (
              <div key={appKey} className={`p-3 rounded-lg flex justify-between items-center border-l-4 ${isOffline ? 'bg-red-50 border-red-500' : 'bg-green-50 border-green-500'}`}>
                <div className="flex items-center">
                  <i className={`${appMap[appKey as keyof typeof appMap].icon} mr-3 ${isOffline ? 'text-red-600' : 'text-green-600'}`}></i>
                  <div>
                    <p className="font-bold text-gray-800">{appMap[appKey as keyof typeof appMap].name}</p>
                    <p className={`text-sm font-semibold ${isOffline ? 'text-red-600 animate-pulse' : 'text-green-600'}`}>
                      {isOffline ? 'FUERA DE LÍNEA' : 'En Línea'}
                    </p>
                  </div>
                </div>
                <Button 
                  onClick={() => isOffline ? handleResolveOutage(appKey as keyof ConnectionStatus) : handleReportOutage(appKey as keyof ConnectionStatus)}
                  variant={isOffline ? 'success' : 'danger'}
                  size="sm"
                  isLoading={processingApp === appKey}
                >
                  {isOffline ? 'Marcar como Resuelto' : 'Reportar Falla'}
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ConnectionStatusWidget;