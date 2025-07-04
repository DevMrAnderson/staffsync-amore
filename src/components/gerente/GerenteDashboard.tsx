import React, { useState, useEffect, useCallback } from 'react';
import { Timestamp, doc, getDoc } from 'firebase/firestore';
import { functions, db } from '../../services/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { useNotification } from '../../contexts/NotificationContext';
import { FirebaseCollections } from '../../constants';
import { parse, addDays, startOfWeek, format } from 'date-fns';
import { es } from 'date-fns/locale/es';

// Tipos
import { PartialShiftForTemplate, Shift, ChecklistTemplate, ChangeRequest, Justification, ShiftReport, User, Notification } from '../../types';

// Servicios
import { 
  getCurrentActiveShiftForUser, 
  getShiftReport, 
  upsertShiftReport, 
  getPreviousShiftReport,
  onPendingManagerChangeRequestsSnapshot,
  onPendingJustificationsSnapshot,
  onUnreadNotificationsSnapshot,
  markNotificationAsRead,
  getShiftTemplates,
  getAllUsersByRole
} from '../../services/firestoreService';

// Componentes
import Navbar from '../common/Navbar';
import LoadingSpinner from '../common/LoadingSpinner';
import Button from '../common/Button';
import ScheduleBuilder from './ScheduleBuilder';
import ChangeRequestManagement from './ChangeRequestManagement';
import JustificationManagement from './JustificationManagement';
import NotificationModal from '../common/NotificationModal';


//========================================================================
// --- SUB-COMPONENTE: El Widget para el Checklist (AHORA INDEPENDIENTE) ---
//========================================================================
interface ShiftChecklistWidgetProps {
  shift: Shift;
  checklist: ChecklistTemplate;
  completedTasks: Record<string, boolean>;
  onToggleTask: (task: string) => void;
  notes: string;
  onNotesChange: (notes: string) => void;
  onSaveReport: () => void;
  isSaving: boolean;
  previousShiftNotes?: string;
}

const ShiftChecklistWidget: React.FC<ShiftChecklistWidgetProps> = ({ 
  shift, checklist, completedTasks, onToggleTask, notes, onNotesChange, onSaveReport, isSaving, previousShiftNotes 
}) => {
  return (
    <section className="mb-6 p-4 md:p-6 bg-white border-l-4 border-amore-red rounded-lg shadow-lg animate-fadeIn">
      <h2 className="text-2xl font-bold text-amore-charcoal mb-4">{checklist.name}</h2>
      
      {previousShiftNotes && (
        <div className="mb-6 p-4 bg-gray-50 border rounded-lg">
          <h3 className="font-semibold text-md text-gray-600 mb-2">Notas del Turno Anterior:</h3>
          <p className="text-sm text-gray-800 whitespace-pre-wrap italic">{previousShiftNotes}</p>
        </div>
      )}
      
      <div className="space-y-3 mb-6">
        <h3 className="font-semibold text-md text-gray-600">Tareas del Turno:</h3>
        {checklist.tasks.map(task => (
          <label key={task} className="flex items-center p-3 rounded-md transition hover:bg-gray-100 cursor-pointer">
            <input
              type="checkbox"
              checked={!!completedTasks[task]}
              onChange={() => onToggleTask(task)}
              className="h-5 w-5 rounded border-gray-300 text-amore-red focus:ring-2 focus:ring-amore-red-soft"
            />
            <span className={`ml-3 text-lg ${completedTasks[task] ? 'text-gray-400 line-through' : 'text-gray-800'}`}>{task}</span>
          </label>
        ))}
      </div>

      <div className="border-t pt-4">
        <label htmlFor="shiftNotes" className="block text-md font-semibold text-amore-charcoal mb-2">Notas para el Siguiente Turno</label>
        <textarea
          id="shiftNotes"
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          rows={4}
          className="w-full mt-1 p-2 border border-gray-300 rounded-md shadow-sm focus:ring-2 focus:ring-red-200 focus:border-amore-red"
          placeholder="Añade observaciones, incidentes o notas..."
        />
      </div>
      <div className="text-right mt-4">
        <Button onClick={onSaveReport} disabled={isSaving}>
          {isSaving ? "Guardando..." : "Guardar Reporte"}
        </Button>
      </div>
    </section>
  );
};


