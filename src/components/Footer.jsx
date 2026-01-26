import React from 'react';
import { Link } from 'react-router-dom';

function Footer() {
    return (
        <footer className="main-footer">
            <div className="footer-content">
                <p>Sistema desenvolvido por <strong>Leonardo Gravina Carlos</strong>.</p>
                <p>
                    Precisa de suporte? <Link to="/contato">Entre em contato</Link>.
                </p>
            </div>
        </footer>
    );
}

export default Footer;