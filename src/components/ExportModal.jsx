import React, { useState } from 'react';
import { Lock, Loader2 } from 'lucide-react';

export default function ExportModal({ onClose, onConfirm, isLoading }) {
  const [password, setPassword] = useState('');

  const handleConfirm = () => {
    onConfirm(password);
  };

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-icon">
          <Lock size={32} />
        </div>
        <h3>Acesso Restrito</h3>
        <p>Digite a senha para baixar o relatório.</p>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Senha"
          className="input-field text-center"
          onKeyDown={(e) => e.key === 'Enter' && handleConfirm()}
        />
        <div className="modal-actions">
          <button onClick={onClose} className="btn btn-ghost">Cancelar</button>
          <button onClick={handleConfirm} className="btn btn-success">
            {isLoading ? <Loader2 className="spin" /> : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  );
}