import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { collection, query, where, getDocs, limit, doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import Header from '../components/Header';
import Toast from '../components/Toast';
import { Search, Loader2, Package, Home, ChevronRight, Copy, CheckCircle, Settings2, Image as ImageIcon, ChevronLeft } from 'lucide-react';

// Função auxiliar para converter unidades (MM para CM ou M)
const convertDimension = (valueInMm, targetUnit) => {
    const val = parseFloat(valueInMm);
    if (isNaN(val)) return '-';
    if (targetUnit === 'cm') return (val / 10).toFixed(1);
    if (targetUnit === 'm') return (val / 1000).toFixed(3);
    return val; // mm
};

export default function ProductAnalysis() {
    const navigate = useNavigate();
    const location = useLocation();
    
    const initialSku = location.state?.sku || ''; 
    const [expedicao, setExpedicao] = useState(location.state?.expedicao || 'UBÁ'); 
    const [uf, setUf] = useState(location.state?.uf || 'MG');
    const [freteType, setFreteType] = useState(location.state?.freteType || 'CIF');
    const [tipoCarga, setTipoCarga] = useState(location.state?.tipoCarga || 'Truck'); 
    const [clientTier, setClientTier] = useState(location.state?.clientTier || '0'); 
    const [paymentTerm, setPaymentTerm] = useState(location.state?.paymentTerm || '0.1360'); 
    const [logisticsMap, setLogisticsMap] = useState(location.state?.logisticsMap || {});

    const [skuInput, setSkuInput] = useState('');
    const [product, setProduct] = useState(null);
    const [loading, setLoading] = useState(false);
    const [searchResults, setSearchResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);
    const [showSimulador, setShowSimulador] = useState(true); 
    
    // --- ESTADOS DO CARROSSEL E UNIDADES ---
    const [activeImgCategory, setActiveImgCategory] = useState('fundo_branco');
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isHoveringImgWrapper, setIsHoveringImgWrapper] = useState(false); 
    const [dimUnit, setDimUnit] = useState('mm'); // mm, cm, m

    const [copied, setCopied] = useState(false);
    const [notification, setNotification] = useState(null);

    const showNotification = (type, message) => { 
        setNotification({ type, message }); 
        setTimeout(() => setNotification(null), 3000); 
    };

    useEffect(() => {
        if (Object.keys(logisticsMap).length === 0) {
            const fetchLogistics = async () => {
                try {
                    const docSnap = await getDoc(doc(db, 'system_settings', 'logistics_discounts'));
                    if (docSnap.exists()) setLogisticsMap(docSnap.data());
                } catch (error) { console.error("Erro malha", error); }
            };
            fetchLogistics();
        }
    }, [logisticsMap]);

    const calculateFinalPrice = () => {
        if (!product) return 0;
        let basePrice = 0;
        if (product.prices && product.prices[expedicao] && product.prices[expedicao][uf]) {
            basePrice = freteType === 'CIF' ? (product.prices[expedicao][uf].cif || 0) : (product.prices[expedicao][uf].fob || 0);
        }
        if (!product.prices && (!basePrice || basePrice === 0)) basePrice = product.price || 0;
        if (basePrice === 0) return 0;

        let descLogistico = 0;
        if (freteType === 'CIF') {
            const logKey = `${expedicao}${uf}${product.sector || 'OUTROS'}${tipoCarga}`.toUpperCase().replace(/\s/g, '');
            descLogistico = logisticsMap[logKey] || 0;
        }
        return basePrice * (1 - parseFloat(paymentTerm)) * (1 - parseFloat(clientTier)) * (1 - descLogistico);
    };

    const loadProductData = (prodData) => {
        setProduct(prodData);
        setActiveImgCategory('fundo_branco');
        setCurrentIndex(0);
        setSkuInput(''); 
        setSearchResults([]); 

        const saved = JSON.parse(localStorage.getItem('itatiaia_recent') || '[]');
        const filtered = saved.filter(p => p.sku !== prodData.sku);
        filtered.unshift({ sku: prodData.sku, description: prodData.description, imageUrl: prodData.imageUrl });
        localStorage.setItem('itatiaia_recent', JSON.stringify(filtered.slice(0, 5)));
    };

    useEffect(() => {
        if (initialSku) {
            const fetchInitial = async () => {
                setLoading(true);
                try {
                    const q = query(collection(db, 'products_base'), where('sku', '==', initialSku));
                    const snap = await getDocs(q);
                    if (!snap.empty) loadProductData({ id: snap.docs[0].id, ...snap.docs[0].data() });
                } catch (err) { console.error(err); }
                setLoading(false);
            };
            fetchInitial();
        }
    }, [initialSku]);

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
                    setSearchResults(Array.from(uniqueMap.values()).slice(0, 6));
                } catch (e) { console.error(e); }
                setIsSearching(false);
            } else { setSearchResults([]); }
        }, 400); 
        return () => clearTimeout(delayDebounceFn);
    }, [skuInput]);

    const handleCopySku = () => {
        if(product?.sku) {
            navigator.clipboard.writeText(product.sku);
            setCopied(true);
            showNotification('success', 'SKU copiado com sucesso!');
            setTimeout(() => setCopied(false), 2000);
        }
    };

    // --- LÓGICA DO CARROSSEL (Menor nome primeiro) ---
    const currentCategoryImages = useMemo(() => {
        if (!product || !product.images) return [];
        return product.images
            .filter(img => img.type === activeImgCategory)
            .sort((a, b) => (a.name?.length || 0) - (b.name?.length || 0)); // Foto principal sempre ganha
    }, [product, activeImgCategory]);

    const currentMainImg = currentCategoryImages[currentIndex]?.url || product?.imageUrl || '';

    // Rotação Automática do Carrossel (Pausa se o mouse estiver em cima)
    useEffect(() => {
        if (isHoveringImgWrapper || currentCategoryImages.length <= 1) return;
        const timer = setInterval(() => {
            setCurrentIndex(prev => (prev + 1) % currentCategoryImages.length);
        }, 4000); 
        return () => clearInterval(timer);
    }, [isHoveringImgWrapper, currentCategoryImages.length]);

    const nextImage = (e) => {
        e.stopPropagation();
        setCurrentIndex(prev => (prev + 1) % currentCategoryImages.length);
    };

    const prevImage = (e) => {
        e.stopPropagation();
        setCurrentIndex(prev => (prev - 1 + currentCategoryImages.length) % currentCategoryImages.length);
    };

    const hasAmbiente = product?.images?.some(i => i.type === 'ambiente');
    const hasDiferencial = product?.images?.some(i => i.type === 'diferencial');
    const finalPrice = calculateFinalPrice();

    return (
        <div style={{height:'100vh', display:'flex', flexDirection:'column', backgroundColor:'#ffffff', fontFamily:"'Inter', sans-serif"}}>
            <div style={{flexShrink: 0}}><Header title="Análise de Produto" /></div>
            
            <div style={{flex: 1, overflowY: 'auto', padding:'2rem'}}>
                <div style={{maxWidth:'1400px', margin:'0 auto', width:'100%'}}>
                    
                    {/* BREADCRUMB */}
                    <div style={{display:'flex', alignItems:'center', gap:'8px', color:'#64748b', fontSize:'0.80rem', fontWeight:600, marginBottom:'1.5rem'}}>
                        <Home size={12} style={{cursor:'pointer'}} onClick={() => navigate('/')} />
                        <ChevronRight size={12} />
                        <span style={{cursor:'pointer', transition:'color 0.2s'}} onClick={() => navigate('/tabela-precos')} onMouseEnter={e=>e.currentTarget.style.color='#0f172a'} onMouseLeave={e=>e.currentTarget.style.color='#64748b'}>Tabela de Preços</span>
                        <ChevronRight size={12} />
                        <span style={{color:'#0f172a'}}>Análise de Produtos</span>
                        {product && <><ChevronRight size={14} /><span style={{color:'#2563eb'}}>{product.sku}</span></>}
                    </div>

                    {/* BARRA DE BUSCA "HOME STYLE" (Pílula Elegante) */}
                    <div style={{display:'flex', justifyContent:'center', marginBottom:'3rem', position:'relative', zIndex:50}}>
                        <div style={{position:'relative', width:'100%', maxWidth:'650px'}}>
                            <Search size={22} style={{position:'absolute', left:'24px', top:'50%', transform:'translateY(-50%)', color:'#94a3b8'}} />
                            <input 
                                type="text" 
                                placeholder="Busque um novo produto por SKU ou Descrição..." 
                                value={skuInput} 
                                onChange={(e) => setSkuInput(e.target.value)} 
                                style={{width:'100%', padding:'18px 24px 18px 56px', borderRadius:'50px', border:'1px solid #e2e8f0', outline:'none', fontSize:'1.05rem', boxShadow:'0 10px 25px rgba(0,0,0,0.03)', color:'#0f172a', transition:'all 0.3s'}} 
                                onFocus={e => {e.currentTarget.style.borderColor = '#2563eb'; e.currentTarget.style.boxShadow = '0 10px 30px rgba(37, 99, 235, 0.1)'}} 
                                onBlur={e => {e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.boxShadow = '0 10px 25px rgba(0,0,0,0.03)'}} 
                            />
                            {isSearching && <Loader2 size={20} className="spin" style={{position:'absolute', right:'24px', top:'50%', transform:'translateY(-50%)', color:'#2563eb'}} />}
                            
                            {searchResults.length > 0 && (
                                <div style={{position:'absolute', top:'100%', left:0, width:'100%', background:'#fff', border:'1px solid #e2e8f0', borderRadius:'16px', marginTop:'12px', boxShadow:'0 15px 35px rgba(0,0,0,0.1)', overflow:'hidden'}}>
                                    {searchResults.map((res, idx) => (
                                        <div key={res.sku} onClick={() => loadProductData(res)} style={{padding:'14px 20px', borderBottom: idx === searchResults.length - 1 ? 'none' : '1px solid #f1f5f9', cursor:'pointer', display:'flex', alignItems:'center', gap:'12px', transition:'background 0.2s'}} onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'} onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                                            <div style={{background:'#f1f5f9', padding:'8px', borderRadius:'8px', color:'#64748b'}}><Search size={16}/></div>
                                            <div style={{display:'flex', flexDirection:'column'}}><span style={{fontSize:'0.9rem', color:'#0f172a', fontWeight:600}}>{res.description}</span><div style={{display:'flex', gap:'8px', alignItems:'center', marginTop:'4px'}}><span style={{fontSize:'0.75rem', color:'#64748b', fontWeight:700}}>SKU: {res.sku}</span><span style={{fontSize:'0.7rem', color:'#2563eb', background:'#eff6ff', padding:'2px 6px', borderRadius:'4px'}}>{res.brand}</span></div></div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {loading && <div style={{display:'flex', justifyContent:'center', marginTop:'50px'}}><Loader2 className="spin" size={40} color="#0f172a"/></div>}

                    {product && !loading && (
                        <div style={{display:'flex', gap:'3rem', alignItems:'flex-start', flexWrap: 'wrap', animation: 'fadeIn 0.4s ease-out', paddingBottom: '3rem'}}>
                            
                            {/* LADO ESQUERDO: GALERIA LIMPA E SEM ZOOM */}
                            <div style={{flex: '1 1 500px', display:'flex', flexDirection:'column', background:'#fff', padding:'20px', borderRadius:'24px', boxShadow:'0 4px 20px rgba(0,0,0,0.03)', border:'1px solid #e2e8f0'}}>
                                
                                {/* CONTAINER DA IMAGEM PRINCIPAL (Altura Máxima Fixa para não estourar a tela) */}
                                <div 
                                    onMouseEnter={() => setIsHoveringImgWrapper(true)}
                                    onMouseLeave={() => setIsHoveringImgWrapper(false)}
                                    style={{position:'relative', height:'420px', background:'#fff', display:'flex', justifyContent:'center', alignItems:'center', borderRadius:'16px'}}
                                >
                                    {currentMainImg ? ( 
                                        <img key={currentMainImg} src={currentMainImg} alt={product.description} style={{maxWidth:'95%', maxHeight:'95%', objectFit:'contain', animation: 'fadeIn 0.3s ease-out'}} /> 
                                    ) : ( 
                                        <div style={{display:'flex', flexDirection:'column', alignItems:'center', color:'#cbd5e1'}}><ImageIcon size={60} strokeWidth={1} /><p style={{fontSize:'1rem', marginTop:16}}>Imagem não encontrada</p></div> 
                                    )}

                                    {/* SETAS DE NAVEGAÇÃO FLUTUANTES */}
                                    {currentCategoryImages.length > 1 && (
                                        <>
                                            <button onClick={prevImage} style={{position:'absolute', left:'10px', top:'50%', transform:'translateY(-50%)', background:'rgba(255,255,255,0.9)', border:'1px solid #e2e8f0', width:'40px', height:'40px', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', zIndex: 10, color:'#0f172a', boxShadow:'0 4px 12px rgba(0,0,0,0.1)', opacity: isHoveringImgWrapper ? 1 : 0, transition:'all 0.2s'}} onMouseEnter={e=>e.currentTarget.style.background='#f8fafc'} onMouseLeave={e=>e.currentTarget.style.background='rgba(255,255,255,0.9)'}><ChevronLeft size={22}/></button>
                                            <button onClick={nextImage} style={{position:'absolute', right:'10px', top:'50%', transform:'translateY(-50%)', background:'rgba(255,255,255,0.9)', border:'1px solid #e2e8f0', width:'40px', height:'40px', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', zIndex: 10, color:'#0f172a', boxShadow:'0 4px 12px rgba(0,0,0,0.1)', opacity: isHoveringImgWrapper ? 1 : 0, transition:'all 0.2s'}} onMouseEnter={e=>e.currentTarget.style.background='#f8fafc'} onMouseLeave={e=>e.currentTarget.style.background='rgba(255,255,255,0.9)'}><ChevronRight size={22}/></button>
                                        </>
                                    )}
                                </div>

                                {/* ABAS DE CATEGORIA */}
                                {product.images && product.images.length > 0 && (
                                    <div style={{display:'flex', gap:'8px', justifyContent:'center', marginTop:'16px', flexWrap:'wrap'}}>
                                        <button onClick={() => {setActiveImgCategory('fundo_branco'); setCurrentIndex(0);}} style={{padding:'6px 18px', fontSize:'0.80rem', fontWeight:600, borderRadius:'30px', border:'1px solid', borderColor: activeImgCategory === 'fundo_branco' ? '#0f172a' : '#e2e8f0', cursor:'pointer', background: activeImgCategory === 'fundo_branco' ? '#0f172a' : '#fff', color: activeImgCategory === 'fundo_branco' ? '#fff' : '#64748b', transition:'all 0.2s'}}>Produto</button>
                                        {hasAmbiente && <button onClick={() => {setActiveImgCategory('ambiente'); setCurrentIndex(0);}} style={{padding:'6px 18px', fontSize:'0.80rem', fontWeight:600, borderRadius:'30px', border:'1px solid', borderColor: activeImgCategory === 'ambiente' ? '#0f172a' : '#e2e8f0', cursor:'pointer', background: activeImgCategory === 'ambiente' ? '#0f172a' : '#fff', color: activeImgCategory === 'ambiente' ? '#fff' : '#64748b', transition:'all 0.2s'}}>Ambiente</button>}
                                        {hasDiferencial && <button onClick={() => {setActiveImgCategory('diferencial'); setCurrentIndex(0);}} style={{padding:'6px 18px', fontSize:'0.80rem', fontWeight:600, borderRadius:'30px', border:'1px solid', borderColor: activeImgCategory === 'diferencial' ? '#0f172a' : '#e2e8f0', cursor:'pointer', background: activeImgCategory === 'diferencial' ? '#0f172a' : '#fff', color: activeImgCategory === 'diferencial' ? '#fff' : '#64748b', transition:'all 0.2s'}}>Diferenciais</button>}
                                    </div>
                                )}

                                {/* MINIATURAS DA CATEGORIA */}
                                {currentCategoryImages.length > 1 && (
                                    <div className="custom-scrollbar" style={{display:'flex', gap:'12px', overflowX:'auto', padding:'16px 0', marginTop:'8px', justifyContent:'center'}}>
                                        {currentCategoryImages.map((img, index) => (
                                            <div key={index} onClick={() => setCurrentIndex(index)} style={{width:'60px', height:'60px', flexShrink:0, background:'#fff', borderRadius:'10px', cursor:'pointer', border: currentIndex === index ? '2px solid #2563eb' : '1px solid #e2e8f0', opacity: currentIndex === index ? 1 : 0.5, transition:'all 0.2s', display:'flex', alignItems:'center', justifyContent:'center', padding:'4px'}}>
                                                <img src={img.url} loading="lazy" decoding="async" style={{maxWidth:'100%', maxHeight:'100%', objectFit:'contain'}} />
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* LADO DIREITO: DADOS DO PRODUTO */}
                            <div style={{flex: '1 1 450px', display:'flex', flexDirection:'column'}}>
                                {/* CABEÇALHO */}
                                <div style={{display:'flex', alignItems:'center', gap:'12px', marginBottom:'16px'}}>
                                    <span style={{background:'#e0e7ff', color:'#1e40af', padding:'6px 12px', borderRadius:'8px', fontSize:'0.75rem', fontWeight:800, letterSpacing:'1px', textTransform:'uppercase'}}>{product.brand}</span>
                                    <div style={{display:'flex', alignItems:'center', gap:'6px', background:'#f8fafc', padding:'4px 12px', borderRadius:'8px', border:'1px solid #cbd5e1'}}>
                                        <span style={{color:'#475569', fontSize:'0.80rem', fontWeight:700}}>SKU: {product.sku}</span>
                                        <button onClick={handleCopySku} style={{background:'transparent', border:'none', cursor:'pointer', color: copied ? '#10b981' : '#94a3b8', display:'flex', alignItems:'center', padding:'4px'}} title="Copiar SKU">{copied ? <CheckCircle size={16} /> : <Copy size={16} />}</button>
                                    </div>
                                </div>
                                <h1 style={{margin:'0 0 24px 0', fontSize:'2.2rem', color:'#0f172a', lineHeight:'1.2', fontWeight:800, letterSpacing:'-1px'}}>{product.description}</h1>

                                {/* SIMULADOR AZUL ITATIAIA (MANTIDO) */}
                                <div style={{background: 'linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)', borderRadius: '16px', padding: '24px', border: 'none', boxShadow: '0 4px 20px rgba(37, 99, 235, 0.15)', marginBottom:'30px'}}>
                                    <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px'}}>
                                        <h3 style={{margin:0, fontSize:'1.1rem', color:'#fff', fontWeight:800, display:'flex', alignItems:'center', gap:'8px', letterSpacing:'0.5px'}}><Settings2 size={20} color="#fff"/> Simulador Comercial</h3>
                                        <button onClick={() => setShowSimulador(!showSimulador)} style={{fontSize:'0.75rem', color:'rgba(255,255,255,0.8)', background:'transparent', border:'none', cursor:'pointer', textDecoration:'underline', fontWeight:600}}>{showSimulador ? 'Ocultar' : 'Mostrar'}</button>
                                    </div>
                                    
                                    {showSimulador && (
                                        <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(130px, 1fr))', gap:'12px', marginBottom:'24px', animation:'fadeIn 0.2s'}}>
                                            {/* Inputs Translúcidos do Simulador */}
                                            <div><label style={{display: 'block', fontSize: '0.7rem', fontWeight: 700, color: '#bfdbfe', marginBottom: '6px', textTransform: 'uppercase'}}>Expedição</label><select value={expedicao} onChange={e => setExpedicao(e.target.value)} style={{width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)', outline: 'none', background: 'rgba(255,255,255,0.1)', color: '#ffffff', fontSize: '0.85rem', fontWeight: 600, cursor:'pointer'}}><option value="UBÁ" style={{color:'#0f172a'}}>UBÁ</option><option value="ATC-TO" style={{color:'#0f172a'}}>ATC-TO</option><option value="SOO" style={{color:'#0f172a'}}>SOO</option></select></div>
                                            <div><label style={{display: 'block', fontSize: '0.7rem', fontWeight: 700, color: '#bfdbfe', marginBottom: '6px', textTransform: 'uppercase'}}>UF Destino</label><select value={uf} onChange={e => setUf(e.target.value)} style={{width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)', outline: 'none', background: 'rgba(255,255,255,0.1)', color: '#ffffff', fontSize: '0.85rem', fontWeight: 600, cursor:'pointer'}}>{['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO'].map(s => <option key={s} value={s} style={{color:'#0f172a'}}>{s}</option>)}</select></div>
                                            <div><label style={{display: 'block', fontSize: '0.7rem', fontWeight: 700, color: '#bfdbfe', marginBottom: '6px', textTransform: 'uppercase'}}>Frete</label><select value={freteType} onChange={e => setFreteType(e.target.value)} style={{width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)', outline: 'none', background: 'rgba(255,255,255,0.1)', color: '#ffffff', fontSize: '0.85rem', fontWeight: 600, cursor:'pointer'}}><option value="FOB" style={{color:'#0f172a'}}>FOB (Retira)</option><option value="CIF" style={{color:'#0f172a'}}>CIF (Entrega)</option></select></div>
                                            <div><label style={{display: 'block', fontSize: '0.7rem', fontWeight: 700, color: '#bfdbfe', marginBottom: '6px', textTransform: 'uppercase'}}>Tipo Carga</label><select value={tipoCarga} onChange={e => setTipoCarga(e.target.value)} style={{width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)', outline: 'none', background: 'rgba(255,255,255,0.1)', color: '#ffffff', fontSize: '0.85rem', fontWeight: 600, cursor:'pointer'}}><option value="Fracionado" style={{color:'#0f172a'}}>Fracionado</option><option value="Truck" style={{color:'#0f172a'}}>Truck</option><option value="Carreta" style={{color:'#0f172a'}}>Carreta</option><option value="O próprio" style={{color:'#0f172a'}}>O próprio</option></select></div>
                                            <div><label style={{display: 'block', fontSize: '0.7rem', fontWeight: 700, color: '#bfdbfe', marginBottom: '6px', textTransform: 'uppercase'}}>Prazo</label><select value={paymentTerm} onChange={e => setPaymentTerm(e.target.value)} style={{width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)', outline: 'none', background: 'rgba(255,255,255,0.1)', color: '#ffffff', fontSize: '0.85rem', fontWeight: 600, cursor:'pointer'}}><option value="0.1360" style={{color:'#0f172a'}}>0 Dias</option><option value="0.1287" style={{color:'#0f172a'}}>15 Dias</option><option value="0.1262" style={{color:'#0f172a'}}>20 Dias</option><option value="0.1213" style={{color:'#0f172a'}}>30 Dias</option><option value="0.1103" style={{color:'#0f172a'}}>55 Dias</option><option value="0.1066" style={{color:'#0f172a'}}>60 Dias</option><option value="0.0919" style={{color:'#0f172a'}}>90 Dias</option><option value="0.0772" style={{color:'#0f172a'}}>120 Dias</option><option value="0.0919" style={{color:'#0f172a'}}>30/300 Dias</option></select></div>
                                            <div><label style={{display: 'block', fontSize: '0.7rem', fontWeight: 700, color: '#bfdbfe', marginBottom: '6px', textTransform: 'uppercase'}}>Cliente</label><select value={clientTier} onChange={e => setClientTier(e.target.value)} style={{width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)', outline: 'none', background: 'rgba(255,255,255,0.1)', color: '#ffffff', fontSize: '0.85rem', fontWeight: 600, cursor:'pointer'}}><option value="0" style={{color:'#0f172a'}}>Padrão</option><option value="0.09" style={{color:'#0f172a'}}>Ouro (9%)</option><option value="0.12" style={{color:'#0f172a'}}>Diamante (12%)</option><option value="0.09" style={{color:'#0f172a'}}>E-commerce</option></select></div>
                                        </div>
                                    )}
                                    
                                    <div style={{display:'flex', alignItems:'flex-end', justifyContent:'space-between', borderTop:'1px solid rgba(255,255,255,0.2)', paddingTop:'20px'}}>
                                        <div style={{display:'flex', flexDirection:'column'}}>
                                            <span style={{fontSize:'0.75rem', fontWeight:800, color:'#bfdbfe', textTransform:'uppercase', letterSpacing:'0.5px'}}>Preço Final Simulado</span>
                                            <span style={{fontSize:'0.8rem', color:'rgba(255,255,255,0.8)', marginTop:'2px'}}>Base: {expedicao} ➔ {uf} ({freteType})</span>
                                        </div>
                                        <div style={{fontSize:'2.8rem', fontWeight:800, color:'#fff', lineHeight:1, letterSpacing:'-1px', textShadow:'0 2px 10px rgba(0,0,0,0.2)'}}>
                                            {finalPrice > 0 ? finalPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '---'}
                                        </div>
                                    </div>
                                </div>

                                {/* FICHA TÉCNICA (ESTILO CLÁSSICO E LIMPO DE VOLTA) */}
                                <div style={{background:'#f8fafc', borderRadius:'16px', padding:'24px', border:'1px solid #e2e8f0'}}>
                                    <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'24px'}}>
                                        <h3 style={{margin:0, fontSize:'1.05rem', color:'#0f172a', display:'flex', alignItems:'center', gap:'8px', fontWeight:800}}><Package size={20} color="#64748b"/> Ficha Técnica</h3>
                                        
                                        {/* SELETOR DE UNIDADE DE MEDIDA (Estilo Claro) */}
                                        <div style={{display:'flex', background:'#e2e8f0', borderRadius:'8px', padding:'2px'}}>
                                            {['mm', 'cm', 'm'].map(unit => (
                                                <button key={unit} onClick={() => setDimUnit(unit)} style={{padding:'4px 10px', fontSize:'0.7rem', fontWeight:700, borderRadius:'6px', border:'none', cursor:'pointer', background: dimUnit === unit ? '#fff' : 'transparent', color: dimUnit === unit ? '#0f172a' : '#64748b', transition:'all 0.2s', textTransform:'uppercase', boxShadow: dimUnit === unit ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'}}>{unit}</button>
                                            ))}
                                        </div>
                                    </div>

                                    {product.dimensions ? (
                                        <div style={{display:'flex', flexDirection:'column', gap:'16px'}}>
                                            <div style={{display:'flex', justifyContent:'space-between', paddingBottom:'12px', borderBottom:'1px dashed #cbd5e1'}}>
                                                <span style={{color:'#64748b', fontSize:'0.9rem', fontWeight:600}}>Status do Produto</span>
                                                <strong style={{color: product.dimensions.statusSku?.toUpperCase().includes('FORA') ? '#ef4444' : '#10b981', fontSize:'0.95rem'}}>{product.dimensions.statusSku || 'Ativo'}</strong>
                                            </div>
                                            <div style={{display:'flex', justifyContent:'space-between', paddingBottom:'12px', borderBottom:'1px dashed #cbd5e1'}}>
                                                <span style={{color:'#64748b', fontSize:'0.9rem', fontWeight:600}}>Linha (Marca)</span>
                                                <strong style={{color:'#0f172a', fontSize:'0.95rem'}}>{product.brand}</strong>
                                            </div>
                                            <div style={{display:'flex', justifyContent:'space-between', paddingBottom:'12px', borderBottom:'1px dashed #cbd5e1'}}>
                                                <span style={{color:'#64748b', fontSize:'0.9rem', fontWeight:600}}>Setor</span>
                                                <strong style={{color:'#0f172a', fontSize:'0.95rem'}}>{product.sector || 'N/A'}</strong>
                                            </div>
                                            
                                            <div style={{display:'flex', justifyContent:'space-between', paddingBottom:'12px', borderBottom:'1px dashed #cbd5e1'}}>
                                                <span style={{color:'#64748b', fontSize:'0.9rem', fontWeight:600}}>Dimensões (C x L x A)</span>
                                                <strong style={{color:'#0f172a', fontSize:'0.95rem'}}>{convertDimension(product.dimensions.length, dimUnit)} x {convertDimension(product.dimensions.width, dimUnit)} x {convertDimension(product.dimensions.height, dimUnit)} {dimUnit}</strong>
                                            </div>
                                            <div style={{display:'flex', justifyContent:'space-between', paddingBottom:'12px', borderBottom:'1px dashed #cbd5e1'}}>
                                                <span style={{color:'#64748b', fontSize:'0.9rem', fontWeight:600}}>Peso Bruto / Líquido</span>
                                                <strong style={{color:'#0f172a', fontSize:'0.95rem'}}>{product.dimensions.weightBruto} kg / {product.dimensions.weightLiq} kg</strong>
                                            </div>
                                            <div style={{display:'flex', justifyContent:'space-between', paddingBottom:'12px', borderBottom:'1px dashed #cbd5e1'}}>
                                                <span style={{color:'#64748b', fontSize:'0.9rem', fontWeight:600}}>Volume</span>
                                                <strong style={{color:'#0f172a', fontSize:'0.95rem'}}>{product.dimensions.volume} m³</strong>
                                            </div>
                                            <div style={{display:'flex', justifyContent:'space-between', paddingBottom:'0', borderBottom:'none'}}>
                                                <span style={{color:'#64748b', fontSize:'0.9rem', fontWeight:600}}>Classificação Fiscal</span>
                                                <strong style={{color:'#0f172a', fontSize:'0.95rem'}}>{product.dimensions.classificacao || 'N/A'}</strong>
                                            </div>
                                        </div>
                                    ) : (<p style={{color:'#94a3b8', fontStyle:'italic'}}>Nenhuma informação técnica cadastrada.</p>)}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
            <style dangerouslySetInnerHTML={{__html: `
                @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
                .custom-scrollbar::-webkit-scrollbar { height: 6px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
            `}} />
            {notification && <Toast type={notification.type} message={notification.message} />}
        </div>
    );
}