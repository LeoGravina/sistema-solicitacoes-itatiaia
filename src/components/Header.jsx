import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { LogOut, User as UserIcon } from 'lucide-react';
import logoImg from '../assets/logo-ita-removebg-preview.png';

export default function Header() {
  const { logout, userData } = useAuth();

  return (
    <header className="header">
      <div className="header-content">
        <div className="brand-area">
          <img src={logoImg} alt="Logo Itatiaia" className="header-logo" />
          <div className="divider-vertical"></div>
          <div className="brand-text">
            <h1>Liberação de Cota</h1>
            <p>Controle Interno</p>
          </div>
        </div>

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