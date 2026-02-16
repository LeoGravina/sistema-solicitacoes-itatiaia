import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { LogOut, User, ShieldCheck, Menu, X, Home, Calculator, BarChart3, Search } from 'lucide-react';
import logo from '../assets/logo-itatiaia.png'; // Confirme seu caminho da logo

export default function Header({ title = "Portal de Sistemas" }) {
  const { userData, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef(null);

  // Fecha o menu se clicar fora dele
  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuRef]);

  return (
    <header style={{ 
        background: '#ffffff', borderBottom: '1px solid #e2e8f0', padding: '0 2rem', height: '75px', 
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        boxShadow: '0 4px 15px rgba(0, 0, 0, 0.03)', position: 'sticky', top: 0, zIndex: 1000 
    }}>
      
      {/* LADO ESQUERDO: MENU HAMBURGUER + LOGO + TÍTULO */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
        
        {/* Menu Hamburguer com Dropdown */}
        <div ref={menuRef} style={{ position: 'relative' }}>
            <button 
                onClick={() => setIsMenuOpen(!isMenuOpen)} 
                style={{ background: isMenuOpen ? '#f1f5f9' : 'transparent', border: 'none', cursor: 'pointer', color: '#0f172a', display: 'flex', alignItems: 'center', padding: '8px', borderRadius: '8px', transition: 'background 0.2s' }}
                onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                onMouseLeave={e => e.currentTarget.style.background = isMenuOpen ? '#f1f5f9' : 'transparent'}
            >
              {isMenuOpen ? <X size={26} /> : <Menu size={26} />}
            </button>

            {/* Dropdown Card */}
            {isMenuOpen && (
              <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: '12px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '16px', boxShadow: '0 10px 40px rgba(0,0,0,0.1)', width: '280px', zIndex: 9999, overflow: 'hidden', animation: 'fadeInDown 0.2s ease-out' }}>
                <div style={{ padding: '16px', borderBottom: '1px solid #f8fafc', fontSize: '0.75rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '1px' }}>Módulos do Sistema</div>
                
                <div onClick={() => { navigate('/'); setIsMenuOpen(false); }} style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', background: location.pathname === '/' ? '#eff6ff' : 'transparent', color: location.pathname === '/' ? '#2563eb' : '#334155', fontWeight: 600, transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'} onMouseLeave={e => e.currentTarget.style.background = location.pathname === '/' ? '#eff6ff' : 'transparent'}>
                    <Home size={20} /> Início (Portal)
                </div>
                
                <div onClick={() => { navigate('/tabela'); setIsMenuOpen(false); }} style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', background: location.pathname === '/tabela' ? '#eff6ff' : 'transparent', color: location.pathname === '/tabela' ? '#2563eb' : '#334155', fontWeight: 600, transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'} onMouseLeave={e => e.currentTarget.style.background = location.pathname === '/tabela' ? '#eff6ff' : 'transparent'}>
                    <Calculator size={20} /> Catálogo Comercial
                </div>

                {/* NOVO LINK: ANÁLISE DE PRODUTO */}
                <div onClick={() => { navigate('/produto-analise'); setIsMenuOpen(false); }} style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', background: location.pathname.includes('/produto') ? '#f0fdf4' : 'transparent', color: location.pathname.includes('/produto') ? '#10b981' : '#334155', fontWeight: 600, transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = '#f0fdf4'} onMouseLeave={e => e.currentTarget.style.background = location.pathname.includes('/produto') ? '#f0fdf4' : 'transparent'}>
                    <Search size={20} /> Análise de Produto
                </div>
                
                <div onClick={() => { navigate('/cotas'); setIsMenuOpen(false); }} style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', background: location.pathname === '/cotas' ? '#fdf4ff' : 'transparent', color: location.pathname === '/cotas' ? '#c026d3' : '#334155', fontWeight: 600, transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = '#fdf4ff'} onMouseLeave={e => e.currentTarget.style.background = location.pathname === '/cotas' ? '#fdf4ff' : 'transparent'}>
                    <BarChart3 size={20} /> Solicitação de Cotas
                </div>
              </div>
            )}
        </div>

        {/* Logo Clicável */}
        <div 
          onClick={() => navigate('/')} 
          style={{ display: 'flex', alignItems: 'center', gap: '16px', cursor: 'pointer', transition: 'opacity 0.2s' }}
          title="Voltar para a Página Inicial"
        >
          <img src={logo} alt="Itatiaia" style={{ height: '35px', objectFit: 'contain' }} />
          <div style={{ height: '30px', width: '2px', background: '#e2e8f0', borderRadius: '2px' }}></div>
          <h1 style={{ margin: 0, fontSize: '1.25rem', color: '#0f172a', fontWeight: 800, letterSpacing: '-0.5px' }}>
              {title}
          </h1>
        </div>
      </div>

      {/* LADO DIREITO: PERFIL E SAIR */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{background: '#eff6ff', padding: '10px', borderRadius: '50%', color: '#2563eb'}}>
                <User size={18} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ color: '#0f172a', fontSize: '0.9rem', fontWeight: 700 }}>{userData?.name || 'Usuário'}</span>
                <span style={{ color: '#64748b', fontSize: '0.75rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {userData?.role === 'admin' ? <><ShieldCheck size={12} color="#2563eb"/> Admin</> : 'Padrão'}
                </span>
            </div>
        </div>
        <div style={{ height: '35px', width: '1px', background: '#e2e8f0' }}></div>
        <button onClick={logout} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#fff', border: '1px solid #fecaca', color: '#ef4444', cursor: 'pointer', fontWeight: 600, padding: '8px 16px', borderRadius: '10px', transition: 'all 0.2s', fontSize: '0.85rem' }} onMouseEnter={e => {e.currentTarget.style.background = '#fef2f2'}} onMouseLeave={e => {e.currentTarget.style.background = '#fff'}}>
            <LogOut size={16} /> Sair
        </button>
      </div>
      <style>{`@keyframes fadeInDown { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </header>
  );
}