import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { collection, query, where, getDocs, limit } from 'firebase/firestore';
import { db } from '../config/firebase';
import Header from '../components/Header';
import Toast from '../components/Toast'; // Adicionado para o aviso de Copiar
import { ArrowLeft, Image as ImageIcon, Search, Loader2, Package, Home, ChevronRight, Copy, CheckCircle } from 'lucide-react';

export default function ProductAnalysis() {
    const navigate = useNavigate();
    const location = useLocation();
    
    // Pega o SKU caso tenha vindo do clique do botão na Gaveta do Catálogo
    const initialSku = location.state?.sku || ''; 

    const [skuInput, setSkuInput] = useState('');
    const [product, setProduct] = useState(null);
    const [loading, setLoading] = useState(false);
    
    // Auto-complete (Busca Dinâmica)
    const [searchResults, setSearchResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);
    
    // Imagens
    const [activeImgCategory, setActiveImgCategory] = useState('fundo_branco');
    const [currentMainImg, setCurrentMainImg] = useState('');

    // Estado para o botão de copiar
    const [copied, setCopied] = useState(false);
    const [notification, setNotification] = useState(null);

    const showNotification = (type, message) => { 
        setNotification({ type, message }); 
        setTimeout(() => setNotification(null), 3000); 
    };

    // FUNÇÃO CENTRAL PARA CARREGAR PRODUTO
    const loadProductData = (prodData) => {
        setProduct(prodData);
        if (prodData.images && prodData.images.length > 0) {
            const fbImgs = prodData.images.filter(img => img.type === 'fundo_branco');
            setCurrentMainImg(fbImgs.length > 0 ? fbImgs[0].url : prodData.imageUrl);
        } else {
            setCurrentMainImg(prodData.imageUrl || '');
        }
        setActiveImgCategory('fundo_branco');
        setSkuInput(''); // Limpa a barra após escolher
        setSearchResults([]); // Fecha o dropdown
    };

    // Busca exata (usada quando vem de outra página)
    useEffect(() => {
        if (initialSku) {
            const fetchInitial = async () => {
                setLoading(true);
                try {
                    const q = query(collection(db, 'products_base'), where('sku', '==', initialSku));
                    const snap = await getDocs(q);
                    if (!snap.empty) {
                        loadProductData({ id: snap.docs[0].id, ...snap.docs[0].data() });
                    }
                } catch (err) { console.error(err); }
                setLoading(false);
            };
            fetchInitial();
        }
    }, [initialSku]);

    // O MÁGICO AUTO-COMPLETE (Roda sozinho enquanto você digita)
    useEffect(() => {
        const delayDebounceFn = setTimeout(async () => {
            if (skuInput.trim().length > 2) {
                setIsSearching(true);
                try {
                    const term = skuInput.toUpperCase().trim();
                    const qSku = query(collection(db, 'products_base'), where('sku', '>=', term), where('sku', '<=', term + '\uf8ff'), limit(5));
                    const qDesc = query(collection(db, 'products_base'), where('description', '>=', term), where('description', '<=', term + '\uf8ff'), limit(5));
                    
                    const [snapSku, snapDesc] = await Promise.all([getDocs(qSku), getDocs(qDesc)]);
                    const uniqueMap = new Map();
                    snapSku.forEach(d => uniqueMap.set(d.id, { id: d.id, ...d.data() }));
                    snapDesc.forEach(d => uniqueMap.set(d.id, { id: d.id, ...d.data() }));
                    
                    setSearchResults(Array.from(uniqueMap.values()).slice(0, 6)); // Mostra até 6 opções
                } catch (e) { console.error(e); }
                setIsSearching(false);
            } else {
                setSearchResults([]);
            }
        }, 400); // Espera 400ms após parar de digitar
        return () => clearTimeout(delayDebounceFn);
    }, [skuInput]);

    // Função de Copiar SKU
    const handleCopySku = () => {
        if(product?.sku) {
            navigator.clipboard.writeText(product.sku);
            setCopied(true);
            showNotification('success', 'SKU copiado com sucesso!');
            setTimeout(() => setCopied(false), 2000);
        }
    };

    return (
        <div style={{minHeight:'100vh', backgroundColor:'#ffffff', fontFamily:"'Inter', sans-serif"}}>
            <Header title="Análise de Produto" />

            <div style={{maxWidth:'1300px', margin:'0 auto', padding:'2rem'}}>
                
                {/* BREADCRUMBS (Trilha de Navegação - Sugestão 2 Aplicada!) */}
                <div style={{display:'flex', alignItems:'center', gap:'8px', color:'#64748b', fontSize:'0.85rem', fontWeight:600, marginBottom:'2rem'}}>
                    <Home size={14} style={{cursor:'pointer'}} onClick={() => navigate('/')} />
                    <ChevronRight size={14} />
                    <span style={{cursor:'pointer', transition:'color 0.2s'}} onClick={() => navigate('/tabela-precos')} onMouseEnter={e=>e.currentTarget.style.color='#0f172a'} onMouseLeave={e=>e.currentTarget.style.color='#64748b'}>Catálogo Comercial</span>
                    <ChevronRight size={14} />
                    <span style={{color:'#0f172a'}}>Análise Detalhada</span>
                    {product && (
                        <>
                            <ChevronRight size={14} />
                            <span style={{color:'#2563eb'}}>{product.sku}</span>
                        </>
                    )}
                </div>

                {/* ÁREA DE BUSCA CENTRALIZADA COM DROPDOWN */}
                <div style={{display:'flex', flexDirection:'column', alignItems:'center', marginBottom:'3rem', position:'relative', zIndex:50}}>
                    <div style={{position:'relative', width:'100%', maxWidth:'600px'}}>
                        <Search size={20} style={{position:'absolute', left:'20px', top:'50%', transform:'translateY(-50%)', color:'#94a3b8'}} />
                        <input 
                            type="text" 
                            placeholder="Busque o produto por SKU ou Descrição..." 
                            value={skuInput}
                            onChange={(e) => setSkuInput(e.target.value)}
                            style={{width:'100%', padding:'18px 20px 18px 50px', borderRadius:'16px', border:'1px solid #cbd5e1', outline:'none', fontSize:'1.05rem', boxShadow:'0 4px 20px rgba(0,0,0,0.04)', color:'#0f172a', transition:'all 0.2s'}} 
                            onFocus={e => e.currentTarget.style.borderColor = '#2563eb'}
                            onBlur={e => e.currentTarget.style.borderColor = '#cbd5e1'}
                        />
                        {isSearching && <Loader2 size={18} className="spin" style={{position:'absolute', right:'20px', top:'50%', transform:'translateY(-50%)', color:'#2563eb'}} />}
                        
                        {/* LISTA SUSPENSA (AUTO-COMPLETE) */}
                        {searchResults.length > 0 && (
                            <div style={{position:'absolute', top:'100%', left:0, width:'100%', background:'#fff', border:'1px solid #e2e8f0', borderRadius:'16px', marginTop:'8px', boxShadow:'0 15px 35px rgba(0,0,0,0.1)', overflow:'hidden'}}>
                                {searchResults.map((res, idx) => (
                                    <div 
                                        key={res.sku} 
                                        onClick={() => loadProductData(res)} 
                                        style={{padding:'14px 20px', borderBottom: idx === searchResults.length - 1 ? 'none' : '1px solid #f1f5f9', cursor:'pointer', display:'flex', alignItems:'center', gap:'12px', transition:'background 0.2s'}} 
                                        onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'} 
                                        onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                                    >
                                        <div style={{background:'#f1f5f9', padding:'8px', borderRadius:'8px', color:'#64748b'}}><Search size={16}/></div>
                                        <div style={{display:'flex', flexDirection:'column'}}>
                                            <span style={{fontSize:'0.9rem', color:'#0f172a', fontWeight:600}}>{res.description}</span>
                                            <div style={{display:'flex', gap:'8px', alignItems:'center', marginTop:'4px'}}>
                                                <span style={{fontSize:'0.75rem', color:'#64748b', fontWeight:700}}>SKU: {res.sku}</span>
                                                <span style={{fontSize:'0.7rem', color:'#2563eb', background:'#eff6ff', padding:'2px 6px', borderRadius:'4px'}}>{res.brand}</span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {loading && <div style={{display:'flex', justifyContent:'center', marginTop:'50px'}}><Loader2 className="spin" size={40} color="#0f172a"/></div>}

                {!product && !loading && (
                    <div style={{textAlign:'center', marginTop:'60px', color:'#94a3b8', display:'flex', flexDirection:'column', alignItems:'center'}}>
                        <div style={{background:'#f8fafc', padding:'30px', borderRadius:'50%', marginBottom:'20px'}}>
                            <Package size={60} style={{opacity:0.3}}/>
                        </div>
                        <h2 style={{margin:0, color:'#0f172a'}}>Nenhum produto selecionado</h2>
                        <p style={{fontSize:'1.1rem'}}>Utilize a barra de pesquisa acima para iniciar a análise.</p>
                    </div>
                )}

                {/* DESIGN MINIMALISTA DO PRODUTO */}
                {product && !loading && (
                    <div style={{display:'flex', gap:'5rem', alignItems:'flex-start', flexWrap: 'wrap', animation: 'fadeIn 0.4s ease-out'}}>
                        
                        {/* LADO ESQUERDO: GALERIA DE FOTOS LIMPA */}
                        <div style={{flex: '1 1 500px', display:'flex', flexDirection:'column'}}>
                            
                            {/* Imagem Principal */}
                            <div style={{display:'flex', justifyContent:'center', alignItems:'center', background:'#f8fafc', borderRadius:'24px', padding:'40px', minHeight:'500px', border:'1px solid #f1f5f9'}}>
                                {currentMainImg ? (
                                    <img src={currentMainImg} alt={product.description} style={{maxWidth:'100%', maxHeight:'600px', objectFit:'contain', mixBlendMode:'multiply'}} onError={(e) => { e.target.style.display = 'none'; e.target.nextElementSibling.style.display = 'flex'; }} />
                                ) : null}
                                <div style={{display: currentMainImg ? 'none' : 'flex', flexDirection:'column', alignItems:'center', color:'#cbd5e1'}}>
                                    <ImageIcon size={60} strokeWidth={1} /><p style={{fontSize:'1rem', marginTop:16}}>Imagem não encontrada</p>
                                </div>
                            </div>

                            {/* Filtros de Categoria (Pílulas) */}
                            {product.images && product.images.length > 0 && (
                                <div style={{display:'flex', gap:'12px', justifyContent:'center', marginTop:'32px'}}>
                                    <button onClick={() => setActiveImgCategory('fundo_branco')} style={{padding:'8px 20px', fontSize:'0.85rem', fontWeight:600, borderRadius:'30px', border: activeImgCategory === 'fundo_branco' ? '2px solid #0f172a' : '1px solid #e2e8f0', cursor:'pointer', background: activeImgCategory === 'fundo_branco' ? '#0f172a' : '#fff', color: activeImgCategory === 'fundo_branco' ? '#fff' : '#64748b', transition:'all 0.2s'}}>Fundo Branco</button>
                                    <button onClick={() => setActiveImgCategory('ambiente')} style={{padding:'8px 20px', fontSize:'0.85rem', fontWeight:600, borderRadius:'30px', border: activeImgCategory === 'ambiente' ? '2px solid #0f172a' : '1px solid #e2e8f0', cursor:'pointer', background: activeImgCategory === 'ambiente' ? '#0f172a' : '#fff', color: activeImgCategory === 'ambiente' ? '#fff' : '#64748b', transition:'all 0.2s'}}>Ambiente Decorado</button>
                                    <button onClick={() => setActiveImgCategory('diferencial')} style={{padding:'8px 20px', fontSize:'0.85rem', fontWeight:600, borderRadius:'30px', border: activeImgCategory === 'diferencial' ? '2px solid #0f172a' : '1px solid #e2e8f0', cursor:'pointer', background: activeImgCategory === 'diferencial' ? '#0f172a' : '#fff', color: activeImgCategory === 'diferencial' ? '#fff' : '#64748b', transition:'all 0.2s'}}>Diferenciais</button>
                                </div>
                            )}

                            {/* Miniaturas */}
                            {product.images && product.images.filter(i => i.type === activeImgCategory).length > 0 && (
                                <div style={{display:'flex', gap:'16px', overflowX:'auto', padding:'20px 0', marginTop:'16px', justifyContent:'center'}}>
                                    {product.images.filter(i => i.type === activeImgCategory).map((img, index) => (
                                        <div key={index} onClick={() => setCurrentMainImg(img.url)} style={{width:'70px', height:'70px', flexShrink:0, background:'#f8fafc', borderRadius:'12px', cursor:'pointer', border: currentMainImg === img.url ? '2px solid #0f172a' : '2px solid transparent', opacity: currentMainImg === img.url ? 1 : 0.5, transition:'all 0.2s', overflow:'hidden'}}>
                                            <img src={img.url} style={{width:'100%', height:'100%', objectFit:'cover', mixBlendMode:'multiply'}} />
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* LADO DIREITO: DADOS DO PRODUTO */}
                        <div style={{flex: '1 1 450px'}}>
                            
                            <div style={{display:'flex', alignItems:'center', gap:'12px', marginBottom:'16px'}}>
                                <span style={{background:'#f1f5f9', color:'#334155', padding:'6px 12px', borderRadius:'8px', fontSize:'0.75rem', fontWeight:700, letterSpacing:'1px', textTransform:'uppercase'}}>{product.brand}</span>
                                
                                {/* BOTÃO COPIAR SKU (Sugestão 1 Aplicada!) */}
                                <div style={{display:'flex', alignItems:'center', gap:'6px', background:'#f8fafc', padding:'4px 12px', borderRadius:'8px', border:'1px solid #e2e8f0'}}>
                                    <span style={{color:'#64748b', fontSize:'0.85rem', fontWeight:700}}>SKU: {product.sku}</span>
                                    <button onClick={handleCopySku} style={{background:'transparent', border:'none', cursor:'pointer', color: copied ? '#10b981' : '#94a3b8', display:'flex', alignItems:'center', padding:'4px'}} title="Copiar SKU">
                                        {copied ? <CheckCircle size={16} /> : <Copy size={16} />}
                                    </button>
                                </div>
                            </div>
                            
                            <h1 style={{margin:'0 0 40px 0', fontSize:'2.5rem', color:'#0f172a', lineHeight:'1.2', fontWeight:800, letterSpacing:'-1px'}}>
                                {product.description}
                            </h1>

                            <div style={{borderTop:'1px solid #e2e8f0', paddingTop:'40px'}}>
                                <h3 style={{fontSize:'1.1rem', color:'#0f172a', display:'flex', alignItems:'center', gap:'8px', marginBottom:'24px'}}><Package size={20} color="#2563eb"/> Ficha Técnica Detalhada</h3>
                                
                                {product.dimensions ? (
                                    <div style={{display:'flex', flexDirection:'column', gap:'16px'}}>
                                        <div style={{display:'flex', justifyContent:'space-between', paddingBottom:'16px', borderBottom:'1px solid #f1f5f9'}}>
                                            <span style={{color:'#64748b', fontWeight:500}}>Dimensões Oficiais (C x L x A)</span>
                                            <strong style={{color:'#0f172a'}}>{product.dimensions.length} x {product.dimensions.width} x {product.dimensions.height} mm</strong>
                                        </div>
                                        <div style={{display:'flex', justifyContent:'space-between', paddingBottom:'16px', borderBottom:'1px solid #f1f5f9'}}>
                                            <span style={{color:'#64748b', fontWeight:500}}>Peso Bruto / Líquido</span>
                                            <strong style={{color:'#0f172a'}}>{product.dimensions.weightBruto} kg / {product.dimensions.weightLiq} kg</strong>
                                        </div>
                                        <div style={{display:'flex', justifyContent:'space-between', paddingBottom:'16px', borderBottom:'1px solid #f1f5f9'}}>
                                            <span style={{color:'#64748b', fontWeight:500}}>Volume Ocupado</span>
                                            <strong style={{color:'#0f172a'}}>{product.dimensions.volume} m³</strong>
                                        </div>
                                        <div style={{display:'flex', justifyContent:'space-between', paddingBottom:'16px', borderBottom:'1px solid #f1f5f9'}}>
                                            <span style={{color:'#64748b', fontWeight:500}}>Fator Cubagem (KG³)</span>
                                            <strong style={{color:'#0f172a'}}>{product.dimensions.kg3} kg</strong>
                                        </div>
                                        <div style={{display:'flex', justifyContent:'space-between', paddingBottom:'16px', borderBottom:'1px solid #f1f5f9'}}>
                                            <span style={{color:'#64748b', fontWeight:500}}>Classificação Comercial</span>
                                            <strong style={{color:'#0f172a'}}>{product.dimensions.classificacao}</strong>
                                        </div>
                                        <div style={{display:'flex', justifyContent:'space-between', paddingBottom:'16px', borderBottom:'1px solid #f1f5f9'}}>
                                            <span style={{color:'#64748b', fontWeight:500}}>Status Ativo (Linha / SKU)</span>
                                            <strong style={{color:'#10b981'}}>{product.dimensions.statusLinha} / {product.dimensions.statusSku}</strong>
                                        </div>
                                    </div>
                                ) : (
                                    <p style={{color:'#94a3b8', fontStyle:'italic'}}>Nenhuma informação técnica cadastrada na Mestra para este SKU.</p>
                                )}
                            </div>

                        </div>
                    </div>
                )}
            </div>
            
            <style dangerouslySetInnerHTML={{__html: `@keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }`}} />
            {notification && <Toast type={notification.type} message={notification.message} />}
        </div>
    );
}