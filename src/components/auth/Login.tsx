import React, { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../../services/firebase';
import Button from '../common/Button';
import { useNotification } from '../../contexts/NotificationContext';

const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { addNotification } = useNotification();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      addNotification('Por favor, ingresa correo y contraseña.', 'warning');
      return;
    }
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      // La notificación de éxito se puede omitir, ya que la redirección es inmediata.
    } catch (err: any) {
      console.error("Login error:", err);
      let errorMessage = 'Error al iniciar sesión. Verifica tus credenciales.';
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        errorMessage = 'Correo o contraseña incorrectos.';
      } else if (err.code === 'auth/invalid-email') {
        errorMessage = 'El formato del correo electrónico no es válido.';
      }
      addNotification(errorMessage, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    // CAMBIO: Un fondo más limpio y profesional que coincide con el resto de la app
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
      <div className="bg-white p-8 md:p-10 rounded-xl shadow-2xl w-full max-w-md animate-fadeIn">
        <div className="text-center mb-8">
          
          {/* CAMBIO: Reemplazamos el placeholder por tu logo animado */}
          <img 
            src="/PNG1.png"
            alt="Logo StaffSync para Cocina Amore"
            className="w-24 h-24 mx-auto mb-4 animate-pro-spinner" // Usamos la animación profesional que creamos
          />
          
          {/* CAMBIO: Títulos que establecen la marca y el cliente */}
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
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                // CAMBIO: El color de foco ahora es 'amore-red'
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
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                // CAMBIO: El color de foco ahora es 'amore-red'
                className="block w-full pl-10 px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-amore-red focus:border-amore-red sm:text-sm transition-colors"
                placeholder="••••••••"
              />
            </div>
          </div>
          
          <div>
            {/* Este botón ahora usará automáticamente el estilo 'amore-red' gracias a nuestro componente Button */}
            <Button type="submit" variant="primary" size="lg" fullWidth isLoading={loading} icon={!loading ? <i className="fas fa-sign-in-alt"></i> : null}>
              {loading ? 'Ingresando...' : 'Ingresar'}
            </Button>
          </div>
        </form>
        
        <p className="mt-8 text-center text-sm text-gray-500">
          ¿Problemas para ingresar? <a href="mailto:soporte@cocinaamore.com" className="font-medium text-amore-red hover:underline">Contacta al administrador</a>.
        </p>
      </div>
    </div>
  );
};

export default Login;