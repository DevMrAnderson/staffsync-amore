import React, { useState, useEffect, useCallback } from 'react';
import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { useNotification } from '../../contexts/NotificationContext';
import { FirebaseCollections } from '../../constants';

// Servicios y Tipos de Datos (asegúrate que las rutas sean correctas)
import { 
  getCurrentActiveShiftForUser, 
  getShiftReport,
  upsertShiftReport,
  getPreviousShiftReport
} from '../../services/firestoreService';
import { Shift, ShiftReport, UserRole } from '../../types';

// Componentes comunes
import Button from '../common/Button';
import LoadingSpinner from '../common/LoadingSpinner';

// --- INTERFAZ PARA LAS PLANTILLAS ---
interface ShiftChecklistTemplate {
  id: 'matutino' | 'vespertino';
  displayName: string;
  tasks: string[];
}


//=================================================================
// 1. SUB-COMPONENTE REUTILIZABLE PARA LA TARJETA DE PLANTILLA
// Definido fuera de OwnerView para solucionar el problema de re-renderizado y pérdida de foco.
//=================================================================
const TemplateCard: React.FC<{
  template: ShiftChecklistTemplate;
  type: 'matutino' | 'vespertino';
  onTaskChange: (type: 'matutino' | 'vespertino', index: number, value: string) => void;
  onRemoveTask: (type: 'matutino' | 'vespertino', index: number) => void;
  onAddTask: (type: 'matutino' | 'vespertino') => void;
}> = ({ template, type, onTaskChange, onRemoveTask, onAddTask }) => (
  <div className="bg-white p-6 rounded-xl shadow-md border-t-4 border-amore-red">
    <h3 className="text-2xl font-bold text-amore-charcoal mb-4 flex items-center">
      <i className={`fas ${type === 'matutino' ? 'fa-sun' : 'fa-moon'} mr-3 text-yellow-500`}></i>
      {template.displayName}
    </h3>
    <div className="space-y-2">
      {template.tasks.map((task, index) => (
        <div key={index} className="flex items-center gap-2">
          <input 
            type="text" 
            value={task}
            onChange={(e) => onTaskChange(type, index, e.target.value)}
            placeholder="Describe una tarea..."
            className="flex-grow p-2 rounded-md border-gray-300 shadow-sm focus:border-amore-red focus:ring-amore-red"
          />
          <Button onClick={() => onRemoveTask(type, index)} variant="danger" size="sm" icon={<i className="fas fa-trash"></i>} />
        </div>
      ))}
    </div>
    <Button onClick={() => onAddTask(type)} variant="light" className="mt-4 w-full">
      <i className="fas fa-plus mr-2"></i>Añadir Tarea
    </Button>
  </div>
);


