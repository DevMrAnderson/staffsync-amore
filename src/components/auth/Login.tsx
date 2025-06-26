import React, { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../../services/firebase';
import Button from '../common/Button';
import { APP_NAME } from '../../constants';
import { useNotification } from '../../contexts/NotificationContext';

const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { addNotification } = useNotification();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      addNotification('Por favor, ingresa correo y contrasena.', 'warning');
      return;
    }
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      addNotification('Inicio de sesion exitoso. Bienvenido!', 'success');
      // AuthProvider handles redirection by listening to auth state changes
    } catch (err: any) {
      console.error("Login error:", err);
      let errorMessage = 'Error al iniciar sesion. Verifica tus credenciales.';
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        errorMessage = 'Correo o contrasena incorrectos.';
      } else if (err.code === 'auth/invalid-email') {
        errorMessage = 'El formato del correo electronico no es valido.';
      }
      addNotification(errorMessage, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-600 via-pink-500 to-red-500 p-4">
      <div className="bg-white p-8 md:p-10 rounded-xl shadow-2xl w-full max-w-md">
        <div className="text-center mb-8">
          {/* Placeholder logo - replace with actual restaurant logo */}
          <div className="w-24 h-24 mx-auto rounded-full bg-gray-200 flex items-center justify-center mb-4 shadow-lg">
            <i className="fas fa-utensils text-4xl text-purple-600"></i>
          </div>
          <h1 className="text-3xl font-bold text-gray-800">{APP_NAME}</h1>
          <p className="text-gray-600 mt-1">Bienvenido de nuevo</p>
        </div>
        
        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 sr-only">
              Correo Electronico
            </label>
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
                className="block w-full pl-10 px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-colors"
                placeholder="tu@email.com"
              />
            </div>
          </div>
          
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 sr-only">
              Contrasena
            </label>
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
                className="block w-full pl-10 px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-colors"
                placeholder="••••••••"
              />
            </div>
          </div>
          
          <div>
            <Button type="submit" variant="primary" size="lg" fullWidth isLoading={loading} icon={!loading ? <i className="fas fa-sign-in-alt"></i> : null}>
              {loading ? 'Ingresando...' : 'Ingresar'}
            </Button>
          </div>
        </form>
        
        <p className="mt-8 text-center text-sm text-gray-500">
          ¿Problemas para ingresar? <a href="mailto:soporte@cocinaamore.com" className="font-medium text-indigo-600 hover:text-indigo-500 hover:underline">Contacta al soporte</a>.
        </p>
      </div>
    </div>
  );
};

export default Login;
