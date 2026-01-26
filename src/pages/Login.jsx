import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import { Eye, EyeOff, Loader2 } from 'lucide-react'; // Importe os ícones
import logoImg from '../assets/logo-ita-removebg-preview.png';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false); // Estado do olhinho
  
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  const { login } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      setError('');
      setLoading(true);
      await login(username, password);
      navigate('/');
    } catch (err) {
      console.error(err);
      setError('Falha ao entrar. Verifique usuário e senha.');
    }
    setLoading(false);
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <img src={logoImg} alt="Itatiaia" className="auth-logo" />
        <h2>Acesso ao Sistema</h2>
        
        {error && <div className="alert-error">{error}</div>}
        
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Usuário</label>
            <input 
              type="text" 
              required 
              className="input-field" 
              value={username} 
              onChange={e => setUsername(e.target.value)} 
              placeholder="Ex: joaosilva"
            />
          </div>
          
          <div className="form-group">
            <label>Senha</label>
            <div className="password-wrapper">
              <input 
                type={showPassword ? "text" : "password"} 
                required 
                className="input-field" 
                value={password} 
                onChange={e => setPassword(e.target.value)} 
              />
              <button 
                type="button" 
                className="btn-eye"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex="-1" // Pula o tab para não atrapalhar navegação
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>

          <button disabled={loading} className="btn btn-primary full-width" type="submit">
            {loading ? <Loader2 className="spin" size={20} /> : 'Entrar'}
          </button>
        </form>
        
        <div className="auth-footer">
          Não tem acesso? <Link to="/register">Cadastre-se</Link>
        </div>
      </div>
    </div>
  );
}