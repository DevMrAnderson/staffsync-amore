import React, { useState, useEffect, useCallback } from 'react';
import Navbar from '../common/Navbar';
import ScheduleBuilder from './ScheduleBuilder';
import ChangeRequestManagement from './ChangeRequestManagement';
import JustificationManagement from './JustificationManagement';
import Button from '../common/Button';
import { useAuth } from '../../contexts/AuthContext';
import { getOptimizedScheduleTemplate } from '../../services/aiService';
import { useNotification } from '../../contexts/NotificationContext';
import { PartialShiftForTemplate, Shift, ChecklistTemplate } from '../../types';
import LoadingSpinner from '../common/LoadingSpinner';
import { getCurrentActiveShiftForUser, getChecklistTemplates, onPendingManagerChangeRequestsSnapshot,
  onPendingJustificationsSnapshot, onUnreadNotificationsSnapshot, markNotificationAsRead } from '../../services/firestoreService';
import NotificationModal from '../common/NotificationModal';

// --- El Widget para el Checklist ---
interface ShiftChecklistWidgetProps {
  shift: Shift;
  checklist: ChecklistTemplate;
}
const ShiftChecklistWidget: React.FC<ShiftChecklistWidgetProps> = ({ shift, checklist }) => {
  const [completedTasks, setCompletedTasks] = useState<Record<string, boolean>>({});
  const handleToggleTask = (task: string) => {
    setCompletedTasks(prev => ({ ...prev, [task]: !prev[task] }));
  };
  return (
    <section className="mb-6 p-4 md:p-6 bg-white border-l-4 border-amore-red rounded-lg shadow-lg animate-fadeIn">
      <h2 className="text-xl font-bold text-amore-charcoal mb-1">Checklist del Turno Activo</h2>
      <p className="text-sm text-amore-gray mb-4">
        Turno: {shift.shiftTypeName} ({shift.start.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} - {shift.end.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})})
      </p>
      <div className="space-y-3">
        {checklist.tasks.map((task, index) => (
          <div key={index} className="flex items-center">
            <input id={`task-${index}`} type="checkbox" className="h-5 w-5 rounded border-gray-300 text-amore-red focus:ring-red-400 cursor-pointer" checked={!!completedTasks[task]} onChange={() => handleToggleTask(task)} />
            <label htmlFor={`task-${index}`} className={`ml-3 text-sm cursor-pointer ${completedTasks[task] ? 'text-gray-400 line-through' : 'text-amore-charcoal'}`}>{task}</label>
          </div>
        ))}
      </div>
    </section>
  );
};


// --- El Dashboard Principal del Gerente ---
type GerenteView = 'scheduleBuilder' | 'changeRequests' | 'justifications' | 'predictive';

interface GerenteViewConfig {
  id: GerenteView;
  label: string;
  icon: string;
}

const GERENTE_VIEWS: GerenteViewConfig[] = [
  { id: 'scheduleBuilder', label: 'Constructor de Horarios', icon: 'fas fa-calendar-alt' },
  { id: 'changeRequests', label: 'Gestionar Cambios', icon: 'fas fa-exchange-alt' },
  { id: 'justifications', label: 'Gestionar Justificantes', icon: 'fas fa-file-signature' },
  { id: 'predictive', label: 'Análisis Predictivo (IA)', icon: 'fas fa-lightbulb' },
];

