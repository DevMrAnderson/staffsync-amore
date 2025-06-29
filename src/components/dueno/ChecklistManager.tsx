import React, { useState, useEffect, useCallback } from 'react';
import { useNotification } from '../../contexts/NotificationContext';
import { ChecklistTemplate } from '../../types';
import { getChecklistTemplates, addChecklistTemplate, updateChecklistTemplate, deleteChecklistTemplate } from '../../services/firestoreService';
import Button from '../common/Button';
import Modal from '../common/Modal';
import LoadingSpinner from '../common/LoadingSpinner';

const ChecklistManager: React.FC = () => {
  const { addNotification } = useNotification();
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // --- LÓGICA DEL FORMULARIO REFACTORIZADA ---
  // En lugar de un objeto complejo, usamos estados simples para cada campo del formulario.
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [currentName, setCurrentName] = useState('');
  const [currentDescription, setCurrentDescription] = useState('');
  const [currentTasks, setCurrentTasks] = useState(''); // Siempre un string

  const fetchTemplates = useCallback(async () => {
    setIsLoading(true);
    try {
      const fetchedTemplates = await getChecklistTemplates();
      setTemplates(fetchedTemplates);
    } catch (error: any) {
      addNotification(`Error al cargar plantillas: ${error.message}`, 'error');
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  }, [addNotification]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const handleOpenModal = (template?: ChecklistTemplate) => {
    if (template) {
      // Si estamos editando, llenamos los estados con los datos de la plantilla
      setCurrentId(template.id);
      setCurrentName(template.name);
      setCurrentDescription(template.description);
      setCurrentTasks(template.tasks.join('\n'));
    } else {
      // Si estamos creando, reseteamos todos los estados
      setCurrentId(null);
      setCurrentName('');
      setCurrentDescription('');
      setCurrentTasks('');
    }
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentName) {
      addNotification('El nombre de la plantilla es obligatorio.', 'warning');
      return;
    }

    const tasksArray = currentTasks.split('\n').filter(task => task.trim() !== '');

    const templateData = {
      name: currentName,
      description: currentDescription,
      tasks: tasksArray,
    };

    try {
      if (currentId) {
        await updateChecklistTemplate(currentId, templateData);
        addNotification('Plantilla actualizada con éxito.', 'success');
      } else {
        await addChecklistTemplate(templateData);
        addNotification('Plantilla creada con éxito.', 'success');
      }
      setIsModalOpen(false);
      fetchTemplates(); // Recargamos la lista
    } catch (error: any) {
      addNotification(`Error al guardar: ${error.message}`, 'error');
      console.error(error);
    }
  };

  const handleDelete = async (templateId: string) => {
    if (window.confirm('¿Estás seguro de que quieres eliminar esta plantilla? Esta acción no se puede deshacer.')) {
      try {
        await deleteChecklistTemplate(templateId);
        addNotification('Plantilla eliminada.', 'success');
        fetchTemplates();
      } catch (error: any) {
        addNotification(`Error al eliminar: ${error.message}`, 'error');
      }
    }
  };

  if (isLoading) return <LoadingSpinner text="Cargando plantillas de checklist..." />;

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-semibold text-amore-charcoal">Gestión de Plantillas de Checklist</h3>
        <Button onClick={() => handleOpenModal()} variant="primary" icon={<i className="fas fa-plus mr-2"></i>}>
          Nueva Plantilla
        </Button>
      </div>
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <ul className="divide-y divide-gray-200">
          {templates.map(template => (
            <li key={template.id} className="p-4 hover:bg-gray-50 flex items-center justify-between flex-wrap">
              <div className="flex-grow min-w-[200px]">
                <p className="font-semibold text-amore-charcoal">{template.name}</p>
                <p className="text-sm text-amore-gray">{template.description}</p>
                <p className="text-xs text-gray-400 mt-1">{template.tasks?.length || 0} tarea(s)</p>
              </div>
              <div className="flex-shrink-0 mt-2 sm:mt-0">
                <Button onClick={() => handleOpenModal(template)} variant="light" size="sm" className="mr-2">Editar</Button>
                <Button onClick={() => handleDelete(template.id)} variant="danger" size="sm">Eliminar</Button>
              </div>
            </li>
          ))}
        </ul>
        {templates.length === 0 && !isLoading && <p className="text-center p-8 text-amore-gray">No hay plantillas de checklist. ¡Crea la primera!</p>}
      </div>

      {isModalOpen && (
        <Modal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title={currentId ? 'Editar Plantilla' : 'Nueva Plantilla'}
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="light" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
              <Button type="submit" form="templateForm" variant="primary">Guardar</Button>
            </div>
          }
        >
          <form id="templateForm" onSubmit={handleSave} className="space-y-4">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-amore-gray">Nombre de la Plantilla</label>
              <input type="text" name="name" value={currentName} onChange={(e) => setCurrentName(e.target.value)} required className="mt-1 w-full p-2 border rounded-md"/>
            </div>
            <div>
              <label htmlFor="description" className="block text-sm font-medium text-amore-gray">Descripción</label>
              <textarea name="description" id="description" value={currentDescription} onChange={(e) => setCurrentDescription(e.target.value)} rows={2} className="mt-1 w-full p-2 border rounded-md"/>
            </div>
            <div>
              <label htmlFor="tasks" className="block text-sm font-medium text-amore-gray">Tareas (una por línea)</label>
              <textarea name="tasks" id="tasks" value={currentTasks} onChange={(e) => setCurrentTasks(e.target.value)} rows={5} className="mt-1 w-full p-2 border rounded-md font-mono text-sm"/>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};

export default ChecklistManager;