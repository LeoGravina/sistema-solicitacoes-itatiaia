import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  collection, query, orderBy, getDocs, writeBatch, doc, limit, 
  where, startAfter 
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import Header from '../components/Header';
import Footer from '../components/Footer';
import { 
  Search, Upload, Filter, Loader2, Trash2, Image as ImageIcon, 
  ArrowLeft, Box, Plus, X, XCircle, Calculator, ChevronDown, DollarSign
} from 'lucide-react';
import Toast from '../components/Toast';
import * as XLSX from 'xlsx';
import styles from '../styles/PriceTable.module.css';

function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

export default function PriceTable() {
  const { userData } = useAuth();
  const isAdmin = userData?.role === 'admin';
  
  // --- PARÂMETROS DA CALCULADORA ---
  const [uf, setUf] = useState('MG');
  const [freteType, setFreteType] = useState('FOB');
  const [clientTier, setClientTier] = useState('Padrao');
  const [paymentTerm, setPaymentTerm] = useState('0');

  // --- DADOS ---
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [lastDoc, setLastDoc] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const ITEMS_PER_PAGE = 50;

  const [rawSearchTerm, setRawSearchTerm] = useState('');
  const searchTerm = useDebounce(rawSearchTerm, 800);
  
  const [activeTab, setActiveTab] = useState('Todos');
  const [tabs, setTabs] = useState(['Todos', 'AÇO e MAD', 'ELETRO', 'ELETROPORTÁTEIS', 'ITACOM']); 
  
  const [selectedBrands, setSelectedBrands] = useState([]);
  const [showAllBrands, setShowAllBrands] = useState(true);
  const [knownBrands, setKnownBrands] = useState(new Set());
  
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [notification, setNotification] = useState(null);
  
  const fileInputRef = useRef(null);
  const pricingInputRef = useRef(null);
  const imageInputRef = useRef(null);
  const [importing, setImporting] = useState(false);
  const [uploadingImages, setUploadingImages] = useState(false);

  // --- CÁLCULO DE PREÇO REAL ---
  const calculateFinalPrice = (product) => {
    let basePrice = 0;
    
    // 1. Busca na tabela importada (prices)
    if (product.prices && product.prices[uf]) {
        const priceObj = product.prices[uf];
        if (freteType === 'CIF') {
            basePrice = priceObj.cif || 0;
        } else {
            basePrice = priceObj.fob || 0;
        }
    }

    // Fallback: Se não achou na tabela (ou for 0), usa preço base de cadastro
    if (!basePrice || basePrice === 0) {
        basePrice = product.price || 0;
        if (uf !== 'MG' && basePrice > 0) basePrice = basePrice * 1.10; // Regra de segurança
    }

    if (basePrice === 0) return 0;

    let finalPrice = basePrice;

    // 2. Cliente
    if (clientTier === 'Ouro') finalPrice = finalPrice * 0.90; 
    else if (clientTier === 'Diamante') finalPrice = finalPrice * 0.85;
    else if (clientTier === 'Ecommerce') finalPrice = finalPrice * 0.95;

    // 3. Prazo
    const days = parseInt(paymentTerm);
    if (days > 0) {
        const juros = 1 + (days * 0.001); 
        finalPrice = finalPrice * juros;
    }

    return finalPrice;
  };

  // --- BUSCA PAGINADA ---
  const fetchProducts = useCallback(async (isLoadMore = false) => {
    try {
      if (isLoadMore) setLoadingMore(true); else setLoading(true);

      const constraints = [];
      if (activeTab !== 'Todos') constraints.push(where('group', '==', activeTab));
      if (selectedBrands.length > 0) constraints.push(where('brand', 'in', selectedBrands));

      if (searchTerm) {
        if (!isNaN(searchTerm) && searchTerm.length > 3) {
             constraints.push(orderBy('sku')); 
             constraints.push(startAfter(searchTerm)); 
             constraints.push(limit(ITEMS_PER_PAGE));
        } else {
             constraints.push(orderBy('description'));
             constraints.push(where('description', '>=', searchTerm.toUpperCase()));
             constraints.push(where('description', '<=', searchTerm.toUpperCase() + '\uf8ff'));
             constraints.push(limit(ITEMS_PER_PAGE));
        }
      } else {
        constraints.push(orderBy('description')); 
        constraints.push(limit(ITEMS_PER_PAGE));
      }

      if (isLoadMore && lastDoc) constraints.push(startAfter(lastDoc));

      const q = query(collection(db, 'products_base'), ...constraints);
      const snapshot = await getDocs(q);
      const newProducts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      setKnownBrands(prev => { 
          const next = new Set(prev); 
          newProducts.forEach(p => { if(p.brand) next.add(p.brand); }); 
          return next; 
      });

      if (isLoadMore) setProducts(prev => [...prev, ...newProducts]);
      else setProducts(newProducts);

      if (snapshot.docs.length > 0) setLastDoc(snapshot.docs[snapshot.docs.length - 1]);
      setHasMore(snapshot.docs.length === ITEMS_PER_PAGE);

    } catch (error) {
      console.error(error);
      if (String(error).includes('requires an index')) {
          const link = String(error).match(/https:\/\/console\.firebase\.google\.com[^\s]*/);
          if (link) alert(`⚠️ Crie o índice clicando aqui (link no console F12)`);
      }
    } finally {
      setLoading(false); setLoadingMore(false);
    }
  }, [activeTab, selectedBrands, searchTerm, lastDoc]);

  useEffect(() => { setLastDoc(null); fetchProducts(false); }, [activeTab, selectedBrands, searchTerm]);

  // --- HELPER ---
  const normalizeText = (text) => text ? text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "") : '';
  const showNotification = (type, message) => { setNotification({ type, message }); setTimeout(() => setNotification(null), 4000); };
  
  const toggleBrand = (brand) => {
    let newSelection = selectedBrands.includes(brand) ? selectedBrands.filter(b => b !== brand) : [...selectedBrands, brand];
    if (newSelection.length > 10) return alert("Máximo 10 marcas.");
    setSelectedBrands(newSelection);
    setShowAllBrands(newSelection.length === 0);
  };
  const clearBrandFilters = () => { setSelectedBrands([]); setShowAllBrands(true); };
  const brandsToList = ['Todas', ...Array.from(knownBrands)].sort();

  // =========================================================
  // === FUNÇÃO NOVA: IMPORTAR PRODUTOS (CATÁLOGO GERAL) ===
  // =========================================================
  const handleImportClick = () => fileInputRef.current?.click();

  const processExcel = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImporting(true);
    showNotification('info', 'Lendo catálogo de produtos...');

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = new Uint8Array(event.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        
        // 1. Mapeia Produtos Existentes (Para atualizar em vez de duplicar)
        // Isso é crucial para não quebrar os preços já importados
        showNotification('info', 'Mapeando base atual...');
        const qAll = query(collection(db, 'products_base'));
        const snapshot = await getDocs(qAll);
        const skuToDocMap = {}; // SKU -> { id, data }
        snapshot.forEach(doc => {
            const d = doc.data();
            if (d.sku) {
                const clean = String(d.sku).replace(/[^0-9]/g, '');
                skuToDocMap[clean] = { id: doc.id, ...d };
            }
        });

        // 2. Processa todas as abas
        let productsToSave = {}; // Map SKU -> Dados para salvar
        let totalRead = 0;

        for (const sheetName of workbook.SheetNames) {
            // Pula abas de sistema ou preço
            if (sheetName.toLowerCase().includes('bd_') || 
                sheetName.toLowerCase().includes('parâmetros') ||
                sheetName.toLowerCase().includes('descrições')) continue;

            console.log(`Lendo aba: ${sheetName}`);
            const worksheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

            // Achar cabeçalho
            let headerIndex = -1;
            for(let i=0; i<15; i++) {
                const row = jsonData[i];
                // Procura colunas chave do seu print: "Material" e "Descrição Comercial"
                if(row && row.some(c => String(c).toUpperCase().includes('MATERIAL'))) {
                    headerIndex = i; break;
                }
            }

            if (headerIndex === -1) continue;

            const header = jsonData[headerIndex];
            const idxSku = header.findIndex(c => String(c).toUpperCase().includes('MATERIAL'));
            const idxDesc = header.findIndex(c => String(c).toUpperCase().includes('DESCRIÇÃO COMERCIAL'));
            const idxBrand = header.findIndex(c => String(c).toUpperCase().includes('LINHA DE PRODUTO'));
            const idxGroup = header.findIndex(c => String(c).toUpperCase().includes('SETOR DE ATIVIDADE'));
            const idxPrice = header.findIndex(c => String(c).toUpperCase().includes('PREÇO TABELA') || String(c).toUpperCase().includes('PREÇO'));
            const idxStatus = header.findIndex(c => String(c).toUpperCase().includes('STATUS'));

            // Processa linhas
            for(let i = headerIndex + 1; i < jsonData.length; i++) {
                const row = jsonData[i];
                if(!row || !row[idxSku]) continue;

                const rawSku = String(row[idxSku]);
                const cleanSku = rawSku.replace(/[^0-9]/g, '');
                
                // Filtra inativos se quiser (opcional)
                if (idxStatus > -1) {
                    const status = String(row[idxStatus]).toUpperCase();
                    if (status.includes('INATIVO') || status.includes('OBSOLETO')) continue;
                }

                const desc = idxDesc > -1 ? String(row[idxDesc]).trim() : 'Sem Descrição';
                const brand = idxBrand > -1 ? String(row[idxBrand]).trim() : 'Geral';
                const group = idxGroup > -1 ? String(row[idxGroup]).trim() : sheetName; // Usa nome da aba se não achar grupo
                
                let price = 0;
                if (idxPrice > -1) {
                    const rawPrice = row[idxPrice];
                    if (typeof rawPrice === 'number') price = rawPrice;
                    else if (typeof rawPrice === 'string') {
                         // Tenta limpar "R$ 1.200,00"
                         let p = rawPrice.replace('R$', '').trim();
                         if(p.includes(',') && p.includes('.')) p = p.replace(/\./g, '').replace(',', '.');
                         else if(p.includes(',')) p = p.replace(',', '.');
                         price = parseFloat(p) || 0;
                    }
                }

                // Monta objeto
                productsToSave[cleanSku] = {
                    sku: cleanSku,
                    description: desc,
                    brand: brand,
                    group: group,
                    price: price, // Preço base
                    stock: 100, // Valor padrão pois a planilha de cadastro não costuma ter estoque real
                    updatedAt: new Date()
                };
                totalRead++;
            }
        }

        // 3. Salvar no Banco (Upsert)
        const skusToProcess = Object.keys(productsToSave);
        if (skusToProcess.length === 0) {
            alert("Nenhum produto encontrado nas abas de tabela.");
            setImporting(false);
            return;
        }

        showNotification('info', `Salvando ${skusToProcess.length} produtos...`);
        let batch = writeBatch(db);
        let batchCount = 0;
        let savedCount = 0;

        for (const sku of skusToProcess) {
            const newData = productsToSave[sku];
            const existing = skuToDocMap[sku];
            
            let docRef;
            if (existing) {
                // Atualiza existente (mantém prices e images)
                docRef = doc(db, 'products_base', existing.id);
                batch.update(docRef, newData);
            } else {
                // Cria novo
                docRef = doc(collection(db, 'products_base')); // ID Auto
                batch.set(docRef, newData);
            }

            batchCount++;
            savedCount++;

            if(batchCount >= 400) {
                await batch.commit();
                batch = writeBatch(db);
                batchCount = 0;
                showNotification('info', `Progresso: ${savedCount} / ${skusToProcess.length}`);
            }
        }

        if (batchCount > 0) await batch.commit();

        alert(`IMPORTAÇÃO CONCLUÍDA!\n\nProdutos lidos: ${totalRead}\nProdutos salvos/atualizados: ${savedCount}`);
        showNotification('success', 'Catálogo de produtos atualizado!');
        
        // Refresh
        setLastDoc(null);
        fetchProducts(false);

      } catch (error) {
        console.error("Erro importação:", error);
        alert("Erro ao importar: " + error.message);
      } finally {
        setImporting(false);
        e.target.value = null;
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // --- IMPORTAÇÃO DE PREÇOS (BD_PREÇO) ---
  const handlePricingImportClick = () => pricingInputRef.current?.click();
  const processPricingExcel = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImporting(true);
    showNotification('info', 'Lendo tabela de preços...');

    const reader = new FileReader();
    reader.onload = async (event) => {
        try {
            const data = new Uint8Array(event.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            
            const sheetName = workbook.SheetNames.find(n => n.toLowerCase().includes('bd_preço') || n.toLowerCase().includes('bd_preco'));
            if (!sheetName) { alert("Aba 'bd_preço' não encontrada."); setImporting(false); return; }

            const worksheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

            let headerIndex = -1;
            for(let i=0; i<20; i++) {
                const row = jsonData[i];
                if(row && row.some(c => String(c).toUpperCase().includes('#SKU'))) { headerIndex = i; break; }
            }
            if(headerIndex === -1) { alert("Coluna '#SKU' não encontrada."); setImporting(false); return; }

            const header = jsonData[headerIndex];
            const idxSku = header.findIndex(c => String(c).toUpperCase().includes('#SKU'));
            const idxUf = header.findIndex(c => String(c).toUpperCase().includes('DESTINO'));
            const idxFob = header.findIndex(c => String(c).toUpperCase().includes('FOB'));
            const idxCif = header.findIndex(c => String(c).toUpperCase().includes('CIF'));

            // Mapa SKUs
            const qAll = query(collection(db, 'products_base'));
            const snapshot = await getDocs(qAll);
            const skuToIdMap = {};
            snapshot.forEach(doc => {
                if (doc.data().sku) {
                    const cleanSku = String(doc.data().sku).replace(/[^0-9]/g, '');
                    skuToIdMap[cleanSku] = doc.id;
                }
            });

            const productUpdates = {};
            let matchCount = 0;

            for(let i = headerIndex + 1; i < jsonData.length; i++) {
                const row = jsonData[i];
                if(!row || !row[idxSku]) continue;
                const cleanSku = String(row[idxSku]).replace(/[^0-9]/g, '');
                const docId = skuToIdMap[cleanSku];
                if(docId) {
                    const uf = String(row[idxUf]).trim().toUpperCase();
                    const fob = parseFloat(row[idxFob]) || 0;
                    const cif = parseFloat(row[idxCif]) || 0;
                    if(!productUpdates[docId]) productUpdates[docId] = {};
                    productUpdates[docId][uf] = { fob, cif };
                    matchCount++;
                }
            }

            if (matchCount === 0) { alert("Nenhum SKU correspondente encontrado. Importe os produtos primeiro!"); setImporting(false); return; }

            // Salvar
            const allIds = Object.keys(productUpdates);
            showNotification('info', `Atualizando preços de ${allIds.length} produtos...`);
            let batch = writeBatch(db);
            let batchCount = 0;
            for (const docId of allIds) {
                const ref = doc(db, 'products_base', docId);
                batch.set(ref, { prices: productUpdates[docId] }, { merge: true });
                batchCount++;
                if(batchCount >= 400) { await batch.commit(); batch = writeBatch(db); batchCount = 0; }
            }
            if (batchCount > 0) await batch.commit();
            alert(`Preços atualizados com sucesso!`);
            showNotification('success', 'Tabela de preços sincronizada!');
            setLastDoc(null); fetchProducts(false);

        } catch (err) { console.error(err); alert("Erro: " + err.message); } 
        finally { setImporting(false); e.target.value = null; }
    };
    reader.readAsArrayBuffer(file);
  };

  // --- OUTROS HANDLERS ---
  const handleImageUploadClick = () => imageInputRef.current?.click();
  const processImages = async (e) => { alert("Use a função da resposta anterior para fotos (Cota diária)."); };
  const handleClearBase = async () => { /* ... */ };

  return (
    <div className={styles.pageContainer}>
      <Header />
      
      {selectedProduct ? (
        <div className={styles.detailContainer}>
             <div className={styles.detailHeader}>
                <button className={styles.btnBack} onClick={() => setSelectedProduct(null)}>
                    <ArrowLeft size={20} /> Voltar
                </button>
                <div className={styles.detailTitle}>
                    <h2>{selectedProduct.description}</h2>
                    <span>SKU: {selectedProduct.sku}</span>
                </div>
            </div>
            <div className={styles.detailContent}>
                <div className={styles.imageSection}>
                    {selectedProduct.imageUrl ? (
                        <img src={selectedProduct.imageUrl} alt="" className={styles.bigImage} />
                    ) : (
                        <div style={{textAlign:'center', color:'#cbd5e1'}}><ImageIcon size={100} /><p>Sem imagem</p></div>
                    )}
                </div>
                <div className={styles.infoSection}>
                    <div className={styles.infoCard}>
                        <div className={styles.infoLabel}>Preço Calculado ({uf}/{freteType})</div>
                        <div className={styles.priceValue}>
                            {calculateFinalPrice(selectedProduct).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </div>
                         <div style={{marginTop: '1rem', fontSize:'0.8rem', color:'#64748b'}}>
                            Tabela Base: {selectedProduct.prices ? (selectedProduct.prices[uf] ? 'Encontrada ✅' : 'Não achou UF ❌') : 'Sem tabela ❌'}
                        </div>
                    </div>
                </div>
            </div>
        </div>
      ) : (
        <div className={styles.contentWrapper}>
            <aside className={styles.sidebar}>
                {/* 1. SIMULADOR */}
                <div style={{padding:'1rem', backgroundColor:'#eff6ff', borderBottom:'1px solid #dbeafe'}}>
                    <div style={{display:'flex', alignItems:'center', gap:'0.5rem', marginBottom:'0.8rem', color:'#1e40af'}}>
                        <Calculator size={18} /> 
                        <h3 style={{margin:0, fontSize:'0.9rem', fontWeight:700}}>Simulador de Custos</h3>
                    </div>
                    
                    <div className={styles.pricingGroup} style={{marginBottom:'0.5rem'}}>
                        <label className={styles.pricingLabel}>UF Destino</label>
                        <select className={styles.pricingSelect} value={uf} onChange={e => setUf(e.target.value)} style={{width:'100%'}}>
                            {['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO'].map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                    </div>
                    <div className={styles.pricingGroup} style={{marginBottom:'0.5rem'}}>
                        <label className={styles.pricingLabel}>Frete</label>
                        <select className={styles.pricingSelect} value={freteType} onChange={e => setFreteType(e.target.value)} style={{width:'100%'}}>
                            <option value="FOB">FOB (Retira)</option>
                            <option value="CIF">CIF (Entrega)</option>
                        </select>
                    </div>
                    <div className={styles.pricingGroup} style={{marginBottom:'0.5rem'}}>
                        <label className={styles.pricingLabel}>Cond. Pagamento</label>
                        <select className={styles.pricingSelect} value={paymentTerm} onChange={e => setPaymentTerm(e.target.value)} style={{width:'100%'}}>
                            <option value="0">À Vista</option>
                            <option value="30">30 Dias</option>
                            <option value="60">60 Dias</option>
                        </select>
                    </div>
                    <div className={styles.pricingGroup}>
                        <label className={styles.pricingLabel}>Cliente</label>
                        <select className={styles.pricingSelect} value={clientTier} onChange={e => setClientTier(e.target.value)} style={{width:'100%'}}>
                            <option value="Padrao">Padrão</option>
                            <option value="Ouro">Ouro (-10%)</option>
                        </select>
                    </div>
                </div>

                {/* 2. FILTROS */}
                <div className={styles.sidebarHeader} style={{marginTop:'0'}}> 
                    <div style={{display:'flex', alignItems:'center', gap:'0.6rem'}}>
                        <Filter size={18} color="#233ae0" /> <h3>Filtros de Marca</h3>
                    </div>
                    {selectedBrands.length > 0 && <button onClick={clearBrandFilters} className={styles.clearBtn}><XCircle size={14} /> Limpar</button>}
                </div>
                <div className={styles.sidebarContent}>
                    <div className={styles.filterList}>
                        {brandsToList.map(brand => {
                            if(brand === 'Todas') return null;
                            const isSelected = selectedBrands.includes(brand);
                            return <button key={brand} className={`${styles.filterBtn} ${isSelected ? styles.active : ''}`} onClick={() => toggleBrand(brand)}><span>{brand}</span> {isSelected && <X size={15} className={styles.closeIcon}/>}</button>
                        })}
                    </div>
                </div>
            </aside>

            <div className={styles.mainArea}>
                <div className={styles.tabsBar}>
                    {tabs.map(tab => (
                        <button key={tab} className={`${styles.tabItem} ${activeTab === tab ? styles.active : ''}`} onClick={() => { setActiveTab(tab); setSelectedBrands([]); }}>
                            {tab}
                        </button>
                    ))}
                </div>

                <div className={styles.toolbar}>
                    <div className={styles.searchContainer}>
                        <Search size={18} className={styles.searchIcon} />
                        <input type="text" placeholder="Buscar produto..." value={rawSearchTerm} onChange={e => setRawSearchTerm(e.target.value)} className={styles.searchInput} />
                    </div>
                    {isAdmin && (
                        <div className={styles.actionsGroup}>
                            <input id="pricingInput" type="file" accept=".xlsx" ref={pricingInputRef} style={{ display: 'none' }} onChange={processPricingExcel} />
                            <button onClick={handlePricingImportClick} className={styles.btnIcon} title="Importar Tabela bd_preço" style={{color:'#16a34a', borderColor:'#16a34a', fontWeight:'bold', backgroundColor:'#f0fdf4'}}>
                                <DollarSign size={18} /> <span style={{fontSize:'0.8rem', marginLeft:4}}>Preços</span>
                            </button>

                            <input id="prodInput" type="file" accept=".xlsx" ref={fileInputRef} style={{ display: 'none' }} onChange={processExcel} />
                            <input id="imgInput" type="file" accept="image/*" multiple ref={imageInputRef} style={{ display: 'none' }} onChange={processImages} />
                            
                            <button onClick={handleImageUploadClick} className={styles.btnIcon} disabled={uploadingImages}><ImageIcon size={18} /></button>
                            {/* BOTÃO ATUALIZADO DE PRODUTOS */}
                            <button onClick={handleImportClick} className={styles.btnSuccess} disabled={importing}><Upload size={18} /> Produtos</button>
                        </div>
                    )}
                </div>

                <div className={styles.tableWrapper}>
                    <table className={styles.dataTable}>
                        <thead>
                            <tr>
                                <th style={{ width: '60px' }}>Img</th>
                                <th style={{ width: '90px' }}>SKU</th>
                                <th>Descrição</th>
                                <th>Linha</th>
                                {activeTab === 'Todos' && <th>Grupo</th>}
                                <th style={{ width: '80px', textAlign: 'center' }}>Estoque</th>
                                <th style={{ width: '130px', textAlign: 'right' }}>Preço ({uf})</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? ( <tr><td colSpan="7" className={styles.emptyState}><Loader2 className="spin" /> Carregando...</td></tr> ) : 
                            products.map((product) => {
                                const finalPrice = calculateFinalPrice(product);
                                return (
                                <tr key={product.id} onClick={() => setSelectedProduct(product)} className={styles.tableRow}>
                                    <td style={{ textAlign: 'center' }}>
                                        {product.imageUrl ? <img src={product.imageUrl} alt="" className={styles.imgThumbnail} /> : <div className={styles.imgPlaceholder}><ImageIcon size={14} /></div>}
                                    </td>
                                    <td className={styles.sku}>{product.sku}</td>
                                    <td className={styles.desc}>{product.description}</td>
                                    <td><span className={styles.brandTag}>{product.brand}</span></td>
                                    {activeTab === 'Todos' && <td><span className={styles.groupTag}>{product.group}</span></td>}
                                    <td style={{ textAlign: 'center' }}>{product.stock}</td>
                                    <td className={styles.price}>
                                        {finalPrice > 0 ? finalPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : <span style={{color:'#ef4444', fontSize:'0.8rem'}}>Indisponível</span>}
                                    </td>
                                </tr>
                            )})}
                        </tbody>
                    </table>
                    {!loading && hasMore && products.length > 0 && (
                        <div style={{textAlign:'center', padding:'1rem'}}>
                            <button onClick={() => fetchProducts(true)} className="btn btn-outline" style={{width:'200px'}} disabled={loadingMore}>
                                {loadingMore ? <Loader2 className="spin" size={16}/> : <ChevronDown size={16}/>} Carregar Mais
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
      )}
      <Footer />
      {notification && <Toast type={notification.type} message={notification.message} />}
    </div>
  );
}