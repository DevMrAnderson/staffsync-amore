import React, { useState, useEffect, useCallback } from 'react';
import { Timestamp, doc, getDoc } from 'firebase/firestore';
import { functions, db } from '../../services/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { useNotification } from '../../contexts/NotificationContext';
import { FirebaseCollections } from '../../constants';
import { parse, addDays, startOfWeek, format, endOfWeek, isEqual } from 'date-fns';
import { es } from 'date-fns/locale/es';
import ManagerShiftSwap from './ManagerShiftSwap';
import ShiftDetailModal from './ShiftDetailModal';
import Modal from '../common/Modal';
import PublishedSchedules from './PublishedSchedules';
import UploadJustificationForm from '../empleado/UploadJustificationForm';


// Tipos
import { PartialShiftForTemplate, Shift, ChecklistTemplate, ChangeRequest, Justification, ShiftReport, User, Notification, ShiftStatus } from '../../types';

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
  offerShiftToManagers,
  getAllUsersByRole,
  updateShift,
  claimShiftOffer,
  onAvailableShiftOffersSnapshot,
  onShiftsForUserSnapshot,
  getShiftsForDay,
  getShiftsForWeek
} from '../../services/firestoreService';

// Componentes
import Navbar from '../common/Navbar';
import LoadingSpinner from '../common/LoadingSpinner';
import Button from '../common/Button';
import ScheduleBuilder from './ScheduleBuilder';
import ChangeRequestManagement from './ChangeRequestManagement';
import JustificationManagement from './JustificationManagement';
import NotificationModal from '../common/NotificationModal';
import ConnectionStatusWidget from './ConnectionStatusWidget';


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
type GerenteView = 'scheduleBuilder' | 'changeRequests' | 'justifications' | 'publishedSchedules' | 'connectionStatus';
const GERENTE_VIEWS = [
  { id: 'connectionStatus', label: 'Estado de Conexiones', icon: 'fas fa-wifi' },
  { id: 'scheduleBuilder', label: 'Constructor de Horarios', icon: 'fas fa-calendar-alt' },
  { id: 'changeRequests', label: 'Gestionar Cambios', icon: 'fas fa-exchange-alt' },
  { id: 'justifications', label: 'Gestionar Justificantes', icon: 'fas fa-file-signature' },
  { id: 'publishedSchedules', label: 'Horarios Publicados', icon: 'fas fa-eye' },
];

