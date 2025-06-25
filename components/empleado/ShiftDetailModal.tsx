
import React, { useState, useEffect } from 'react';
import { Shift, ShiftType, ChecklistItem as ChecklistItemType, ShiftStatus } from '../../types';
import Modal from '../common/Modal';
import Button from '../common/Button';
import { format } from 'date-fns';
import { es } from 'date-fns/locale/es';
import { DATE_FORMAT_SPA_DATETIME, DATE_FORMAT_SPA_TIME_ONLY } from '../../constants';

interface ChecklistItemProps {
  item: ChecklistItemType;
  onToggle: () => void;
  index: number;
}

const ChecklistItemDisplay: React.FC<ChecklistItemProps> = ({ item, onToggle, index }) => {
  const itemId = `checklist-${index}-${item.task.replace(/\s+/g, '-')}`;
  return (
    <div className="flex items-center mb-2 p-2 bg-gray-50 rounded hover:bg-gray-100 transition-colors">
      <input
        type="checkbox"
        id={itemId}
        checked={item.done}
        onChange={onToggle}
        className="h-5 w-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500 cursor-pointer"
        aria-labelledby={`${itemId}-label`}
      />
      <label 
        id={`${itemId}-label`}
        htmlFor={itemId}
        className={`ml-3 block text-sm font-medium ${item.done ? 'text-gray-400 line-through italic' : 'text-gray-700'} cursor-pointer`}
      >
        {item.task}
      </label>
    </div>
  );
};

interface ShiftDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  shift: Shift;
  shiftType: ShiftType; // Expect shiftType to be passed directly
  onRequestChange: (shift: Shift) => void;
  canRequestChange: boolean;
}

const ShiftDetailModal: React.FC<ShiftDetailModalProps> = ({ 
  isOpen, 
  onClose, 
  shift, 
  shiftType, 
  onRequestChange,
  canRequestChange
}) => {
  const [checklist, setChecklist] = useState<ChecklistItemType[]>([]);

  useEffect(() => {
    // Initialize checklist state from shiftType template when modal opens or shiftType changes
    // The 'done' state is ephemeral for this modal instance
    if (isOpen && shiftType && shiftType.checklist) {
      setChecklist(shiftType.checklist.map(item => ({ ...item, done: false })));
    }
  }, [shiftType, isOpen]); 

  const handleToggleChecklistItem = (index: number) => {
    setChecklist(prev =>
      prev.map((item, i) =>
        i === index ? { ...item, done: !item.done } : item
      )
    );
  };

  if (!shiftType) { // Should not happen if data is loaded correctly before opening
      return (
        <Modal isOpen={isOpen} onClose={onClose} title="Error">
            <p>No se pudieron cargar los detalles del tipo de turno.</p>
        </Modal>
      );
  }

  const modalFooter = (
    <>
      {canRequestChange && (
        <Button 
          onClick={() => onRequestChange(shift)} 
          variant="warning"
          icon={<i className="fas fa-exchange-alt"></i>}
        >
          Solicitar Cambio de Turno
        </Button>
      )}
      {!canRequestChange && shift.status === ShiftStatus.CAMBIO_SOLICITADO && (
         <p className="text-sm text-yellow-700 bg-yellow-100 p-3 rounded-md w-full text-center">
            <i className="fas fa-info-circle mr-2"></i>Ya has solicitado un cambio.
        </p>
      )}
      {!canRequestChange && shift.status === ShiftStatus.CAMBIO_EN_PROCESO && (
         <p className="text-sm text-orange-700 bg-orange-100 p-3 rounded-md w-full text-center">
            <i className="fas fa-hourglass-half mr-2"></i>Este turno esta en proceso de cambio.
        </p>
      )}
      <Button onClick={onClose} variant="light" className="ml-2">Cerrar</Button>
    </>
  );

  return (
    <Modal 
        isOpen={isOpen} 
        onClose={onClose} 
        title={`Detalle: ${shiftType.name}`} 
        size="xl"
        footer={modalFooter}
    >
      <div className="space-y-5">
        <div>
          <h3 className="text-lg font-semibold text-gray-800 mb-1">Informacion del Turno</h3>
          <p className="text-sm text-gray-600">
            <strong>Fecha y Hora:</strong> {shift.start ? format(shift.start.toDate(), DATE_FORMAT_SPA_DATETIME, { locale: es }) : 'N/A'} - {shift.end ? format(shift.end.toDate(), DATE_FORMAT_SPA_TIME_ONLY, { locale: es }) : 'N/A'}
          </p>
          <p className="text-sm text-gray-600"><strong>Tipo:</strong> {shiftType.name}</p>
          {shift.notes && <p className="text-sm text-gray-600"><strong>Notas:</strong> {shift.notes}</p>}
        </div>

        {shiftType.checklist && shiftType.checklist.length > 0 && (
          <div>
            <h3 className="text-lg font-semibold text-gray-800 mb-2 border-b pb-1">Guia de Excelencia (Checklist)</h3>
            <div className="max-h-60 overflow-y-auto pr-2 custom-scrollbar">
              {checklist.map((item, index) => (
                <ChecklistItemDisplay
                  key={index}
                  item={item}
                  onToggle={() => handleToggleChecklistItem(index)}
                  index={index}
                />
              ))}
            </div>
          </div>
        )}

        {shiftType.procedures && shiftType.procedures.length > 0 && (
          <div>
            <h3 className="text-lg font-semibold text-gray-800 mb-2 border-b pb-1">Procedimientos Clave</h3>
            <ul className="space-y-3 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
              {shiftType.procedures.map((proc, index) => (
                <li key={index} className="p-3 bg-indigo-50 rounded-md shadow-sm">
                  <p className="font-semibold text-indigo-700">{proc.task}</p>
                  <p className="text-sm text-gray-600 whitespace-pre-line">{proc.guide}</p>
                  {proc.videoUrl && (
                    <a
                      href={proc.videoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-500 hover:text-blue-700 hover:underline mt-1 inline-block"
                    >
                      <i className="fas fa-video mr-1"></i> Ver Video Guia
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default ShiftDetailModal;