const GerenteDashboard: React.FC = () => {
  const { userData } = useAuth();
  const { addNotification } = useNotification();
  const [activeView, setActiveView] = useState<GerenteView>('scheduleBuilder');
  const [optimizedTemplate, setOptimizedTemplate] = useState<PartialShiftForTemplate[] | null>(null);
  const [loadingTemplate, setLoadingTemplate] = useState(false);
  const [activeShift, setActiveShift] = useState<Shift | null>(null);
  const [activeChecklist, setActiveChecklist] = useState<ChecklistTemplate | null>(null);
  const [isLoadingChecklist, setIsLoadingChecklist] = useState(true);
  const [pendingChangesCount, setPendingChangesCount] = useState(0);
  const [pendingJustificationsCount, setPendingJustificationsCount] = useState(0);

  // 1. Estados para manejar las notificaciones del gerente
  const [unreadNotifications, setUnreadNotifications] = useState<Notification[]>([]);
  const [isConfirmingNotif, setIsConfirmingNotif] = useState(false);

  // 2. useEffect para escuchar las notificaciones no leídas
  useEffect(() => {
    if (userData) {
      const unsubscribe = onUnreadNotificationsSnapshot(userData.id, (notifications) => {
        setUnreadNotifications(notifications);
      });
      return () => unsubscribe();
    }
  }, [userData]);


  useEffect(() => {
    if (!userData) return;
    const findActiveChecklist = async () => {
      setIsLoadingChecklist(true);
      try {
        const shift = await getCurrentActiveShiftForUser(userData.id);
        setActiveShift(shift);
        if (shift) {
          const templates = await getChecklistTemplates();
          if (templates.length > 0) {
            setActiveChecklist(templates[0]);
          } else {
             addNotification("No se encontraron plantillas de checklist.", "warning");
          }
        }
      } catch (error: any) {
        console.error("Error buscando checklist activo:", error);
        addNotification(`Error al buscar checklist: ${error.message}`, "error");
      } finally {
        setIsLoadingChecklist(false);
      }
    };
    findActiveChecklist();
  }, [userData, addNotification]);

  // --- NUEVOS USEEFFECTS PARA CONTAR PENDIENTES ---
  useEffect(() => {
    const unsubscribe = onPendingManagerChangeRequestsSnapshot((requests: ChangeRequest[]) => {
      setPendingChangesCount(requests.length);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = onPendingJustificationsSnapshot((justifications: Justification[]) => {
      setPendingJustificationsCount(justifications.length);
    });
    return () => unsubscribe();
  }, []);

  const handleOptimizeSchedule = async () => {
    setLoadingTemplate(true);
    setOptimizedTemplate(null);
    try {
      const template = await getOptimizedScheduleTemplate();
      setOptimizedTemplate(template);
      if (template.length > 0) {
        addNotification(`Plantilla de horario optimizado con ${template.length} turnos (simulada) cargada.`, 'info');
      } else {
        addNotification('La IA no genero sugerencias para la plantilla esta vez (simulado).', 'info');
      }
      setActiveView('scheduleBuilder');
    } catch (error: any) {
      console.error("Error al obtener plantilla optimizada:", error);
      addNotification(`Error al cargar plantilla optimizada: ${error.message}`, 'error');
    } finally {
      setLoadingTemplate(false);
    }
  };

  const handleConfirmNotification = async (notification: Notification) => {
  setIsConfirmingNotif(true);
  try {
    // CORRECCIÓN: Ahora recibimos el objeto 'notification' completo
    // y usamos 'notification.id' para marcarlo como leído.
    await markNotificationAsRead(notification.id);
    addNotification("Notificación de empleado confirmada.", "info");
    // No necesitamos notificar a nadie más, el gerente es el final del ciclo.
  } catch (error: any) {
    addNotification(`Error al confirmar la notificación: ${error.message}`, "error");
    console.error("Error al confirmar notificación del gerente:", error);
  } finally {
    setIsConfirmingNotif(false);
  }
};

  const renderView = () => {
    switch (activeView) {
      case 'scheduleBuilder':
        return <ScheduleBuilder initialTemplate={optimizedTemplate} onTemplateConsumed={() => setOptimizedTemplate(null)} />;
      case 'changeRequests':
        return <ChangeRequestManagement />;
      case 'justifications':
        return <JustificationManagement />;
      case 'predictive':
        return (
          <div className="p-4 md:p-6 bg-white rounded-lg shadow-md animate-fadeIn">
            <h2 className="text-xl font-semibold mb-4 text-gray-700">Análisis Predictivo (Simulado)</h2>
            <p className="mb-4 text-gray-600">
              Utiliza la IA para generar una plantilla de horario optimizada basada en patrones historicos y predicciones de demanda (simulado). Los resultados apareceran en el Constructor de Horarios.
            </p>
            <Button onClick={handleOptimizeSchedule} isLoading={loadingTemplate} variant="primary" icon={<i className="fas fa-cogs mr-2"></i>}>
              {loadingTemplate ? 'Optimizando...' : 'Obtener Horario Optimizado con IA'}
            </Button>
            {optimizedTemplate && !loadingTemplate && (
                 <div className="mt-6 p-4 bg-green-50 border-l-4 border-green-500 rounded-md">
                   <h3 className="font-semibold text-green-700">
                     <i className="fas fa-check-circle mr-2"></i>
                     {optimizedTemplate.length > 0 ? `¡Plantilla Cargada con ${optimizedTemplate.length} turnos!` : "Plantilla Procesada"}
                   </h3>
                   <p className="text-sm text-green-600">
                     {optimizedTemplate.length > 0 
                       ? <>La plantilla optimizada esta lista. Ve al <Button variant="secondary" size="xs" className="inline-block ml-1 px-2 py-0.5" onClick={() => setActiveView('scheduleBuilder')}>Constructor de Horarios</Button> para aplicarla.</>
                       : "La IA no genero sugerencias especificas esta vez. Puedes construir el horario manualmente."}
                   </p>
                 </div>
            )}
          </div>
        );
      default:
        const _exhaustiveCheck: never = activeView;
        return <p>Vista no encontrada: {_exhaustiveCheck}</p>;
    }
  };

  if (!userData) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner text="Cargando datos de gerente..." />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <Navbar title="Panel de Gerente" />
      <div className="container mx-auto p-4 md:p-6 flex-grow">
        <aside className="mb-6">
          <div className="bg-white p-3 md:p-4 rounded-xl shadow-lg flex flex-col sm:flex-row flex-wrap gap-2 justify-center">
            {GERENTE_VIEWS.map(view => {
  // 1. Ahora que usamos llaves {}, SÍ podemos poner lógica aquí.
  let hasNotification = false;
  if (view.id === 'changeRequests' && pendingChangesCount > 0) {
    hasNotification = true;
  }
  if (view.id === 'justifications' && pendingJustificationsCount > 0) {
    hasNotification = true;
  }

  // 2. Y ahora usamos 'return' para devolver el componente del botón.
  return (
    <Button 
      key={view.id}
      variant={activeView === view.id ? 'primary' : 'light'}
      onClick={() => {
        setActiveView(view.id);
        if (view.id !== 'scheduleBuilder' && view.id !== 'predictive') {
          setOptimizedTemplate(null);
        }
      }}
      icon={<i className={`${view.icon} mr-2`}></i>}
      className="flex-grow sm:flex-grow-0 relative"
    >
      {view.label}
      {/* Esta parte ahora funcionará porque 'hasNotification' existe */}
      {hasNotification && (
        <span className="absolute -top-1 -right-1 flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-3 w-3 bg-yellow-500"></span>
        </span>
      )}
    </Button>
  );
})}
          </div>
        </aside>
        
        {isLoadingChecklist ? (
          <div className="py-4"><LoadingSpinner text="Buscando turno activo..." /></div>
        ) : activeShift && activeChecklist ? (
          <ShiftChecklistWidget shift={activeShift} checklist={activeChecklist} />
        ) : (
          <div className="text-center p-4 mb-6 bg-blue-50 border border-blue-200 rounded-lg text-blue-700">
            No tienes un turno activo en este momento. El checklist aparecerá aquí cuando comience tu turno.
          </div>
        )}

        <main className="bg-white p-2 sm:p-4 md:p-6 rounded-xl shadow-lg min-h-[400px]">
          {renderView()}
        </main>

        {unreadNotifications.length > 0 && (
  <NotificationModal 
    notification={unreadNotifications[0]}
    onConfirm={handleConfirmNotification} // Correcto: pasa la función directamente
    isProcessing={isConfirmingNotif}
  />
)}
      </div>
    </div>
  );
};

export default GerenteDashboard;