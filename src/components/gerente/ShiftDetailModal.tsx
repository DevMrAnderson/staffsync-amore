import React from 'react';
import { Shift, ShiftStatus, User } from '../../types';
import { format } from 'date-fns';
import { es } from 'date-fns/locale/es';
import Modal from '../common/Modal';
import Button from '../common/Button';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  shift: Shift | null;
  currentUser: User | null;
  onOfferShift: (shift: Shift) => void;
  onUploadJustification: (shift: Shift) => void;
}

const ShiftDetailModal: React.FC<Props> = ({ isOpen, onClose, shift, currentUser, onOfferShift, onUploadJustification }) => {
  if (!shift || !currentUser || !shift.start || !shift.end) {
    // Si el turno no existe o no tiene fechas, no dibujamos nada y lo reportamos.
    console.error("ShiftDetailModal recibió un turno incompleto o nulo:", shift);
    return null; 
  }


  const isMyShift = shift.userId === currentUser.id;
  const isShiftInThePast = new Date() > shift.start.toDate();
  const canOfferShift = isMyShift && !isShiftInThePast && shift.status === ShiftStatus.CONFIRMADO;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Detalle del Turno">
      <div className="p-6 space-y-4">
        <div>
          <h3 className="text-lg font-bold text-amore-charcoal">{shift.shiftTypeName}</h3>
          <p className="text-sm text-gray-500">
            {format(shift.start.toDate(), 'eeee, d \'de\' MMMM', { locale: es })}
          </p>
        </div>

        <div className="text-base text-gray-700">
          <p><i className="fas fa-clock w-5 text-gray-400 mr-2"></i>{format(shift.start.toDate(), 'p', { locale: es })} - {format(shift.end.toDate(), 'p', { locale: es })}</p>
          <p><i className="fas fa-user w-5 text-gray-400 mr-2"></i>Asignado a: <span className="font-semibold">{shift.userName}</span></p>
        </div>

        {shift.notes && (
          <div className="pt-4 border-t">
            <h4 className="font-semibold text-amore-charcoal">Notas del Turno:</h4>
            <p className="text-sm text-gray-600 italic mt-1">{shift.notes}</p>
          </div>
        )}

        {/* --- BOTÓN PARA SUBIR JUSTIFICANTE --- */}
      {/* Solo aparece si el turno tiene una falta */}
      {shift.status === ShiftStatus.FALTA_INJUSTIFICADA && (
        <div className="mt-6 border-t pt-6 text-center">
          <p className="text-sm text-red-700 font-semibold mb-3">Este turno fue marcado como falta injustificada.</p>
          <Button onClick={() => onUploadJustification(shift)} variant="info" icon={<i className="fas fa-file-upload mr-2"></i>}>
            Subir Justificante
          </Button>
        </div>
      )}
        
        {/* --- El Nuevo Botón de Ofrecer Turno --- */}
        {/* Solo aparece si se cumplen todas las condiciones */}
        {canOfferShift && (
          <div className="mt-6 border-t pt-6 text-center">
            <p className="text-sm text-gray-600 mb-3">¿No puedes cubrir este turno?</p>
            <Button 
              onClick={() => onOfferShift(shift)} 
              variant="warning"
              icon={<i className="fas fa-bullhorn mr-2"></i>}
            >
              Ofrecer a otro Gerente
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default ShiftDetailModal;