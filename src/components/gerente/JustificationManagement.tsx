import React, { useState, useEffect } from 'react';
import { Justification, JustificationStatus } from '../../types';
import Button from '../common/Button';
import LoadingSpinner from '../common/LoadingSpinner';
import Modal from '../common/Modal';
import { useNotification } from '../../contexts/NotificationContext';
import { updateJustification, onPendingJustificationsSnapshot, serverTimestamp } from '../../services/firestoreService';
import { logUserAction } from '../../services/historyService';
import { useAuth } from '../../contexts/AuthContext';
import { format } from 'date-fns';
import { es } from 'date-fns/locale/es';
import { DATE_FORMAT_SPA_DATE_ONLY, DATE_FORMAT_SPA_DATETIME, HISTORY_ACTIONS } from '../../constants';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../services/firebase';
import JustificationHistory from './JustificationHistory'; // Importamos el nuevo componente
import JustificationPendingList from './JustificationPendingList';

const JustificationManagement: React.FC = () => {
  const [view, setView] = useState<'pending' | 'history'>('pending');

  return (
    <div className="animate-fadeIn">
      <div className="flex items-center justify-between mb-6 border-b pb-3">
        <h2 className="text-2xl font-bold text-amore-charcoal">
          Gestión de Justificantes
        </h2>
        <div className="flex space-x-2">
          <Button 
            variant={view === 'pending' ? 'primary' : 'light'}
            onClick={() => setView('pending')}
          >
            Pendientes
          </Button>
          <Button 
            variant={view === 'history' ? 'primary' : 'light'}
            onClick={() => setView('history')}
          >
            Historial
          </Button>
        </div>
      </div>

      {/* Mostramos un componente u otro dependiendo de la vista seleccionada */}
      {view === 'pending' ? <JustificationPendingList /> : <JustificationHistory />}
    </div>
  );
};

export default JustificationManagement;
