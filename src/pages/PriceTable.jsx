import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { collection, query, getDocs, writeBatch, arrayUnion, doc, getDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import Header from '../components/Header';
import { 
  Search, Loader2, Image as ImageIcon, Settings2, X, ExternalLink, 
  ChevronLeft, ChevronRight, Home, Download, Filter, LayoutGrid, 
  Scale, UploadCloud, CheckSquare, Trash2, ChevronUp, ChevronDown, ArrowUpDown
} from 'lucide-react';
import Toast from '../components/Toast';
import * as XLSX from 'xlsx';
import imageCompression from 'browser-image-compression';

const cleanSKU = (sku) => String(sku).toUpperCase().replace(/[^A-Z0-9]/g, '');
const normalizeText = (text) => text ? text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "") : '';
const getBaseSku = (sku) => { const clean = cleanSKU(sku); return clean.endsWith('R') ? clean.slice(0, -1) : clean; };

const HighlightText = ({ text, highlight }) => {
    if (!highlight || !highlight.trim()) return <span>{text}</span>;
    const regex = new RegExp(`(${highlight})`, 'gi');
    const parts = String(text).split(regex);
    return <span>{parts.map((part, i) => regex.test(part) ? <span key={i} style={{backgroundColor: '#fef08a', color: '#854d0e', fontWeight: 'bold', padding: '1px 3px', borderRadius: '4px'}}>{part}</span> : <span key={i}>{part}</span>)}</span>;
};

const saveToRecent = (product) => {
    try {
        const saved = JSON.parse(localStorage.getItem('itatiaia_recent') || '[]');
        const filtered = saved.filter(p => p.sku !== product.sku);
        filtered.unshift({ sku: product.sku, description: product.description, imageUrl: product.imageUrl });
        localStorage.setItem('itatiaia_recent', JSON.stringify(filtered.slice(0, 5))); 
    } catch (e) { console.error("Erro ao salvar histórico", e); }
};

const ROW_HEIGHTS = { header: '120px', price: '60px', line: '40px', dim: '35px', weight: '35px', vol: '35px', action: '60px' };

