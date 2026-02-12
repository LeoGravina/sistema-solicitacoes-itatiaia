import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { LogOut, User as UserIcon, TableProperties, LayoutDashboard } from 'lucide-react'; // Ícones novos
import logoImg from '../assets/logo-ita-removebg-preview.png';
import { useNavigate, useLocation } from 'react-router-dom'; // Para navegação

export default function Header() {
  const { logout, userData } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <header className="header">
      <div className="header-content">
        <div className="brand-area" onClick={() => navigate('/')} style={{cursor: 'pointer'}}>
          <img src={logoImg} alt="Logo Itatiaia" className="header-logo" />
          <div className="divider-vertical"></div>
          <div className="brand-text">
            <h1>Controle Comercial</h1>
            <p>Sistema Interno</p>
          </div>
        </div>

        {/* --- MENU DE NAVEGAÇÃO CENTRAL (SIMPLES) --- */}
        <nav style={{ display: 'flex', gap: '1rem' }}>
            <button 
                onClick={() => navigate('/')}
                className={`btn btn-ghost ${location.pathname === '/' ? 'active' : ''}`}
                style={{ color: location.pathname === '/' ? '#233ae0' : '#6b7280' }}
            >
                <LayoutDashboard size={18} /> Cotas
            </button>
            <button 
                onClick={() => navigate('/tabela-precos')}
                className={`btn btn-ghost ${location.pathname === '/tabela-precos' ? 'active' : ''}`}
                style={{ color: location.pathname === '/tabela-precos' ? '#233ae0' : '#6b7280' }}
            >
                <TableProperties size={18} /> Catálogo
            </button>
        </nav>

        <div className="user-area">
          <div className="user-info">
             <UserIcon size={16} />
             <span>{userData?.name || 'Usuário'}</span>
             {userData?.role === 'admin' && <span className="badge-admin">Admin</span>}
          </div>
          <button onClick={logout} className="btn-logout" title="Sair">
            <LogOut size={18} />
          </button>
        </div>
      </div>
    </header>
  );
}