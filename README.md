Sistema de Solicitações e Catálogo - Itatiaia
Plataforma Web Corporativa (ERP Front-end) desenvolvida para gerenciar catálogos de produtos, simulações avançadas de preços logísticos, criação de solicitações e controle de cotas da Itatiaia.

🚀 Visão Geral
Este sistema foi projetado para alta performance e usabilidade de nível corporativo. Ele centraliza dados de produtos (Aço, Madeira, Eletro, Eletroportáteis, Itacom), permitindo cálculos instantâneos de frete (FOB/CIF), impostos e prazos, além de gerenciar um acervo massivo de imagens sincronizadas diretamente com a nuvem.

🛠️ Tecnologias e Stack
Front-end: React.js (Vite)

Roteamento: React Router DOM (Múltiplas páginas/módulos)

Banco de Dados & Storage: Google Firebase (Firestore NoSQL e Firebase Storage)

Autenticação: Firebase Authentication (Controle de rotas e permissões de Admin)

Manipulação de Planilhas: xlsx (SheetJS) para exportação de dados.

Otimização: browser-image-compression para tratamento de imagens no lado do cliente antes do upload.

Ícones e UI: lucide-react para iconografia padronizada.

📁 Arquitetura do Projeto
O projeto segue uma estrutura modular limpa, focada em separação de responsabilidades:

Plaintext
📦 src
 ┣ 📂 assets           # Imagens estáticas, logos e recursos visuais da interface
 ┣ 📂 components       # Componentes globais e reutilizáveis
 ┃ ┣ 📜 ExportModal.jsx  # Modal padrão para configurações de exportação
 ┃ ┣ 📜 Footer.jsx       # Rodapé do sistema
 ┃ ┣ 📜 Header.jsx       # Cabeçalho global com navegação e perfil
 ┃ ┗ 📜 Toast.jsx        # Sistema de notificações (Success, Info, Error)
 ┣ 📂 config           # Arquivos de inicialização
 ┃ ┗ 📜 firebase.js      # Inicialização do App, Auth, Firestore e Storage
 ┣ 📂 contexts         # Gerenciamento de Estado Global
 ┃ ┗ 📜 AuthContext.jsx  # Contexto de sessão de usuário e permissões (Admin vs Usuário)
 ┣ 📂 pages            # Módulos / Telas principais do sistema
 ┃ ┣ 📜 Contato.jsx          # Tela de suporte/contato
 ┃ ┣ 📜 CotasDashboard.jsx   # Painel de indicadores e métricas de cotas
 ┃ ┣ 📜 Home.jsx             # Dashboard principal de entrada
 ┃ ┣ 📜 Login.jsx            # Porta de entrada (Autenticação)
 ┃ ┣ 📜 Register.jsx         # Criação de novos acessos
 ┃ ┣ 📜 NewRequest.jsx       # Formulário de novas solicitações
 ┃ ┣ 📜 PriceTable.jsx       # Tabela de preços, simulador comercial e upload de img
 ┃ ┗ 📜 ProductAnalysis.jsx  # Ficha técnica detalhada e galeria de mídia
 ┣ 📂 styles           # CSS Global e variáveis padronizadas
 ┣ 📂 utils            # Funções utilitárias (ex: formatação de moeda, cálculos)
 ┣ 📜 App.jsx          # Configuração do Router e provedores de Contexto
 ┗ 📜 main.jsx         # Ponto de entrada do React

⚙️ Regras de Negócio Importantes (Atenção Devs)

Para dar manutenção no código, é estritamente necessário compreender as seguintes lógicas de negócio aplicadas no Front-end:

1. Motor do Simulador Comercial (PriceTable.jsx e ProductAnalysis.jsx)
O cálculo do preço final não vem pronto do banco. Ele é renderizado em tempo real cruzando:

Base de Preço + UF de Destino + Expedição.

Regra FOB (Retira) vs CIF (Entrega).

Em caso de CIF, o sistema aplica Descontos Logísticos (logistics_discounts) baseados no setor do produto e no Tipo de Carga.

Adição de Coeficientes: Prazos de Pagamento e Tier do Cliente (Ouro, Diamante, etc).

2. Algoritmo de Inteligência de Imagem
Como o sistema recebe uploads em massa por pastas, a miniatura principal (imageUrl) não é confiada cegamente. A tabela e a análise utilizam a função getBestPrimaryImage que:

Filtra apenas fotos do tipo fundo_branco.

Prioriza arquivos que contenham as strings FECHADA, FRONTAL ou FRENTE.

Como fallback de desempate, escolhe o arquivo de nome mais curto (ex: SKU.jpg ganha de SKU_aberto.jpg).

3. Upload em Lote e writeBatch
Na aba PriceTable, o botão de Subir Fotos utiliza o Firestore writeBatch. Para não exceder os limites do Firebase (500 operações por batch), o loop de atualização do banco divide as gravações em lotes de 400 em 400. Nunca altere essa lógica para escritas unitárias (updateDoc simples) em loop, ou o sistema sofrerá throttling.

Como rodar o projeto localmente
Clone o repositório e instale as dependências:

Bash
npm install
Configuração de Ambiente:
Certifique-se de solicitar o arquivo .env.local ao Tech Lead. Ele deve ser colocado na raiz do projeto contendo as chaves privadas do Firebase:

Snippet de código
VITE_FIREBASE_API_KEY=sua_api_key
VITE_FIREBASE_AUTH_DOMAIN=seu_dominio
VITE_FIREBASE_PROJECT_ID=seu_project_id
VITE_FIREBASE_STORAGE_BUCKET=seu_storage
VITE_FIREBASE_MESSAGING_SENDER_ID=seu_sender_id
VITE_FIREBASE_APP_ID=seu_app_id
Inicie o servidor de desenvolvimento Vite:

Bash
npm run dev
O sistema estará disponível em http://localhost:5173.

Documentação mantida pela equipe de desenvolvimento Itatiaia.