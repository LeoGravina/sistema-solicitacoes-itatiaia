import React, { useState, useEffect } from 'react';
import { collection, addDoc, serverTimestamp, doc, getDoc, updateDoc } from 'firebase/firestore';
import { db, appId } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import { Plus, Trash2, Save, User, Calendar, ArrowLeft, Loader2, FileText } from 'lucide-react'; 
import { useNavigate, useParams } from 'react-router-dom';
import Header from '../components/Header';
import Toast from '../components/Toast';
import { logAction } from '../utils/logger';
import Footer from '../components/Footer';

const COLLECTION_NAME = 'cota_requests';

export default function NewRequest() {
  const { userData, currentUser } = useAuth();
  const navigate = useNavigate();
  const { id } = useParams();
  
  const isEditing = !!id;
  const requesterName = userData?.name || '';
  
  const [releaseDate, setReleaseDate] = useState('');
  const [reason, setReason] = useState('');
  const [items, setItems] = useState([{ sku: '', qtd: '' }]);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(isEditing);
  const [notification, setNotification] = useState(null);

  useEffect(() => {
    if (isEditing) {
      const fetchData = async () => {
        try {
          const docRef = doc(db, 'artifacts', appId, 'public', 'data', COLLECTION_NAME, id);
          const docSnap = await getDoc(docRef);
          
          if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.requesterUid !== currentUser.uid) {
              alert("Você não tem permissão para editar esta solicitação.");
              navigate('/');
              return;
            }
            setReleaseDate(data.releaseDate);
            setReason(data.reason || '');
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
    if (field === 'sku') {
        value = value.toUpperCase().replace(/\s/g, '');
    }
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

    if (!reason.trim()) {
      showNotification('error', 'Por favor, informe o motivo da solicitação.');
      return;
    }

    const validItems = items.filter(i => i.sku.trim() !== '' && i.qtd !== '');
    if (validItems.length === 0) {
      showNotification('error', 'Preencha pelo menos um item.');
      return;
    }

    const invalidSku = validItems.find(item => item.sku.length !== 10 && item.sku.length !== 11);
    if (invalidSku) {
        showNotification('error', `SKU inválido: ${invalidSku.sku}. O SKU deve ter 10 ou 11 dígitos.`);
        return;
    }

    setLoading(true);
    try {
      const payload = {
        requester: requesterName,
        requesterUid: currentUser.uid,
        releaseDate: releaseDate,
        reason: reason,
        items: validItems,
        status: isEditing ? undefined : 'pending',
        updatedAt: serverTimestamp()
      };

      if (!isEditing) {
          payload.createdAt = serverTimestamp();
          payload.status = 'pending';
      }

      if (isEditing) {
        const docRef = doc(db, 'artifacts', appId, 'public', 'data', COLLECTION_NAME, id);
        if (payload.status === undefined) delete payload.status;
        
        await updateDoc(docRef, payload);
        await logAction(userData, 'UPDATE_REQUEST', id, 'Solicitação editada');
        showNotification('success', 'Solicitação atualizada com sucesso!');
      } else {
        const docRef = await addDoc(collection(db, 'artifacts', appId, 'public', 'data', COLLECTION_NAME), payload);
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
            <Loader2 className="spin" size={48} color="#233ae0" />
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

            <div className="form-group">
                <label><FileText size={16} className="icon-blue" /> Motivo da Solicitação *</label>
                <input 
                    type="text" 
                    value={reason} 
                    onChange={(e) => setReason(e.target.value)} 
                    placeholder="Insira o motivo da soliciação"
                    className="input-field"
                />
            </div>

            <div className="table-container">
               <div className="table-rows scrollable-area">
                <div className="row-header">
                  <div className="col-num">#</div>
                  <div className="col-sku">SKU (10 ou 11 Dígitos)</div>
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
                        maxLength={11}
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
              
              {/* ÁREA DE AÇÃO COMPACTA: ADICIONAR ITEM (ESQUERDA) + SALVAR (DIREITA) */}
              <div className="add-row-area">
                <button onClick={handleAddItem} className="btn-add">
                    <Plus size={18} /> Adicionar item
                </button>
                
                <button onClick={handleSave} disabled={loading} className="btn btn-primary">
                    {loading ? <Loader2 className="spin" size={20} /> : <Save size={20} />}
                    {loading ? 'Salvando...' : 'Salvar Requisição'}
                </button>
              </div>
            </div>

          </div>
        </div>
        </div>
      </main>
      {notification && <Toast type={notification.type} message={notification.message} />}

          <Footer />
    </div>


  );
}