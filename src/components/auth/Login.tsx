import React, { useState, useCallback } from 'react';
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../../services/firebase';
import { useNotification } from '../../contexts/NotificationContext';

// Componentes Comunes
import Button from '../common/Button';
import Modal from '../common/Modal';
import LoadingSpinner from '../common/LoadingSpinner';

const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { addNotification } = useNotification();
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);

  /**
   * Maneja el intento de inicio de sesión del usuario.
   */
  const handleLogin = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      addNotification('Por favor, ingresa correo y contraseña.', 'warning');
      return;
    }
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      // El AuthContext se encargará de la redirección al dashboard correcto.
    } catch (err: any) {
      console.error("Error de Login:", err);
      let errorMessage = 'Error al iniciar sesión. Verifica tus credenciales.';
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        errorMessage = 'Correo o contraseña incorrectos.';
      }
      addNotification(errorMessage, 'error');
    } finally {
      setLoading(false);
    }
  }, [email, password, addNotification]);

  /**
   * Maneja la solicitud de restablecimiento de contraseña.
   */
  const handlePasswordReset = useCallback(async () => {
    setIsResetModalOpen(false); // Cierra el modal
    if (!email) {
      addNotification('Por favor, escribe tu correo electrónico en el campo para restablecer la contraseña.', 'warning');
      return;
    }
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, email);
      addNotification('¡Correo de restablecimiento enviado! Revisa tu bandeja de entrada y spam.', 'success');
    } catch (error: any) {
      addNotification('No se encontró ninguna cuenta con ese correo electrónico.', 'error');
    } finally {
      setLoading(false);
    }
  }, [email, addNotification]);

  return (
    // Usamos un Fragmento (<>) para agrupar los elementos sin añadir un div extra al DOM.
    <>
      <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
        <div className="bg-white p-8 md:p-10 rounded-xl shadow-2xl w-full max-w-md animate-fadeIn">
          <div className="text-center mb-8">
            <img 
              src="/PNG1.png"
              alt="Logo StaffSync para Cocina Amore"
              className="w-24 h-24 mx-auto mb-4"
            />
            <h1 className="text-3xl font-bold text-amore-charcoal">StaffSync</h1>
            <p className="text-amore-gray mt-1">
              Portal de Personal para <span className="font-semibold text-amore-red">Cocina Amore</span>
            </p>
          </div>
          
          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label htmlFor="email" className="sr-only">Correo Electrónico</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <i className="fas fa-envelope text-gray-400"></i>
                </div>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full pl-10 px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-amore-red focus:border-amore-red sm:text-sm transition-colors"
                  placeholder="tu@email.com"
                />
              </div>
            </div>
            
            <div>
              <label htmlFor="password" className="sr-only">Contraseña</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <i className="fas fa-lock text-gray-400"></i>
                </div>
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full pl-10 px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-amore-red focus:border-amore-red sm:text-sm transition-colors"
                  placeholder="••••••••"
                />
              </div>
            </div>
            
            <div>
              <Button type="submit" variant="primary" size="lg" fullWidth isLoading={loading} icon={loading ? undefined : <i className="fas fa-sign-in-alt"></i>}>
                {loading ? 'Ingresando...' : 'Ingresar'}
              </Button>
            </div>
          </form>
          
          <div className="mt-8 text-center text-sm text-gray-500 flex items-center justify-center gap-4">
            <button 
              type="button" 
              onClick={() => setIsResetModalOpen(true)}
              className="font-medium text-amore-red hover:underline focus:outline-none"
            >
              ¿Olvidaste tu contraseña?
            </button>
            <span className="text-gray-300">|</span>
            <a href="mailto:soporte@cocinaamore.com" className="font-medium text-amore-red hover:underline">
              Contactar Soporte
            </a>
          </div>
        </div>
      </div>

      {/* --- MODAL DE CONFIRMACIÓN PARA RECUPERAR CONTRASEÑA --- */}
      <Modal
        isOpen={isResetModalOpen}
        onClose={() => setIsResetModalOpen(false)}
        title="Restablecer Contraseña"
      >
        <div className="p-4 text-center">
          <p className="text-gray-700">
            Se enviará un enlace para restablecer la contraseña a la siguiente dirección:
          </p>
          <p className="font-bold my-4 text-lg text-amore-charcoal break-all">{email || '...'}</p>
          <p className="text-sm text-gray-500">¿Deseas continuar?</p>
          <div className="mt-6 flex justify-center gap-4">
            <Button onClick={() => setIsResetModalOpen(false)} variant="light">
              Cancelar
            </Button>
            <Button onClick={handlePasswordReset} variant="primary">
              Sí, Enviar Correo
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
};

export default Login;