import React from 'react';
import { CheckCircle, AlertCircle } from 'lucide-react';

export default function Toast({ type, message }) {
  // type deve ser 'success' ou 'error'
  return (
    <div className={`toast ${type}`}>
      {type === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
      <span>{message}</span>
    </div>
  );
}