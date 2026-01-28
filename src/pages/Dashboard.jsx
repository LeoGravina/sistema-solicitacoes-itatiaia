import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, deleteDoc, limit } from 'firebase/firestore';
import { db, appId } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import { generateAndDownloadCSV } from '../utils/exportHelpers';
import { logAction } from '../utils/logger';
import Header from '../components/Header';
import { 
  FileSpreadsheet, CheckSquare, Square, Plus, LayoutGrid, CheckCircle2, 
  AlertCircle, CalendarClock, CalendarDays, X, Download, Trash2, Search, 
  Pencil, ChevronDown, AlertTriangle, HelpCircle, FileText 
} from 'lucide-react'; 
import { useNavigate } from 'react-router-dom';
import Footer from '../components/Footer';

const COLLECTION_NAME = 'cota_requests';
const ITEMS_PER_PAGE = 10;

export default function Dashboard() {
  const [requests, setRequests] = useState([]);
  const [filter, setFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  
  const [selectedRequest, setSelectedRequest] = useState(null); 
  const [deleteConfirmationId, setDeleteConfirmationId] = useState(null); 
  const [statusConfirmation, setStatusConfirmation] = useState(null); 

  const [itemsLimit, setItemsLimit] = useState(ITEMS_PER_PAGE);
  const [hasMore, setHasMore] = useState(true);

  const { userData, currentUser } = useAuth();
  const navigate = useNavigate();
  const isAdmin = userData?.role === 'admin';

  useEffect(() => {
    const q = query(
      collection(db, 'artifacts', appId, 'public', 'data', COLLECTION_NAME),
      orderBy('createdAt', 'desc'),
      limit(itemsLimit)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setRequests(data);
      setHasMore(data.length >= itemsLimit);
    });
    return () => unsubscribe();
  }, [itemsLimit]);

  const loadMore = () => setItemsLimit(prev => prev + 10);

  const handleStatusClick = (e, id, currentStatus) => {
    e.stopPropagation(); 
    if (!isAdmin) return;
    setStatusConfirmation({ id, currentStatus });
  };

  const confirmStatusChange = async () => {
    if (!statusConfirmation) return;
    
    const { id, currentStatus } = statusConfirmation;
    const newStatus = currentStatus === 'completed' ? 'pending' : 'completed';
    
    try {
      const docRef = doc(db, 'artifacts', appId, 'public', 'data', COLLECTION_NAME, id);
      await updateDoc(docRef, { status: newStatus });
      await logAction(userData, 'UPDATE_STATUS', id, `Status alterado para ${newStatus}`);
    } catch (error) {
      console.error("Erro ao mudar status", error);
    } finally {
      setStatusConfirmation(null); 
    }
  };

  const onRequestDelete = (id) => setDeleteConfirmationId(id);
  
  const confirmDelete = async () => {
    if (!deleteConfirmationId) return;
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', COLLECTION_NAME, deleteConfirmationId));
      await logAction(userData || { uid: currentUser.uid }, 'DELETE', deleteConfirmationId, 'Excluído via Dashboard');
      setDeleteConfirmationId(null);
      if (selectedRequest?.id === deleteConfirmationId) setSelectedRequest(null);
    } catch (error) {
      alert("Erro ao excluir.");
    }
  };

  const handleEdit = (id) => navigate(`/editar/${id}`);
  
  // --- EXPORTAÇÃO FILTRADA ---
  const handleExportAll = (e) => { 
    e.stopPropagation(); 
    
    // Filtra: Pega tudo que NÃO está completado (Status !== 'completed')
    const pendingRequests = filteredRequests.filter(req => req.status !== 'completed');
    
    if (pendingRequests.length === 0) {
        alert("Não há solicitações pendentes para exportar.");
        return;
    }

    generateAndDownloadCSV(pendingRequests); 
  };

  const handleExportSingle = (req) => { generateAndDownloadCSV([req]); if(isAdmin) logAction(userData, 'EXPORT_CSV', req.id, 'Download individual'); };
  const handleKpiClick = (clickedFilter) => setFilter(filter === clickedFilter ? 'all' : clickedFilter);

  const stats = {
    total: requests.length,
    completed: requests.filter(r => r.status === 'completed').length,
    pending: requests.filter(r => r.status !== 'completed').length
  };

  const filteredRequests = requests.filter(req => {
    const matchesStatus = filter === 'all' ? true : filter === 'completed' ? req.status === 'completed' : req.status !== 'completed';
    const lowerSearch = searchTerm.toLowerCase();
    const matchesSearch = req.requester.toLowerCase().includes(lowerSearch) || (req.items && req.items.some(item => item.sku.toLowerCase().includes(lowerSearch)));
    return matchesStatus && matchesSearch;
  });

  const formatDate = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp.seconds * 1000);
    return date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };
  
  const formatReleaseDate = (dateString) => {
    if (!dateString) return 'N/A';
    const [year, month] = dateString.split('-');
    return `${month}/${year}`;
  };

  const isSelectedOwner = selectedRequest && currentUser && selectedRequest.requesterUid === currentUser.uid;

  return (
    <div className="app-container">
      <Header />
      <main className="main-content">
        
        <div className="kpi-grid">
           <div className={`kpi-card blue ${filter === 'all' ? 'active' : ''}`} onClick={() => handleKpiClick('all')}>
            <div className="kpi-icon"><LayoutGrid size={24} /></div>
            <div className="kpi-info"><h3>{stats.total}</h3><p>Total de Solicitações</p></div>
          </div>
          <div className={`kpi-card green ${filter === 'completed' ? 'active' : ''}`} onClick={() => handleKpiClick('completed')}>
            <div className="kpi-icon"><CheckCircle2 size={24} /></div>
            <div className="kpi-info"><h3>{stats.completed}</h3><p>Solicitações Atendidas</p></div>
          </div>
          <div className={`kpi-card red ${filter === 'pending' ? 'active' : ''}`} onClick={() => handleKpiClick('pending')}>
            <div className="kpi-icon"><AlertCircle size={24} /></div>
            <div className="kpi-info"><h3>{stats.pending}</h3><p>Solicitações em Aberto</p></div>
          </div>
        </div>

        <div className="dashboard-actions-row">
           <div className="search-box">
             <Search size={20} className="search-icon" />
             <input type="text" placeholder="Buscar por nome ou SKU..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
           </div>
           <div className="action-buttons">
             <button onClick={() => navigate('/nova-solicitacao')} className="btn btn-primary"><Plus size={18} /> Nova Solicitação</button>
             {isAdmin && <button onClick={handleExportAll} className="btn btn-outline"><FileSpreadsheet size={18} /> Exportar Lista</button>}
           </div>
        </div>

        <div className="request-list">
          {filteredRequests.map((req) => (
            <div key={req.id} className={`request-card ${req.status === 'completed' ? 'completed' : ''}`} onClick={() => setSelectedRequest(req)}>
              <div className="req-main-content">
                <div className="req-header-row">
                   <strong>{req.requester}</strong>
                   <span className="req-timestamp"><CalendarClock size={14} /> {formatDate(req.createdAt)}</span>
                </div>
                <div className="req-details-col">
                   <div className="req-release">
                      <CalendarDays size={14} className="icon-gray" />
                      <span>Liberação: <strong>{formatReleaseDate(req.releaseDate)}</strong></span>
                   </div>
                   <span className="item-count">{req.items?.length || 0} itens</span>
                </div>
              </div>
              
              <div className="req-status" onClick={(e) => e.stopPropagation()}>
                {isAdmin ? (
                  <button className="btn-check" onClick={(e) => handleStatusClick(e, req.id, req.status)} title="Alterar Status">
                    {req.status === 'completed' ? <CheckSquare size={32} color="#16a34a" /> : <Square size={32} color="#d1d5db" />}
                  </button>
                ) : (
                  <div title="Status">{req.status === 'completed' ? <CheckSquare size={32} color="#16a34a" /> : <Square size={32} color="#d1d5db" />}</div>
                )}
              </div>
            </div>
          ))}
          {filteredRequests.length === 0 && <div className="empty-state"><p>Nenhuma solicitação encontrada.</p></div>}
          {hasMore && filteredRequests.length > 0 && <button onClick={loadMore} className="btn-load-more"><ChevronDown size={16} /> Carregar mais</button>}
        </div>
      </main>

      <Footer />

      {selectedRequest && (
        <div className="modal-overlay" onClick={() => setSelectedRequest(null)}>
          <div className="modal-content-large" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Detalhes da Solicitação</h3>
              <button className="btn-close" onClick={() => setSelectedRequest(null)}><X size={24} /></button>
            </div>
            <div className="modal-body">
                <div className="detail-grid">
                  <div className="detail-item"><label>Solicitante</label><p>{selectedRequest.requester}</p></div>
                  <div className="detail-item"><label>Criado em</label><p>{formatDate(selectedRequest.createdAt)}</p></div>
                  <div className="detail-item"><label>Liberação</label><p>{formatReleaseDate(selectedRequest.releaseDate)}</p></div>
                  <div className="detail-item"><label>Status</label><span className={`status-badge-text ${selectedRequest.status}`}>{selectedRequest.status === 'completed' ? 'Finalizado' : 'Em Aberto'}</span></div>
                </div>

                {selectedRequest.reason && (
                    <div style={{ marginBottom: '1.5rem', background: '#f0f9ff', padding: '1rem', borderRadius: '8px', border: '1px solid #bae6fd' }}>
                        <label style={{ fontSize: '0.75rem', color: '#0284c7', fontWeight: '700', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <FileText size={14} /> Motivo da Solicitação
                        </label>
                        <p style={{ margin: '5px 0 0', color: '#0c4a6e', fontSize: '0.95rem' }}>{selectedRequest.reason}</p>
                    </div>
                )}

                <div className="items-table-wrapper">
                  <table className="items-table">
                    <thead><tr><th>#</th><th>SKU / Produto</th><th className="text-right">Qtd</th></tr></thead>
                    <tbody>
                      {selectedRequest.items?.map((item, idx) => (
                        <tr key={idx}><td>{idx + 1}</td><td className="uppercase">{item.sku}</td><td className="text-right">{item.qtd}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
            </div>
            <div className="modal-footer-modern">
               <div className="footer-group-left">
                 {(isAdmin || (isSelectedOwner && selectedRequest.status !== 'completed')) && (
                   <button className="btn-text-danger" onClick={() => onRequestDelete(selectedRequest.id)}>
                     <Trash2 size={18} /> Excluir
                   </button>
                 )}
                 {isSelectedOwner && selectedRequest.status !== 'completed' && (
                   <button className="btn btn-primary" onClick={() => handleEdit(selectedRequest.id)}>
                     <Pencil size={18} /> Editar
                   </button>
                 )}
               </div>
               <div className="footer-group-right">
                 {isAdmin && (
                   <button className="btn btn-outline" onClick={() => handleExportSingle(selectedRequest)}>
                     <Download size={18} /> Baixar CSV
                   </button>
                 )}
               </div>
            </div>
          </div>
        </div>
      )}

      {deleteConfirmationId && (
        <div className="modal-overlay-top">
          <div className="modal-confirmation">
            <div style={{ marginBottom: '1rem' }}><AlertTriangle size={48} color="#ef4444" style={{margin:'0 auto'}} /></div>
            <h3>Excluir Solicitação?</h3>
            <p>Você está prestes a excluir permanentemente este registro. Essa ação não pode ser desfeita.</p>
            <div className="confirmation-actions">
              <button className="btn-cancel" onClick={() => setDeleteConfirmationId(null)}>Cancelar</button>
              <button className="btn-confirm-danger" onClick={confirmDelete}>Sim, Excluir</button>
            </div>
          </div>
        </div>
      )}

      {statusConfirmation && (
        <div className="modal-overlay-top">
          <div className="modal-confirmation">
            <div style={{ marginBottom: '1rem' }}><HelpCircle size={48} color="#233ae0" style={{margin:'0 auto'}} /></div>
            <h3>
              {statusConfirmation.currentStatus === 'completed' ? 'Reabrir Solicitação?' : 'Finalizar Solicitação?'}
            </h3>
            <p>
              {statusConfirmation.currentStatus === 'completed' 
                ? 'A solicitação voltará para o status "Em Aberto" e aparecerá como pendência.' 
                : 'A solicitação será marcada como atendida e sairá das pendências.'}
            </p>
            <div className="confirmation-actions">
              <button className="btn-cancel" onClick={() => setStatusConfirmation(null)}>Cancelar</button>
              <button className="btn-confirm-primary" onClick={confirmStatusChange}>Confirmar</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}