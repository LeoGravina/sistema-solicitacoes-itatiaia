import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FiMail, FiPhone, FiLinkedin, FiGithub, FiArrowLeft, FiCode } from 'react-icons/fi';
import styles from '../styles/Contato.module.css';

function Contato() {
    const navigate = useNavigate();

    return (
        <div className={styles.pageWrapper}>
            <main className={styles.contatoCard}>
                <div className={styles.headerIcon}>
                    <FiCode size={40} />
                </div>
                
                <h1 className={styles.contatoTitle}>Leonardo Gravina</h1>
                <p className={styles.roleBadge}>Desenvolvedor Full Stack</p>
                
                <div className={styles.pitchText}>
                    <p>
                        Gostou da experiência deste sistema?
                    </p>
                    <p>
                        Eu crio soluções digitais modernas, rápidas e intuitivas como esta.
                        <strong> Vamos tirar sua ideia do papel?</strong>
                    </p>
                </div>

                <div className={styles.contatoInfoList}>
                    {/* WhatsApp */}
                    <a 
                        href="https://wa.me/5532984057124" 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className={`${styles.contatoItem} ${styles.whatsapp}`}
                    >
                        <FiPhone size={22} />
                        <div>
                            <strong>WhatsApp</strong>
                            <span>(32) 98405-7124</span>
                        </div>
                    </a>

                    {/* Email */}
                    <a 
                        href="mailto:leonardocarlos807@gmail.com" 
                        className={styles.contatoItem}
                    >
                        <FiMail size={22} />
                        <div>
                            <strong>Email</strong>
                            <span>leonardocarlos807@gmail.com</span>
                        </div>
                    </a>

                    <div className={styles.rowLinks}>
                        {/* LinkedIn Atualizado */}
                        <a href="https://www.linkedin.com/in/leonardo-gravina-carlos-a770bb237" target="_blank" rel="noopener noreferrer" className={styles.miniLink}>
                            <FiLinkedin size={20} /> LinkedIn
                        </a>
                        
                        {/* GitHub */}
                        <a href="https://github.com/LeoGravina" target="_blank" rel="noopener noreferrer" className={styles.miniLink}>
                            <FiGithub size={20} /> GitHub
                        </a>
                    </div>
                </div>

                <button className={styles.backButton} onClick={() => navigate(-1)}>
                    <FiArrowLeft /> Voltar para o Sistema
                </button>
            </main>
        </div>
    );
}

export default Contato;