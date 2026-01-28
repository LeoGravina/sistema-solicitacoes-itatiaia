export const generateAndDownloadCSV = (docs) => {
  let csvContent = "data:text/csv;charset=utf-8,";
  
  // Cabeçalho simplificado para importação (SKU e Quantidade apenas)
  csvContent += "SKU,Quantidade\n";

  docs.forEach((docData) => {
    if (Array.isArray(docData.items)) {
      docData.items.forEach(item => {
        // Remove vírgulas e espaços extras do SKU para evitar quebra do CSV
        const safeSku = String(item.sku).replace(/,/g, '').trim();
        const safeQtd = String(item.qtd).replace(/,/g, '').trim();
        
        // Gera a linha apenas com SKU e QTD
        csvContent += `${safeSku},${safeQtd}\n`;
      });
    }
  });

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  // Nome do arquivo sugere que é para importação
  link.setAttribute("download", "importacao_cotas.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};