export const generateAndDownloadCSV = (docs) => {
  let csvContent = "data:text/csv;charset=utf-8,";
  // Cabeçalho atualizado com Data de Liberação
  csvContent += "Data Criação,Data Liberação,Requisitante,SKU,Quantidade\n";

  docs.forEach((docData) => {
    // 1. Data de Criação (System)
    const createdAt = docData.createdAt 
      ? new Date(docData.createdAt.seconds * 1000).toLocaleDateString('pt-BR') 
      : 'N/A';
    
    // 2. Data de Liberação (Input do usuário)
    let releaseDate = docData.releaseDate || 'N/A';
    // Formata de YYYY-MM-DD para DD/MM/YYYY se for uma data válida
    if (releaseDate !== 'N/A' && releaseDate.includes('-')) {
        const [year, month, day] = releaseDate.split('-');
        releaseDate = `${day}/${month}/${year}`;
    }

    if (Array.isArray(docData.items)) {
      docData.items.forEach(item => {
        // Remove vírgulas dos textos para não quebrar a coluna do CSV
        const safeRequester = String(docData.requester).replace(/,/g, ''); 
        const safeSku = String(item.sku).replace(/,/g, '');
        
        csvContent += `${createdAt},${releaseDate},${safeRequester},${safeSku},${item.qtd}\n`;
      });
    }
  });

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", "relatorio_cotas_itatiaia.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};