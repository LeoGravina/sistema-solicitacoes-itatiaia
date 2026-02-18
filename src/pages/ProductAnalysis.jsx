import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { collection, query, where, getDocs, limit, doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import Header from '../components/Header';
import Toast from '../components/Toast';
import { ArrowLeft, Image as ImageIcon, Search, Loader2, Package, Home, ChevronRight, Copy, CheckCircle, Settings2 } from 'lucide-react';

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
    
    const [activeImgCategory, setActiveImgCategory] = useState('fundo_branco');
    const [currentMainImg, setCurrentMainImg] = useState('');

    const [copied, setCopied] = useState(false);
    const [notification, setNotification] = useState(null);

    const [zoomStyle, setZoomStyle] = useState({ opacity: 0 });
    const imgContainerRef = useRef(null);

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
    }, []);

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
        if (prodData.images && prodData.images.length > 0) {
            const fbImgs = prodData.images.filter(img => img.type === 'fundo_branco');
            setCurrentMainImg(fbImgs.length > 0 ? fbImgs[0].url : prodData.imageUrl);
        } else {
            setCurrentMainImg(prodData.imageUrl || '');
        }
        setActiveImgCategory('fundo_branco');
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

    const handleMouseMove = (e) => {
        const { left, top, width, height } = e.target.getBoundingClientRect();
        const x = (e.pageX - left) / width * 100;
        const y = (e.pageY - top) / height * 100;
        setZoomStyle({
            backgroundImage: `url(${currentMainImg})`,
            backgroundPosition: `${x}% ${y}%`,
            backgroundSize: '200%', 
            opacity: 1
        });
    };

    const hasAmbiente = product?.images?.some(i => i.type === 'ambiente');
    const hasDiferencial = product?.images?.some(i => i.type === 'diferencial');
    const finalPrice = calculateFinalPrice();

    return (
        // ESTRUTURA BLINDADA: Header Fixo + Conteúdo Rolável
        <div style={{height:'100vh', display:'flex', flexDirection:'column', backgroundColor:'#ffffff', fontFamily:"'Inter', sans-serif"}}>
            
            {/* Header com flexShrink: 0 para não diminuir NUNCA */}
            <div style={{flexShrink: 0}}>
                <Header title="Análise de Produto" />
            </div>

            {/* Conteúdo com overflowY: auto para rolar independente do Header */}
            <div style={{flex: 1, overflowY: 'auto', padding:'2rem'}}>
                <div style={{maxWidth:'1400px', margin:'0 auto', width:'100%'}}>
                    
                    <div style={{display:'flex', alignItems:'center', gap:'8px', color:'#64748b', fontSize:'0.85rem', fontWeight:600, marginBottom:'2rem'}}>
                        <Home size={14} style={{cursor:'pointer'}} onClick={() => navigate('/')} />
                        <ChevronRight size={14} />
                        <span style={{cursor:'pointer', transition:'color 0.2s'}} onClick={() => navigate('/tabela-precos')} onMouseEnter={e=>e.currentTarget.style.color='#0f172a'} onMouseLeave={e=>e.currentTarget.style.color='#64748b'}>Catálogo Comercial</span>
                        <ChevronRight size={14} />
                        <span style={{color:'#0f172a'}}>Análise Detalhada</span>
                        {product && <><ChevronRight size={14} /><span style={{color:'#2563eb'}}>{product.sku}</span></>}
                    </div>

                    <div style={{display:'flex', flexDirection:'column', alignItems:'center', marginBottom:'3rem', position:'relative', zIndex:50}}>
                        <div style={{position:'relative', width:'100%', maxWidth:'600px'}}>
                            <Search size={20} style={{position:'absolute', left:'20px', top:'50%', transform:'translateY(-50%)', color:'#94a3b8'}} />
                            <input type="text" placeholder="Busque o produto por SKU ou Descrição..." value={skuInput} onChange={(e) => setSkuInput(e.target.value)} style={{width:'100%', padding:'18px 20px 18px 50px', borderRadius:'16px', border:'1px solid #cbd5e1', outline:'none', fontSize:'1.05rem', boxShadow:'0 4px 20px rgba(0,0,0,0.04)', color:'#0f172a', transition:'all 0.2s'}} onFocus={e => e.currentTarget.style.borderColor = '#2563eb'} onBlur={e => e.currentTarget.style.borderColor = '#cbd5e1'} />
                            {isSearching && <Loader2 size={18} className="spin" style={{position:'absolute', right:'20px', top:'50%', transform:'translateY(-50%)', color:'#2563eb'}} />}
                            {searchResults.length > 0 && (
                                <div style={{position:'absolute', top:'100%', left:0, width:'100%', background:'#fff', border:'1px solid #e2e8f0', borderRadius:'16px', marginTop:'8px', boxShadow:'0 15px 35px rgba(0,0,0,0.1)', overflow:'hidden'}}>
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
                        <div style={{display:'flex', gap:'4rem', alignItems:'flex-start', flexWrap: 'wrap', animation: 'fadeIn 0.4s ease-out', paddingBottom: '3rem'}}>
                            
                            <div style={{flex: '1 1 500px', display:'flex', flexDirection:'column'}}>
                                <div ref={imgContainerRef} onMouseMove={handleMouseMove} onMouseLeave={() => setZoomStyle({ opacity: 0 })} style={{position:'relative', display:'flex', justifyContent:'center', alignItems:'center', background:'#fff', borderRadius:'24px', padding:'10px', height:'500px', border:'1px solid #e2e8f0', cursor:'crosshair', overflow:'hidden'}}>
                                    {currentMainImg ? ( <img src={currentMainImg} alt={product.description} style={{maxWidth:'100%', maxHeight:'100%', objectFit:'contain', zIndex: 1}} /> ) : ( <div style={{display:'flex', flexDirection:'column', alignItems:'center', color:'#cbd5e1'}}><ImageIcon size={60} strokeWidth={1} /><p style={{fontSize:'1rem', marginTop:16}}>Imagem não encontrada</p></div> )}
                                    {currentMainImg && ( <div style={{...zoomStyle, position:'absolute', top:0, left:0, width:'100%', height:'100%', pointerEvents:'none', zIndex: 2, transition: 'opacity 0.2s ease-out'}} /> )}
                                </div>

                                {product.images && product.images.length > 0 && (
                                    <div style={{display:'flex', gap:'10px', justifyContent:'center', marginTop:'24px', flexWrap:'wrap'}}>
                                        <button onClick={() => setActiveImgCategory('fundo_branco')} style={{padding:'8px 18px', fontSize:'0.85rem', fontWeight:600, borderRadius:'30px', border: activeImgCategory === 'fundo_branco' ? '2px solid #0f172a' : '1px solid #e2e8f0', cursor:'pointer', background: activeImgCategory === 'fundo_branco' ? '#0f172a' : '#fff', color: activeImgCategory === 'fundo_branco' ? '#fff' : '#64748b', transition:'all 0.2s'}}>Produto</button>
                                        {hasAmbiente && <button onClick={() => setActiveImgCategory('ambiente')} style={{padding:'8px 18px', fontSize:'0.85rem', fontWeight:600, borderRadius:'30px', border: activeImgCategory === 'ambiente' ? '2px solid #0f172a' : '1px solid #e2e8f0', cursor:'pointer', background: activeImgCategory === 'ambiente' ? '#0f172a' : '#fff', color: activeImgCategory === 'ambiente' ? '#fff' : '#64748b', transition:'all 0.2s'}}>Ambiente</button>}
                                        {hasDiferencial && <button onClick={() => setActiveImgCategory('diferencial')} style={{padding:'8px 18px', fontSize:'0.85rem', fontWeight:600, borderRadius:'30px', border: activeImgCategory === 'diferencial' ? '2px solid #0f172a' : '1px solid #e2e8f0', cursor:'pointer', background: activeImgCategory === 'diferencial' ? '#0f172a' : '#fff', color: activeImgCategory === 'diferencial' ? '#fff' : '#64748b', transition:'all 0.2s'}}>Diferenciais</button>}
                                    </div>
                                )}

                                {product.images && product.images.filter(i => i.type === activeImgCategory).length > 0 && (
                                    <div style={{display:'flex', gap:'12px', overflowX:'auto', padding:'16px 0', justifyContent:'center'}}>
                                        {product.images.filter(i => i.type === activeImgCategory).map((img, index) => (
                                            <div key={index} onClick={() => setCurrentMainImg(img.url)} style={{width:'70px', height:'70px', flexShrink:0, background:'#fff', borderRadius:'12px', cursor:'pointer', border: currentMainImg === img.url ? '2px solid #0f172a' : '1px solid #e2e8f0', opacity: currentMainImg === img.url ? 1 : 0.6, transition:'all 0.2s', overflow:'hidden', display:'flex', alignItems:'center', justifyContent:'center'}}>
                                                <img src={img.url} style={{maxWidth:'90%', maxHeight:'90%', objectFit:'contain'}} />
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div style={{flex: '1 1 450px'}}>
                                <div style={{display:'flex', alignItems:'center', gap:'12px', marginBottom:'16px'}}>
                                    <span style={{background:'#f1f5f9', color:'#334155', padding:'6px 12px', borderRadius:'8px', fontSize:'0.75rem', fontWeight:700, letterSpacing:'1px', textTransform:'uppercase'}}>{product.brand}</span>
                                    <div style={{display:'flex', alignItems:'center', gap:'6px', background:'#f8fafc', padding:'4px 12px', borderRadius:'8px', border:'1px solid #e2e8f0'}}>
                                        <span style={{color:'#64748b', fontSize:'0.85rem', fontWeight:700}}>SKU: {product.sku}</span>
                                        <button onClick={handleCopySku} style={{background:'transparent', border:'none', cursor:'pointer', color: copied ? '#10b981' : '#94a3b8', display:'flex', alignItems:'center', padding:'4px'}} title="Copiar SKU">{copied ? <CheckCircle size={16} /> : <Copy size={16} />}</button>
                                    </div>
                                </div>
                                
                                <h1 style={{margin:'0 0 20px 0', fontSize:'2.2rem', color:'#0f172a', lineHeight:'1.2', fontWeight:800, letterSpacing:'-1px'}}>{product.description}</h1>

                                <div style={{background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:'16px', padding:'20px', marginBottom:'30px'}}>
                                    <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'16px'}}>
                                        <h3 style={{margin:0, fontSize:'1rem', color:'#1e40af', fontWeight:700, display:'flex', alignItems:'center', gap:'8px'}}><Settings2 size={18}/> Simulador de Condições</h3>
                                        <button onClick={() => setShowSimulador(!showSimulador)} style={{fontSize:'0.75rem', color:'#64748b', background:'transparent', border:'none', cursor:'pointer', textDecoration:'underline'}}>{showSimulador ? 'Ocultar' : 'Mostrar'}</button>
                                    </div>
                                    
                                    {showSimulador && (
                                        <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(130px, 1fr))', gap:'12px', marginBottom:'20px', animation:'fadeIn 0.2s'}}>
                                            <div><label style={{display:'block', fontSize:'0.7rem', fontWeight:600, color:'#64748b'}}>Expedição</label><select value={expedicao} onChange={e => setExpedicao(e.target.value)} style={{width:'100%', padding:'6px', borderRadius:'6px', border:'1px solid #cbd5e1', background:'#fff', fontSize:'0.8rem'}}><option value="UBÁ">UBÁ</option><option value="ATC-TO">ATC-TO</option><option value="SOO">SOO</option></select></div>
                                            <div><label style={{display:'block', fontSize:'0.7rem', fontWeight:600, color:'#64748b'}}>UF Destino</label><select value={uf} onChange={e => setUf(e.target.value)} style={{width:'100%', padding:'6px', borderRadius:'6px', border:'1px solid #cbd5e1', background:'#fff', fontSize:'0.8rem'}}>{['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO'].map(s => <option key={s} value={s}>{s}</option>)}</select></div>
                                            <div><label style={{display:'block', fontSize:'0.7rem', fontWeight:600, color:'#64748b'}}>Frete</label><select value={freteType} onChange={e => setFreteType(e.target.value)} style={{width:'100%', padding:'6px', borderRadius:'6px', border:'1px solid #cbd5e1', background:'#fff', fontSize:'0.8rem'}}><option value="FOB">FOB (Retira)</option><option value="CIF">CIF (Entrega)</option></select></div>
                                            <div><label style={{display:'block', fontSize:'0.7rem', fontWeight:600, color:'#64748b'}}>Tipo Carga</label><select value={tipoCarga} onChange={e => setTipoCarga(e.target.value)} style={{width:'100%', padding:'6px', borderRadius:'6px', border:'1px solid #cbd5e1', background:'#fff', fontSize:'0.8rem'}}><option value="Fracionado">Fracionado</option><option value="Truck">Truck</option><option value="Carreta">Carreta</option><option value="O próprio">O próprio</option></select></div>
                                            <div><label style={{display:'block', fontSize:'0.7rem', fontWeight:600, color:'#64748b'}}>Prazo</label><select value={paymentTerm} onChange={e => setPaymentTerm(e.target.value)} style={{width:'100%', padding:'6px', borderRadius:'6px', border:'1px solid #cbd5e1', background:'#fff', fontSize:'0.8rem'}}><option value="0.1360">0 Dias - 13,60%</option><option value="0.1287">15 Dias - 12,87%</option><option value="0.1262">20 Dias - 12,62%</option><option value="0.1213">30 Dias - 12,13%</option><option value="0.1103">55 Dias - 11,03%</option><option value="0.1066">60 Dias - 10,66%</option><option value="0.0919">90 Dias - 9,19%</option><option value="0.0772">120 Dias - 7,72%</option><option value="0.0919">30/300 Dias - 9,19%</option></select></div>
                                            <div><label style={{display:'block', fontSize:'0.7rem', fontWeight:600, color:'#64748b'}}>Cliente</label><select value={clientTier} onChange={e => setClientTier(e.target.value)} style={{width:'100%', padding:'6px', borderRadius:'6px', border:'1px solid #cbd5e1', background:'#fff', fontSize:'0.8rem'}}><option value="0">Padrão</option><option value="0.09">Ouro (9%)</option><option value="0.12">Diamante (12%)</option><option value="0.09">E-commerce (9%)</option></select></div>
                                        </div>
                                    )}

                                    <div style={{display:'flex', alignItems:'flex-end', justifyContent:'space-between', borderTop:'1px solid #e2e8f0', paddingTop:'16px'}}>
                                        <div style={{display:'flex', flexDirection:'column'}}>
                                            <span style={{fontSize:'0.75rem', fontWeight:700, color:'#64748b', textTransform:'uppercase'}}>Preço Calculado</span>
                                            <span style={{fontSize:'0.8rem', color:'#94a3b8'}}>Rota: {expedicao} ➔ {uf}</span>
                                        </div>
                                        <div style={{fontSize:'2.5rem', fontWeight:800, color:'#10b981', lineHeight:1}}>
                                            {finalPrice > 0 ? finalPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '---'}
                                        </div>
                                    </div>
                                </div>

                                <div style={{borderTop:'1px solid #e2e8f0', paddingTop:'32px'}}>
                                    <h3 style={{fontSize:'1rem', color:'#0f172a', display:'flex', alignItems:'center', gap:'8px', marginBottom:'20px', fontWeight:700}}><Package size={20} color="#2563eb"/> Ficha Técnica</h3>
                                    {product.dimensions ? (
                                        <div style={{display:'flex', flexDirection:'column', gap:'14px'}}>
                                            <div style={{display:'flex', justifyContent:'space-between', paddingBottom:'12px', borderBottom:'1px solid #f1f5f9'}}><span style={{color:'#64748b', fontSize:'0.9rem'}}>Dimensões (C x L x A)</span><strong style={{color:'#0f172a', fontSize:'0.95rem'}}>{product.dimensions.length} x {product.dimensions.width} x {product.dimensions.height} mm</strong></div>
                                            <div style={{display:'flex', justifyContent:'space-between', paddingBottom:'12px', borderBottom:'1px solid #f1f5f9'}}><span style={{color:'#64748b', fontSize:'0.9rem'}}>Peso Bruto / Líquido</span><strong style={{color:'#0f172a', fontSize:'0.95rem'}}>{product.dimensions.weightBruto} kg / {product.dimensions.weightLiq} kg</strong></div>
                                            <div style={{display:'flex', justifyContent:'space-between', paddingBottom:'12px', borderBottom:'1px solid #f1f5f9'}}><span style={{color:'#64748b', fontSize:'0.9rem'}}>Volume</span><strong style={{color:'#0f172a', fontSize:'0.95rem'}}>{product.dimensions.volume} m³</strong></div>
                                            <div style={{display:'flex', justifyContent:'space-between', paddingBottom:'12px', borderBottom:'1px solid #f1f5f9'}}><span style={{color:'#64748b', fontSize:'0.9rem'}}>Classificação</span><strong style={{color:'#0f172a', fontSize:'0.95rem'}}>{product.dimensions.classificacao}</strong></div>
                                            <div style={{display:'flex', justifyContent:'space-between', paddingBottom:'12px', borderBottom:'1px solid #f1f5f9'}}><span style={{color:'#64748b', fontSize:'0.9rem'}}>Status</span><strong style={{color:'#10b981', fontSize:'0.95rem'}}>{product.dimensions.statusSku}</strong></div>
                                        </div>
                                    ) : (<p style={{color:'#94a3b8', fontStyle:'italic'}}>Nenhuma informação técnica.</p>)}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
            <style dangerouslySetInnerHTML={{__html: `@keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }`}} />
            {notification && <Toast type={notification.type} message={notification.message} />}
        </div>
    );
}