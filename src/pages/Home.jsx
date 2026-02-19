import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import { Calculator, CheckCircle, FilePlus, Search, ArrowRight, Clock, Image as ImageIcon } from 'lucide-react';

export default function Home() {
    const navigate = useNavigate();
    const [recentItems, setRecentItems] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        const saved = localStorage.getItem('itatiaia_recent');
        if (saved) setRecentItems(JSON.parse(saved));
    }, []);

    const handleSearch = (e) => {
        e.preventDefault();
        navigate(searchQuery.trim() ? `/tabela-precos?search=${encodeURIComponent(searchQuery.trim())}` : '/tabela-precos');
    };

    return (
        <div style={{height: '100vh', overflowY: 'auto', backgroundColor:'#f8fafc', fontFamily:"'Inter', sans-serif"}}>
            
            <Header title="Página Principal" />
            
            <div style={{maxWidth:'1500px', margin:'0 auto', padding:'4rem 2rem'}}>
                
                <div style={{marginBottom:'3rem', textAlign:'center'}}>
                    <h1 style={{fontSize:'2.5rem', fontWeight:800, color:'#0f172a', margin:0}}>Bem-vindo ao Sistema</h1>
                    <p style={{fontSize:'1.1rem', color:'#64748b', marginTop:'12px'}}>Selecione o módulo que deseja acessar.</p>
                </div>

                {recentItems.length > 0 && (
                    <div style={{marginBottom:'3rem', display:'flex', flexDirection:'column', alignItems:'center', animation:'fadeIn 0.3s ease-out'}}>
                        <div style={{display:'flex', alignItems:'center', gap:'6px', color:'#64748b', fontSize:'0.85rem', fontWeight:600, marginBottom:'16px'}}><Clock size={14} /> Acessados Recentemente</div>
                        <div style={{display:'flex', gap:'12px', flexWrap:'wrap', justifyContent:'center'}}>
                            {recentItems.map((item, index) => (
                                <div key={index} onClick={() => navigate(`/produto-analise`, { state: { sku: item.sku } })} style={{display:'flex', alignItems:'center', gap:'10px', background:'#fff', padding:'8px 16px 8px 8px', borderRadius:'30px', border:'1px solid #e2e8f0', cursor:'pointer', transition:'all 0.2s', boxShadow:'0 2px 5px rgba(0,0,0,0.02)'}} onMouseEnter={e => {e.currentTarget.style.borderColor='#2563eb'; e.currentTarget.style.transform='translateY(-2px)'}} onMouseLeave={e => {e.currentTarget.style.borderColor='#e2e8f0'; e.currentTarget.style.transform='translateY(0)'}} title={item.description}>
                                    <div style={{width:'32px', height:'32px', background:'#f8fafc', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden'}}>
                                        {/* LAZY LOADING ADICIONADO AQUI */}
                                        {item.imageUrl ? <img src={item.imageUrl} loading="lazy" decoding="async" style={{width:'100%', height:'100%', objectFit:'cover'}} alt="" /> : <ImageIcon size={14} color="#cbd5e1" />}
                                    </div>
                                    <div style={{display:'flex', flexDirection:'column'}}><span style={{fontSize:'0.75rem', fontWeight:700, color:'#0f172a', lineHeight:1}}>{item.sku}</span><span style={{fontSize:'0.7rem', color:'#64748b', maxWidth:'120px', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', marginTop:'2px'}}>{item.description}</span></div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(300px, 1fr))', gap:'2rem', paddingBottom: '2rem'}}>
                    <div onClick={() => navigate('/tabela-precos')} style={{background:'#fff', borderRadius:'24px', padding:'32px', cursor:'pointer', border:'1px solid #e2e8f0', boxShadow:'0 10px 30px rgba(0,0,0,0.04)', transition:'all 0.3s', display:'flex', flexDirection:'column', justifyContent:'space-between', minHeight:'240px'}} onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-8px)'; e.currentTarget.style.borderColor = '#2563eb'; e.currentTarget.style.boxShadow = '0 20px 40px rgba(37, 99, 235, 0.1)'; }} onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.boxShadow = '0 10px 30px rgba(0,0,0,0.04)'; }}>
                        <div><div style={{background:'#eff6ff', width:'40px', height:'40px', borderRadius:'16px', display:'flex', alignItems:'center', justifyContent:'center', color:'#2563eb', marginBottom:'1.5rem'}}><Calculator size={28} /></div><h2 style={{margin:0, fontSize:'1.4rem', color:'#0f172a', fontWeight:700}}>Tabela de Preços</h2><p style={{margin:'10px 0 0 0', fontSize:'0.95rem', color:'#64748b', lineHeight:'1.6'}}>Tabela completa para cotação rápida e simulador de fretes.</p></div>
                        <div style={{display:'flex', alignItems:'center', gap:'8px', color:'#2563eb', fontWeight:600, fontSize:'0.95rem', marginTop:'2rem'}}>Acessar Tabela de Preços <ArrowRight size={18} /></div>
                    </div>

                    <div onClick={() => navigate('/produto-analise')} style={{background:'#fff', borderRadius:'24px', padding:'32px', cursor:'pointer', border:'1px solid #e2e8f0', boxShadow:'0 10px 30px rgba(0,0,0,0.04)', transition:'all 0.3s', display:'flex', flexDirection:'column', justifyContent:'space-between', minHeight:'240px'}} onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-8px)'; e.currentTarget.style.borderColor = '#10b981'; e.currentTarget.style.boxShadow = '0 20px 40px rgba(16, 185, 129, 0.1)'; }} onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.boxShadow = '0 10px 30px rgba(0,0,0,0.04)'; }}>
                        <div><div style={{background:'#f0fdf4', width:'40px', height:'40px', borderRadius:'16px', display:'flex', alignItems:'center', justifyContent:'center', color:'#10b981', marginBottom:'1.5rem'}}><Search size={28} /></div><h2 style={{margin:0, fontSize:'1.4rem', color:'#0f172a', fontWeight:700}}>Análise de Produto</h2><p style={{margin:'10px 0 0 0', fontSize:'0.95rem', color:'#64748b', lineHeight:'1.6'}}>Busque um SKU específico para ver imagens e detalhes completos.</p></div>
                        <div style={{display:'flex', alignItems:'center', gap:'8px', color:'#10b981', fontWeight:600, fontSize:'0.95rem', marginTop:'2rem'}}>Acessar Análise de Produtos<ArrowRight size={18} /></div>
                    </div>

                    <div onClick={() => navigate('/nova-solicitacao')} style={{background:'#fff', borderRadius:'24px', padding:'32px', cursor:'pointer', border:'1px solid #e2e8f0', boxShadow:'0 10px 30px rgba(0,0,0,0.04)', transition:'all 0.3s', display:'flex', flexDirection:'column', justifyContent:'space-between', minHeight:'240px'}} onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-8px)'; e.currentTarget.style.borderColor = '#c026d3'; e.currentTarget.style.boxShadow = '0 20px 40px rgba(192, 38, 211, 0.1)'; }} onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.boxShadow = '0 10px 30px rgba(0,0,0,0.04)'; }}>
                        <div><div style={{background:'#fdf4ff', width:'40px', height:'40px', borderRadius:'16px', display:'flex', alignItems:'center', justifyContent:'center', color:'#c026d3', marginBottom:'1.5rem'}}><FilePlus size={28} /></div><h2 style={{margin:0, fontSize:'1.4rem', color:'#0f172a', fontWeight:700}}>Solicitação de Cotas</h2><p style={{margin:'10px 0 0 0', fontSize:'0.95rem', color:'#64748b', lineHeight:'1.6'}}>Solicite Cotas para Liberação.</p></div>
                        <div style={{display:'flex', alignItems:'center', gap:'8px', color:'#c026d3', fontWeight:600, fontSize:'0.95rem', marginTop:'2rem'}}>Acessar Solicitação de Cotas <ArrowRight size={18} /></div>
                    </div>

                    <div onClick={() => navigate('/cotas')} style={{background:'#fff', borderRadius:'24px', padding:'32px', cursor:'pointer', border:'1px solid #e2e8f0', boxShadow:'0 10px 30px rgba(0,0,0,0.04)', transition:'all 0.3s', display:'flex', flexDirection:'column', justifyContent:'space-between', minHeight:'240px'}} onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-8px)'; e.currentTarget.style.borderColor = '#d3bc2a'; e.currentTarget.style.boxShadow = '0 20px 40px rgba(192, 38, 211, 0.1)'; }} onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.boxShadow = '0 10px 30px rgba(0,0,0,0.04)'; }}>
                        <div><div style={{background:'#fdf4ff', width:'40px', height:'40px', borderRadius:'16px', display:'flex', alignItems:'center', justifyContent:'center', color:'#d3bc2a', marginBottom:'1.5rem'}}><CheckCircle size={28} /></div><h2 style={{margin:0, fontSize:'1.4rem', color:'#0f172a', fontWeight:700}}>Liberação de Cotas</h2><p style={{margin:'10px 0 0 0', fontSize:'0.95rem', color:'#64748b', lineHeight:'1.6'}}>Libere as Cotas Solicitadas.</p></div>
                        <div style={{display:'flex', alignItems:'center', gap:'8px', color:'#d3bc2a', fontWeight:600, fontSize:'0.95rem', marginTop:'2rem'}}>Acessar Liberação de Cotas <ArrowRight size={18} /></div>
                    </div>
                </div>
            </div>
            <style dangerouslySetInnerHTML={{__html: `@keyframes fadeIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }`}} />
        </div>
    );
}