//========================================================================
// --- COMPONENTE PRINCIPAL: El Dashboard del Gerente ---
//========================================================================
type GerenteView = 'scheduleBuilder' | 'changeRequests' | 'justifications';
const GERENTE_VIEWS = [
  { id: 'scheduleBuilder', label: 'Constructor de Horarios', icon: 'fas fa-calendar-alt' },
  { id: 'changeRequests', label: 'Gestionar Cambios', icon: 'fas fa-exchange-alt' },
  { id: 'justifications', label: 'Gestionar Justificantes', icon: 'fas fa-file-signature' },
];

const GerenteDashboard: React.FC = () => {
  const { user, userData } = useAuth();
  const { addNotification } = useNotification();
  
  const [activeView, setActiveView] = useState<GerenteView>('scheduleBuilder');
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [shiftContext, setShiftContext] = useState<{
    activeShift: Shift;
    checklistTemplate: ChecklistTemplate;
    previousNotes: string;
    currentReport: Partial<ShiftReport>;
  } | null>(null);
  
  const [pendingChangesCount, setPendingChangesCount] = useState(0);
  const [pendingJustificationsCount, setPendingJustificationsCount] = useState(0);
  const [unreadNotifications, setUnreadNotifications] = useState<Notification[]>([]);
  const [isConfirmingNotif, setIsConfirmingNotif] = useState(false);


  // --- ÚNICO Y DEFINITIVO useEffect PARA TODA LA LÓGICA DE CARGA Y ESCUCHA ---
  useEffect(() => {
    if (!user || !userData) {
      setLoading(false);
      return;
    }

    let isMounted = true;

    const loadData = async () => {
      setLoading(true);
      const shift = await getCurrentActiveShiftForUser(user.uid);
      if (!isMounted) return;

      if (shift) {
        let template = null;
        const templateId = shift.shiftTypeId; // No es necesario 'as ...'
        if (templateId) {
          // Asumimos que tu colección de plantillas de checklist se llama así
          const templateRef = doc(db, 'shiftChecklistTemplates', templateId);
          const templateSnap = await getDoc(templateRef);
          if (templateSnap.exists()) {
            template = templateSnap.data() as ChecklistTemplate;
          } else {
            addNotification(`No se encontró la plantilla de checklist para el turno actual ('${templateId}').`, 'error');
          }
        } else {
          addNotification('Este turno no tiene un checklist asignado.', 'warning');
        }

        if (template) {
          const [prevReport, report] = await Promise.all([
            getPreviousShiftReport(shift.start),
            getShiftReport(shift.id),
          ]);
          if (isMounted) {
            setShiftContext({
              activeShift: shift,
              checklistTemplate: template,
              previousNotes: prevReport?.notes || 'No hay notas del turno anterior.',
              currentReport: report || { completedTasks: {}, notes: '' },
            });
          }
        }
      } else {
        if (isMounted) setShiftContext(null);
      }

      if (isMounted) setLoading(false);
    };

    loadData();

    // Listeners para los contadores de notificaciones
    const unsubChanges = onPendingManagerChangeRequestsSnapshot((reqs) => isMounted && setPendingChangesCount(reqs.length));
    const unsubJustifications = onPendingJustificationsSnapshot((justs) => isMounted && setPendingJustificationsCount(justs.length));
    const unsubNotifications = onUnreadNotificationsSnapshot(user.uid, (notifs) => isMounted && setUnreadNotifications(notifs));

    return () => {
      isMounted = false;
      unsubChanges();
      unsubJustifications();
      unsubNotifications();
    };
  }, [user, userData, addNotification]);
  
  // --- MANEJADORES DE EVENTOS ---

  const handleToggleTask = useCallback((task: string) => {
    if (!shiftContext) return;
    const newCompletedTasks = {
      ...shiftContext.currentReport.completedTasks,
      [task]: !shiftContext.currentReport.completedTasks?.[task],
    };
    setShiftContext(prev => ({
      ...prev!,
      currentReport: { ...prev!.currentReport, completedTasks: newCompletedTasks }
    }));
  }, [shiftContext]);
  
  const handleNotesChange = useCallback((notes: string) => {
    if (!shiftContext) return;
    setShiftContext(prev => ({ ...prev!, currentReport: { ...prev!.currentReport, notes: notes }}));
  }, [shiftContext]);
  
  const handleSaveReport = async () => {
    if (!shiftContext?.activeShift || !user || !userData) return;
    
    const { activeShift, checklistTemplate, currentReport } = shiftContext;

    // --- LÓGICA NUEVA: Construimos el snapshot ---
    const checklistSnapshot = checklistTemplate.tasks.map(taskText => ({
      task: taskText,
      done: !!currentReport.completedTasks?.[taskText] // Usamos el estado actual para saber si está hecha
    }));
    // ------------------------------------------

    setIsSaving(true);
    try {
      await upsertShiftReport(activeShift.id, {
        shiftId: activeShift.id,
        managerId: user.uid,
        managerName: userData.name,
        templateId: activeShift.shiftTypeId,
        shiftTypeName: activeShift.shiftTypeName,
        notes: currentReport.notes || '',
        checklistSnapshot: checklistSnapshot, // <-- Guardamos el nuevo campo
      });
      addNotification('Reporte del turno guardado con éxito.', 'success');
    } catch (error: any) {
      addNotification(`Error al guardar: ${error.message}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmNotification = async (notification: Notification) => {
      setIsConfirmingNotif(true);
      try {
        await markNotificationAsRead(notification.id);
        addNotification("Notificación confirmada.", "info");
      } catch (error: any) {
        addNotification(`Error al confirmar la notificación: ${error.message}`, "error");
      } finally {
        setIsConfirmingNotif(false);
      }
  };
  
  const renderView = () => {
    switch (activeView) {
      case 'scheduleBuilder': return <ScheduleBuilder />;
      case 'changeRequests': return <ChangeRequestManagement />;
      case 'justifications': return <JustificationManagement />;
      default: return null;
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <Navbar title="Panel de Gerente" />
      <div className="container mx-auto p-4 md:p-6 flex-grow">
        <aside className="mb-6">
          <div className="bg-white p-3 md:p-4 rounded-xl shadow-lg flex flex-col sm:flex-row flex-wrap gap-2 justify-center">
            {GERENTE_VIEWS.map(view => (
              <Button 
                key={view.id}
                variant={activeView === view.id ? 'primary' : 'light'}
                onClick={() => setActiveView(view.id)}
                icon={<i className={`${view.icon} mr-2`}></i>}
                className="flex-grow sm:flex-grow-0 relative"
              >
                {view.label}
                {(view.id === 'changeRequests' && pendingChangesCount > 0) || (view.id === 'justifications' && pendingJustificationsCount > 0) ? (
                  <span className="absolute -top-1 -right-1 flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-yellow-500"></span>
                  </span>
                ) : null}
              </Button>
            ))}
          </div>
        </aside>
        
        {loading ? (
          <div className="py-8 text-center"><LoadingSpinner text="Cargando información..." /></div>
        ) : shiftContext ? (
          <ShiftChecklistWidget 
            shift={shiftContext.activeShift} 
            checklist={shiftContext.checklistTemplate} 
            completedTasks={shiftContext.currentReport.completedTasks || {}}
            notes={shiftContext.currentReport.notes || ''}
            previousShiftNotes={shiftContext.previousNotes} 
            isSaving={isSaving}
            onToggleTask={handleToggleTask}
            onNotesChange={handleNotesChange}
            onSaveReport={handleSaveReport}
          />
        ) : (
          <div className="text-center p-4 mb-6 bg-blue-50 border border-blue-200 rounded-lg text-blue-700">
            No tienes un turno activo en este momento. El checklist aparecerá aquí cuando comience tu turno.
          </div>
        )}

        <main className="bg-white p-2 sm:p-4 md:p-6 rounded-xl shadow-lg min-h-[400px]">
          {renderView()}
        </main>

        {unreadNotifications.find(n => n.requiresConfirmation) && (
          <NotificationModal 
            notification={unreadNotifications.find(n => n.requiresConfirmation)!}
            onConfirm={() => handleConfirmNotification(unreadNotifications.find(n => n.requiresConfirmation)!)}
            isProcessing={isConfirmingNotif}
          />
        )}
      </div>
    </div>
  );
};

export default GerenteDashboard;