export default function PriceTable() {
  const navigate = useNavigate();
  const location = useLocation();
  const { userData } = useAuth();
  const isAdmin = userData?.role === 'admin';
  
  const [expedicao, setExpedicao] = useState('UBÁ'); 
  const [uf, setUf] = useState('MG');
  const [freteType, setFreteType] = useState('CIF');
  const [tipoCarga, setTipoCarga] = useState('Truck'); 
  const [clientTier, setClientTier] = useState('0'); 
  const [paymentTerm, setPaymentTerm] = useState('0.1360'); 
  const [logisticsMap, setLogisticsMap] = useState({});

  const [allProducts, setAllProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isClearingDb, setIsClearingDb] = useState(false); 
  const ITEMS_PER_PAGE = 50;

  const [currentPage, setCurrentPage] = useState(1);
  const tableContainerRef = useRef(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('Todos');
  const fixedTabs = ['Todos', 'AÇO e MAD', 'ELETRO', 'ELETROPORTÁTEIS', 'ITACOM'];
  const [showFilters, setShowFilters] = useState(true); 
  
  // NOVOS ESTADOS PARA O FILTRO DE LINHAS
  const [showBrandFilters, setShowBrandFilters] = useState(false);
  const [selectedLinhas, setSelectedLinhas] = useState([]);
  const [linhaSearchTerm, setLinhaSearchTerm] = useState('');
  
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [notification, setNotification] = useState(null);

  const [compareList, setCompareList] = useState([]);
  const [showCompareModal, setShowCompareModal] = useState(false);

  const [sortConfig, setSortConfig] = useState({ key: 'description', direction: 'asc' });

  const imageInputRef = useRef(null);
  const [uploadingImages, setUploadingImages] = useState(false);

  const [showColMenu, setShowColMenu] = useState(false);
  const [visibleCols, setVisibleCols] = useState(() => {
      const saved = localStorage.getItem('itatiaia_priceTableCols');
      return saved ? JSON.parse(saved) : { compare: true, img: true, sku: true, desc: true, linha: true, estoque: true, preco: true };
  });

  const showNotification = (type, message) => { setNotification({ type, message }); setTimeout(() => setNotification(null), 4000); };
  useEffect(() => { localStorage.setItem('itatiaia_priceTableCols', JSON.stringify(visibleCols)); }, [visibleCols]);
  const toggleCol = (col) => setVisibleCols(prev => ({...prev, [col]: !prev[col]}));

  const fetchAllData = useCallback(async () => {
    setLoading(true);
    try {
        const q = query(collection(db, 'products_base'));
        const snap = await getDocs(q);
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setAllProducts(data);

        const logSnap = await getDoc(doc(db, 'system_settings', 'logistics_discounts'));
        if (logSnap.exists()) setLogisticsMap(logSnap.data());
    } catch (err) { console.error("Erro ao carregar dados:", err); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAllData(); }, [fetchAllData]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const searchParam = params.get('search');
    if (searchParam) { setSearchTerm(searchParam); window.history.replaceState({}, document.title, location.pathname); }
  }, [location]);

  const calculateFinalPrice = useCallback((product) => {
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
  }, [expedicao, uf, freteType, tipoCarga, paymentTerm, clientTier, logisticsMap]);

  const dynamicTabCounts = useMemo(() => {
      const counts = { 'Todos': allProducts.length };
      fixedTabs.forEach(tab => { if (tab !== 'Todos') counts[tab] = allProducts.filter(p => p.group === tab).length; });
      return counts;
  }, [allProducts]);

  const knownLinhas = useMemo(() => {
      let res = allProducts;
      if (activeTab !== 'Todos') res = res.filter(p => p.group === activeTab);
      return [...new Set(res.map(p => p.brand).filter(Boolean))].sort();
  }, [allProducts, activeTab]);

  const processedProducts = useMemo(() => {
      let res = [...allProducts];
      
      if (activeTab !== 'Todos') res = res.filter(p => p.group === activeTab);
      if (selectedLinhas.length > 0) res = res.filter(p => selectedLinhas.includes(p.brand));
      
      if (searchTerm) {
          const term = searchTerm.toUpperCase();
          res = res.filter(p => (p.sku && p.sku.toUpperCase().includes(term)) || (p.description && p.description.toUpperCase().includes(term)));
      }

      if (sortConfig.key) {
          res.sort((a, b) => {
              let aVal = a[sortConfig.key];
              let bVal = b[sortConfig.key];

              if (sortConfig.key === 'priceCalc') {
                  aVal = calculateFinalPrice(a);
                  bVal = calculateFinalPrice(b);
              }
              if (sortConfig.key === 'stock') {
                  aVal = Number(aVal) || 0;
                  bVal = Number(bVal) || 0;
              }

              if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
              if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
              return 0;
          });
      }
      return res;
  }, [allProducts, activeTab, selectedLinhas, searchTerm, sortConfig, calculateFinalPrice]);

  const totalItems = processedProducts.length;
  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE) || 1;
  const currentProducts = processedProducts.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  useEffect(() => { setCurrentPage(1); }, [activeTab, selectedLinhas, searchTerm, sortConfig]);
  useEffect(() => { if (tableContainerRef.current) tableContainerRef.current.scrollTop = 0; }, [currentPage]);

  const handleSort = (key) => {
      let direction = 'asc';
      if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
      setSortConfig({ key, direction });
  };

  const exportToExcel = () => {
      if (processedProducts.length === 0) return alert("Nenhum produto para exportar.");
      const dataToExport = processedProducts.map(p => ({
          'SKU': p.sku, 'Descrição': p.description, 'Linha': p.brand, 'Grupo': p.group,
          'Estoque': p.stock, 'Preço Calc. (R$)': calculateFinalPrice(p)
      }));
      const ws = XLSX.utils.json_to_sheet(dataToExport);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Cotação Atual");
      XLSX.writeFile(wb, `Cotacao_${activeTab}_${new Date().getTime()}.xlsx`);
  };

  const handleClearDatabaseImages = async () => {
      if (!window.confirm("ATENÇÃO: Isso apagará todas as fotos anexadas no banco de dados.")) return;
      setIsClearingDb(true); showNotification('info', 'Limpando banco de imagens...');
      try {
          let batch = writeBatch(db); let count = 0;
          allProducts.forEach(product => {
              batch.update(doc(db, 'products_base', product.id), { images: [], imageUrl: null });
              count++;
              if (count >= 400) { batch.commit(); batch = writeBatch(db); count = 0; }
          });
          if (count > 0) await batch.commit();
          showNotification('success', 'Banco zerado com sucesso!');
          fetchAllData();
      } catch (error) { alert("Erro ao limpar: " + error.message); } 
      finally { setIsClearingDb(false); }
  };

  const handleImageUploadClick = () => imageInputRef.current?.click();
  const processImages = async (e) => {
    const allFiles = Array.from(e.target.files);
    const files = allFiles.filter(file => file.type.startsWith('image/'));
    if (files.length === 0) { alert("Nenhuma imagem válida na pasta."); return; }
    
    setUploadingImages(true); showNotification('info', `Comprimindo e espelhando ${files.length} imagens. Isso pode demorar um pouco...`);
    
    let successCount = 0; let batch = writeBatch(db); let batchCount = 0;
    try {
        const skuMap = {}; const descMap = {};
        allProducts.forEach(p => {
            if (p.sku) { const bSku = getBaseSku(p.sku); if (!skuMap[bSku]) skuMap[bSku] = []; skuMap[bSku].push(p.id); }
            if (p.description) { const cDesc = normalizeText(p.description); if (!descMap[cDesc]) descMap[cDesc] = []; descMap[cDesc].push(p.id); }
        });

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const actualFileName = file.name.split('/').pop().split('\\').pop(); 
            const relativePath = (file.webkitRelativePath || '').toLowerCase();
            let imgType = 'fundo_branco';
            if (relativePath.includes('ambiente')) imgType = 'ambiente';
            else if (relativePath.includes('diferencia')) imgType = 'diferencial';

            let targetIds = [];
            const nameParts = actualFileName.split(/[^a-zA-Z0-9]/);
            const skuCandidate = nameParts.find(p => p.length >= 5 && p.length <= 15 && /\d/.test(p));
            if (skuCandidate) { const fileBaseSku = getBaseSku(skuCandidate); if (skuMap[fileBaseSku]) targetIds.push(...skuMap[fileBaseSku]); }
            if (targetIds.length === 0) {
                const cleanFileName = normalizeText(actualFileName.substring(0, actualFileName.lastIndexOf('.')));
                if (descMap[cleanFileName]) targetIds.push(...descMap[cleanFileName]);
                else { Object.keys(descMap).forEach(dbDescKey => { if (cleanFileName.length > 4 && dbDescKey.includes(cleanFileName)) targetIds.push(...descMap[dbDescKey]); }); }
            }
            targetIds = [...new Set(targetIds)];

            if (targetIds.length > 0) {
                let fileToUpload = file;
                try { fileToUpload = await imageCompression(file, { maxSizeMB: 0.15, maxWidthOrHeight: 1200, useWebWorker: true }); } catch (err) {}
                const storageRef = ref(storage, `product_images/${new Date().getTime()}_${actualFileName}`);
                try {
                    await uploadBytes(storageRef, fileToUpload); const downloadURL = await getDownloadURL(storageRef);
                    for (const docId of targetIds) {
                        const updateData = { images: arrayUnion({ url: downloadURL, type: imgType, name: actualFileName }) };
                        if (imgType === 'fundo_branco') updateData.imageUrl = downloadURL; 
                        batch.update(doc(db, 'products_base', docId), updateData);
                        batchCount++; if (batchCount >= 400) { await batch.commit(); batch = writeBatch(db); batchCount = 0; }
                    }
                    successCount++;
                } catch (err) { console.error(err); }
            }
        }
        if (batchCount > 0) await batch.commit();
        alert(`SUCESSO!\nForam sincronizadas ${successCount} imagens.`);
        fetchAllData();
    } catch (error) { alert("Erro ao subir: " + error.message); } 
    finally { setUploadingImages(false); if (e.target) e.target.value = null; }
  };

  const toggleLinha = (linha) => {
      let next = selectedLinhas.includes(linha) ? selectedLinhas.filter(b => b !== linha) : [...selectedLinhas, linha];
      setSelectedLinhas(next);
  };

  const SortIcon = ({ columnKey }) => {
      if (sortConfig.key !== columnKey) return <ArrowUpDown size={14} color="#cbd5e1" style={{marginLeft: 4}} />;
      return sortConfig.direction === 'asc' ? <ChevronUp size={14} color="#2563eb" style={{marginLeft: 4}} /> : <ChevronDown size={14} color="#2563eb" style={{marginLeft: 4}} />;
  };

  const SkeletonRows = () => Array(15).fill(0).map((_, i) => (
      <tr key={i} style={{borderBottom:'1px solid #f1f5f9'}}>
          {visibleCols.compare && <td style={{padding:'6px'}}><div className="skeleton-box" style={{width:16, height:16, borderRadius:'4px', margin:'0 auto'}}></div></td>}
          {visibleCols.img && <td style={{padding:'6px'}}><div className="skeleton-box" style={{width:32, height:32, borderRadius:'6px', margin:'0 auto'}}></div></td>}
          {visibleCols.sku && <td style={{padding:'8px 10px'}}><div className="skeleton-box" style={{height:12, width:'80%', borderRadius:'4px'}}></div></td>}
          {visibleCols.desc && <td style={{padding:'8px 10px'}}><div className="skeleton-box" style={{height:14, width:'95%', borderRadius:'4px'}}></div></td>}
          {visibleCols.linha && <td style={{padding:'8px 10px'}}><div className="skeleton-box" style={{height:18, width:'70px', borderRadius:'6px'}}></div></td>}
          {visibleCols.estoque && <td style={{padding:'8px 10px'}}><div className="skeleton-box" style={{height:12, width:'30px', borderRadius:'4px', margin:'0 auto'}}></div></td>}
          {visibleCols.preco && <td style={{padding:'8px 10px', display:'flex', justifyContent:'flex-end'}}><div className="skeleton-box" style={{height:16, width:'70px', borderRadius:'4px'}}></div></td>}
      </tr>
  ));

  return (
    <div style={{height:'100vh', display:'flex', flexDirection:'column', backgroundColor:'#f8fafc', fontFamily:"'Inter', sans-serif", overflow:'hidden'}}>
    
    <div style={{flexShrink: 0}}><Header title="Tabela de Preços" /></div>

    <div style={{maxWidth:'1600px', margin:'0 auto', padding:'1rem 1.5rem', width:'100%', display:'flex', flexDirection:'column', flex:1, overflow:'hidden', position:'relative'}}>
        
        <div style={{display:'flex', alignItems:'center', gap:'6px', color:'#64748b', fontSize:'0.80rem', fontWeight:600, marginBottom:'0.75rem', flexShrink: 0}}>
            <Home size={12} style={{cursor:'pointer'}} onClick={() => navigate('/')} />
            <ChevronRight size={12} />
            <span style={{color:'#0f172a'}}>Tabela de Preços</span>
        </div>

        <div style={{flexShrink: 0, background:'#fff', borderRadius:'12px', padding:'1rem 1.5rem', border:'1px solid #e2e8f0', marginBottom:'0.75rem', boxShadow:'0 2px 10px rgba(0,0,0,0.02)'}}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: showFilters ? '0.75rem' : '0'}}>
                <div style={{display:'flex', alignItems:'center', gap:'6px', color:'#1e40af'}}><Settings2 size={16} /> <h3 style={{margin:0, fontSize:'0.9rem', fontWeight:700}}>Simulador Rápido</h3></div>
                <button onClick={() => setShowFilters(!showFilters)} style={{background:'transparent', border:'1px solid #cbd5e1', padding:'4px 10px', borderRadius:'6px', cursor:'pointer', color:'#475569', fontSize:'0.75rem', fontWeight:600}}>{showFilters ? 'Ocultar Parâmetros' : 'Ajustar Cotação'}</button>
            </div>
            {showFilters && (
                <div style={{display:'flex', flexWrap:'wrap', gap:'10px'}}>
                    <div style={{flex:'1 1 140px'}}><label style={{display:'block', fontSize:'0.65rem', fontWeight:700, color:'#64748b', marginBottom:'4px'}}>Expedição</label><select value={expedicao} onChange={e => setExpedicao(e.target.value)} style={{width:'100%', padding:'6px 10px', borderRadius:'6px', border:'1px solid #cbd5e1', outline:'none', background:'#f8fafc', fontSize:'0.8rem'}}><option value="UBÁ">UBÁ</option><option value="ATC-TO">ATC-TO</option><option value="SOO">SOO</option></select></div>
                    <div style={{flex:'1 1 140px'}}><label style={{display:'block', fontSize:'0.65rem', fontWeight:700, color:'#64748b', marginBottom:'4px'}}>UF Destino</label><select value={uf} onChange={e => setUf(e.target.value)} style={{width:'100%', padding:'6px 10px', borderRadius:'6px', border:'1px solid #cbd5e1', outline:'none', background:'#f8fafc', fontSize:'0.8rem'}}>{['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO'].map(s => <option key={s} value={s}>{s}</option>)}</select></div>
                    <div style={{flex:'1 1 140px'}}><label style={{display:'block', fontSize:'0.65rem', fontWeight:700, color:'#64748b', marginBottom:'4px'}}>Frete</label><select value={freteType} onChange={e => setFreteType(e.target.value)} style={{width:'100%', padding:'6px 10px', borderRadius:'6px', border:'1px solid #cbd5e1', outline:'none', background:'#f8fafc', fontSize:'0.8rem'}}><option value="FOB">FOB (Retira)</option><option value="CIF">CIF (Entrega)</option></select></div>
                    <div style={{flex:'1 1 140px'}}><label style={{display:'block', fontSize:'0.65rem', fontWeight:700, color:'#64748b', marginBottom:'4px'}}>Tipo Carga</label><select value={tipoCarga} onChange={e => setTipoCarga(e.target.value)} style={{width:'100%', padding:'6px 10px', borderRadius:'6px', border:'1px solid #cbd5e1', outline:'none', background:'#f8fafc', fontSize:'0.8rem'}}><option value="Fracionado">Fracionado</option><option value="Truck">Truck</option><option value="Carreta">Carreta</option><option value="O próprio">O próprio</option></select></div>
                    <div style={{flex:'1 1 140px'}}><label style={{display:'block', fontSize:'0.65rem', fontWeight:700, color:'#64748b', marginBottom:'4px'}}>Prazo</label><select value={paymentTerm} onChange={e => setPaymentTerm(e.target.value)} style={{width:'100%', padding:'6px 10px', borderRadius:'6px', border:'1px solid #cbd5e1', outline:'none', background:'#f8fafc', fontSize:'0.8rem'}}><option value="0.1360">0 Dias - 13,60%</option><option value="0.1287">15 Dias - 12,87%</option><option value="0.1262">20 Dias - 12,62%</option><option value="0.1213">30 Dias - 12,13%</option><option value="0.1103">55 Dias - 11,03%</option><option value="0.1066">60 Dias - 10,66%</option><option value="0.0919">90 Dias - 9,19%</option><option value="0.0772">120 Dias - 7,72%</option><option value="0.0919">30/300 Dias - 9,19%</option></select></div>
                    <div style={{flex:'1 1 140px'}}><label style={{display:'block', fontSize:'0.65rem', fontWeight:700, color:'#64748b', marginBottom:'4px'}}>Cliente</label><select value={clientTier} onChange={e => setClientTier(e.target.value)} style={{width:'100%', padding:'6px 10px', borderRadius:'6px', border:'1px solid #cbd5e1', outline:'none', background:'#f8fafc', fontSize:'0.8rem'}}><option value="0">Padrão</option><option value="0.09">Ouro (9%)</option><option value="0.12">Diamante (12%)</option><option value="0.09">E-commerce (9%)</option></select></div>
                </div>
            )}
        </div>

        {/* CONTROLES E BOTÕES PRINCIPAIS */}
        <div style={{flexShrink: 0, display:'flex', alignItems:'center', gap:'12px', marginBottom:'0.75rem', flexWrap:'wrap', zIndex: 100}}>
            
            <div style={{display:'flex', gap:'6px'}}>
                {fixedTabs.map(tab => (
                    <button key={tab} onClick={() => handleTabChange(tab)} style={{padding:'6px 14px', background: activeTab === tab ? '#2563eb' : '#fff', color: activeTab === tab ? '#fff' : '#475569', border:'1px solid', borderColor: activeTab === tab ? '#2563eb' : '#e2e8f0', borderRadius:'8px', cursor:'pointer', fontWeight:600, fontSize:'0.8rem', transition:'0.2s', whiteSpace:'nowrap'}}>
                        {tab} {dynamicTabCounts[tab] !== undefined ? <span style={{opacity:0.8, marginLeft:4, fontSize:'0.65rem'}}>({dynamicTabCounts[tab]})</span> : ''}
                    </button>
                ))}
            </div>

            <div style={{width:'1px', height:'24px', background:'#cbd5e1', margin:'0 4px', flexShrink:0}}></div>

            {/* BOTÃO DROPDOWN DE LINHAS */}
            <div style={{position: 'relative', flexShrink: 0}}>
                <button onClick={() => setShowBrandFilters(!showBrandFilters)} style={{display:'flex', alignItems:'center', gap:'6px', background: selectedLinhas.length > 0 ? '#eff6ff' : '#fff', color: selectedLinhas.length > 0 ? '#2563eb' : '#475569', border:'1px solid', borderColor: selectedLinhas.length > 0 ? '#bfdbfe' : '#cbd5e1', padding:'6px 14px', borderRadius:'8px', fontWeight:600, fontSize:'0.8rem', cursor:'pointer', transition:'all 0.2s'}}>
                    <Filter size={16} /> Linhas {selectedLinhas.length > 0 && `(${selectedLinhas.length})`}
                </button>

                {showBrandFilters && (
                    <>
                        <div onClick={() => setShowBrandFilters(false)} style={{position:'fixed', top:0, left:0, right:0, bottom:0, zIndex:9998}}></div>
                        <div style={{position:'absolute', top:'100%', left:0, marginTop:'8px', background:'#fff', border:'1px solid #e2e8f0', borderRadius:'12px', padding:'12px', boxShadow:'0 15px 40px rgba(0,0,0,0.15)', zIndex:9999, width:'260px', animation: 'fadeInDown 0.2s ease-out', display:'flex', flexDirection:'column', gap:'10px'}}>
                            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                                <strong style={{fontSize:'0.8rem', color:'#0f172a'}}>Filtrar Linhas</strong>
                                {selectedLinhas.length > 0 && <button onClick={() => setSelectedLinhas([])} style={{background:'transparent', border:'none', color:'#ef4444', fontSize:'0.7rem', fontWeight:600, cursor:'pointer'}}>Limpar</button>}
                            </div>

                            <div style={{position:'relative'}}>
                                <Search size={14} style={{position:'absolute', left:'10px', top:'50%', transform:'translateY(-50%)', color:'#94a3b8'}} />
                                <input type="text" placeholder="Buscar linha..." value={linhaSearchTerm} onChange={e => setLinhaSearchTerm(e.target.value)} style={{width:'100%', padding:'6px 10px 6px 30px', borderRadius:'6px', border:'1px solid #cbd5e1', outline:'none', fontSize:'0.75rem'}} />
                            </div>

                            <div className="custom-scrollbar" style={{maxHeight:'200px', overflowY:'auto', display:'flex', flexDirection:'column', gap:'2px'}}>
                                {knownLinhas.filter(l => l.toLowerCase().includes(linhaSearchTerm.toLowerCase())).map(linha => (
                                    <label key={linha} style={{display:'flex', alignItems:'center', gap:'8px', padding:'6px 8px', cursor:'pointer', borderRadius:'6px', background: selectedLinhas.includes(linha) ? '#f8fafc' : 'transparent', transition:'0.2s'}} onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'} onMouseLeave={e => e.currentTarget.style.background = selectedLinhas.includes(linha) ? '#f8fafc' : 'transparent'}>
                                        <input type="checkbox" checked={selectedLinhas.includes(linha)} onChange={() => toggleLinha(linha)} style={{cursor:'pointer'}} />
                                        <span style={{fontSize:'0.75rem', color: selectedLinhas.includes(linha) ? '#0f172a' : '#475569', fontWeight: selectedLinhas.includes(linha) ? 600 : 500}}>{linha || 'Sem Linha'}</span>
                                    </label>
                                ))}
                                {knownLinhas.filter(l => l.toLowerCase().includes(linhaSearchTerm.toLowerCase())).length === 0 && (
                                    <span style={{fontSize:'0.75rem', color:'#94a3b8', textAlign:'center', padding:'10px 0'}}>Nenhuma linha encontrada.</span>
                                )}
                            </div>
                        </div>
                    </>
                )}
            </div>

            <div style={{position:'relative', width:'250px'}}>
                <Search size={16} style={{position:'absolute', left:'10px', top:'50%', transform:'translateY(-50%)', color:'#94a3b8'}} />
                <input type="text" placeholder={`Buscar (aperte / )`} value={searchTerm} onChange={e => setSearchTerm(e.target.value)} style={{width:'100%', padding:'6px 30px 6px 36px', borderRadius:'8px', border:'1px solid #cbd5e1', outline:'none', fontSize:'0.85rem', transition:'all 0.2s'}} />
                {searchTerm && <X onClick={() => setSearchTerm('')} size={14} style={{position:'absolute', right:'10px', top:'50%', transform:'translateY(-50%)', color:'#ef4444', cursor:'pointer'}} />}
            </div>

            <div style={{position:'relative'}}>
                <button onClick={() => setShowColMenu(!showColMenu)} style={{display:'flex', alignItems:'center', justifyContent:'center', width:'32px', height:'32px', background: showColMenu ? '#f1f5f9' : '#fff', color: '#475569', border:'1px solid', borderColor: '#cbd5e1', borderRadius:'8px', cursor:'pointer', transition:'all 0.2s'}} title="Personalizar Colunas">
                    <LayoutGrid size={16} />
                </button>
                {showColMenu && (
                    <>
                        <div onClick={() => setShowColMenu(false)} style={{position:'fixed', top:0, left:0, right:0, bottom:0, zIndex:9998}}></div>
                        <div style={{position:'absolute', top:'100%', right:0, marginTop:'8px', background:'#fff', border:'1px solid #e2e8f0', borderRadius:'12px', padding:'16px', boxShadow:'0 15px 40px rgba(0,0,0,0.15)', zIndex:9999, width:'200px', whiteSpace: 'normal', textAlign: 'left', animation: 'fadeInDown 0.2s ease-out'}}>
                            <strong style={{display:'block', fontSize:'0.8rem', color:'#0f172a', marginBottom:'12px', borderBottom:'1px solid #f1f5f9', paddingBottom:'8px'}}>Mostrar colunas:</strong>
                            {['compare', 'img', 'sku', 'desc', 'linha', 'estoque', 'preco'].map(col => (
                                <label key={col} style={{display:'flex', alignItems:'center', gap:'10px', fontSize:'0.85rem', color:'#475569', marginBottom:'10px', cursor:'pointer', textTransform: col === 'img' ? 'none' : 'capitalize'}}>
                                    <input type="checkbox" checked={visibleCols[col]} onChange={() => toggleCol(col)} style={{cursor:'pointer'}} /> 
                                    {col === 'desc' ? 'Descrição' : col === 'preco' ? 'Preço Calc.' : col === 'compare' ? 'Lado a Lado' : col}
                                </label>
                            ))}
                        </div>
                    </>
                )}
            </div>

            <button onClick={exportToExcel} style={{display:'flex', alignItems:'center', gap:'6px', background:'#10b981', color:'#fff', border:'none', padding:'8px 14px', borderRadius:'8px', fontWeight:600, fontSize:'0.8rem', cursor:'pointer', transition:'all 0.2s', boxShadow:'0 2px 10px rgba(16,185,129,0.2)'}}>
                <Download size={16} /> Exportar
            </button>

            {isAdmin && (
                <>
                    <input id="imgInput" type="file" accept="image/*" webkitdirectory="true" multiple ref={imageInputRef} style={{ display: 'none' }} onChange={processImages} />
                    <button onClick={handleClearDatabaseImages} disabled={isClearingDb || uploadingImages} style={{display:'flex', alignItems:'center', gap:'6px', background:'#fff', color:'#ef4444', border:'1px solid #fecaca', padding:'6px 14px', borderRadius:'8px', fontWeight:600, fontSize:'0.8rem', cursor:'pointer', transition:'all 0.2s'}}>
                        {isClearingDb ? <Loader2 size={16} className="spin" /> : <Trash2 size={16} />} Limpar Fotos
                    </button>
                    <button onClick={handleImageUploadClick} disabled={uploadingImages || isClearingDb} style={{display:'flex', alignItems:'center', gap:'6px', background:'#3b82f6', color:'#fff', border:'none', padding:'8px 14px', borderRadius:'8px', fontWeight:600, fontSize:'0.8rem', cursor:'pointer', transition:'all 0.2s'}}>
                        {uploadingImages ? <Loader2 size={16} className="spin" /> : <UploadCloud size={16} />} Subir Fotos
                    </button>
                </>
            )}
        </div>

        <div style={{flex: 1, minHeight: 0, display:'flex', flexDirection:'column', background:'#fff', borderRadius:'12px', border:'1px solid #e2e8f0', overflow:'hidden', boxShadow:'0 2px 10px rgba(0,0,0,0.02)'}}>
            <div ref={tableContainerRef} style={{flex: 1, overflowX: 'auto', overflowY: 'auto', scrollBehavior: 'smooth'}} className="custom-scrollbar">
                <table style={{width:'100%', borderCollapse:'collapse', minWidth:'1000px', position:'relative'}}>
                    <thead style={{position: 'sticky', top: 0, zIndex: 10, background:'#f8fafc', boxShadow: '0 2px 4px rgba(0,0,0,0.05)'}}>
                        <tr>
                            {visibleCols.compare && <th style={{ width: '40px', padding:'10px', textAlign:'center', borderBottom:'1px solid #e2e8f0'}}></th>}
                            {visibleCols.img && <th style={{ width: '50px', padding:'10px', textAlign:'center', color:'#475569', fontSize:'0.7rem', fontWeight:700, borderBottom:'1px solid #e2e8f0'}}>Img</th>}
                            
                            {visibleCols.sku && <th onClick={() => handleSort('sku')} style={{ width: '120px', padding:'10px', textAlign:'left', color: sortConfig.key === 'sku' ? '#0f172a' : '#475569', fontSize:'0.7rem', fontWeight:700, borderBottom:'1px solid #e2e8f0', cursor:'pointer', userSelect:'none' }}><div style={{display:'flex', alignItems:'center'}}>SKU <SortIcon columnKey="sku"/></div></th>}
                            {visibleCols.desc && <th onClick={() => handleSort('description')} style={{ padding:'10px', textAlign:'left', color: sortConfig.key === 'description' ? '#0f172a' : '#475569', fontSize:'0.7rem', fontWeight:700, borderBottom:'1px solid #e2e8f0', cursor:'pointer', userSelect:'none' }}><div style={{display:'flex', alignItems:'center'}}>Descrição do Produto <SortIcon columnKey="description"/></div></th>}
                            {visibleCols.linha && <th onClick={() => handleSort('brand')} style={{ width: '200px', padding:'10px', textAlign:'left', color: sortConfig.key === 'brand' ? '#0f172a' : '#475569', fontSize:'0.7rem', fontWeight:700, borderBottom:'1px solid #e2e8f0', cursor:'pointer', userSelect:'none' }}><div style={{display:'flex', alignItems:'center'}}>Linha <SortIcon columnKey="brand"/></div></th>}
                            {visibleCols.estoque && <th onClick={() => handleSort('stock')} style={{ width: '80px', padding:'10px', textAlign:'center', color: sortConfig.key === 'stock' ? '#0f172a' : '#475569', fontSize:'0.7rem', fontWeight:700, borderBottom:'1px solid #e2e8f0', cursor:'pointer', userSelect:'none' }}><div style={{display:'flex', alignItems:'center', justifyContent:'center'}}>Estoque <SortIcon columnKey="stock"/></div></th>}
                            {visibleCols.preco && <th onClick={() => handleSort('priceCalc')} style={{ width: '130px', padding:'10px', textAlign:'right', color: sortConfig.key === 'priceCalc' ? '#0f172a' : '#475569', fontSize:'0.7rem', fontWeight:700, borderBottom:'1px solid #e2e8f0', cursor:'pointer', userSelect:'none' }}><div style={{display:'flex', alignItems:'center', justifyContent:'flex-end'}}>Preço Calc. <SortIcon columnKey="priceCalc"/></div></th>}
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? ( <SkeletonRows /> ) : 
                        currentProducts.map((product) => {
                            const finalPrice = calculateFinalPrice(product);
                            const isComparing = compareList.find(p => p.id === product.id);
                            
                            return (
                            <tr key={product.id} onClick={() => openProductDrawer(product)} style={{borderBottom:'1px solid #f1f5f9', cursor:'pointer', transition:'background 0.2s'}} onMouseEnter={(e)=>e.currentTarget.style.background='#f8fafc'} onMouseLeave={(e)=>e.currentTarget.style.background='transparent'}>
                                {visibleCols.compare && (
                                    <td style={{ padding:'6px', textAlign:'center' }} onClick={(e) => handleToggleCompare(e, product)}>
                                        <div style={{width:'18px', height:'18px', border:'2px solid', borderColor: isComparing ? '#2563eb' : '#cbd5e1', background: isComparing ? '#2563eb' : '#fff', borderRadius:'4px', margin:'0 auto', display:'flex', alignItems:'center', justifyContent:'center'}}>
                                            {isComparing && <CheckSquare size={14} color="#fff" />}
                                        </div>
                                    </td>
                                )}
                                {visibleCols.img && (
                                    <td style={{ padding:'6px', textAlign: 'center' }}>
                                        <div style={{position: 'relative', width: 32, height: 32, margin: '0 auto', background:'#fff', borderRadius:'4px', border:'1px solid #f1f5f9', display:'flex', alignItems:'center', justifyContent:'center'}}>
                                            {product.imageUrl ? ( <img src={product.imageUrl} alt="" loading="lazy" decoding="async" style={{maxWidth:'100%', maxHeight:'100%', objectFit:'contain', borderRadius:'4px'}} onError={(e) => { e.target.style.display = 'none'; e.target.nextElementSibling.style.display = 'block'; }} /> ) : null}
                                            <ImageIcon size={14} color="#cbd5e1" style={{display: product.imageUrl ? 'none' : 'block'}} />
                                        </div>
                                    </td>
                                )}
                                {visibleCols.sku && <td style={{ padding:'8px 10px', fontSize:'0.8rem', fontWeight:600, color:'#334155'}}><HighlightText text={product.sku} highlight={searchTerm} /></td>}
                                {visibleCols.desc && <td style={{ padding:'8px 10px', fontSize:'0.8rem', color:'#0f172a', fontWeight:500}}><HighlightText text={product.description} highlight={searchTerm} /></td>}
                                {visibleCols.linha && <td style={{ padding:'8px 10px'}}><span style={{background:'#f1f5f9', color:'#475569', padding:'2px 6px', borderRadius:'4px', fontSize:'0.7rem', fontWeight:600}}>{product.brand}</span></td>}
                                {visibleCols.estoque && <td style={{ padding:'8px 10px', textAlign: 'center', fontSize:'0.8rem', color:'#64748b' }}>{product.stock}</td>}
                                {visibleCols.preco && <td style={{ padding:'8px 10px', textAlign:'right', fontWeight:800, fontSize:'0.9rem', color: finalPrice > 0 ? '#10b981' : '#ef4444'}}>{finalPrice > 0 ? finalPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : 'Indisponível'}</td>}
                            </tr>
                        )})}
                        {!loading && currentProducts.length === 0 && <tr><td colSpan="7" style={{textAlign:'center', padding:'3rem', color:'#64748b', fontSize:'0.85rem'}}>Nenhum produto encontrado.</td></tr>}
                    </tbody>
                </table>
            </div>
            
            {!loading && (
                <div style={{flexShrink: 0, position:'relative', display:'flex', justifyContent:'center', alignItems:'center', padding:'0.75rem 1rem', borderTop:'1px solid #e2e8f0', background:'#fff'}}>
                    <div style={{position:'absolute', left:'1rem', fontSize:'0.8rem', color:'#64748b'}}>Exibindo <b>{totalItems}</b> itens no total</div>
                    <div style={{display:'flex', alignItems:'center', gap:'12px'}}>
                        <button onClick={() => setCurrentPage(p => p - 1)} disabled={currentPage === 1} style={{display:'flex', alignItems:'center', gap:4, background: currentPage === 1 ? '#f8fafc' : '#fff', border:'1px solid', borderColor: currentPage === 1 ? '#e2e8f0' : '#cbd5e1', padding:'4px 10px', borderRadius:'6px', cursor: currentPage === 1 ? 'not-allowed' : 'pointer', fontSize:'0.8rem', fontWeight:600, color: currentPage === 1 ? '#94a3b8' : '#0f172a', transition: '0.2s', boxShadow: currentPage === 1 ? 'none' : '0 1px 2px rgba(0,0,0,0.05)'}}><ChevronLeft size={14}/> Anterior</button>
                        <span style={{fontSize:'0.8rem', color:'#475569', fontWeight:500, margin:'0 8px'}}>Página <b style={{color:'#0f172a'}}>{currentPage}</b> de <b style={{color:'#0f172a'}}>{totalPages}</b></span>
                        <button onClick={() => setCurrentPage(p => p + 1)} disabled={currentPage === totalPages || totalPages === 0} style={{display:'flex', alignItems:'center', gap:4, background: currentPage === totalPages || totalPages === 0 ? '#f8fafc' : '#fff', border:'1px solid', borderColor: currentPage === totalPages || totalPages === 0 ? '#e2e8f0' : '#cbd5e1', padding:'4px 10px', borderRadius:'6px', cursor: currentPage === totalPages || totalPages === 0 ? 'not-allowed' : 'pointer', fontSize:'0.8rem', fontWeight:600, color: currentPage === totalPages || totalPages === 0 ? '#94a3b8' : '#0f172a', transition: '0.2s', boxShadow: currentPage === totalPages || totalPages === 0 ? 'none' : '0 1px 2px rgba(0,0,0,0.05)'}}>Próxima <ChevronRight size={14}/></button>
                    </div>
                </div>
            )}
        </div>

        {compareList.length > 0 && !showCompareModal && (
            <div style={{position:'fixed', bottom: '30px', left: '50%', transform:'translateX(-50%)', background:'#0f172a', color:'#fff', padding:'12px 24px', borderRadius:'30px', display:'flex', alignItems:'center', gap:'20px', zIndex:900, boxShadow:'0 10px 25px rgba(0,0,0,0.2)', animation:'fadeInDown 0.3s ease-out'}}>
                <div style={{display:'flex', alignItems:'center', gap:'8px', fontWeight:600}}>
                    <Scale size={18} /> {compareList.length} produto(s) selecionado(s)
                </div>
                <div style={{display:'flex', gap:'10px'}}>
                    <button onClick={() => setCompareList([])} style={{background:'transparent', border:'none', color:'#94a3b8', cursor:'pointer', fontSize:'0.85rem', fontWeight:600}}>Limpar</button>
                    <button onClick={() => setShowCompareModal(true)} style={{background:'#2563eb', border:'none', color:'#fff', padding:'6px 16px', borderRadius:'20px', cursor:'pointer', fontSize:'0.85rem', fontWeight:700, boxShadow:'0 2px 10px rgba(37,99,235,0.4)'}}>Comparar Lado a Lado</button>
                </div>
            </div>
        )}

        {showCompareModal && (
            <div style={{position:'fixed', top:0, left:0, right:0, bottom:0, background:'#f8fafc', zIndex:9999, display:'flex', flexDirection:'column', animation:'fadeIn 0.2s'}}>
                <div style={{background:'#fff', padding:'15px 30px', borderBottom:'1px solid #e2e8f0', display:'flex', justifyContent:'space-between', alignItems:'center', boxShadow:'0 2px 5px rgba(0,0,0,0.02)', flexShrink:0}}>
                    <div style={{display:'flex', alignItems:'center', gap:'10px', color:'#0f172a'}}><Scale size={20} color="#2563eb"/> <h2 style={{margin:0, fontSize:'1.2rem'}}>Comparador Lado a Lado</h2></div>
                    <button onClick={() => setShowCompareModal(false)} style={{display:'flex', alignItems:'center', gap:'6px', background:'#f1f5f9', border:'none', padding:'6px 14px', borderRadius:'8px', color:'#475569', fontWeight:600, cursor:'pointer', fontSize:'0.85rem'}}><X size={16}/> Fechar</button>
                </div>

                <div style={{flex:1, display:'flex', padding:'20px 30px', overflowX:'auto', overflowY:'hidden', alignItems:'flex-start'}}>
                    <div style={{display:'flex', gap:'16px', minWidth:'max-content'}}>
                        <div style={{width:'140px', flexShrink:0, display:'flex', flexDirection:'column', paddingTop: ROW_HEIGHTS.header}}>
                            <div style={{height: ROW_HEIGHTS.price, display:'flex', alignItems:'center', fontWeight:700, color:'#64748b', fontSize:'0.8rem'}}>Preço Simulado</div>
                            <div style={{height: ROW_HEIGHTS.line, display:'flex', alignItems:'center', fontWeight:700, color:'#64748b', fontSize:'0.8rem'}}>Linha</div>
                            <div style={{height: ROW_HEIGHTS.dim, display:'flex', alignItems:'center', fontWeight:700, color:'#64748b', fontSize:'0.8rem'}}>Comprimento</div>
                            <div style={{height: ROW_HEIGHTS.dim, display:'flex', alignItems:'center', fontWeight:700, color:'#64748b', fontSize:'0.8rem'}}>Largura</div>
                            <div style={{height: ROW_HEIGHTS.dim, display:'flex', alignItems:'center', fontWeight:700, color:'#64748b', fontSize:'0.8rem'}}>Altura</div>
                            <div style={{height: ROW_HEIGHTS.weight, display:'flex', alignItems:'center', fontWeight:700, color:'#64748b', fontSize:'0.8rem'}}>Peso Bruto</div>
                            <div style={{height: ROW_HEIGHTS.vol, display:'flex', alignItems:'center', fontWeight:700, color:'#64748b', fontSize:'0.8rem'}}>Volume (m³)</div>
                        </div>

                        {compareList.map(prod => (
                            <div key={prod.id} style={{width:'280px', flexShrink:0, background:'#fff', border:'1px solid #e2e8f0', borderRadius:'12px', padding:'15px', boxShadow:'0 4px 15px rgba(0,0,0,0.03)', display:'flex', flexDirection:'column', position:'relative'}}>
                                <button onClick={() => setCompareList(prev => prev.filter(p => p.id !== prod.id))} style={{position:'absolute', top:10, right:10, background:'#fef2f2', border:'none', color:'#ef4444', width:'22px', height:'22px', borderRadius:'50%', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', zIndex:10}}><X size={12}/></button>
                                
                                <div style={{height: ROW_HEIGHTS.header, display:'flex', flexDirection:'column'}}>
                                    <div style={{height:'70px', display:'flex', justifyContent:'center', alignItems:'center', marginBottom:'10px', background:'#fff'}}>
                                        {prod.imageUrl ? <img src={prod.imageUrl} loading="lazy" decoding="async" style={{maxHeight:'100%', maxWidth:'100%', objectFit:'contain'}} /> : <ImageIcon size={30} color="#cbd5e1" />}
                                    </div>
                                    <span style={{fontSize:'0.7rem', color:'#64748b', fontWeight:700, display:'block'}}>{prod.sku}</span>
                                    <h4 style={{margin:'2px 0 0 0', fontSize:'0.85rem', color:'#0f172a', lineHeight:'1.2', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{prod.description}</h4>
                                </div>

                                <div style={{height: ROW_HEIGHTS.price, display:'flex', alignItems:'center', fontSize:'1.5rem', fontWeight:800, color:'#10b981', borderTop:'1px solid #f1f5f9'}}>{calculateFinalPrice(prod).toLocaleString('pt-BR', {style:'currency', currency:'BRL'})}</div>
                                <div style={{height: ROW_HEIGHTS.line, display:'flex', alignItems:'center', fontSize:'0.85rem', color:'#334155', borderTop:'1px solid #f1f5f9'}}>{prod.brand}</div>
                                <div style={{height: ROW_HEIGHTS.dim, display:'flex', alignItems:'center', fontSize:'0.85rem', color:'#334155', borderTop:'1px solid #f1f5f9'}}>{prod.dimensions?.length || 0} mm</div>
                                <div style={{height: ROW_HEIGHTS.dim, display:'flex', alignItems:'center', fontSize:'0.85rem', color:'#334155', borderTop:'1px solid #f1f5f9'}}>{prod.dimensions?.width || 0} mm</div>
                                <div style={{height: ROW_HEIGHTS.dim, display:'flex', alignItems:'center', fontSize:'0.85rem', color:'#334155', borderTop:'1px solid #f1f5f9'}}>{prod.dimensions?.height || 0} mm</div>
                                <div style={{height: ROW_HEIGHTS.weight, display:'flex', alignItems:'center', fontSize:'0.85rem', color:'#334155', borderTop:'1px solid #f1f5f9'}}>{prod.dimensions?.weightBruto || 0} kg</div>
                                <div style={{height: ROW_HEIGHTS.vol, display:'flex', alignItems:'center', fontSize:'0.85rem', color:'#334155', borderTop:'1px solid #f1f5f9', marginBottom:'10px'}}>{prod.dimensions?.volume || 0} m³</div>
                                
                                <button onClick={() => {setShowCompareModal(false); navigate(`/produto-analise`, {state:{sku: prod.sku}});}} style={{marginTop:'auto', height: ROW_HEIGHTS.action, background:'#f8fafc', border:'1px solid #cbd5e1', padding:'0', borderRadius:'8px', fontWeight:600, fontSize:'0.8rem', color:'#475569', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center'}}>Ver Análise Completa</button>
                            </div>
                        ))}
                        
                        {compareList.length < 4 && (
                            <div onClick={() => setShowCompareModal(false)} style={{width:'280px', height:'450px', flexShrink:0, border:'2px dashed #cbd5e1', borderRadius:'12px', display:'flex', flexDirection:'column', justifyContent:'center', alignItems:'center', color:'#94a3b8', cursor:'pointer', background:'transparent', transition:'all 0.2s'}} onMouseEnter={e=>{e.currentTarget.style.borderColor='#2563eb'; e.currentTarget.style.color='#2563eb'; e.currentTarget.style.background='#eff6ff';}} onMouseLeave={e=>{e.currentTarget.style.borderColor='#cbd5e1'; e.currentTarget.style.color='#94a3b8'; e.currentTarget.style.background='transparent';}}>
                                <Search size={30} style={{marginBottom:'10px'}}/>
                                <span style={{fontWeight:600, fontSize:'0.85rem'}}>Adicionar produto</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        )}

        {selectedProduct && (
            <>
                <div onClick={() => setSelectedProduct(null)} style={{position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(15, 23, 42, 0.4)', backdropFilter:'blur(3px)', zIndex:9998}} />
                
                <div style={{position:'fixed', top:0, right:0, bottom:0, width:'100%', maxWidth:'400px', background:'#fff', zIndex:9999, overflowY:'auto', boxShadow:'-10px 0 30px rgba(0,0,0,0.1)', animation:'slideInRight 0.2s ease-out', display:'flex', flexDirection:'column'}}>
                    <div style={{background:'#fff', padding:'20px', display:'flex', justifyContent:'center', position:'relative', borderBottom:'1px solid #e2e8f0', minHeight:'220px', alignItems:'center', flexShrink: 0}}>
                        <button onClick={() => setSelectedProduct(null)} style={{position:'absolute', top:15, right:15, background:'#fff', border:'1px solid #e2e8f0', width:'32px', height:'32px', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', color:'#475569', boxShadow:'0 2px 5px rgba(0,0,0,0.05)', zIndex:10}}><X size={18} /></button>
                        
                        {selectedProduct.imageUrl ? (
                            <img src={selectedProduct.imageUrl} alt="" loading="lazy" decoding="async" style={{maxWidth:'90%', maxHeight:'180px', objectFit:'contain'}} onError={(e) => { e.target.style.display = 'none'; }} />
                        ) : (
                            <div style={{display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', color:'#cbd5e1'}}><ImageIcon size={40} /><p style={{fontSize:'0.85rem'}}>Sem imagem</p></div>
                        )}
                    </div>
                    <div style={{padding:'24px', display:'flex', flexDirection:'column', gap:'1.2rem', flex:1}}>
                        <div>
                            <span style={{color:'#2563eb', fontSize:'0.7rem', fontWeight:700, textTransform:'uppercase'}}>{selectedProduct.brand}</span>
                            <h2 style={{margin:'4px 0 6px 0', fontSize:'1.2rem', color:'#0f172a', lineHeight:'1.3'}}>{selectedProduct.description}</h2>
                            <span style={{fontSize:'0.8rem', color:'#64748b'}}>SKU: {selectedProduct.sku}</span>
                        </div>
                        <div style={{background:'#f8fafc', borderRadius:'12px', padding:'16px', border:'1px solid #e2e8f0', borderLeft:'4px solid #10b981'}}>
                            <span style={{fontSize:'0.7rem', fontWeight:800, color:'#64748b', textTransform:'uppercase'}}>Preço Simulado</span>
                            <div style={{fontSize:'2rem', fontWeight:800, color:'#10b981', margin:'4px 0'}}>
                                {calculateFinalPrice(selectedProduct).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            </div>
                            <div style={{fontSize:'0.75rem', color:'#64748b', marginTop:6}}>Rota: {expedicao} ➔ {uf} ({freteType})</div>
                        </div>
                        <button 
                            onClick={() => navigate(`/produto-analise`, { state: { sku: selectedProduct.sku, expedicao, uf, freteType, tipoCarga, clientTier, paymentTerm, logisticsMap } })}
                            style={{width:'100%', display:'flex', alignItems:'center', justifyContent:'center', gap:8, background:'#2563eb', color:'#fff', border:'none', padding:'12px', borderRadius:'8px', fontWeight:700, fontSize:'0.9rem', cursor:'pointer', transition:'0.2s', boxShadow:'0 4px 10px rgba(37,99,235,0.2)', marginTop:'auto'}}
                            onMouseEnter={e=>e.currentTarget.style.transform='translateY(-2px)'} onMouseLeave={e=>e.currentTarget.style.transform='translateY(0)'}
                        >
                            Ver Análise e Fotos <ExternalLink size={16}/>
                        </button>
                    </div>
                </div>
            </>
        )}
        
        <style dangerouslySetInnerHTML={{__html: `
            @keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }
            @keyframes fadeInDown { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
            @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
            @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .4; } }
            .skeleton-box { background: #e2e8f0; animation: pulse 1.5s infinite ease-in-out; }
            .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
            .custom-scrollbar::-webkit-scrollbar-track { background: #f8fafc; border-radius: 4px; }
            .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
            .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
            ::-webkit-scrollbar { width: 8px; height: 8px; }
            ::-webkit-scrollbar-track { background: #f1f5f9; border-radius: 4px; }
            ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
            ::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
        `}} />
    </div>
    {notification && <Toast type={notification.type} message={notification.message} />}
    </div>
  );
}