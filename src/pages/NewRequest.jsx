import React, { useState, useEffect } from 'react';
import { collection, addDoc, serverTimestamp, doc, getDoc, updateDoc } from 'firebase/firestore'; // Importei updateDoc e getDoc
import { db, appId } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import { Plus, Trash2, Save, User, Calendar, ArrowLeft, Loader2 } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom'; // Importei useParams
import Header from '../components/Header';
import Toast from '../components/Toast';
import { logAction } from '../utils/logger';

const COLLECTION_NAME = 'cota_requests';

export default function NewRequest() {
  const { userData, currentUser } = useAuth();
  const navigate = useNavigate();
  const { id } = useParams(); // Pega o ID da URL se for edição
  
  // Estado para saber se é modo edição
  const isEditing = !!id;

  const requesterName = userData?.name || '';
  
  const [releaseDate, setReleaseDate] = useState('');
  const [items, setItems] = useState([{ sku: '', qtd: '' }]);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(isEditing); // Loading inicial pra buscar dados
  const [notification, setNotification] = useState(null);

  // --- EFEITO: BUSCAR DADOS SE FOR EDIÇÃO ---
  useEffect(() => {
    if (isEditing) {
      const fetchData = async () => {
        try {
          const docRef = doc(db, 'artifacts', appId, 'public', 'data', COLLECTION_NAME, id);
          const docSnap = await getDoc(docRef);
          
          if (docSnap.exists()) {
            const data = docSnap.data();
            // Verifica segurança: só o dono pode editar
            if (data.requesterUid !== currentUser.uid) {
              alert("Você não tem permissão para editar esta solicitação.");
              navigate('/');
              return;
            }
            setReleaseDate(data.releaseDate);
            setItems(data.items);
          } else {
            alert("Solicitação não encontrada.");
            navigate('/');
          }
        } catch (error) {
          console.error("Erro ao buscar:", error);
        } finally {
          setInitialLoading(false);
        }
      };
      fetchData();
    }
  }, [id, isEditing, navigate, currentUser.uid]);

  // Foco automático (apenas se não estiver carregando dados)
  useEffect(() => {
    if (!initialLoading && items.length > 1) {
      const lastIndex = items.length - 1;
      const element = document.getElementById(`sku-${lastIndex}`);
      if (element) element.focus();
    }
  }, [items.length, initialLoading]);

  const handleAddItem = () => setItems([...items, { sku: '', qtd: '' }]);

  const handleRemoveItem = (index) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
    }
  };

  const handleItemChange = (index, field, value) => {
    const newItems = [...items];
    newItems[index][field] = value;
    setItems(newItems);
  };

  const showNotification = (type, message) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4000);
  };

  const handleSave = async () => {

    

    if (!releaseDate) {
      showNotification('error', 'Por favor, informe a data de liberação.');
      return;
    }

    const validItems = items.filter(i => i.sku.trim() !== '' && i.qtd !== '');
    if (validItems.length === 0) {
      showNotification('error', 'Preencha pelo menos um item.');
      return;
    }

    setLoading(true);
    try {
      if (isEditing) {
        const docRef = doc(db, 'artifacts', appId, 'public', 'data', COLLECTION_NAME, id);
        await updateDoc(docRef, {
          releaseDate: releaseDate,
          items: validItems,
        });
        
        // --- LOG ---
        await logAction(userData, 'UPDATE_REQUEST', id, 'Solicitação editada');
        
        showNotification('success', 'Solicitação atualizada com sucesso!');
      } else {
        const docRef = await addDoc(collection(db, 'artifacts', appId, 'public', 'data', COLLECTION_NAME), {
          requester: requesterName,
          requesterUid: currentUser.uid,
          releaseDate: releaseDate,
          items: validItems,
          status: 'pending',
          createdAt: serverTimestamp(),
        });
        
        // --- LOG ---
        await logAction(userData, 'CREATE_REQUEST', docRef.id, 'Nova solicitação criada');
        
        showNotification('success', 'Solicitação criada com sucesso!');
      }
      
      setTimeout(() => navigate('/'), 1500);
      
    } catch (error) {
      console.error(error);
      showNotification('error', 'Erro ao salvar.');
    } finally {
      setLoading(false);
    }
  };

  if (initialLoading) {
    return (
        <div className="app-container" style={{justifyContent:'center', alignItems:'center'}}>
            <Loader2 className="spin" size={48} color="#0047AB" />
        </div>
    );
  }

  return (
    <div className="app-container">
      <Header />
      <main className="main-content">
      <div className="scroll-wrapper">
        <div className="card">
          <div className="card-header-simple">
            <div style={{display:'flex', alignItems:'center', gap: '10px'}}>
              <button onClick={() => navigate('/')} className="btn-icon-white"><ArrowLeft /></button>
              <h2>{isEditing ? 'Editar Solicitação' : 'Nova Solicitação'}</h2>
            </div>
          </div>

          <div className="card-body">
            <div className="form-row">
              <div className="form-group flex-grow">
                <label><User size={16} className="icon-blue" /> Solicitante</label>
                <input type="text" value={requesterName} disabled className="input-field disabled-input" />
              </div>

              <div className="form-group date-group">
                <label><Calendar size={16} className="icon-blue" /> Data Liberação *</label>
                <input type="date" value={releaseDate} onChange={(e) => setReleaseDate(e.target.value)} className="input-field" />
              </div>
            </div>

            <div className="table-container">
               <div className="table-rows scrollable-area">
                <div className="row-header">
                  <div className="col-num">#</div>
                  <div className="col-sku">SKU / PRODUTO</div>
                  <div className="col-qtd">QTD</div>
                  <div className="col-action"></div>
                </div>

                {items.map((item, index) => (
                  <div key={index} className="row-item">
                    <div className="col-num">{index + 1}</div>
                    <div className="col-sku">
                      <input
                        id={`sku-${index}`}
                        type="text"
                        value={item.sku}
                        onChange={(e) => handleItemChange(index, 'sku', e.target.value)}
                        placeholder="CÓDIGO SKU"
                        className="input-field input-sm uppercase"
                      />
                    </div>
                    <div className="col-qtd">
                      <input
                        type="number"
                        value={item.qtd}
                        onChange={(e) => handleItemChange(index, 'qtd', e.target.value)}
                        placeholder="0"
                        className="input-field input-sm text-center"
                      />
                    </div>
                    <div className="col-action">
                      <button onClick={() => handleRemoveItem(index)} disabled={items.length === 1} className="btn-icon">
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="add-row-area">
                <button onClick={handleAddItem} className="btn-add"><Plus size={18} /> Adicionar item</button>
              </div>
            </div>

            <div className="form-actions">
              <button onClick={handleSave} disabled={loading} className="btn btn-primary">
                {loading ? <Loader2 className="spin" size={20} /> : <Save size={20} />}
                {loading ? 'Salvando...' : isEditing ? 'Atualizar Solicitação' : 'Salvar Requisição'}
              </button>
            </div>
          </div>
        </div>
        </div>
      </main>
      {notification && <Toast type={notification.type} message={notification.message} />}
    </div>
  );
}