const GerenteDashboard: React.FC = () => {
  const { user, userData } = useAuth();
  const { addNotification } = useNotification();
  
  const [activeView, setActiveView] = useState<GerenteView>('publishedSchedules');
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
  const [isOfferModalOpen, setIsOfferModalOpen] = useState(false);
  const [shiftToOffer, setShiftToOffer] = useState<Shift | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedShift, setSelectedShift] = useState<Shift | null>(null);
  const [myShifts, setMyShifts] = useState<Shift[]>([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [isJustificationModalOpen, setIsJustificationModalOpen] = useState(false);
  const [justifyingShift, setJustifyingShift] = useState<Shift | null>(null);


// --- ÚNICO Y DEFINITIVO useEffect PARA TODA LA LÓGICA DEL GERENTE ---
  useEffect(() => {
    if (!user || !userData) {
      setLoading(false);
      return;
    }

    let isMounted = true;

    // Oyente para los turnos del propio gerente en la semana actual
    const rangeStart = Timestamp.fromDate(startOfWeek(currentDate, { weekStartsOn: 1 }));
    const rangeEnd = Timestamp.fromDate(endOfWeek(currentDate, { weekStartsOn: 1 }));
    const unsubMyShifts = onShiftsForUserSnapshot(user.uid, rangeStart, rangeEnd, (updatedShifts) => {
      if (isMounted) {
        setMyShifts(updatedShifts);
      }
    });

    // Función para cargar los datos del checklist del turno activo
    const loadActiveShiftData = async () => {
      setLoading(true);
      const shift = await getCurrentActiveShiftForUser(user.uid);
      if (!isMounted) return;

      if (shift) {
        let template = null;
        const templateId = shift.shiftTypeId;
        if (templateId) {
          const templateRef = doc(db, 'shiftChecklistTemplates', templateId);
          const templateSnap = await getDoc(templateRef);
          if (templateSnap.exists()) {
            template = templateSnap.data() as ChecklistTemplate;
          } else {
            addNotification(`No se encontró la plantilla de checklist '${templateId}'.`, 'error');
          }
        }
        
        if (template) {
          const [prevReport, report] = await Promise.all([
            getPreviousShiftReport(shift.id),
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

    // --- Ejecutamos todo y configuramos los listeners ---
    loadActiveShiftData();
    const unsubChanges = onPendingManagerChangeRequestsSnapshot(reqs => isMounted && setPendingChangesCount(reqs.length));
    const unsubJustifications = onPendingJustificationsSnapshot(justs => isMounted && setPendingJustificationsCount(justs.length));
    const unsubNotifications = onUnreadNotificationsSnapshot(user.uid, notifs => isMounted && setUnreadNotifications(notifs));

    // --- Función de limpieza completa ---
    return () => {
      isMounted = false;
      unsubMyShifts(); // Limpiamos el nuevo oyente de turnos
      unsubChanges();
      unsubJustifications();
      unsubNotifications();
    };
    
  }, [user, userData, currentDate, addNotification]); // Añadimos 'currentDate' a las dependencias
  
  // --- MANEJADORES DE EVENTOS ---

  // Esta función se encarga de cargar/recargar los turnos del gerente para la semana visible
  const loadMyShifts = useCallback(async () => {
    if (!user) return;
    
    setLoading(true);
    
    const rangeStart = Timestamp.fromDate(startOfWeek(currentDate, { weekStartsOn: 1 }));
    const rangeEnd = Timestamp.fromDate(endOfWeek(currentDate, { weekStartsOn: 1 }));
    
    // Asumimos que getShiftsForWeek existe en tu servicio y puede filtrar por usuario
    const updatedShifts = await getShiftsForWeek(rangeStart, rangeEnd, user.uid);
    setMyShifts(updatedShifts);
    
    setLoading(false);
  }, [user, currentDate, addNotification]); // Añadimos addNotification por si quieres manejar errores aquí

  // Este useEffect llama a la función cuando el componente carga o la fecha cambia
  useEffect(() => {
    loadMyShifts();
  }, [loadMyShifts]);

  // ------------------------------------

  const handleOpenUploadForm = (shift: Shift) => {
  setIsDetailModalOpen(false); // Cerramos el modal de detalles
  setTimeout(() => {
    setJustifyingShift(shift);
    setIsJustificationModalOpen(true);
  }, 150);
};




  const handleNavigateToBuilder = (date: Date) => {
  // 1. Cambia la vista principal al constructor de horarios
  setActiveView('scheduleBuilder');
  // 2. (Importante) Pasa la fecha seleccionada al constructor.
  //    Esto requiere que modifiques ScheduleBuilder para que acepte una prop de fecha.
  //    Por ahora, podemos usar un console.log para ver que funciona.
  console.log(`Navegando al constructor para la fecha: ${date}`);
  addNotification(`Cargando constructor para el ${format(date, 'PPP', { locale: es })}...`, 'info');
};

  const handleOpenShiftDetails = (shiftToOpen: Shift) => {
  // Ya no necesitamos buscar, recibimos el turno directamente. Es más seguro.
  setSelectedShift(shiftToOpen);
  setIsDetailModalOpen(true);
};

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

  const handleOpenOfferModal = (shift: Shift) => {
  setShiftToOffer(shift);
  setIsOfferModalOpen(true);
};

const executeOfferShift = async () => {
  if (!shiftToOffer || !user || !userData) {
    addNotification("No se puede ofrecer el turno. Faltan datos.", "error");
    return;
  }

  setIsOfferModalOpen(false); // Cierra el modal de confirmación

  try {
    // Estas dos líneas actualizan la base de datos
    await offerShiftToManagers(shiftToOffer, user.uid, userData.name);
    await updateShift(shiftToOffer.id, { status: ShiftStatus.CAMBIO_OFRECIDO_GERENTE });

    addNotification("Tu turno ha sido ofrecido con éxito.", "success");
    setIsDetailModalOpen(false); // Cierra el modal de detalles

    // --- LA LLAMADA CORRECTA PARA REFRESCAR ---
    // Forzamos una recarga de los datos llamando a la función que ya existe
    // en este componente, en lugar de usar variables que no existen aquí.
    await loadMyShifts(); 
    
  } catch (error: any) {
    addNotification(`Error al ofrecer el turno: ${error.message}`, 'error');
  }
};


  
  const handleSaveReport = async () => {
    // 1. Verificación robusta de que tenemos todos los datos necesarios
    if (!shiftContext?.activeShift || !user || !userData) {
      addNotification("No se puede guardar el reporte: faltan datos del turno o del usuario.", "error");
      return;
    }

    const { activeShift, currentReport } = shiftContext;

    // 2. Construimos el objeto de datos que queremos guardar
    const reportData = {
        shiftId: activeShift.id,
        managerId: user.uid,
        managerName: userData.name,
        templateId: activeShift.shiftTypeId,
        shiftTypeName: activeShift.shiftTypeName,
        completedTasks: currentReport.completedTasks || {},
        notes: currentReport.notes || '',
    };
    
    setIsSaving(true);
    try {
      // 3. Llamamos a upsertShiftReport usando el ID del TURNO como ID del REPORTE
      await upsertShiftReport(activeShift.id, reportData);
      
      addNotification('Reporte del turno guardado con éxito.', 'success');
    } catch (error: any) {
      addNotification(`Error al guardar el reporte: ${error.message}`, 'error');
      console.error("Error en handleSaveReport:", error);
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
      case 'connectionStatus':
        return <ConnectionStatusWidget />;
      case 'scheduleBuilder': return <ScheduleBuilder 
  currentDate={currentDate}
  onDateChange={setCurrentDate}
  onShiftClick={(shift) => handleOpenShiftDetails(shift.id)} 
/>;
      case 'changeRequests': return <ChangeRequestManagement />;
      case 'justifications': return <JustificationManagement />;
      case 'publishedSchedules':
  return (
    <PublishedSchedules 
      currentDate={currentDate}
      onDateChange={setCurrentDate}
      onNavigateToBuilder={handleNavigateToBuilder} 
      onShiftClick={handleOpenShiftDetails} 
    />
  );
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

        {/* --- NUEVA SECCIÓN DE INTERCAMBIO DE TURNOS --- */}
        <section className="my-8 animate-fadeIn">
          <ManagerShiftSwap />
        </section>
        {/* ----------------------------------------- */}

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

            {isDetailModalOpen && (
  <ShiftDetailModal
    isOpen={isDetailModalOpen}
    onClose={() => setIsDetailModalOpen(false)}
    shift={selectedShift}
    currentUser={userData}
    onOfferShift={handleOpenOfferModal}
    onUploadJustification={handleOpenUploadForm}
    />
)}

<Modal
        isOpen={isOfferModalOpen}
        onClose={() => setIsOfferModalOpen(false)}
        title="Confirmar Acción"
      >
        <div className="p-4 text-center">
          <i className="fas fa-exchange-alt text-4xl text-yellow-500 mb-4"></i>
          <h3 className="text-lg font-medium text-gray-900">¿Ofrecer este turno?</h3>
          {shiftToOffer && (
            <div className="mt-2">
              <p className="text-sm text-gray-600">
                Estás a punto de ofrecer tu turno del 
                <strong className="block my-2">
                  {format(shiftToOffer.start.toDate(), 'eeee, d \'de\' MMMM', { locale: es })}
                </strong>
                a los demás gerentes.
              </p>
              <p className="text-sm text-gray-500 mt-1">El primero que lo acepte se lo quedará.</p>
            </div>
          )}
          <div className="mt-6 flex justify-center gap-4">
            <Button onClick={() => setIsOfferModalOpen(false)} variant="light">
              Cancelar
            </Button>
            <Button onClick={executeOfferShift} variant="warning">
              Sí, Ofrecer Turno
            </Button>
          </div>
        </div>
      </Modal>



      {/* --- MODAL PARA SUBIR JUSTIFICANTE --- */}
<Modal isOpen={isJustificationModalOpen} onClose={() => setIsJustificationModalOpen(false)} title="Subir Justificante de Ausencia">
  {justifyingShift && (
    <UploadJustificationForm 
      shiftId={justifyingShift.id} 
      dateOfAbsence={justifyingShift.start.toDate()} 
      onSuccess={() => { 
        setIsJustificationModalOpen(false); 
        addNotification('Justificante enviado correctamente.', 'success');
        // Aquí podrías llamar a una función para refrescar los turnos
      }} 
    />
  )}
</Modal>
          
      </div>
    </div>
  );
};

export default GerenteDashboard;