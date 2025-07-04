import React from 'react';
import { Shift, ShiftStatus } from '../../types';
import Modal from '../common/Modal';
import Button from '../common/Button';
import { format } from 'date-fns';
import { es } from 'date-fns/locale/es';
import { DATE_FORMAT_SPA_DATETIME, DATE_FORMAT_SPA_TIME_ONLY } from '../../constants';

interface ShiftDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  shift: Shift;
  // Hacemos opcionales estas props que son para diferentes contextos
  onRequestChange?: (shift: Shift) => void;
  canRequestChange?: boolean;
  onProposalDecision?: (accepted: boolean) => void;
  isProposal?: boolean;
}

const ShiftDetailModal: React.FC<ShiftDetailModalProps> = ({ 
  isOpen, 
  onClose, 
  shift, 
  onRequestChange,
  canRequestChange,
  onProposalDecision,
  isProposal = false,
}) => {

  const modalFooter = (
    <div className="flex justify-end items-center w-full gap-2">
      {/* Lógica para mostrar botones según el contexto */}
      {isProposal && onProposalDecision && (
        <>
          <Button variant="success" onClick={() => onProposalDecision(true)} icon={<i className="fas fa-check mr-2"></i>}>Aceptar Cobertura</Button>
          <Button variant="danger" onClick={() => onProposalDecision(false)} icon={<i className="fas fa-times mr-2"></i>}>Rechazar</Button>
        </>
      )}

      {!isProposal && canRequestChange && onRequestChange && (
        <Button onClick={() => onRequestChange(shift)} variant="warning" icon={<i className="fas fa-exchange-alt mr-2"></i>}>
          Solicitar Cambio
        </Button>
      )}
      
      {!isProposal && !canRequestChange && shift.status === ShiftStatus.CAMBIO_SOLICITADO && (
        <p className="text-sm text-yellow-700 font-semibold text-center flex-grow">Solicitud de cambio enviada.</p>
      )}

      <Button onClick={onClose} variant="light">Cerrar</Button>
    </div>
  );

  return (
    <Modal 
        isOpen={isOpen} 
        onClose={onClose} 
        title={isProposal ? "Propuesta de Cobertura de Turno" : "Detalle del Turno"}
        size="lg"
        footer={modalFooter}
    >
      <div className="space-y-4">
        {isProposal && (
            <p className="text-amore-gray text-center bg-yellow-50 p-3 rounded-md">
                Se te ha propuesto para cubrir el siguiente turno. Por favor, revisa y responde.
            </p>
        )}
        <div>
          <h3 className="text-lg font-semibold text-amore-charcoal mb-1">Información del Turno</h3>
          <p className="text-sm text-gray-600">
            <strong>Tipo de Turno:</strong> {shift.shiftTypeName || 'No especificado'}
          </p>
          <p className="text-sm text-gray-600">
            <strong>Fecha y Hora:</strong> {shift.start ? format(shift.start.toDate(), DATE_FORMAT_SPA_DATETIME, { locale: es }) : 'N/A'} - {shift.end ? format(shift.end.toDate(), DATE_FORMAT_SPA_TIME_ONLY, { locale: es }) : 'N/A'}
          </p>
          {shift.notes && <p className="text-sm text-gray-600"><strong>Notas del Gerente:</strong> {shift.notes}</p>}
        </div>
      </div>
    </Modal>
  );
};

export default ShiftDetailModal;