//=================================================================
// 2. VISTA Y LÓGICA PARA EL DUEÑO
//=================================================================
const OwnerView: React.FC = () => {
  const { addNotification } = useNotification();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [matutinoTemplate, setMatutinoTemplate] = useState<ShiftChecklistTemplate>({ id: 'matutino', displayName: 'Turno Matutino', tasks: [] });
  const [vespertinoTemplate, setVespertinoTemplate] = useState<ShiftChecklistTemplate>({ id: 'vespertino', displayName: 'Turno Vespertino', tasks: [] });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const matutinoRef = doc(db, FirebaseCollections.SHIFT_CHECKLIST_TEMPLATES, 'matutino'); // <-- CORREGIDO
      const vespertinoRef = doc(db, FirebaseCollections.SHIFT_CHECKLIST_TEMPLATES, 'vespertino'); // <-- CORREGIDO
  
      const [matutinoSnap, vespertinoSnap] = await Promise.all([getDoc(matutinoRef), getDoc(vespertinoRef)]);
      
      const defaultMatutino = { id: 'matutino', displayName: 'Turno Matutino', tasks: [] };
      const defaultVespertino = { id: 'vespertino', displayName: 'Turno Vespertino', tasks: [] };

      setMatutinoTemplate(matutinoSnap.exists() ? matutinoSnap.data() as ShiftChecklistTemplate : defaultMatutino);
      setVespertinoTemplate(vespertinoSnap.exists() ? vespertinoSnap.data() as ShiftChecklistTemplate : defaultVespertino);

    } catch (error: any) { 
      addNotification(`Error al cargar plantillas: ${error.message}`, 'error'); 
    } finally { 
      setLoading(false); 
    }
  }, [addNotification]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleTaskChange = (type: 'matutino' | 'vespertino', index: number, value: string) => {
    const setter = type === 'matutino' ? setMatutinoTemplate : setVespertinoTemplate;
    setter(prev => {
      const newTasks = [...prev.tasks];
      newTasks[index] = value;
      return { ...prev, tasks: newTasks };
    });
  };

  const addTask = (type: 'matutino' | 'vespertino') => {
    const setter = type === 'matutino' ? setMatutinoTemplate : setVespertinoTemplate;
    setter(prev => ({ ...prev, tasks: [...prev.tasks, ''] }));
  };

  const removeTask = (type: 'matutino' | 'vespertino', index: number) => {
    const setter = type === 'matutino' ? setMatutinoTemplate : setVespertinoTemplate;
    setter(prev => ({ ...prev, tasks: prev.tasks.filter((_, i) => i !== index) }));
  };

  const handleSaveChanges = async () => {
    setSaving(true);
    try {
      const matutinoRef = doc(db, FirebaseCollections.SHIFT_CHECKLIST_TEMPLATES, 'matutino'); // <-- CORREGIDO
      const vespertinoRef = doc(db, FirebaseCollections.SHIFT_CHECKLIST_TEMPLATES, 'vespertino'); // <-- CORREGIDO
      const cleanMatutinoTasks = matutinoTemplate.tasks.filter(t => t.trim() !== '');
      const cleanVespertinoTasks = vespertinoTemplate.tasks.filter(t => t.trim() !== '');
      await Promise.all([
        setDoc(matutinoRef, { ...matutinoTemplate, tasks: cleanMatutinoTasks }, { merge: true }),
        setDoc(vespertinoRef, { ...vespertinoTemplate, tasks: cleanVespertinoTasks }, { merge: true })
      ]);
      addNotification('Plantillas guardadas correctamente.', 'success');
    } catch (error: any) { 
      addNotification(`Error al guardar: ${error.message}`, 'error'); 
    } finally { 
      setSaving(false); 
    }
  };

  if (loading) return <LoadingSpinner text="Cargando plantillas..." />;

  return (
    <div className="p-4 sm:p-6 bg-gray-50 animate-fadeIn">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-extrabold text-amore-charcoal">Configuración de Plantillas de Turno</h1>
          <p className="mt-2 text-lg text-gray-600">Define los checklists para los turnos matutino y vespertino.</p>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <TemplateCard template={matutinoTemplate} type="matutino" onTaskChange={handleTaskChange} onRemoveTask={removeTask} onAddTask={addTask} />
          <TemplateCard template={vespertinoTemplate} type="vespertino" onTaskChange={handleTaskChange} onRemoveTask={removeTask} onAddTask={addTask} />
        </div>
        <div className="mt-8 flex justify-end">
          <Button onClick={handleSaveChanges} disabled={saving} variant="primary" size="lg">
            {saving ? <><LoadingSpinner size="sm" /> Guardando...</> : <><i className="fas fa-save mr-2"></i>Guardar Todos los Cambios</>}
          </Button>
        </div>
      </div>
    </div>
  );
};


