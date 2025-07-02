import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { AuthProvider } from './contexts/AuthContext';
import { NotificationProvider } from './contexts/NotificationContext';

// PASO 3.1: Importamos nuestro nuevo ThemeProvider
import { ThemeProvider } from './contexts/ThemeContext';

const rootElement = document.getElementById('root');

if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      {/* PASO 3.2: Envolvemos todo con el ThemeProvider */}
      {/* Es como un "abrazo" que le da superpoderes de tema a toda la app */}
      
        <NotificationProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </NotificationProvider>
      
    </React.StrictMode>
  );
}