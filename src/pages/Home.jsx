import React from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import { Calculator, BarChart3, Search, ArrowRight } from 'lucide-react';

export default function Home() {
    const navigate = useNavigate();

    return (
        <div style={{minHeight:'100vh', backgroundColor:'#f8fafc', fontFamily:"'Inter', sans-serif"}}>
            <Header title="Portal de Sistemas" />
            
            <div style={{maxWidth:'1000px', margin:'0 auto', padding:'4rem 2rem'}}>
                <div style={{marginBottom:'3rem', textAlign:'center'}}>
                    <h1 style={{fontSize:'2.5rem', fontWeight:800, color:'#0f172a', margin:0}}>Bem-vindo ao Portal</h1>
                    <p style={{fontSize:'1.1rem', color:'#64748b', marginTop:'12px'}}>Selecione o módulo corporativo que deseja acessar.</p>
                </div>

                <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(300px, 1fr))', gap:'2rem'}}>
                    
                    {/* CARTÃO 1: TABELA DE PREÇOS */}
                    <div 
                        onClick={() => navigate('/tabela-precos')} 
                        style={{background:'#fff', borderRadius:'24px', padding:'32px', cursor:'pointer', border:'1px solid #e2e8f0', boxShadow:'0 10px 30px rgba(0,0,0,0.04)', transition:'all 0.3s', display:'flex', flexDirection:'column', justifyContent:'space-between', minHeight:'240px'}}
                        onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-8px)'; e.currentTarget.style.borderColor = '#2563eb'; e.currentTarget.style.boxShadow = '0 20px 40px rgba(37, 99, 235, 0.1)'; }} 
                        onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.boxShadow = '0 10px 30px rgba(0,0,0,0.04)'; }}
                    >
                        <div>
                            <div style={{background:'#eff6ff', width:'60px', height:'60px', borderRadius:'16px', display:'flex', alignItems:'center', justifyContent:'center', color:'#2563eb', marginBottom:'1.5rem'}}><Calculator size={28} /></div>
                            <h2 style={{margin:0, fontSize:'1.4rem', color:'#0f172a', fontWeight:700}}>Catálogo & Simulador</h2>
                            <p style={{margin:'10px 0 0 0', fontSize:'0.95rem', color:'#64748b', lineHeight:'1.6'}}>Tabela completa para cotação rápida e simulador de fretes.</p>
                        </div>
                        <div style={{display:'flex', alignItems:'center', gap:'8px', color:'#2563eb', fontWeight:600, fontSize:'0.95rem', marginTop:'2rem'}}>Acessar Catálogo <ArrowRight size={18} /></div>
                    </div>

                    {/* CARTÃO 2: ANÁLISE DE PRODUTO (NOVO!) */}
                    <div 
                        onClick={() => navigate('/produto-analise')} 
                        style={{background:'#fff', borderRadius:'24px', padding:'32px', cursor:'pointer', border:'1px solid #e2e8f0', boxShadow:'0 10px 30px rgba(0,0,0,0.04)', transition:'all 0.3s', display:'flex', flexDirection:'column', justifyContent:'space-between', minHeight:'240px'}}
                        onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-8px)'; e.currentTarget.style.borderColor = '#10b981'; e.currentTarget.style.boxShadow = '0 20px 40px rgba(16, 185, 129, 0.1)'; }} 
                        onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.boxShadow = '0 10px 30px rgba(0,0,0,0.04)'; }}
                    >
                        <div>
                            <div style={{background:'#f0fdf4', width:'60px', height:'60px', borderRadius:'16px', display:'flex', alignItems:'center', justifyContent:'center', color:'#10b981', marginBottom:'1.5rem'}}><Search size={28} /></div>
                            <h2 style={{margin:0, fontSize:'1.4rem', color:'#0f172a', fontWeight:700}}>Análise de Produto</h2>
                            <p style={{margin:'10px 0 0 0', fontSize:'0.95rem', color:'#64748b', lineHeight:'1.6'}}>Busque um SKU específico para ver imagens, ficha técnica e detalhes completos.</p>
                        </div>
                        <div style={{display:'flex', alignItems:'center', gap:'8px', color:'#10b981', fontWeight:600, fontSize:'0.95rem', marginTop:'2rem'}}>Acessar Análise <ArrowRight size={18} /></div>
                    </div>

                    {/* CARTÃO 3: COTAS */}
                    <div 
                        onClick={() => navigate('/cotas')} 
                        style={{background:'#fff', borderRadius:'24px', padding:'32px', cursor:'pointer', border:'1px solid #e2e8f0', boxShadow:'0 10px 30px rgba(0,0,0,0.04)', transition:'all 0.3s', display:'flex', flexDirection:'column', justifyContent:'space-between', minHeight:'240px'}}
                        onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-8px)'; e.currentTarget.style.borderColor = '#c026d3'; e.currentTarget.style.boxShadow = '0 20px 40px rgba(192, 38, 211, 0.1)'; }} 
                        onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.boxShadow = '0 10px 30px rgba(0,0,0,0.04)'; }}
                    >
                        <div>
                            <div style={{background:'#fdf4ff', width:'60px', height:'60px', borderRadius:'16px', display:'flex', alignItems:'center', justifyContent:'center', color:'#c026d3', marginBottom:'1.5rem'}}><BarChart3 size={28} /></div>
                            <h2 style={{margin:0, fontSize:'1.4rem', color:'#0f172a', fontWeight:700}}>Gestão de Cotas</h2>
                            <p style={{margin:'10px 0 0 0', fontSize:'0.95rem', color:'#64748b', lineHeight:'1.6'}}>Acompanhe o atingimento de metas, faturamento e performance da equipe.</p>
                        </div>
                        <div style={{display:'flex', alignItems:'center', gap:'8px', color:'#c026d3', fontWeight:600, fontSize:'0.95rem', marginTop:'2rem'}}>Acessar Módulo <ArrowRight size={18} /></div>
                    </div>

                </div>
            </div>
        </div>
    );
}