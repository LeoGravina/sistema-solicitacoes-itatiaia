import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, collection, query, orderBy, getDocs, limit, where, startAfter, getCountFromServer, getDoc, startAt } from 'firebase/firestore';
import { db } from '../config/firebase';
import Header from '../components/Header';
import { Search, Image as ImageIcon, Settings2, X, Info, ExternalLink, ChevronLeft, ChevronRight, Home, Download, Filter } from 'lucide-react';
import * as XLSX from 'xlsx';

function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

// 🪄 MÁGICA 1: COMPONENTE MARCA-TEXTO
// Ele recebe um texto normal e a palavra buscada. Se achar, pinta de amarelo!
const HighlightText = ({ text, highlight }) => {
    if (!highlight || !highlight.trim()) return <span>{text}</span>;
    const regex = new RegExp(`(${highlight})`, 'gi');
    const parts = String(text).split(regex);
    return (
        <span>
            {parts.map((part, i) => 
                regex.test(part) 
                ? <span key={i} style={{backgroundColor: '#fef08a', color: '#854d0e', fontWeight: 'bold', padding: '2px 4px', borderRadius: '4px'}}>{part}</span> 
                : <span key={i}>{part}</span>
            )}
        </span>
    );
};

export default function PriceTable() {
  const navigate = useNavigate();
  
  // PARÂMETROS DO SIMULADOR
  const [expedicao, setExpedicao] = useState('UBÁ'); 
  const [uf, setUf] = useState('MG');
  const [freteType, setFreteType] = useState('CIF');
  const [tipoCarga, setTipoCarga] = useState('Truck'); 
  const [clientTier, setClientTier] = useState('0'); 
  const [paymentTerm, setPaymentTerm] = useState('0.1360'); 

  const [logisticsMap, setLogisticsMap] = useState({});
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const ITEMS_PER_PAGE = 50;

  // PAGINAÇÃO REAL
  const [currentPage, setCurrentPage] = useState(1);
  const [pageHistory, setPageHistory] = useState([]); 
  const [firstDoc, setFirstDoc] = useState(null);
  const [lastDoc, setLastDoc] = useState(null);
  const [hasMore, setHasMore] = useState(true);

  // FILTROS, BUSCA E ABAS
  const [rawSearchTerm, setRawSearchTerm] = useState('');
  const searchTerm = useDebounce(rawSearchTerm, 800);
  const [activeTab, setActiveTab] = useState('Todos');
  const fixedTabs = ['Todos', 'AÇO e MAD', 'ELETRO', 'ELETROPORTÁTEIS', 'ITACOM'];
  const [tabCounts, setTabCounts] = useState({});
  const [showFilters, setShowFilters] = useState(true); 
  
  const [showBrandFilters, setShowBrandFilters] = useState(false);
  const [selectedLinhas, setSelectedLinhas] = useState([]);
  const [knownLinhas, setKnownLinhas] = useState(new Set());
  
  const [selectedProduct, setSelectedProduct] = useState(null);

  useEffect(() => { 
      const fetchTabCounts = async () => {
          try {
              const counts = {};
              const snapTotal = await getCountFromServer(collection(db, 'products_base'));
              counts['Todos'] = snapTotal.data().count;
              for (const grupo of ['AÇO e MAD', 'ELETRO', 'ELETROPORTÁTEIS', 'ITACOM']) {
                  const snap = await getCountFromServer(query(collection(db, 'products_base'), where('group', '==', grupo)));
                  counts[grupo] = snap.data().count;
              }
              setTabCounts(counts);
          } catch (error) { console.error(error); }
      };
      const fetchLogistics = async () => {
          try {
              const docSnap = await getDoc(doc(db, 'system_settings', 'logistics_discounts'));
              if (docSnap.exists()) setLogisticsMap(docSnap.data());
          } catch (error) { console.error(error); }
      };
      fetchTabCounts(); fetchLogistics();
  }, []);

  const calculateFinalPrice = (product) => {
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

  const exportToExcel = () => {
      if (products.length === 0) return alert("Nenhum produto na tela para exportar.");
      const dataToExport = products.map(p => ({
          'SKU': p.sku, 'Descrição': p.description, 'Linha': p.brand, 'Grupo': p.group,
          'Estoque': p.stock, 'Preço Calc. (R$)': calculateFinalPrice(p)
      }));
      const ws = XLSX.utils.json_to_sheet(dataToExport);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Cotação Atual");
      const fileName = searchTerm ? `Cotacao_Pesquisa_${searchTerm}_${new Date().getTime()}.xlsx` : `Cotacao_${activeTab}_${new Date().getTime()}.xlsx`;
      XLSX.writeFile(wb, fileName);
  };

  const toggleLinha = (linha) => {
      let next = selectedLinhas.includes(linha) ? selectedLinhas.filter(b => b !== linha) : [...selectedLinhas, linha];
      if(next.length > 10) return alert("Máximo de 10 linhas simultâneas.");
      setSelectedLinhas(next);
  };

  const linhasToList = Array.from(knownLinhas).sort();

  const fetchProducts = useCallback(async (direction = 'next') => {
    setLoading(true);
    try {
        const constraints = [];
        if (activeTab !== 'Todos') constraints.push(where('group', '==', activeTab));
        if (selectedLinhas.length > 0) constraints.push(where('brand', 'in', selectedLinhas));

        if (searchTerm) {
            const term = searchTerm.toUpperCase();
            const qSku = query(collection(db, 'products_base'), ...constraints, where('sku', '>=', term), where('sku', '<=', term + '\uf8ff'), limit(ITEMS_PER_PAGE));
            const qDesc = query(collection(db, 'products_base'), ...constraints, where('description', '>=', term), where('description', '<=', term + '\uf8ff'), limit(ITEMS_PER_PAGE));
            const [snapSku, snapDesc] = await Promise.all([getDocs(qSku), getDocs(qDesc)]);
            const uniqueMap = new Map();
            snapSku.forEach(d => uniqueMap.set(d.id, d.data()));
            snapDesc.forEach(d => uniqueMap.set(d.id, d.data()));
            
            let fetched = Array.from(uniqueMap.values()).sort((a, b) => a.description.localeCompare(b.description));
            setKnownLinhas(prev => { const next = new Set(prev); fetched.forEach(p => { if(p.brand) next.add(p.brand); }); return next; });
            
            setProducts(fetched);
            setHasMore(false); 
        } else {
            constraints.push(orderBy('description'));
            constraints.push(limit(ITEMS_PER_PAGE));

            if (direction === 'next' && lastDoc) {
                constraints.push(startAfter(lastDoc));
                setPageHistory(prev => [...prev, firstDoc]);
                setCurrentPage(p => p + 1);
            } else if (direction === 'prev') {
                const prevDoc = pageHistory.pop();
                setPageHistory([...pageHistory]);
                constraints.push(startAt(prevDoc));
                setCurrentPage(p => p - 1);
            } else {
                setPageHistory([]); setCurrentPage(1);
            }

            const q = query(collection(db, 'products_base'), ...constraints);
            const snapshot = await getDocs(q);
            let fetched = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            setKnownLinhas(prev => { const next = new Set(prev); fetched.forEach(p => { if(p.brand) next.add(p.brand); }); return next; });
            setProducts(fetched);
            
            if (snapshot.docs.length > 0) {
                setFirstDoc(snapshot.docs[0]);
                setLastDoc(snapshot.docs[snapshot.docs.length - 1]);
            }
            setHasMore(snapshot.docs.length === ITEMS_PER_PAGE);
        }
    } catch (error) { console.error(error); } finally { setLoading(false); }
  }, [activeTab, searchTerm, selectedLinhas, lastDoc, firstDoc, pageHistory]);

  useEffect(() => { 
      setLastDoc(null); 
      setFirstDoc(null); 
      fetchProducts('initial'); 
  }, [activeTab, searchTerm, selectedLinhas]);

  const handleTabChange = (tab) => {
      setActiveTab(tab);
      setSelectedLinhas([]);
      setKnownLinhas(new Set()); 
      setRawSearchTerm('');
  };

  const totalItems = tabCounts[activeTab] || 0;
  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE) || 1;

  // 🪄 MÁGICA 2: COMPONENTE SKELETON
  // Gera 10 linhas "fantasmas" para a tabela enquanto carrega
  const SkeletonRows = () => {
      return Array(10).fill(0).map((_, i) => (
          <tr key={i} style={{borderBottom:'1px solid #f1f5f9'}}>
              <td style={{padding:'8px'}}><div className="skeleton-box" style={{width:40, height:40, borderRadius:'6px', margin:'0 auto'}}></div></td>
              <td style={{padding:'12px'}}><div className="skeleton-box" style={{height:14, width:'80%', borderRadius:'4px'}}></div></td>
              <td style={{padding:'12px'}}><div className="skeleton-box" style={{height:16, width:'95%', borderRadius:'4px'}}></div></td>
              <td style={{padding:'12px'}}><div className="skeleton-box" style={{height:22, width:'80px', borderRadius:'6px'}}></div></td>
              <td style={{padding:'12px'}}><div className="skeleton-box" style={{height:14, width:'40px', borderRadius:'4px', margin:'0 auto'}}></div></td>
              <td style={{padding:'12px', display:'flex', justifyContent:'flex-end'}}><div className="skeleton-box" style={{height:20, width:'80px', borderRadius:'4px'}}></div></td>
          </tr>
      ));
  };

  return (
    <div style={{height:'100vh', display:'flex', flexDirection:'column', backgroundColor:'#f8fafc', fontFamily:"'Inter', sans-serif", overflow:'hidden'}}>
    <Header title="Catálogo Comercial" /> 

    <div style={{maxWidth:'1600px', margin:'0 auto', padding:'1.5rem 2rem', width:'100%', display:'flex', flexDirection:'column', flex:1, overflow:'hidden'}}>
        
        {/* BREADCRUMBS */}
        <div style={{display:'flex', alignItems:'center', gap:'8px', color:'#64748b', fontSize:'0.85rem', fontWeight:600, marginBottom:'1rem', flexShrink: 0}}>
            <Home size={14} style={{cursor:'pointer'}} onClick={() => navigate('/')} />
            <ChevronRight size={14} />
            <span style={{color:'#0f172a'}}>Catálogo e Cotação Rápidas</span>
        </div>

        {/* SIMULADOR */}
        <div style={{flexShrink: 0, background:'#fff', borderRadius:'16px', padding:'1.5rem', border:'1px solid #e2e8f0', marginBottom:'1rem', boxShadow:'0 2px 10px rgba(0,0,0,0.02)'}}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: showFilters ? '1rem' : '0'}}>
                <div style={{display:'flex', alignItems:'center', gap:'8px', color:'#1e40af'}}><Settings2 size={20} /> <h3 style={{margin:0, fontSize:'1.1rem', fontWeight:700}}>Simulador Rápido</h3></div>
                <button onClick={() => setShowFilters(!showFilters)} style={{background:'transparent', border:'1px solid #cbd5e1', padding:'6px 12px', borderRadius:'6px', cursor:'pointer', color:'#475569', fontSize:'0.8rem', fontWeight:600}}>{showFilters ? 'Ocultar Parâmetros' : 'Ajustar Cotação'}</button>
            </div>
            {showFilters && (
                <div style={{display:'flex', flexWrap:'wrap', gap:'15px'}}>
                    <div style={{flex:'1 1 150px'}}><label style={{display:'block', fontSize:'0.75rem', fontWeight:600, color:'#64748b', marginBottom:'4px'}}>Expedição</label><select value={expedicao} onChange={e => setExpedicao(e.target.value)} style={{width:'100%', padding:'8px 12px', borderRadius:'8px', border:'1px solid #cbd5e1', outline:'none', background:'#f8fafc'}}><option value="UBÁ">UBÁ</option><option value="ATC-TO">ATC-TO</option><option value="SOO">SOO</option></select></div>
                    <div style={{flex:'1 1 150px'}}><label style={{display:'block', fontSize:'0.75rem', fontWeight:600, color:'#64748b', marginBottom:'4px'}}>UF Destino</label><select value={uf} onChange={e => setUf(e.target.value)} style={{width:'100%', padding:'8px 12px', borderRadius:'8px', border:'1px solid #cbd5e1', outline:'none', background:'#f8fafc'}}>{['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO'].map(s => <option key={s} value={s}>{s}</option>)}</select></div>
                    <div style={{flex:'1 1 150px'}}><label style={{display:'block', fontSize:'0.75rem', fontWeight:600, color:'#64748b', marginBottom:'4px'}}>Frete</label><select value={freteType} onChange={e => setFreteType(e.target.value)} style={{width:'100%', padding:'8px 12px', borderRadius:'8px', border:'1px solid #cbd5e1', outline:'none', background:'#f8fafc'}}><option value="FOB">FOB (Retira)</option><option value="CIF">CIF (Entrega)</option></select></div>
                    <div style={{flex:'1 1 150px'}}><label style={{display:'block', fontSize:'0.75rem', fontWeight:600, color:'#64748b', marginBottom:'4px'}}>Tipo Carga</label><select value={tipoCarga} onChange={e => setTipoCarga(e.target.value)} style={{width:'100%', padding:'8px 12px', borderRadius:'8px', border:'1px solid #cbd5e1', outline:'none', background:'#f8fafc'}}><option value="Fracionado">Fracionado</option><option value="Truck">Truck</option><option value="Carreta">Carreta</option><option value="O próprio">O próprio</option></select></div>
                    <div style={{flex:'1 1 150px'}}><label style={{display:'block', fontSize:'0.75rem', fontWeight:600, color:'#64748b', marginBottom:'4px'}}>Prazo</label><select value={paymentTerm} onChange={e => setPaymentTerm(e.target.value)} style={{width:'100%', padding:'8px 12px', borderRadius:'8px', border:'1px solid #cbd5e1', outline:'none', background:'#f8fafc'}}><option value="0.1360">0 Dias - 13,60%</option><option value="0.1287">15 Dias - 12,87%</option><option value="0.1262">20 Dias - 12,62%</option><option value="0.1213">30 Dias - 12,13%</option><option value="0.1103">55 Dias - 11,03%</option><option value="0.1066">60 Dias - 10,66%</option><option value="0.0919">90 Dias - 9,19%</option><option value="0.0772">120 Dias - 7,72%</option><option value="0.0919">30/300 Dias - 9,19%</option></select></div>
                    <div style={{flex:'1 1 150px'}}><label style={{display:'block', fontSize:'0.75rem', fontWeight:600, color:'#64748b', marginBottom:'4px'}}>Cliente</label><select value={clientTier} onChange={e => setClientTier(e.target.value)} style={{width:'100%', padding:'8px 12px', borderRadius:'8px', border:'1px solid #cbd5e1', outline:'none', background:'#f8fafc'}}><option value="0">Padrão</option><option value="0.09">Ouro (9%)</option><option value="0.12">Diamante (12%)</option><option value="0.09">E-commerce (9%)</option></select></div>
                </div>
            )}
        </div>

        {/* ABAS, PESQUISA E BOTÕES */}
        <div style={{flexShrink: 0, display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1rem', flexWrap:'wrap', gap:'1rem'}}>
            <div style={{display:'flex', gap:'8px', overflowX:'auto', paddingBottom:'4px'}}>
                {fixedTabs.map(tab => (
                    <button key={tab} onClick={() => handleTabChange(tab)} style={{padding:'8px 16px', background: activeTab === tab ? '#2563eb' : '#fff', color: activeTab === tab ? '#fff' : '#475569', border:'1px solid', borderColor: activeTab === tab ? '#2563eb' : '#e2e8f0', borderRadius:'10px', cursor:'pointer', fontWeight:600, fontSize:'0.85rem', transition:'0.2s'}}>
                        {tab} {tabCounts[tab] !== undefined ? <span style={{opacity:0.8, marginLeft:6, fontSize:'0.7rem'}}>({tabCounts[tab]})</span> : ''}
                    </button>
                ))}
            </div>
            
            <div style={{display:'flex', alignItems:'center', gap:'12px'}}>
                <button onClick={() => setShowBrandFilters(!showBrandFilters)} style={{display:'flex', alignItems:'center', gap:'8px', background: showBrandFilters || selectedLinhas.length > 0 ? '#eff6ff' : '#fff', color: showBrandFilters || selectedLinhas.length > 0 ? '#2563eb' : '#475569', border:'1px solid', borderColor: showBrandFilters || selectedLinhas.length > 0 ? '#bfdbfe' : '#cbd5e1', padding:'10px 16px', borderRadius:'10px', fontWeight:600, fontSize:'0.9rem', cursor:'pointer', transition:'all 0.2s'}}>
                    <Filter size={18} /> Linhas {selectedLinhas.length > 0 && `(${selectedLinhas.length})`}
                </button>

                <div style={{position:'relative', width:'300px'}}>
                    <Search size={18} style={{position:'absolute', left:'12px', top:'50%', transform:'translateY(-50%)', color:'#94a3b8'}} />
                    <input type="text" placeholder={`Buscar produto em ${activeTab}...`} value={rawSearchTerm} onChange={e => setRawSearchTerm(e.target.value)} style={{width:'100%', padding:'10px 35px 10px 40px', borderRadius:'10px', border:'1px solid #cbd5e1', outline:'none', fontSize:'0.9rem'}} />
                    {rawSearchTerm && <X onClick={() => setRawSearchTerm('')} size={16} style={{position:'absolute', right:'12px', top:'50%', transform:'translateY(-50%)', color:'#ef4444', cursor:'pointer'}} />}
                </div>

                <button onClick={exportToExcel} style={{display:'flex', alignItems:'center', gap:'8px', background:'#10b981', color:'#fff', border:'none', padding:'10px 16px', borderRadius:'10px', fontWeight:600, fontSize:'0.9rem', cursor:'pointer', transition:'all 0.2s', boxShadow:'0 2px 10px rgba(16,185,129,0.2)'}}>
                    <Download size={18} /> Exportar
                </button>
            </div>
        </div>

        {/* PAINEL DE FILTROS DE LINHA (EXPANSÍVEL) */}
        {showBrandFilters && (
            <div style={{flexShrink: 0, background:'#fff', borderRadius:'12px', padding:'16px', border:'1px solid #e2e8f0', marginBottom:'1rem', display:'flex', flexWrap:'wrap', gap:'8px', animation: 'fadeInDown 0.2s ease-out'}}>
                <div style={{width:'100%', display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'8px'}}>
                    <span style={{fontSize:'0.85rem', fontWeight:700, color:'#0f172a'}}>Filtrar por Linha/Marca (Máximo 10 simultâneas)</span>
                    {selectedLinhas.length > 0 && (
                        <button onClick={() => setSelectedLinhas([])} style={{background:'transparent', border:'none', color:'#ef4444', fontSize:'0.75rem', fontWeight:600, cursor:'pointer'}}>
                            Limpar Filtros
                        </button>
                    )}
                </div>
                
                {linhasToList.map(linha => {
                    const isSelected = selectedLinhas.includes(linha);
                    return (
                        <button key={linha} onClick={() => toggleLinha(linha)} style={{padding:'6px 14px', borderRadius:'20px', border:'1px solid', borderColor: isSelected ? '#2563eb' : '#e2e8f0', background: isSelected ? '#2563eb' : '#f8fafc', color: isSelected ? '#fff' : '#475569', fontSize:'0.75rem', fontWeight:600, cursor:'pointer', transition:'0.2s', display:'flex', alignItems:'center', gap:'6px'}}>
                            {linha || 'Sem Linha'} {isSelected && <X size={12} />}
                        </button>
                    )
                })}
                {linhasToList.length <= 1 && (
                    <span style={{fontSize:'0.8rem', color:'#94a3b8', fontStyle:'italic'}}>Navegue pela tabela para o sistema carregar mais linhas...</span>
                )}
            </div>
        )}

        {/* TABELA SCROLLÁVEL */}
        <div style={{flex: 1, minHeight: 0, display:'flex', flexDirection:'column', background:'#fff', borderRadius:'16px', border:'1px solid #e2e8f0', overflow:'hidden', boxShadow:'0 2px 10px rgba(0,0,0,0.02)'}}>
            
            <div style={{flex: 1, overflowX: 'auto', overflowY: 'auto'}}>
                <table style={{width:'100%', borderCollapse:'collapse', minWidth:'1000px', position:'relative'}}>
                    <thead style={{position: 'sticky', top: 0, zIndex: 10, background:'#f8fafc', boxShadow: '0 2px 4px rgba(0,0,0,0.05)'}}>
                        <tr>
                            <th style={{ width: '60px', padding:'12px', textAlign:'center', color:'#475569', fontSize:'0.75rem', fontWeight:700, borderBottom:'1px solid #e2e8f0'}}>Img</th>
                            <th style={{ width: '130px', padding:'12px', textAlign:'left', color:'#475569', fontSize:'0.75rem', fontWeight:700, borderBottom:'1px solid #e2e8f0' }}>SKU</th>
                            <th style={{ padding:'12px', textAlign:'left', color:'#475569', fontSize:'0.75rem', fontWeight:700, borderBottom:'1px solid #e2e8f0' }}>Descrição do Produto</th>
                            <th style={{ width: '220px', padding:'12px', textAlign:'left', color:'#475569', fontSize:'0.75rem', fontWeight:700, borderBottom:'1px solid #e2e8f0' }}>Linha</th>
                            <th style={{ width: '90px', padding:'12px', textAlign:'center', color:'#475569', fontSize:'0.75rem', fontWeight:700, borderBottom:'1px solid #e2e8f0' }}>Estoque</th>
                            <th style={{ width: '140px', padding:'12px', textAlign:'right', color:'#475569', fontSize:'0.75rem', fontWeight:700, borderBottom:'1px solid #e2e8f0' }}>Preço Calc.</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? ( <SkeletonRows /> ) : 
                        products.map((product) => {
                            const finalPrice = calculateFinalPrice(product);
                            return (
                            <tr key={product.id} onClick={() => setSelectedProduct(product)} style={{borderBottom:'1px solid #f1f5f9', cursor:'pointer', transition:'background 0.2s'}} onMouseEnter={(e)=>e.currentTarget.style.background='#f8fafc'} onMouseLeave={(e)=>e.currentTarget.style.background='transparent'}>
                                <td style={{ padding:'8px', textAlign: 'center' }}>
                                    <div style={{position: 'relative', width: 40, height: 40, margin: '0 auto', background:'#f1f5f9', borderRadius:'6px', display:'flex', alignItems:'center', justifyContent:'center'}}>
                                        {product.imageUrl ? (
                                            <img src={product.imageUrl} alt="" style={{maxWidth:'100%', maxHeight:'100%', objectFit:'contain', borderRadius:'6px'}} onError={(e) => { e.target.style.display = 'none'; e.target.nextElementSibling.style.display = 'block'; }} />
                                        ) : null}
                                        <ImageIcon size={16} color="#cbd5e1" style={{display: product.imageUrl ? 'none' : 'block'}} />
                                    </div>
                                </td>
                                
                                {/* USO DO MARCA-TEXTO AQUI */}
                                <td style={{ padding:'12px', fontSize:'0.85rem', fontWeight:600, color:'#334155'}}>
                                    <HighlightText text={product.sku} highlight={searchTerm} />
                                </td>
                                <td style={{ padding:'12px', fontSize:'0.85rem', color:'#0f172a', fontWeight:500}}>
                                    <HighlightText text={product.description} highlight={searchTerm} />
                                </td>
                                
                                <td style={{ padding:'12px'}}><span style={{background:'#f1f5f9', color:'#475569', padding:'4px 8px', borderRadius:'6px', fontSize:'0.75rem', fontWeight:600}}>{product.brand}</span></td>
                                <td style={{ padding:'12px', textAlign: 'center', fontSize:'0.85rem', color:'#64748b' }}>{product.stock}</td>
                                <td style={{ padding:'12px', textAlign:'right', fontWeight:800, fontSize:'0.95rem', color: finalPrice > 0 ? '#10b981' : '#ef4444'}}>
                                    {finalPrice > 0 ? finalPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : 'Indisponível'}
                                </td>
                            </tr>
                        )})}
                        {!loading && products.length === 0 && (
                            <tr><td colSpan="6" style={{textAlign:'center', padding:'3rem', color:'#64748b'}}>Nenhum produto encontrado.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
            
            {/* RODAPÉ E PAGINAÇÃO */}
            {!loading && !searchTerm && (
                <div style={{flexShrink: 0, position:'relative', display:'flex', justifyContent:'center', alignItems:'center', padding:'1rem 1.5rem', borderTop:'1px solid #e2e8f0', background:'#fff'}}>
                    <div style={{position:'absolute', left:'1.5rem', fontSize:'0.85rem', color:'#64748b'}}>
                        Exibindo <b>{products.length}</b> itens
                    </div>
                    <div style={{display:'flex', alignItems:'center', gap:'16px'}}>
                        <button onClick={() => fetchProducts('prev')} disabled={currentPage === 1} style={{display:'flex', alignItems:'center', gap:4, background: currentPage === 1 ? '#f8fafc' : '#fff', border:'1px solid', borderColor: currentPage === 1 ? '#e2e8f0' : '#cbd5e1', padding:'6px 14px', borderRadius:'8px', cursor: currentPage === 1 ? 'not-allowed' : 'pointer', fontSize:'0.85rem', fontWeight:600, color: currentPage === 1 ? '#94a3b8' : '#0f172a', transition: '0.2s', boxShadow: currentPage === 1 ? 'none' : '0 1px 2px rgba(0,0,0,0.05)'}}>
                            <ChevronLeft size={16}/> Anterior
                        </button>
                        <span style={{fontSize:'0.9rem', color:'#475569', fontWeight:500, margin:'0 10px'}}>
                            Página <b style={{color:'#0f172a'}}>{currentPage}</b> de <b style={{color:'#0f172a'}}>{totalPages}</b>
                        </span>
                        <button onClick={() => fetchProducts('next')} disabled={!hasMore} style={{display:'flex', alignItems:'center', gap:4, background: !hasMore ? '#f8fafc' : '#fff', border:'1px solid', borderColor: !hasMore ? '#e2e8f0' : '#cbd5e1', padding:'6px 14px', borderRadius:'8px', cursor: !hasMore ? 'not-allowed' : 'pointer', fontSize:'0.85rem', fontWeight:600, color: !hasMore ? '#94a3b8' : '#0f172a', transition: '0.2s', boxShadow: !hasMore ? 'none' : '0 1px 2px rgba(0,0,0,0.05)'}}>
                            Próxima <ChevronRight size={16}/>
                        </button>
                    </div>
                </div>
            )}
        </div>

        {/* GAVETA EXPRESSA */}
        {selectedProduct && (
            <>
                <div onClick={() => setSelectedProduct(null)} style={{position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(15, 23, 42, 0.4)', backdropFilter:'blur(3px)', zIndex:998, animation:'fadeIn 0.2s'}} />
                
                <div style={{position:'fixed', top:0, right:0, bottom:0, width:'100%', maxWidth:'450px', background:'#fff', zIndex:999, overflowY:'auto', boxShadow:'-10px 0 30px rgba(0,0,0,0.1)', animation:'slideInRight 0.2s ease-out'}}>
                    <div style={{background:'#f8fafc', padding:'20px', display:'flex', justifyContent:'center', position:'relative', borderBottom:'1px solid #e2e8f0', minHeight:'250px'}}>
                        <button onClick={() => setSelectedProduct(null)} style={{position:'absolute', top:15, right:15, background:'#fff', border:'1px solid #e2e8f0', width:'32px', height:'32px', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', color:'#475569', boxShadow:'0 2px 5px rgba(0,0,0,0.05)'}}><X size={18} /></button>
                        
                        {selectedProduct.imageUrl ? (
                            <img src={selectedProduct.imageUrl} alt="" style={{maxWidth:'100%', maxHeight:'250px', objectFit:'contain'}} onError={(e) => { e.target.style.display = 'none'; }} />
                        ) : (
                            <div style={{display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', color:'#cbd5e1'}}><ImageIcon size={50} /><p>Sem imagem</p></div>
                        )}
                    </div>

                    <div style={{padding:'24px', display:'flex', flexDirection:'column', gap:'1.5rem'}}>
                        <div>
                            <span style={{color:'#2563eb', fontSize:'0.75rem', fontWeight:700, textTransform:'uppercase'}}>{selectedProduct.brand}</span>
                            <h2 style={{margin:'4px 0 8px 0', fontSize:'1.3rem', color:'#0f172a', lineHeight:'1.3'}}>{selectedProduct.description}</h2>
                            <span style={{fontSize:'0.85rem', color:'#64748b'}}>SKU: {selectedProduct.sku}</span>
                        </div>

                        <div style={{background:'#f8fafc', borderRadius:'12px', padding:'16px', border:'1px solid #e2e8f0', borderLeft:'4px solid #10b981'}}>
                            <span style={{fontSize:'0.75rem', fontWeight:800, color:'#64748b', textTransform:'uppercase'}}>Preço Simulado</span>
                            <div style={{fontSize:'2.2rem', fontWeight:800, color:'#10b981', margin:'4px 0'}}>
                                {calculateFinalPrice(selectedProduct).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            </div>
                            <div style={{fontSize:'0.8rem', color:'#64748b', marginTop:8}}>Rota: {expedicao} ➔ {uf} ({freteType})</div>
                        </div>

                        <button 
                            onClick={() => navigate(`/produto-analise`, { state: { sku: selectedProduct.sku, expedicao, uf, freteType, tipoCarga, clientTier, paymentTerm, logisticsMap } })}
                            style={{width:'100%', display:'flex', alignItems:'center', justifyContent:'center', gap:8, background:'#2563eb', color:'#fff', border:'none', padding:'14px', borderRadius:'10px', fontWeight:700, fontSize:'0.95rem', cursor:'pointer', transition:'0.2s', boxShadow:'0 4px 10px rgba(37,99,235,0.2)'}}
                            onMouseEnter={e=>e.currentTarget.style.transform='translateY(-2px)'} onMouseLeave={e=>e.currentTarget.style.transform='translateY(0)'}
                        >
                            Ver Análise e Fotos Completas <ExternalLink size={18}/>
                        </button>
                    </div>
                </div>
            </>
        )}
        
        {/* CSS DAS ANIMAÇÕES E SKELETON */}
        <style dangerouslySetInnerHTML={{__html: `
            @keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }
            @keyframes fadeInDown { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
            @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
            @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .4; } }
            .skeleton-box { background: #e2e8f0; animation: pulse 1.5s infinite ease-in-out; }
            ::-webkit-scrollbar { width: 8px; height: 8px; }
            ::-webkit-scrollbar-track { background: #f1f5f9; border-radius: 4px; }
            ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
            ::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
        `}} />
    </div>
    </div>
  );
}