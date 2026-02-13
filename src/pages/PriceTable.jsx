import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  collection, query, orderBy, getDocs, writeBatch, doc, limit, 
  where, startAfter, getCountFromServer, getDoc
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import Header from '../components/Header';
import Footer from '../components/Footer';
import { 
  Search, Upload, Filter, Loader2, Trash2, Image as ImageIcon, 
  ArrowLeft, Box, Plus, X, XCircle, Calculator, ChevronDown, Package, Info, Database,
  Ruler, Weight 
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

const cleanSKU = (sku) => String(sku).toUpperCase().replace(/[^A-Z0-9]/g, '');

const parsePrice = (val) => {
    if (val === undefined || val === null || val === '') return 0;
    if (typeof val === 'number') return val;
    let str = String(val).replace(/[^\d,\.-]/g, '');
    if (str === '') return 0;
    
    if (str.includes(',') && str.includes('.')) {
        if (str.lastIndexOf(',') > str.lastIndexOf('.')) {
            str = str.replace(/\./g, '').replace(',', '.'); 
        } else {
            str = str.replace(/,/g, ''); 
        }
    } else if (str.includes(',')) {
        str = str.replace(',', '.'); 
    }
    return parseFloat(str) || 0;
};

export default function PriceTable() {
  const { userData } = useAuth();
  const isAdmin = userData?.role === 'admin';
  
  // --- PARÂMETROS DA CALCULADORA ---
  const [expedicao, setExpedicao] = useState('UBÁ'); 
  const [uf, setUf] = useState('MG');
  const [freteType, setFreteType] = useState('CIF');
  const [tipoCarga, setTipoCarga] = useState('Truck'); 
  const [clientTier, setClientTier] = useState('0'); 
  const [paymentTerm, setPaymentTerm] = useState('0.1360'); 
  const [dimUnit, setDimUnit] = useState('mm');

  // --- NOVO: MAPA DE DESCONTOS LOGÍSTICOS DA ABA 1 ---
  const [logisticsMap, setLogisticsMap] = useState({});

  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [lastDoc, setLastDoc] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const ITEMS_PER_PAGE = 50;

  const [rawSearchTerm, setRawSearchTerm] = useState('');
  const searchTerm = useDebounce(rawSearchTerm, 800);
  
  const [activeTab, setActiveTab] = useState('Todos');
  const fixedTabs = ['Todos', 'AÇO e MAD', 'ELETRO', 'ELETROPORTÁTEIS', 'ITACOM'];
  const [tabCounts, setTabCounts] = useState({});
  
  const [selectedBrands, setSelectedBrands] = useState([]);
  const [showAllBrands, setShowAllBrands] = useState(true);
  const [knownBrands, setKnownBrands] = useState(new Set());
  
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [notification, setNotification] = useState(null);
  
  const fileInputRef = useRef(null);
  const imageInputRef = useRef(null);
  const [importing, setImporting] = useState(false);
  const [uploadingImages, setUploadingImages] = useState(false);

  // --- FUNÇÕES DE BUSCA DE METADADOS (Tiradas do esconderijo!) ---
  const fetchTabCounts = async () => {
      try {
          const counts = {};
          const collRef = collection(db, 'products_base');
          const snapTotal = await getCountFromServer(collRef);
          counts['Todos'] = snapTotal.data().count;
          for (const grupo of ['AÇO e MAD', 'ELETRO', 'ELETROPORTÁTEIS', 'ITACOM']) {
              const q = query(collRef, where('group', '==', grupo));
              const snap = await getCountFromServer(q);
              counts[grupo] = snap.data().count;
          }
          setTabCounts(counts);
      } catch (error) { console.error("Erro contagem:", error); }
  };

  const fetchLogistics = async () => {
      try {
          const docSnap = await getDoc(doc(db, 'system_settings', 'logistics_discounts'));
          if (docSnap.exists()) setLogisticsMap(docSnap.data());
      } catch (error) { console.error("Erro logistica:", error); }
  };

  // --- CARREGA CONTAGENS E MAPA LOGÍSTICO AO ABRIR O SITE ---
  useEffect(() => { 
      fetchTabCounts(); 
      fetchLogistics();
  }, []);

  // --- A MATEMÁTICA DEFINITIVA (COM ABA 1) ---
  const calculateFinalPrice = (product) => {
    let basePrice = 0;
    if (product.prices && product.prices[expedicao] && product.prices[expedicao][uf]) {
        const priceObj = product.prices[expedicao][uf];
        basePrice = freteType === 'CIF' ? (priceObj.cif || 0) : (priceObj.fob || 0);
    }
    if (!product.prices && (!basePrice || basePrice === 0)) basePrice = product.price || 0;
    if (basePrice === 0) return 0;

    const descFinanceiro = parseFloat(paymentTerm);
    const descComercial = parseFloat(clientTier);
    
    // MÁGICA LOGÍSTICA: Constrói a chave e puxa do banco
    let descLogistico = 0;
    if (freteType === 'CIF') {
        const sec = product.sector || 'OUTROS';
        const logKey = `${expedicao}${uf}${sec}${tipoCarga}`.toUpperCase().replace(/\s/g, '');
        descLogistico = logisticsMap[logKey] || 0;
    }
    
    const descPromocional = 0; 

    return basePrice * (1 - descFinanceiro) * (1 - descComercial) * (1 - descLogistico) * (1 - descPromocional);
  };

  const fetchProducts = useCallback(async (isLoadMore = false) => {
    try {
      if (isLoadMore) setLoadingMore(true); else setLoading(true);

      const constraints = [];
      if (activeTab !== 'Todos') constraints.push(where('group', '==', activeTab));
      if (selectedBrands.length > 0) constraints.push(where('brand', 'in', selectedBrands));

      let fetchedProducts = [];

      if (searchTerm) {
          const term = searchTerm.toUpperCase();
          const qSku = query(collection(db, 'products_base'), ...constraints, where('sku', '>=', term), where('sku', '<=', term + '\uf8ff'), limit(ITEMS_PER_PAGE));
          const qDesc = query(collection(db, 'products_base'), ...constraints, where('description', '>=', term), where('description', '<=', term + '\uf8ff'), limit(ITEMS_PER_PAGE));
          
          const [snapSku, snapDesc] = await Promise.all([getDocs(qSku), getDocs(qDesc)]);
          
          const uniqueMap = new Map();
          snapSku.forEach(d => uniqueMap.set(d.id, { id: d.id, ...d.data() }));
          snapDesc.forEach(d => uniqueMap.set(d.id, { id: d.id, ...d.data() }));
          
          fetchedProducts = Array.from(uniqueMap.values());
          fetchedProducts.sort((a, b) => a.description.localeCompare(b.description));
          
          setHasMore(false); 
      } else {
          constraints.push(orderBy('description'));
          constraints.push(limit(ITEMS_PER_PAGE));
          if (isLoadMore && lastDoc) constraints.push(startAfter(lastDoc));

          const q = query(collection(db, 'products_base'), ...constraints);
          const snapshot = await getDocs(q);
          fetchedProducts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          
          if (snapshot.docs.length > 0) setLastDoc(snapshot.docs[snapshot.docs.length - 1]);
          setHasMore(snapshot.docs.length === ITEMS_PER_PAGE);
      }

      setKnownBrands(prev => { 
          const next = new Set(prev); fetchedProducts.forEach(p => { if(p.brand) next.add(p.brand); }); return next; 
      });

      if (isLoadMore) setProducts(prev => [...prev, ...fetchedProducts]);
      else setProducts(fetchedProducts);

    } catch (error) { 
      console.error(error); 
      if (String(error).includes('requires an index')) {
          alert(`⚠️ O Firebase precisa criar um novo Índice de Busca.\nAbra o Console (F12) e clique no link gerado!`);
      }
    } finally { setLoading(false); setLoadingMore(false); }
  }, [activeTab, selectedBrands, searchTerm, lastDoc]);

  useEffect(() => { setLastDoc(null); fetchProducts(false); }, [activeTab, selectedBrands, searchTerm]);

  const normalizeText = (text) => text ? text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "") : '';
  const showNotification = (type, message) => { setNotification({ type, message }); setTimeout(() => setNotification(null), 4000); };
  const toggleBrand = (brand) => {
    let newSelection = selectedBrands.includes(brand) ? selectedBrands.filter(b => b !== brand) : [...selectedBrands, brand];
    if (newSelection.length > 10) return alert("Máximo 10 marcas.");
    setSelectedBrands(newSelection); setShowAllBrands(newSelection.length === 0);
  };
  const clearBrandFilters = () => { setSelectedBrands([]); setShowAllBrands(true); };
  const brandsToList = ['Todas', ...Array.from(knownBrands)].sort();

  const formatDim = (val) => {
      const num = parseFloat(val) || 0;
      if (num === 0) return '-';
      if (dimUnit === 'mm') return `${num} mm`;
      if (dimUnit === 'cm') return `${(num / 10).toLocaleString('pt-BR')} cm`;
      if (dimUnit === 'm') return `${(num / 1000).toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})} m`;
      return val;
  };

  const formatKg = (val) => {
      const num = parseFloat(val) || 0;
      return num === 0 ? '-' : `${num.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})} kg`;
  }

  const formatVol = (val) => {
      const num = parseFloat(val) || 0;
      return num === 0 ? '-' : `${num.toLocaleString('pt-BR', {minimumFractionDigits: 3, maximumFractionDigits: 3})} m³`;
  }

  // =========================================================
  // === IMPORTAÇÃO MESTRA (AGORA COM ABA 1, 3 e 4)        ===
  // =========================================================
  const handleImportClick = () => fileInputRef.current?.click();

  const processUnifiedExcel = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImporting(true);
    showNotification('info', 'Lendo a planilha Mestra... Aguarde.');

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = new Uint8Array(event.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        
        // --- FASE 1.5: EXTRAIR REGRAS DA ABA 1 ---
        showNotification('info', 'Mapeando regras logísticas (Aba 1)...');
        let logDiscountsToSave = {};
        const sheet1Name = workbook.SheetNames.find(n => n.toLowerCase().includes('parâmetro') || n.toLowerCase().includes('parametro'));
        
        if (sheet1Name) {
            const data1 = XLSX.utils.sheet_to_json(workbook.Sheets[sheet1Name], { header: 1 });
            let hLog = -1;
            for(let i=0; i<10; i++) { if(data1[i] && data1[i].some(c => String(c).toUpperCase() === 'CONCATENAR')) { hLog = i; break; } }
            
            if (hLog > -1) {
                const head1 = data1[hLog];
                const iConcat = head1.findIndex(c => String(c).toUpperCase() === 'CONCATENAR');
                const iDesc = head1.indexOf('Desconto', iConcat) > -1 ? head1.indexOf('Desconto', iConcat) : iConcat + 6;

                for(let i = hLog + 1; i < data1.length; i++) {
                    const row = data1[i];
                    if(!row || !row[iConcat]) continue;
                    
                    const key = String(row[iConcat]).toUpperCase().replace(/\s/g, ''); 
                    let val = row[iDesc];
                    let numVal = 0;
                    
                    if (typeof val === 'number') {
                        numVal = val > 1 ? val / 100 : val;
                    } else if (typeof val === 'string') {
                        let clean = val.replace('%', '').replace(',', '.').trim();
                        numVal = parseFloat(clean) || 0;
                        if (val.includes('%') || numVal > 1) numVal = numVal / 100;
                    }
                    logDiscountsToSave[key] = numVal;
                }
            }
        }

        // --- FASE 1: EXTRAIR ABA 3 ---
        showNotification('info', 'Extraindo dados técnicos (Aba 3)...');
        const dimensionsMap = {};
        const sheet3Name = workbook.SheetNames.find(n => n.toLowerCase().includes('zppq001'));
        if (sheet3Name) {
            const data3 = XLSX.utils.sheet_to_json(workbook.Sheets[sheet3Name], { header: 1 });
            let h3 = -1;
            for(let i=0; i<10; i++) { if(data3[i] && data3[i].some(c => String(c).toUpperCase().includes('MATERIAL'))) { h3 = i; break; } }
            if (h3 > -1) {
                const head = data3[h3];
                const iMat = head.findIndex(c => String(c).toUpperCase().includes('MATERIAL'));
                const cols = {
                    cmp: head.findIndex(c => String(c).toUpperCase() === 'CMPR.'), lar: head.findIndex(c => String(c).toUpperCase().includes('LARGURA')),
                    alt: head.findIndex(c => String(c).toUpperCase().includes('ALTURA')), pesB: head.findIndex(c => String(c).toUpperCase().includes('PESO BRUTO')),
                    pesL: head.findIndex(c => String(c).toUpperCase().includes('PESO LÍQUIDO') || String(c).toUpperCase().includes('PESO LIQUIDO')),
                    vol: head.findIndex(c => String(c).toUpperCase().includes('VOLUME')), statLin: head.findIndex(c => String(c).toUpperCase().includes('STATUS LINHA')),
                    statSku: head.findIndex(c => String(c).toUpperCase().includes('STATUS SKU')), classLin: head.findIndex(c => String(c).toUpperCase().includes('CLASSIFICAÇÃO')),
                    hier: head.findIndex(c => String(c).toUpperCase().includes('HIERARQUIA DE PRODUTOS')), tipoMat: head.findIndex(c => String(c).toUpperCase().includes('TIPO DE MATERIAL')),
                    kg3: head.findIndex(c => String(c).toUpperCase().includes('KG3') || String(c).toUpperCase().includes('KG³'))
                };

                for(let i = h3 + 1; i < data3.length; i++) {
                    if(!data3[i] || !data3[i][iMat]) continue;
                    const cSku = cleanSKU(data3[i][iMat]);
                    dimensionsMap[cSku] = {
                        length: cols.cmp > -1 ? data3[i][cols.cmp] || 0 : 0, width: cols.lar > -1 ? data3[i][cols.lar] || 0 : 0, 
                        height: cols.alt > -1 ? data3[i][cols.alt] || 0 : 0, weightBruto: cols.pesB > -1 ? data3[i][cols.pesB] || 0 : 0, 
                        weightLiq: cols.pesL > -1 ? data3[i][cols.pesL] || 0 : 0, volume: cols.vol > -1 ? data3[i][cols.vol] || 0 : 0,
                        statusLinha: cols.statLin > -1 ? String(data3[i][cols.statLin] || '-') : '-', statusSku: cols.statSku > -1 ? String(data3[i][cols.statSku] || '-') : '-',
                        classificacao: cols.classLin > -1 ? String(data3[i][cols.classLin] || '-') : '-', hierarquia: cols.hier > -1 ? String(data3[i][cols.hier] || '-') : '-',
                        tipoMat: cols.tipoMat > -1 ? String(data3[i][cols.tipoMat] || '-') : '-', kg3: cols.kg3 > -1 ? data3[i][cols.kg3] || 0 : 0
                    };
                }
            }
        }

        // --- FASE 2: PREÇOS (Aba 4) ---
        showNotification('info', 'Extraindo tabela de preços CIF e FOB (Aba 4)...');
        const pricesMap = {};
        const sheet4Name = workbook.SheetNames.find(n => n.toLowerCase().includes('bd_preço') || n.toLowerCase().includes('bd_preco'));
        if (sheet4Name) {
            const data4 = XLSX.utils.sheet_to_json(workbook.Sheets[sheet4Name], { header: 1 });
            let h4 = -1;
            for(let i=0; i<15; i++) { if(data4[i] && data4[i].some(c => String(c).toUpperCase().includes('#SKU'))) { h4 = i; break; } }
            if (h4 > -1) {
                const head = data4[h4];
                const iSku = head.findIndex(c => String(c).toUpperCase().includes('#SKU'));
                const iExp = head.findIndex(c => String(c).toUpperCase().includes('EXPEDI')); 
                const iUf = head.findIndex(c => String(c).toUpperCase().includes('DESTI'));
                const iFob = head.findIndex(c => String(c).toUpperCase().includes('FOB') && !String(c).toUpperCase().includes('CHAVE'));
                const iCif = head.findIndex(c => String(c).toUpperCase().includes('CIF') && !String(c).toUpperCase().includes('CHAVE'));

                for(let i = h4 + 1; i < data4.length; i++) {
                    const row = data4[i];
                    if(!row || !row[iSku]) continue;
                    
                    const cSku = cleanSKU(row[iSku]);
                    const exp = iExp > -1 ? String(row[iExp]).trim().toUpperCase() : 'UBÁ';
                    const uf = String(row[iUf]).trim().toUpperCase();
                    
                    const fobVal = parsePrice(row[iFob]);
                    const cifVal = parsePrice(row[iCif]);

                    if(!pricesMap[cSku]) pricesMap[cSku] = {};
                    if(!pricesMap[cSku][exp]) pricesMap[cSku][exp] = {}; 
                    
                    const curr = pricesMap[cSku][exp][uf];
                    pricesMap[cSku][exp][uf] = { fob: (curr && curr.fob > 0) ? curr.fob : fobVal, cif: (curr && curr.cif > 0) ? curr.cif : cifVal };
                }
            }
        }

        // --- FASE 3: MAPEAR BANCO ATUAL ---
        const qAll = query(collection(db, 'products_base'));
        const snapshot = await getDocs(qAll);
        const skuToDocsMap = {};
        snapshot.forEach(doc => {
            const d = doc.data();
            if (d.sku) {
                const cSku = cleanSKU(d.sku);
                if (!skuToDocsMap[cSku]) skuToDocsMap[cSku] = [];
                skuToDocsMap[cSku].push({ id: doc.id, ...d });
            }
        });

        // --- FASE 4: ABAS DE PRODUTO ---
        let productsToSave = {}; 
        let totalRead = 0;

        for (const sheetName of workbook.SheetNames) {
            if (/bd_|parâmetro|premissa|descriç|imagem|comparativo|composi/i.test(sheetName)) continue;

            const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });

            let h1 = -1;
            for(let i=0; i<15; i++) {
                if(jsonData[i] && jsonData[i].some(c => {
                    const val = String(c).toUpperCase(); return val.includes('MATERIAL') || val.includes('SKU') || val.includes('CÓDIGO');
                })) { h1 = i; break; }
            }
            if (h1 === -1) continue;

            const header = jsonData[h1];
            const idxSku = header.findIndex(c => { const v = String(c).toUpperCase(); return v.includes('MATERIAL') || v.includes('SKU') || v.includes('CÓDIGO'); });
            const idxDesc = header.findIndex(c => String(c).toUpperCase().includes('DESCRIÇÃO'));
            const idxBrand = header.findIndex(c => String(c).toUpperCase().includes('LINHA'));
            const idxSector = header.findIndex(c => String(c).toUpperCase() === 'SETOR' || String(c).toUpperCase().includes('SETOR DE'));
            const idxStatus = header.findIndex(c => String(c).toUpperCase().includes('STATUS'));

            const cleanGroupName = sheetName.replace(/Tabela\s*-\s*/i, '').trim();

            for(let i = h1 + 1; i < jsonData.length; i++) {
                const row = jsonData[i];
                if(!row || !row[idxSku]) continue;

                const cSku = cleanSKU(row[idxSku]);
                if (idxStatus > -1) {
                    const status = String(row[idxStatus]).toUpperCase();
                    if (status.includes('INATIVO') || status.includes('OBSOLETO')) continue;
                }

                productsToSave[cSku] = {
                    sku: cSku, 
                    description: idxDesc > -1 ? String(row[idxDesc]).trim() : 'Sem Descrição', 
                    brand: idxBrand > -1 ? String(row[idxBrand]).trim() : 'Geral', 
                    group: cleanGroupName, 
                    sector: idxSector > -1 ? String(row[idxSector]).trim().toUpperCase() : 'OUTROS', 
                    dimensions: dimensionsMap[cSku] || null, 
                    prices: pricesMap[cSku] || null, 
                    stock: 100, 
                    updatedAt: new Date()
                };
                totalRead++;
            }
        }

        const skusToProcess = Object.keys(productsToSave);
        if (skusToProcess.length === 0) { alert("Nenhum produto encontrado."); setImporting(false); return; }

        // --- FASE 5: SALVAR NO FIREBASE ---
        showNotification('info', `Salvando ${skusToProcess.length} produtos... não feche a tela!`);
        let batch = writeBatch(db);
        let batchCount = 0;
        let docsUpdated = 0;

        // Salva os parâmetros logísticos primeiro
        if (Object.keys(logDiscountsToSave).length > 0) {
            batch.set(doc(db, 'system_settings', 'logistics_discounts'), logDiscountsToSave);
            batchCount++;
            setLogisticsMap(logDiscountsToSave); 
        }

        for (const sku of skusToProcess) {
            const newData = productsToSave[sku];
            const existingDocs = skuToDocsMap[sku];
            
            if (existingDocs && existingDocs.length > 0) {
                for (const existing of existingDocs) {
                    const docRef = doc(db, 'products_base', existing.id);
                    batch.set(docRef, newData, { merge: true }); 
                    batchCount++; docsUpdated++;

                    if(batchCount >= 100) { 
                        await batch.commit(); batch = writeBatch(db); batchCount = 0; 
                        showNotification('info', `Enviando... ${docsUpdated} salvos.`);
                        await new Promise(resolve => setTimeout(resolve, 3000));
                    }
                }
            } else {
                const docRef = doc(collection(db, 'products_base'));
                batch.set(docRef, newData);
                batchCount++; docsUpdated++;

                if(batchCount >= 100) { 
                    await batch.commit(); batch = writeBatch(db); batchCount = 0; 
                    showNotification('info', `Enviando... ${docsUpdated} salvos.`);
                    await new Promise(resolve => setTimeout(resolve, 3000));
                }
            }
        }
        
        if (batchCount > 0) await batch.commit();

        alert(`IMPORTAÇÃO MESTRA CONCLUÍDA! 🚀\n\n- Produtos: ${docsUpdated}\nAs Medidas, Preços e Tabela de Fretes foram unificados!`);
        showNotification('success', 'Catálogo Mestre Atualizado!');
        
        setLastDoc(null); fetchProducts(false); fetchTabCounts();

      } catch (error) { 
          console.error(error); 
          if(String(error).includes('quota')) alert("Limite diário do Google atingido.");
          else alert("Erro ao importar: " + error.message); 
      } 
      finally { setImporting(false); e.target.value = null; }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleImageUploadClick = () => imageInputRef.current?.click();
  const processImages = async (e) => {
    const allFiles = Array.from(e.target.files);
    const files = allFiles.filter(file => file.type.startsWith('image/'));
    if (files.length === 0) { alert("Nenhuma imagem válida na pasta."); return; }
    setUploadingImages(true);
    showNotification('info', `Analisando ${files.length} imagens...`);
    
    let successCount = 0; let matchesFound = 0;
    let batch = writeBatch(db); let batchCount = 0; let logReport = []; 

    try {
        const qAll = query(collection(db, 'products_base')); 
        const snapshotAll = await getDocs(qAll);
        const skuMap = {}; const descMap = {};

        snapshotAll.forEach(doc => {
            const p = doc.data();
            if (p.sku) {
                const cSku = cleanSKU(p.sku);
                if (!skuMap[cSku]) skuMap[cSku] = [];
                skuMap[cSku].push(doc.id);
            }
            if (p.description) {
                const cDesc = normalizeText(p.description);
                if (!descMap[cDesc]) descMap[cDesc] = [];
                descMap[cDesc].push(doc.id);
            }
        });

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const actualFileName = file.name.split('/').pop().split('\\').pop(); 
            let targetIds = [];
            
            const skuRegex = /(\d{6,15}[A-Za-z]?)/i; 
            const skuMatch = actualFileName.match(skuRegex);
            
            if (skuMatch) {
                const matchedSkuClean = cleanSKU(skuMatch[0]);
                if (skuMap[matchedSkuClean]) targetIds.push(...skuMap[matchedSkuClean]);
            }

            if (targetIds.length === 0) {
                const nameWithoutExt = actualFileName.substring(0, actualFileName.lastIndexOf('.'));
                const cleanFileName = normalizeText(nameWithoutExt);
                if (descMap[cleanFileName]) targetIds.push(...descMap[cleanFileName]);
                else {
                    Object.keys(descMap).forEach(dbDescKey => {
                        if (cleanFileName.length > 4 && dbDescKey.includes(cleanFileName)) targetIds.push(...descMap[dbDescKey]);
                    });
                }
            }

            targetIds = [...new Set(targetIds)];

            if (targetIds.length > 0) {
                matchesFound += targetIds.length;
                const timestamp = new Date().getTime(); 
                const storageRef = ref(storage, `product_images/${timestamp}_${actualFileName}`);

                try {
                    await uploadBytes(storageRef, file);
                    const downloadURL = await getDownloadURL(storageRef);
                    for (const docId of targetIds) {
                        const productRef = doc(db, 'products_base', docId);
                        batch.update(productRef, { imageUrl: downloadURL });
                        batchCount++;
                        if (batchCount >= 400) { await batch.commit(); batch = writeBatch(db); batchCount = 0; }
                    }
                    successCount++;
                    logReport.push(`✅ [VINCULOU] Imagem: "${actualFileName}" em ${targetIds.length} docs.`);
                } catch (err) { logReport.push(`❌ [ERRO] Imagem: "${actualFileName}" -> ${err.message}`); }
            } else {
                logReport.push(`⚠️ [IGNORADA] Imagem: "${actualFileName}" -> Sem match.`);
            }
        }

        if (batchCount > 0) await batch.commit();
        console.log(logReport.join('\n'));
        alert(`UPLOAD FINALIZADO!\n\nSalvas: ${successCount}\nVínculos: ${matchesFound}`);
        showNotification('success', 'Fotos atualizadas!');
        setLastDoc(null); fetchProducts(false);

    } catch (error) {
        console.error(error);
        if (String(error).includes('quota')) alert("COTA EXCEDIDA! Aguarde 24h.");
        else alert("Erro fatal: " + error.message);
    } finally { setUploadingImages(false); if (e.target) e.target.value = null; }
  };

  const handleClearBase = async () => {
    const confirm = window.confirm("⚠️ ATENÇÃO EXTREMA!\nIsso vai apagar TODOS os produtos do sistema. O banco ficará zerado.\nTem certeza?");
    if(!confirm) return;
    setImporting(true);
    showNotification('info', 'Iniciando varredura e limpeza... não feche a tela.');

    try {
        let totalDeleted = 0;
        let keepDeleting = true;

        while (keepDeleting) {
            const q = query(collection(db, 'products_base'), limit(400));
            const snapshot = await getDocs(q);

            if (snapshot.empty) { keepDeleting = false; break; }

            const batch = writeBatch(db);
            snapshot.docs.forEach((d) => { batch.delete(d.ref); totalDeleted++; });
            await batch.commit();
            showNotification('info', `Limpando o lixo... ${totalDeleted} apagados.`);
        }

        alert(`LIMPEZA CONCLUÍDA COM SUCESSO! 🧹✨\n\nForam vaporizados ${totalDeleted} registros.`);
        showNotification('success', 'Banco de dados 100% limpo!');
        setProducts([]); setLastDoc(null); setHasMore(false); fetchTabCounts();
    } catch (e) { alert("Erro ao limpar: " + e.message); } finally { setImporting(false); }
  };

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
                        <img src={selectedProduct.imageUrl} alt="" className={styles.bigImage} onError={(e) => { e.target.style.display = 'none'; e.target.nextElementSibling.style.display = 'flex'; }} />
                    ) : null}
                    <div style={{display: selectedProduct.imageUrl ? 'none' : 'flex', flexDirection:'column', alignItems:'center', color:'#cbd5e1', width:'100%', height:'100%', justifyContent:'center'}}>
                        <ImageIcon size={100} /><p>Sem imagem no Banco</p>
                    </div>
                </div>
                <div className={styles.infoSection}>
                    
                    <div className={styles.infoCard}>
                        <div className={styles.infoLabel}>Preço Líquido Unitário</div>
                        <div className={styles.priceValue}>
                            {calculateFinalPrice(selectedProduct).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </div>
                        
                        <div style={{marginTop: '1.2rem', padding: '12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize:'0.85rem', color:'#475569'}}>
                            <div style={{display:'flex', alignItems:'center', gap:6, marginBottom:'8px', fontWeight:600, color:'#1e293b'}}>
                                <Info size={14} color="#233ae0" /> Auditoria de Rota e Descontos
                            </div>
                            <div style={{lineHeight:'1.6'}}>
                                <strong>Rota Atual:</strong> {expedicao} ➔ {uf} ({freteType})<br/>
                                
                                {selectedProduct.prices && selectedProduct.prices[expedicao] && selectedProduct.prices[expedicao][uf] ? (
                                    <>
                                        <strong>FOB Tabela:</strong> {selectedProduct.prices[expedicao][uf].fob?.toLocaleString('pt-BR', {style:'currency', currency:'BRL'}) || 'R$ 0,00'}<br/>
                                        <strong>CIF Tabela:</strong> {selectedProduct.prices[expedicao][uf].cif?.toLocaleString('pt-BR', {style:'currency', currency:'BRL'}) || 'R$ 0,00'}<br/>
                                    </>
                                ) : (
                                    <span style={{color: '#ef4444', display:'block'}}>❌ Valores FOB/CIF não encontrados.</span>
                                )}
                                
                                {freteType === 'CIF' && (
                                    <div style={{marginTop:'6px', paddingTop:'6px', borderTop:'1px dashed #cbd5e1'}}>
                                        <strong>% Desc. Logístico:</strong> {((logisticsMap[`${expedicao}${uf}${selectedProduct.sector || 'OUTROS'}${tipoCarga}`.toUpperCase().replace(/\s/g, '')] || 0) * 100).toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}% <br/>
                                        <span style={{fontSize:'0.7rem', color:'#94a3b8'}}>Setor: {selectedProduct.sector || 'N/A'}</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {selectedProduct.prices && Object.keys(selectedProduct.prices).length > 0 && (
                            <div style={{marginTop:'1rem', maxHeight:'200px', overflowY:'auto', background:'#fff', padding:'12px', border:'1px solid #e2e8f0', borderRadius:'8px', fontSize:'0.8rem'}}>
                                <div style={{display:'flex', alignItems:'center', gap:6, marginBottom:10, fontWeight:600, color:'#1e293b'}}>
                                    <Database size={14} color="#10b981"/> Rotas Importadas (Clique para Simular!)
                                </div>
                                {Object.entries(selectedProduct.prices).map(([expKey, ufs]) => (
                                    <div key={expKey} style={{marginBottom:10}}>
                                        <strong style={{color:'#64748b', display:'block', marginBottom:6, textTransform:'uppercase', fontSize:'0.75rem'}}>Saída de {expKey}:</strong>
                                        <div style={{display:'flex', flexWrap:'wrap', gap:'6px'}}>
                                        {Object.keys(ufs).sort().map((ufKey) => {
                                            const isActive = (uf === ufKey && expedicao === expKey);
                                            return (
                                                <button 
                                                    key={ufKey} 
                                                    onClick={() => { setUf(ufKey); setExpedicao(expKey); }}
                                                    style={{
                                                        background: isActive ? '#233ae0' : '#f1f5f9',
                                                        color: isActive ? 'white' : '#475569',
                                                        padding:'4px 8px', borderRadius:'6px', border:'1px solid transparent', 
                                                        cursor:'pointer', fontSize:'0.75rem', fontWeight:'600', transition:'all 0.2s',
                                                        borderColor: isActive ? '#233ae0' : '#cbd5e1'
                                                    }}
                                                    title={`Simular frete para ${ufKey} saindo de ${expKey}`}
                                                >
                                                    {ufKey}
                                                </button>
                                            )
                                        })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className={styles.infoCard}>
                        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom: '1px solid #e2e8f0', paddingBottom:'0.8rem', marginBottom:'0.8rem'}}>
                            <div style={{display:'flex', alignItems:'center', gap:6, fontWeight:600, color:'#1e293b'}}>
                                <Package size={16} color="#475569"/> Ficha Técnica e Logística
                            </div>
                            
                            <div style={{display: 'flex', gap: '4px', background: '#f1f5f9', padding: '4px', borderRadius: '8px'}}>
                                {['mm', 'cm', 'm'].map(u => (
                                    <button
                                        key={u}
                                        onClick={() => setDimUnit(u)}
                                        style={{
                                            padding: '4px 12px', fontSize: '0.75rem', fontWeight: 600, borderRadius: '6px',
                                            border: 'none', cursor: 'pointer', transition: 'all 0.2s',
                                            background: dimUnit === u ? '#233ae0' : 'transparent',
                                            color: dimUnit === u ? '#fff' : '#64748b',
                                            boxShadow: dimUnit === u ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                                        }}
                                    >
                                        {u}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {selectedProduct.dimensions ? (
                            <>
                                <div style={{display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:'0.6rem', marginBottom:'1rem'}}>
                                    <div style={{background:'#f8fafc', padding:'10px', borderRadius:'8px', border:'1px solid #f1f5f9'}}>
                                        <span style={{fontSize:'0.7rem', color:'#64748b', display:'flex', alignItems:'center', gap:4}}><Ruler size={12}/> Comprimento</span>
                                        <strong style={{fontSize:'1.1rem', color:'#0f172a', display:'block', marginTop:4}}>{formatDim(selectedProduct.dimensions.length)}</strong>
                                    </div>
                                    <div style={{background:'#f8fafc', padding:'10px', borderRadius:'8px', border:'1px solid #f1f5f9'}}>
                                        <span style={{fontSize:'0.7rem', color:'#64748b', display:'flex', alignItems:'center', gap:4}}><Ruler size={12}/> Largura</span>
                                        <strong style={{fontSize:'1.1rem', color:'#0f172a', display:'block', marginTop:4}}>{formatDim(selectedProduct.dimensions.width)}</strong>
                                    </div>
                                    <div style={{background:'#f8fafc', padding:'10px', borderRadius:'8px', border:'1px solid #f1f5f9'}}>
                                        <span style={{fontSize:'0.7rem', color:'#64748b', display:'flex', alignItems:'center', gap:4}}><Ruler size={12}/> Altura</span>
                                        <strong style={{fontSize:'1.1rem', color:'#0f172a', display:'block', marginTop:4}}>{formatDim(selectedProduct.dimensions.height)}</strong>
                                    </div>

                                    <div style={{background:'#f8fafc', padding:'10px', borderRadius:'8px', border:'1px solid #f1f5f9'}}>
                                        <span style={{fontSize:'0.7rem', color:'#64748b', display:'flex', alignItems:'center', gap:4}}><Weight size={12}/> Peso Bruto</span>
                                        <strong style={{fontSize:'1.1rem', color:'#0f172a', display:'block', marginTop:4}}>{formatKg(selectedProduct.dimensions.weightBruto)}</strong>
                                    </div>
                                    <div style={{background:'#f8fafc', padding:'10px', borderRadius:'8px', border:'1px solid #f1f5f9'}}>
                                        <span style={{fontSize:'0.7rem', color:'#64748b', display:'flex', alignItems:'center', gap:4}}><Weight size={12}/> Peso Líq</span>
                                        <strong style={{fontSize:'1.1rem', color:'#0f172a', display:'block', marginTop:4}}>{formatKg(selectedProduct.dimensions.weightLiq)}</strong>
                                    </div>
                                    <div style={{background:'#f8fafc', padding:'10px', borderRadius:'8px', border:'1px solid #f1f5f9'}}>
                                        <span style={{fontSize:'0.7rem', color:'#64748b', display:'flex', alignItems:'center', gap:4}}><Box size={12}/> Volume</span>
                                        <strong style={{fontSize:'1.1rem', color:'#0f172a', display:'block', marginTop:4}}>{formatVol(selectedProduct.dimensions.volume)}</strong>
                                    </div>
                                </div>
                                
                                <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.8rem', fontSize:'0.85rem', background:'#f1f5f9', padding:'12px', borderRadius:'8px'}}>
                                    <div><span style={{color:'#64748b', display:'block', fontSize:'0.75rem'}}>KG³</span><strong style={{color:'#1e293b'}}>{formatKg(selectedProduct.dimensions.kg3)}</strong></div>
                                    <div><span style={{color:'#64748b', display:'block', fontSize:'0.75rem'}}>Hierarquia</span><strong style={{color:'#1e293b'}}>{selectedProduct.dimensions.hierarquia}</strong></div>
                                    <div><span style={{color:'#64748b', display:'block', fontSize:'0.75rem'}}>Status Linha</span><strong style={{color:'#1e293b'}}>{selectedProduct.dimensions.statusLinha}</strong></div>
                                    <div><span style={{color:'#64748b', display:'block', fontSize:'0.75rem'}}>Status SKU</span><strong style={{color:'#1e293b'}}>{selectedProduct.dimensions.statusSku}</strong></div>
                                    <div><span style={{color:'#64748b', display:'block', fontSize:'0.75rem'}}>Classificação</span><strong style={{color:'#1e293b'}}>{selectedProduct.dimensions.classificacao}</strong></div>
                                    <div><span style={{color:'#64748b', display:'block', fontSize:'0.75rem'}}>Tipo Material</span><strong style={{color:'#1e293b'}}>{selectedProduct.dimensions.tipoMat}</strong></div>
                                </div>
                            </>
                        ) : (
                            <div style={{fontSize:'0.85rem', color:'#94a3b8', padding:'1rem', textAlign:'center', background:'#f8fafc', borderRadius:'8px'}}>
                                Dados da aba zppq001 não encontrados.
                            </div>
                        )}
                    </div>

                </div>
            </div>
        </div>
      ) : (
        <div className={styles.contentWrapper}>
            <aside className={styles.sidebar}>
                <div style={{padding:'1rem', backgroundColor:'#eff6ff', borderBottom:'1px solid #dbeafe'}}>
                    <div style={{display:'flex', alignItems:'center', gap:'0.5rem', marginBottom:'0.8rem', color:'#1e40af'}}>
                        <Calculator size={18} /> <h3 style={{margin:0, fontSize:'0.9rem', fontWeight:700}}>Simulador de Custos</h3>
                    </div>

                    <div className={styles.pricingGroup} style={{marginBottom:'0.5rem'}}>
                        <label className={styles.pricingLabel}>Expedição</label>
                        <select className={styles.pricingSelect} value={expedicao} onChange={e => setExpedicao(e.target.value)} style={{width:'100%'}}>
                            <option value="UBÁ">UBÁ</option>
                            <option value="ATC-TO">ATC-TO</option>
                            <option value="SOO">SOO</option>
                        </select>
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
                        <label className={styles.pricingLabel}>Tipo de Carga</label>
                        <select className={styles.pricingSelect} value={tipoCarga} onChange={e => setTipoCarga(e.target.value)} style={{width:'100%'}}>
                            <option value="Fracionado">Fracionado</option>
                            <option value="Truck">Truck</option>
                            <option value="Carreta">Carreta</option>
                            <option value="O próprio">O próprio</option>
                        </select>
                    </div>
                    <div className={styles.pricingGroup} style={{marginBottom:'0.5rem'}}>
                        <label className={styles.pricingLabel}>Prazo Médio</label>
                        <select className={styles.pricingSelect} value={paymentTerm} onChange={e => setPaymentTerm(e.target.value)} style={{width:'100%'}}>
                            <option value="0.1360">0 Dias - 13,60%</option>
                            <option value="0.1287">15 Dias - 12,87%</option>
                            <option value="0.1262">20 Dias - 12,62%</option>
                            <option value="0.1250">22 Dias - 12,50%</option>
                            <option value="0.1223">28 Dias - 12,23%</option>
                            <option value="0.1213">30 Dias - 12,13%</option>
                            <option value="0.1176">37 Dias - 11,76%</option>
                            <option value="0.1154">42 Dias - 11,54%</option>
                            <option value="0.1140">45 Dias - 11,40%</option>
                            <option value="0.1127">47 Dias - 11,27%</option>
                            <option value="0.1103">55 Dias - 11,03%</option>
                            <option value="0.1066">60 Dias - 10,66%</option>
                            <option value="0.1042">65 Dias - 10,42%</option>
                            <option value="0.1017">70 Dias - 10,17%</option>
                            <option value="0.0993">75 Dias - 9,93%</option>
                            <option value="0.0956">82 Dias - 9,56%</option>
                            <option value="0.0919">90 Dias - 9,19%</option>
                            <option value="0.0883">97 Dias - 8,83%</option>
                            <option value="0.0870">100 Dias - 8,70%</option>
                            <option value="0.0821">110 Dias - 8,21%</option>
                            <option value="0.0772">120 Dias - 7,72%</option>
                            <option value="0.0626">150 Dias - 6,26%</option>
                            <option value="0.0479">180 Dias - 4,79%</option>
                            <option value="0.0919">30/300 Dias - 9,19%</option>
                        </select>
                    </div>
                    <div className={styles.pricingGroup}>
                        <label className={styles.pricingLabel}>Classif. Cliente</label>
                        <select className={styles.pricingSelect} value={clientTier} onChange={e => setClientTier(e.target.value)} style={{width:'100%'}}>
                            <option value="0">Padrão</option>
                            <option value="0.09">Ouro (9%)</option>
                            <option value="0.12">Diamante (12%)</option>
                            <option value="0.09">E-commerce (9%)</option>
                        </select>
                    </div>
                </div>

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
                    {fixedTabs.map(tab => (
                        <button 
                            key={tab} 
                            className={`${styles.tabItem} ${activeTab === tab ? styles.active : ''}`} 
                            onClick={() => { setActiveTab(tab); setSelectedBrands([]); }}
                        >
                            {tab} {tabCounts[tab] !== undefined ? <span style={{fontSize:'0.75rem', opacity:0.7, marginLeft:4}}>({tabCounts[tab]})</span> : ''}
                        </button>
                    ))}
                </div>

                <div className={styles.toolbar}>
                    <div className={styles.searchContainer}>
                        <Search size={18} className={styles.searchIcon} />
                        <input type="text" placeholder="Buscar por SKU ou Descrição..." value={rawSearchTerm} onChange={e => setRawSearchTerm(e.target.value)} className={styles.searchInput} />
                    </div>
                    {isAdmin && (
                        <div className={styles.actionsGroup}>
                            <input id="prodInput" type="file" accept=".xlsx" ref={fileInputRef} style={{ display: 'none' }} onChange={processUnifiedExcel} />
                            <input id="imgInput" type="file" accept="image/*" webkitdirectory="true" multiple ref={imageInputRef} style={{ display: 'none' }} onChange={processImages} />
                            
                            <button onClick={handleClearBase} className={styles.btnDanger} title="Limpar Base"><Trash2 size={18} /></button>

                            <button onClick={handleImageUploadClick} className={styles.btnIcon} disabled={uploadingImages} title="Upload de Pasta de Fotos">
                                {uploadingImages ? <Loader2 size={18} className="spin" /> : <ImageIcon size={18} />}
                            </button>
                            
                            <button onClick={handleImportClick} className={styles.btnSuccess} disabled={importing} title="Importar Tabela Completa">
                                {importing ? <Loader2 size={18} className="spin" /> : <Upload size={18} />} Importar Mestra
                            </button>
                        </div>
                    )}
                </div>

                <div className={styles.tableWrapper}>
                    <table className={styles.dataTable}>
                        <thead>
                            <tr>
                                <th style={{ width: '60px' }}>Img</th>
                                <th style={{ width: '100px' }}>SKU</th>
                                <th>Descrição</th>
                                <th>Linha</th>
                                {activeTab === 'Todos' && <th>Grupo</th>}
                                <th style={{ width: '80px', textAlign: 'center' }}>Estoque</th>
                                <th style={{ width: '130px', textAlign: 'right' }}>Preço Calc.</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? ( <tr><td colSpan="7" className={styles.emptyState}><Loader2 className="spin" /> Carregando...</td></tr> ) : 
                            products.map((product) => {
                                const finalPrice = calculateFinalPrice(product);
                                return (
                                <tr key={product.id} onClick={() => setSelectedProduct(product)} className={styles.tableRow}>
                                    <td style={{ textAlign: 'center' }}>
                                        <div style={{position: 'relative', width: 40, height: 40, margin: '0 auto'}}>
                                            {product.imageUrl ? (
                                                <>
                                                    <img src={product.imageUrl} alt="" className={styles.imgThumbnail} onError={(e) => { e.target.style.display = 'none'; e.target.nextElementSibling.style.display = 'flex'; }} />
                                                    <div className={styles.imgPlaceholder} style={{display:'none', position:'absolute', top:0, left:0}}><ImageIcon size={14} /></div>
                                                </>
                                            ) : <div className={styles.imgPlaceholder}><ImageIcon size={14} /></div>}
                                        </div>
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