//=================================================================
// 3. VISTA Y LÓGICA PARA EL GERENTE
//=================================================================
const ManagerView: React.FC = () => {
  const { user } = useAuth();
  const { addNotification } = useNotification();
  
  // Mantenemos un solo estado para toda la información del turno
  const [shiftData, setShiftData] = useState<{
    activeShift: Shift | null;
    checklistTemplate: ShiftChecklistTemplate | null;
    previousNotes: string;
    currentReport: Partial<ShiftReport>;
  } | null>(null);
  
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    // Usamos una variable para evitar condiciones de carrera si el componente se desmonta
    let isMounted = true;

    const loadManagerData = async () => {
      if (!user || !isMounted) {
        setLoading(false);
        return;
      }
      
      setLoading(true);

      // --- Carga de Datos en una sola operación ---
      const shift = await getCurrentActiveShiftForUser(user.uid);
      
      if (shift && isMounted) {
        const prevReport = await getPreviousShiftReport(shift.start);
        const report = await getShiftReport(shift.id);
        
        let template = null;
        const templateId = shift.shiftTypeId as 'matutino' | 'vespertino';
        if (templateId) {
          const templateRef = doc(db, 'shiftChecklistTemplates', templateId);
          const templateSnap = await getDoc(templateRef);
          if (templateSnap.exists()) {
            template = templateSnap.data() as ShiftChecklistTemplate;
          } else {
            addNotification('No se encontró la plantilla de checklist para este turno.', 'error');
          }
        } else {
          addNotification('Este turno no tiene un checklist asignado.', 'warning');
        }

        // Actualizamos todo el estado a la vez
        setShiftData({
          activeShift: shift,
          checklistTemplate: template,
          previousNotes: prevReport?.notes || 'No hay notas del turno anterior.',
          currentReport: report || { completedTasks: {}, notes: '' },
        });

      } else {
        // Si no hay turno, nos aseguramos de que el estado sea nulo
        setShiftData(null);
      }
      
      if (isMounted) {
        setLoading(false);
      }
    };

    loadManagerData();

    // Función de limpieza
    return () => {
      isMounted = false;
    };
  }, [user, addNotification]);

  const handleTaskToggle = (task: string, isChecked: boolean) => {
    if (!shiftData) return;
    setShiftData(prev => ({
      ...prev!,
      currentReport: {
        ...prev!.currentReport,
        completedTasks: { ...prev!.currentReport.completedTasks, [task]: isChecked }
      }
    }));
  };
  
  const handleNotesChange = useCallback((notes: string) => {
  if (!shiftContext) return;
  setShiftContext(prev => ({ ...prev!, currentReport: { ...prev!.currentReport, notes: notes }}));
}, [shiftContext]);

  const handleSaveReport = async () => {
    if (!shiftData?.activeShift || !user) return;
    setIsSaving(true);
    try {
      await upsertShiftReport(shiftData.activeShift.id, {
        shiftId: shiftData.activeShift.id,
        managerId: user.uid,
        templateId: shiftData.activeShift.shiftTypeId,
        completedTasks: shiftData.currentReport.completedTasks || {},
        notes: shiftData.currentReport.notes || ''
      });
      addNotification('Reporte del turno guardado.', 'success');
    } catch (error: any) {
      addNotification(`Error al guardar el reporte: ${error.message}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // --- Lógica de Renderizado ---
  if (loading) return <LoadingSpinner text="Buscando turno activo..." />;
  
  // Ahora la condición es mucho más simple y robusta
  if (!shiftData || !shiftData.activeShift) return (
    <div className="p-6 bg-white rounded-xl shadow-lg text-center">
      <i className="fas fa-bed text-4xl text-gray-400 mb-4"></i>
      <h2 className="text-2xl font-bold text-gray-700">No tienes un turno activo en este momento.</h2>
      <p className="text-gray-500 mt-2">Cuando tu turno comience, aquí aparecerá tu checklist y las notas de relevo.</p>
    </div>
  );

  return (
    <div className="p-4 sm:p-6 bg-gray-50 animate-fadeIn">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-extrabold text-amore-charcoal mb-6">Mi Turno Activo: {shiftData.checklistTemplate?.displayName || 'Sin Checklist'}</h1>
        
        <div className="mb-8">
          <h2 className="text-xl font-bold text-gray-700 mb-2">Notas del Turno Anterior</h2>
          <blockquote className="p-4 bg-yellow-50 border-l-4 border-yellow-400 text-yellow-800 italic rounded-r-lg">
            {shiftData.previousNotes}
          </blockquote>
        </div>

        {shiftData.checklistTemplate ? (
          <div className="mb-8 p-6 bg-white rounded-xl shadow-md">
            <h2 className="text-xl font-bold text-amore-charcoal mb-4">Checklist de Tareas</h2>
            <div className="space-y-3">
              {shiftData.checklistTemplate.tasks.map(task => (
                <label key={task} className="flex items-center p-3 rounded-md transition hover:bg-gray-50">
                  <input
                    type="checkbox"
                    checked={shiftData.currentReport.completedTasks?.[task] || false}
                    onChange={(e) => handleTaskToggle(task, e.target.checked)}
                    className="h-5 w-5 rounded border-gray-300 text-amore-red focus:ring-amore-red-soft"
                  />
                  <span className="ml-3 text-lg text-gray-700">{task}</span>
                </label>
              ))}
            </div>
          </div>
        ) : (
          <div className="mb-8 p-6 bg-orange-100 border-l-4 border-orange-500 rounded-lg">
             <h2 className="font-bold text-orange-800">No se encontró un checklist para este turno.</h2>
             <p className="text-orange-700">Contacta al administrador para que asigne una plantilla de checklist a este tipo de turno.</p>
          </div>
        )}
        
        <div className="p-6 bg-white rounded-xl shadow-md">
          <h2 className="text-xl font-bold text-amore-charcoal mb-2">Notas para el Siguiente Turno</h2>
          <textarea
            value={shiftData.currentReport.notes}
            onChange={(e) => handleNotesChange(e.target.value)}
            placeholder="Escribe aquí cualquier cosa importante para el siguiente gerente..."
            className="w-full p-2 rounded-md border-gray-300 shadow-sm focus:border-amore-red focus:ring-amore-red"
            rows={5}
          />
        </div>

        <div className="mt-8 flex justify-end">
          <Button onClick={handleSaveReport} variant="primary" size="lg" disabled={isSaving}>
            {isSaving ? 'Guardando...' : <><i className="fas fa-save mr-2"></i>Guardar Reporte de Turno</>}
          </Button>
        </div>
      </div>
    </div>
  );
};


//=================================================================
// 4. COMPONENTE PRINCIPAL QUE DECIDE QUÉ VISTA MOSTRAR
//=================================================================
const ChecklistManager: React.FC = () => {
  const { userData } = useAuth();

  if (!userData) {
    return <LoadingSpinner />;
  }
  
  return userData.role === UserRole.DUENO ? <OwnerView /> : <ManagerView />;
};

export default ChecklistManager;