import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import logoImg from '../assets/logo-itatiaia.png';

export default function Register() {
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  // Estados para os olhinhos
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  const { signup } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();

    if (password !== confirmPassword) {
      return setError("As senhas não coincidem.");
    }
    if (password.length < 6) {
      return setError("A senha deve ter pelo menos 6 caracteres.");
    }
    if (!fullName.trim()) {
      return setError("Nome completo é obrigatório.");
    }

    try {
      setError('');
      setLoading(true);
      await signup(username, password, fullName);
      navigate('/');
    } catch (err) {
      console.error(err);
      if (err.code === 'auth/email-already-in-use') {
        setError('Este nome de usuário já está em uso.');
      } else {
        setError('Falha ao criar conta.');
      }
    }
    setLoading(false);
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <img src={logoImg} alt="Itatiaia" className="auth-logo" />
        <h2>Novo Cadastro</h2>
        
        {error && <div className="alert-error">{error}</div>}
        
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Nome Completo *</label>
            <input 
              type="text" 
              required 
              className="input-field" 
              value={fullName} 
              onChange={e => setFullName(e.target.value)} 
              placeholder="Insira seu nome completo" 
            />
          </div>

          <div className="form-group">
            <label>Usuário de Acesso *</label>
            <input 
              type="text" 
              required 
              className="input-field" 
              value={username} 
              onChange={e => setUsername(e.target.value.replace(/\s/g, ''))} // Remove espaços
              placeholder="Crie seu usuário" 
            />
          </div>

          <div className="form-group">
            <label>Senha *</label>
            <div className="password-wrapper">
              <input 
                type={showPassword ? "text" : "password"} 
                required 
                className="input-field" 
                value={password} 
                onChange={e => setPassword(e.target.value)}
                placeholder='******' 
              />
              <button type="button" className="btn-eye" onClick={() => setShowPassword(!showPassword)}>
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>

          <div className="form-group">
            <label>Confirmar Senha *</label>
            <div className="password-wrapper">
              <input 
                type={showConfirmPassword ? "text" : "password"} 
                required 
                className="input-field" 
                value={confirmPassword} 
                onChange={e => setConfirmPassword(e.target.value)} 
                placeholder='******'    
              />
              <button type="button" className="btn-eye" onClick={() => setShowConfirmPassword(!showConfirmPassword)}>
                {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>

          <button disabled={loading} className="btn btn-primary btn-auth-submit" type="submit">
            {loading ? <Loader2 className="spin" size={20} /> : 'Entrar'}
          </button>
        </form>
        
        <div className="auth-footer">
          Já tem conta? <Link to="/login">Faça Login</Link>
        </div>
      </div>
    </div>
  );
}