export const generateAndDownloadCSV = (docs) => {
  let csvContent = "data:text/csv;charset=utf-8,";
  
  csvContent += "SKU,Qtd\n";

  docs.forEach((docData) => {
    if (Array.isArray(docData.items)) {
      docData.items.forEach(item => {
        const safeSku = item.sku ? String(item.sku).replace(/,/g, '').trim() : '';
        
        const rawQtd = item.qtd !== undefined && item.qtd !== null ? item.qtd : '';
        const safeQtd = String(rawQtd).replace(/,/g, '').trim();

        if (safeSku || safeQtd) {
            csvContent += `${safeSku},${safeQtd}\n`;
        }
      });
    }
  });

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", "importacao_cotas.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};