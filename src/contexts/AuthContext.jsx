import React, { createContext, useState, useEffect, useContext } from 'react';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged 
} from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, db } from '../config/firebase';

const AuthContext = createContext({});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);

  // Definimos um domínio interno para criar o e-mail falso
  const FAKE_DOMAIN = "@itatiaia.interno";

  // Função de Cadastro (Agora recebe username em vez de email)
  async function signup(username, password, fullName) {
    // Gera o email falso: usuario -> usuario@itatiaia.interno
    const email = `${username.toLowerCase().trim()}${FAKE_DOMAIN}`;
    
    const result = await createUserWithEmailAndPassword(auth, email, password);
    
    // Salva no banco os dados visíveis
    await setDoc(doc(db, "users", result.user.uid), {
      username: username.toLowerCase().trim(),
      name: fullName,
      role: 'user', 
      createdAt: new Date()
    });
    return result;
  }

  // Função de Login (Agora recebe username)
  function login(username, password) {
    const email = `${username.toLowerCase().trim()}${FAKE_DOMAIN}`;
    return signInWithEmailAndPassword(auth, email, password);
  }

  function logout() {
    return signOut(auth);
  }

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        const docRef = doc(db, "users", user.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setUserData(docSnap.data());
        }
      } else {
        setUserData(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const value = {
    currentUser,
    userData,
    signup,
    login,
    logout
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}