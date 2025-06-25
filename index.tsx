import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AuthProvider } from './contexts/AuthContext';
import { NotificationProvider } from './contexts/NotificationContext';

const rootElement = document.getElementById('root');
if (!rootElement) {
  console.error("Error Fatal: Elemento 'root' no encontrado en HTML. La aplicacion no puede iniciar.");
  const body = document.body;
  if (body) {
    body.innerHTML = '<div style="color: red; text-align: center; padding: 50px;"><h1>Error Fatal</h1><p>No se pudo iniciar la aplicacion. El elemento HTML con ID \'root\' no fue encontrado.</p></div>';
  }
  throw new Error("No se pudo encontrar el elemento raiz para montar la aplicacion.");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <NotificationProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </NotificationProvider>
  </React.StrictMode>
);