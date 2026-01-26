import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';

// Páginas
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import NewRequest from './pages/NewRequest';
import Contato from './pages/Contato'; 

// Componentes Globais
import Footer from './components/Footer'; // <--- Importe o Footer

import './styles/global.css';

function PrivateRoute({ children }) {
  const { currentUser } = useAuth();
  return currentUser ? children : <Navigate to="/login" />;
}

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/contato" element={<Contato />} />

          {/* Rotas Protegidas */}
          <Route path="/" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
          <Route path="/nova-solicitacao" element={<PrivateRoute><NewRequest /></PrivateRoute>} />
          <Route path="/editar/:id" element={<PrivateRoute><NewRequest /></PrivateRoute>} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}