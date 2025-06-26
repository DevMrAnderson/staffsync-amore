import React, { useState } from 'react';
import Navbar from '../common/Navbar';
import ScheduleBuilder from './ScheduleBuilder';
import ChangeRequestManagement from './ChangeRequestManagement';
import JustificationManagement from './JustificationManagement';
import Button from '../common/Button';
import { useAuth } from '../../contexts/AuthContext';
import { getOptimizedScheduleTemplate } from '../../services/aiService';
import { useNotification } from '../../contexts/NotificationContext';
import { PartialShiftForTemplate } from '../../types';
import LoadingSpinner from '../common/LoadingSpinner';

type GerenteView = 'scheduleBuilder' | 'changeRequests' | 'justifications' | 'predictive';

interface GerenteViewConfig {
  id: GerenteView;
  label: string;
  icon: string; // Font Awesome class
}

const GERENTE_VIEWS: GerenteViewConfig[] = [
  { id: 'scheduleBuilder', label: 'Constructor de Horarios', icon: 'fas fa-calendar-alt' },
  { id: 'changeRequests', label: 'Gestionar Cambios', icon: 'fas fa-exchange-alt' },
  { id: 'justifications', label: 'Gestionar Justificantes', icon: 'fas fa-file-signature' },
  { id: 'predictive', label: 'Analisis Predictivo (IA)', icon: 'fas fa-lightbulb' },
];


const GerenteDashboard: React.FC = () => {
  const { userData } = useAuth();
  const { addNotification } = useNotification();
  const [activeView, setActiveView] = useState<GerenteView>('scheduleBuilder');
  const [optimizedTemplate, setOptimizedTemplate] = useState<PartialShiftForTemplate[] | null>(null);
  const [loadingTemplate, setLoadingTemplate] = useState(false);

  const handleOptimizeSchedule = async () => {
    setLoadingTemplate(true);
    setOptimizedTemplate(null); // Clear previous template
    try {
      const template = await getOptimizedScheduleTemplate(); // Already typed as PartialShiftForTemplate[]
      setOptimizedTemplate(template);
      if (template.length > 0) {
        addNotification(`Plantilla de horario optimizado con ${template.length} turnos (simulada) cargada.`, 'info');
      } else {
        addNotification('La IA no genero sugerencias para la plantilla esta vez (simulado).', 'info');
      }
      setActiveView('scheduleBuilder'); // Switch to builder with the template
    } catch (error: any) {
      console.error("Error al obtener plantilla optimizada:", error);
      addNotification(`Error al cargar plantilla optimizada: ${error.message}`, 'error');
    } finally {
      setLoadingTemplate(false);
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
            <h2 className="text-xl font-semibold mb-4 text-gray-700">Analisis Predictivo (Simulado)</h2>
            <p className="mb-4 text-gray-600">
              Utiliza la IA para generar una plantilla de horario optimizada basada en patrones historicos y predicciones de demanda (simulado).
              Los resultados apareceran en el Constructor de Horarios.
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
            {GERENTE_VIEWS.map(view => (
              <Button 
                key={view.id}
                variant={activeView === view.id ? 'primary' : 'light'}
                onClick={() => {
                    setActiveView(view.id);
                    if (view.id !== 'scheduleBuilder') setOptimizedTemplate(null); // Clear template if navigating away from builder unless going to predictive then builder
                }}
                icon={<i className={`${view.icon} mr-2`}></i>}
                className="flex-grow sm:flex-grow-0"
              >
                {view.label}
              </Button>
            ))}
          </div>
        </aside>
        
        <main className="bg-white p-2 sm:p-4 md:p-6 rounded-xl shadow-lg min-h-[400px]">
          {renderView()}
        </main>
      </div>
    </div>
  );
};

export default GerenteDashboard;
