// src/utils/logger.js
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';

export const logAction = async (user, action, targetId, details = '') => {
  if (!user) return;

  try {
    await addDoc(collection(db, 'system_logs'), {
      performedBy: user.name || user.email || 'Desconhecido',
      performedByUid: user.uid || user.id, // Suporta objeto do Auth ou do Firestore
      role: user.role || 'user',
      action: action, // Ex: 'DELETE', 'CREATE', 'UPDATE_STATUS'
      targetId: targetId, // ID da solicitação afetada
      details: details,
      timestamp: serverTimestamp()
    });
    console.log(`[LOG] ${action} registrado.`);
  } catch (error) {
    console.error("Erro ao salvar log:", error);
  }
};