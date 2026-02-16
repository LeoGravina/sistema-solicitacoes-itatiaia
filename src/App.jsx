import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';

// Páginas
import Login from './pages/Login';
import Register from './pages/Register';
import Home from './pages/Home';
import Dashboard from './pages/Dashboard';
import NewRequest from './pages/NewRequest';
import Contato from './pages/Contato'; 
import PriceTable from './pages/PriceTable';
import ProductAnalysis from './pages/ProductAnalysis';

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
          <Route path="/" element={<Home />} />
          <Route path="/cotas" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
          <Route path="/editar/:id" element={<PrivateRoute><NewRequest /></PrivateRoute>} />
          <Route path="/nova-solicitacao" element={<PrivateRoute><NewRequest /></PrivateRoute>} />
          <Route path="/tabela-precos" element={<PrivateRoute><PriceTable /></PrivateRoute>} />
          <Route path="/produto/:sku" element={<PrivateRoute><ProductAnalysis /></PrivateRoute>} />
          <Route path="/produto-analise" element={<PrivateRoute><ProductAnalysis /></PrivateRoute>} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}