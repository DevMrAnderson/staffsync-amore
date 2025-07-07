import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useNotification } from '../../contexts/NotificationContext';
import { Shift, ShiftOffer } from '../../types';
import { 
  onAvailableShiftOffersSnapshot, 
  claimShiftOffer,
  getShiftsForMonth // Necesitaremos esta función para el horario del gerente
} from '../../services/firestoreService';
import { format, isSameDay, subDays } from 'date-fns';
import { es } from 'date-fns/locale/es';

import Button from '../common/Button';
import LoadingSpinner from '../common/LoadingSpinner';
import Modal from '../common/Modal';

const ManagerShiftSwap: React.FC = () => {
  const { user, userData } = useAuth();
  const { addNotification } = useNotification();
  
  const [offeredShifts, setOfferedShifts] = useState<ShiftOffer[]>([]);
  const [myShifts, setMyShifts] = useState<Shift[]>([]); // <-- NUEVO: Estado para el horario propio
  const [loading, setLoading] = useState(true);
  
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [offerToConfirm, setOfferToConfirm] = useState<ShiftOffer | null>(null);

  // useEffect para cargar TODOS los datos necesarios
  useEffect(() => {
    if (!user) return;

    // 1. Oyente para las ofertas de otros gerentes (como antes)
    const unsubOffers = onAvailableShiftOffersSnapshot(user.uid, (offers) => {
      setOfferedShifts(offers);
      setLoading(false);
    });
    
    // 2. Cargamos los turnos del mes del gerente actual para las validaciones
    const fetchMyShifts = async () => {
      // Cargamos los turnos del mes actual y el siguiente para tener contexto
      const thisMonthShifts = await getShiftsForMonth(new Date(), user.uid);
      const nextMonthShifts = await getShiftsForMonth(new Date(new Date().setMonth(new Date().getMonth() + 1)), user.uid);
      setMyShifts([...thisMonthShifts, ...nextMonthShifts]);
    };

    fetchMyShifts();

    // Limpiamos la suscripción al desmontar
    return () => unsubOffers();
  }, [user]);

  // --- LÓGICA MEJORADA DE FILTRADO ---
  const filteredAndEnrichedOffers = useMemo(() => {
    return offeredShifts
      // 1. Ocultamos ofertas en días que ya tenemos un turno
      .filter(offer => {
        if (!offer.shiftDetails?.start) return false;
        const offerDate = offer.shiftDetails.start.toDate();
        return !myShifts.some(myShift => isSameDay(myShift.start.toDate(), offerDate));
      })
      // 2. Añadimos la advertencia de "clopening"
      .map(offer => {
        let clopeningWarning = false;
        if (offer.shiftDetails?.shiftTypeId === 'matutino') {
          const previousDay = subDays(offer.shiftDetails.start.toDate(), 1);
          const workedVespertino = myShifts.some(myShift => 
            isSameDay(myShift.start.toDate(), previousDay) && myShift.shiftTypeId === 'vespertino'
          );
          if (workedVespertino) {
            clopeningWarning = true;
          }
        }
        return { ...offer, clopeningWarning };
      });
  }, [offeredShifts, myShifts]);

  const handleOpenConfirmModal = (offer: ShiftOffer) => {
    setOfferToConfirm(offer);
  };

  const handleClaimShift = async () => {
    if (!offerToConfirm || !user || !userData) return;
    
    const offerId = offerToConfirm.id;
    setClaimingId(offerId); // Para mostrar el spinner en el botón
    setOfferToConfirm(null); // Cerramos el modal

    try {
      await claimShiftOffer(offerId, user.uid, userData.name);
      addNotification('¡Turno reclamado con éxito! El horario se actualizará.', 'success');
    } catch (error: any) {
      addNotification(`No se pudo reclamar el turno: ${error.message}`, 'error');
    } finally {
      setClaimingId(null);
    }
  };

  if (loading) return <div className="text-center p-4"><LoadingSpinner text="Buscando turnos disponibles..." /></div>;

  return (
    <div className="p-4 bg-white rounded-xl shadow-lg">
      <h2 className="text-2xl font-bold text-amore-charcoal mb-4">Intercambio de Turnos (Gerentes)</h2>
      {filteredAndEnrichedOffers.length === 0 ? (
        <p className="text-center text-gray-500 italic py-6">No hay ofertas compatibles con tu horario en este momento.</p>
      ) : (
        <div className="space-y-3">
          {filteredAndEnrichedOffers.map(offer => (
            <div key={offer.id} className={`p-4 rounded-lg flex flex-col sm:flex-row justify-between items-center gap-4 ${offer.clopeningWarning ? 'bg-orange-50 border-l-4 border-orange-500' : 'bg-green-50 border-l-4 border-green-500'}`}>
              <div>
                <p className="font-bold text-gray-800">{offer.offeringManagerName} ofrece su turno:</p>
                <p className="text-sm text-gray-700">
                  {offer.shiftDetails?.shiftTypeName} del {offer.shiftDetails ? format(offer.shiftDetails.start.toDate(), 'PPP', { locale: es }) : ''}
                </p>
                {/* --- NUEVA ADVERTENCIA DE CLOPENING --- */}
                {offer.clopeningWarning && (
                  <p className="text-xs font-bold text-orange-600 mt-1 flex items-center">
                    <i className="fas fa-exclamation-triangle mr-1.5"></i>
                    Advertencia: Este turno es un "clopening".
                  </p>
                )}
              </div>
              <Button 
                onClick={() => handleOpenConfirmModal(offer)} 
                variant="success"
                isLoading={claimingId === offer.id}
                disabled={!!claimingId}
              >
                Aceptar Turno
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* --- NUEVO MODAL DE CONFIRMACIÓN --- */}
    {offerToConfirm && (
      <Modal
        isOpen={!!offerToConfirm}
        onClose={() => setOfferToConfirm(null)}
        title="Confirmar Cobertura de Turno"
      >
        <div className="p-4 text-center">
          <p className="text-gray-700">
            ¿Estás seguro de que quieres aceptar este turno de 
            <strong className="mx-1">{offerToConfirm.offeringManagerName}</strong>?
          </p>
          <p className="text-sm text-gray-500 mt-2">
            Esta acción se reflejará en tu horario.
          </p>
          <div className="mt-6 flex justify-center gap-4">
            <Button onClick={() => setOfferToConfirm(null)} variant="light">
              Cancelar
            </Button>
            <Button onClick={handleClaimShift} variant="success">
              Sí, Aceptar Turno
            </Button>
          </div>
        </div>
      </Modal>
    )}
  </div>
);
};

export default ManagerShiftSwap;