(function() {
    // Dieser Wrapper stellt sicher, dass keine Variablen oder Funktionen in den globalen Scope der Seite gelangen.

    const PAGE_COUNT = 25;
    // Cache, um bereits abgerufene Transaktionen zu speichern und unnötige Anfragen zu vermeiden.
    let transactionCache = {};

    const getCookie = (name) => {
        const cookies = document.cookie.split('; ');
        const cookieMap = cookies.map(it => it.split('='))
            .reduce((prev, curr) => {
                const [key, value] = curr;
                return { ...prev, [key]: value };
            }, {});
        return cookieMap[name];
    };

    const fetchHeaders = () => {
        const headers = new Headers();
        headers.append('authority', 'api.koinly.io');
        headers.append('accept', 'application/json, text/plain, */*');
        headers.append('cookie', document.cookie);
        headers.append('origin', 'https://app.koinly.io');
        headers.append('referer', 'https://app.koinly.io/');
        headers.append('user-agent', navigator.userAgent);
        headers.append('x-auth-token', getCookie('API_KEY'));
        headers.append('x-portfolio-token', getCookie('PORTFOLIO_ID'));
        return headers;
    };

    const fetchSession = async () => {
        const response = await fetch('https://api.koinly.io/api/sessions', { headers: fetchHeaders() });
        return response.json();
    };

    // --- DATENABRUF FUNKTIONEN ---

    const fetchWalletsPage = async (pageNumber) => {
        const response = await fetch(`https://api.koinly.io/api/wallets?per_page=${PAGE_COUNT}&page=${pageNumber}`, { headers: fetchHeaders() });
        return response.json();
    };
    
    const fetchTransactionsPageForWallet = async (pageNumber, walletID) => {
        const response = await fetch(`https://api.koinly.io/api/transactions?order=date&q[m]=and&q[g][0][from_wallet_id_or_to_wallet_id_eq]=${walletID}&page=${pageNumber}&per_page=${PAGE_COUNT}`, { headers: fetchHeaders() });
        return response.json();
    };

    const fetchAllTransactionsPage = async (pageNumber) => {
        const response = await fetch(`https://api.koinly.io/api/transactions?per_page=${PAGE_COUNT}&order=date&page=${pageNumber}`, { headers: fetchHeaders() });
        return response.json();
    };

    const getAllWallets = async () => {
        const firstPage = await fetchWalletsPage(1);
        const totalPages = firstPage.meta.page.total_pages;
        const promises = [];
        for (let i = 2; i <= totalPages; i++) {
            promises.push(fetchWalletsPage(i));
        }
        const remainingPages = await Promise.all(promises);
        return [firstPage, ...remainingPages].flatMap(it => it.wallets);
    };

    const getTransactionsForWallet = async (walletID) => {
        const firstPage = await fetchTransactionsPageForWallet(1, walletID);
        const totalPages = firstPage.meta.page.total_pages;
        const promises = [];
        for (let i = 2; i <= totalPages; i++) {
            promises.push(fetchTransactionsPageForWallet(i, walletID));
        }
        const remainingPages = await Promise.all(promises);
        return [firstPage, ...remainingPages].flatMap(it => it.transactions);
    };

    const fetchAllTransactions = async () => {
        const firstPage = await fetchAllTransactionsPage(1);
        const totalPages = firstPage.meta.page.total_pages;
        const promises = [];
        for (let i = 2; i <= totalPages; i++) {
            promises.push(fetchAllTransactionsPage(i));
        }
        const remainingPages = await Promise.all(promises);
        return [firstPage, ...remainingPages].flatMap(it => it.transactions);
    };

    // --- DATEI-ERSTELLUNGSFUNKTIONEN ---

    const escapeCSV = (field) => {
        if (field === null || field === undefined) return '';
        const str = String(field);
        if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
            const escapedStr = str.replace(/"/g, '""');
            return `"${escapedStr}"`;
        }
        return str;
    };
    
    const toCSVFile = (fileName, baseCurrency, transactions) => {
        // Definiert jede Spalte mit ihrem Header und einer Funktion, um den Wert zu extrahieren.
        // Dies verhindert Fehler durch unsortierte Spalten und verbessert die Lesbarkeit.
        const columnConfig = [
            { header: 'Date',                 getValue: (t) => t.date },
            { header: 'Transaction Type',     getValue: (t) => t.type },
            { header: 'Label',                getValue: (t) => t.label ? t.label : '' },
            { header: 'Ignored?',             getValue: (t) => t.ignored ? t.ignored : '' },
            { header: 'Ign. Reason',          getValue: (t) => t.ignored_reason ? t.ignored_reason : '' },
            { header: 'F(From)_Wallet',       getValue: (t) => t.from ? t.from.wallet.name : '' },
            { header: 'F_Source',             getValue: (t) => t.from_source ? t.from_source : '' },
            { header: 'T(To)_Wallet',         getValue: (t) => t.to ? t.to.wallet.name : '' },
            { header: 'T_Source',             getValue: (t) => t.to_source ? t.to_source : '' },
            { header: 'F_Amount',             getValue: (t) => t.from ? t.from.amount : '' },
            { header: 'F_Cur',                getValue: (t) => t.from ? t.from.currency.symbol : '' },
            { header: 'F_Cur ID',             getValue: (t) => t.from ? t.from.currency.id : '' },
            { header: 'F_Cur Type',           getValue: (t) => t.from ? t.from.currency.type : '' },
            { header: 'F_Cost Basis',         getValue: (t) => t.from ? t.from.cost_basis : '' },
            { header: 'F_Cost Basis Cur',     getValue: (t, bc) => (t.from && t.from.cost_basis != null) ? bc : '' },
            { header: 'T_Amount',             getValue: (t) => t.to ? t.to.amount : '' },
            { header: 'T_Cur',                getValue: (t) => t.to ? t.to.currency.symbol : '' },
            { header: 'T_Cur ID',             getValue: (t) => t.to ? t.to.currency.id : '' },
            { header: 'T_Cur Type',           getValue: (t) => t.to ? t.to.currency.type : '' },
            { header: 'T_Cost Basis',         getValue: (t) => t.to ? t.to.cost_basis : '' },
            { header: 'T_Cost Basis Cur',     getValue: (t, bc) => (t.to && t.to.cost_basis != null) ? bc : '' },
            { header: 'Fee Amount',           getValue: (t) => t.fee ? t.fee.amount : '' },
            { header: 'Fee Cur',              getValue: (t) => t.fee ? t.fee.currency.symbol : '' },
            { header: 'Fee Cur ID',           getValue: (t) => t.fee ? t.fee.currency.id : '' },
            { header: 'Fee Cur Type',         getValue: (t) => t.fee ? t.fee.currency.type : '' },
            { header: 'Fee Value',            getValue: (t) => (t.fee && t.fee_value != null) ? t.fee_value : '' }, // KORRIGIERT: Greift auf t.fee_value zu
            { header: 'Fee Value Cur',        getValue: (t, bc) => (t.fee && t.fee_value != null) ? bc : '' },      // KORRIGIERT: Logik wie oben
            { header: 'Net Worth Amount',     getValue: (t) => t.net_value != null ? t.net_value : '' },
            { header: 'Net Worth Cur',        getValue: (t, bc) => t.net_value != null ? bc : '' },
            { header: 'Gain',                 getValue: (t) => t.gain != null ? t.gain : '' },
            { header: 'Gain Cur',             getValue: (t, bc) => t.gain != null ? bc : '' },
            { header: 'Cost Basis Method',    getValue: (t) => t.cost_basis_method },
            { header: 'Manual?',              getValue: (t) => t.manual ? t.manual : '' },
            { header: 'Missing Rates?',       getValue: (t) => t.missing_rates ? t.missing_rates : '' },
            { header: 'Missing Cost Basis?',  getValue: (t) => t.missing_cost_basis ? t.missing_cost_basis : '' },
            { header: 'Description',          getValue: (t) => t.description },
            { header: 'TxHash',               getValue: (t) => t.txhash },
        ];

        // Erzeugt die Header-Zeile aus der Konfiguration
        const headings = columnConfig.map(c => c.header).join(',');

        // Erzeugt die Datenzeilen basierend auf der Konfiguration
        const transactionRows = transactions.map(t => {
            const row = columnConfig.map(c => c.getValue(t, baseCurrency));
            return row.map(escapeCSV).join(',');
        });

        const csv = [headings, ...transactionRows].join('\n');
        const hiddenElement = document.createElement('a');
        hiddenElement.href = 'data:text/csv;charset=utf-8,' + encodeURI(csv);
        hiddenElement.target = '_blank';
        hiddenElement.download = `${fileName}.csv`;
        hiddenElement.click();
    };

    const toJSONFile = (fileName, transactions) => {
        const jsonString = JSON.stringify(transactions, null, 2);
        const hiddenElement = document.createElement('a');
        hiddenElement.href = 'data:application/json;charset=utf-8,' + encodeURIComponent(jsonString);
        hiddenElement.target = '_blank';
        hiddenElement.download = `${fileName}.json`;
        hiddenElement.click();
    };

    // --- UI-ERSTELLUNG UND LOGIK ---

    function createUI() {
        const styles = `
            #koinly-exporter-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0, 0, 0, 0.7); z-index: 10000; display: flex; justify-content: center; align-items: center; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
            #koinly-exporter-modal { background-color: #ffffff; padding: 25px; border-radius: 8px; width: 90%; max-width: 600px; max-height: 80vh; display: flex; flex-direction: column; box-shadow: 0 5px 20px rgba(0,0,0,0.25); position: relative; }
            #koinly-exporter-modal h2 { margin: 0 0 20px 0; color: #333; }
            #koinly-exporter-list { list-style: none; padding: 0; margin: 0; overflow-y: auto; }
            #koinly-exporter-list li { display: flex; justify-content: space-between; align-items: center; padding: 12px 5px; border-bottom: 1px solid #e0e0e0; color: #333; }
            #koinly-exporter-list li:last-child { border-bottom: none; }
            #koinly-exporter-list li.separator { padding: 0; border-bottom: 2px solid #0052ff; margin: 10px 0; }
            .koinly-exporter-btn-group { display: flex; gap: 8px; }
            .koinly-exporter-btn-group button { padding: 8px 12px; border: 1px solid #007bff; color: #007bff; background-color: white; border-radius: 5px; cursor: pointer; transition: all 0.2s ease; font-weight: bold; flex-shrink: 0; }
            .koinly-exporter-btn-group button:hover { background-color: #007bff; color: white; }
            .koinly-exporter-btn-group button:disabled { background-color: #ccc; border-color: #ccc; color: #666; cursor: not-allowed; }
            #koinly-exporter-close-corner { position: absolute; top: 15px; right: 20px; font-size: 24px; color: #888; cursor: pointer; line-height: 1; user-select: none; }
            #koinly-exporter-footer { margin-top: 20px; text-align: center; }
            #koinly-exporter-close-btn { padding: 10px 20px; border: 1px solid #6c757d; color: #6c757d; background-color: white; border-radius: 5px; cursor: pointer; font-size: 16px; transition: all 0.2s ease; }
            #koinly-exporter-close-btn:hover { background-color: #f8f9fa; }
        `;
        const styleSheet = document.createElement("style");
        styleSheet.innerText = styles;
        document.head.appendChild(styleSheet);

        const overlay = document.createElement('div');
        overlay.id = 'koinly-exporter-overlay';
        overlay.innerHTML = `
            <div id="koinly-exporter-modal">
                <span id="koinly-exporter-close-corner">&times;</span>
                <h2>Export Wallet Transactions</h2>
                <ul id="koinly-exporter-list"><li>Lade Wallets...</li></ul>
                <div id="koinly-exporter-footer">
                    <button id="koinly-exporter-close-btn">Schliessen</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);

        const close = () => {
            document.getElementById('koinly-exporter-overlay')?.remove();
            transactionCache = {}; // Cache beim Schließen leeren
        };
        document.getElementById('koinly-exporter-close-corner').onclick = close;
        document.getElementById('koinly-exporter-close-btn').onclick = close;
        overlay.onclick = (e) => { if (e.target.id === 'koinly-exporter-overlay') close(); };
        
        return { listElement: document.getElementById('koinly-exporter-list') };
    }

    async function startExporter() {
        if (document.getElementById('koinly-exporter-overlay')) {
            console.log("Exporter ist bereits geöffnet.");
            return;
        }
        
        const { listElement } = createUI();

        try {
            const session = await fetchSession();
            const baseCurrency = session.portfolios[0].base_currency.symbol;
            const wallets = await getAllWallets();

            listElement.innerHTML = '';

            const handleDownload = async (item, format, btn) => {
                const originalText = btn.textContent;
                btn.textContent = 'Lade...';
                const allButtonsInGroup = btn.parentElement.querySelectorAll('button');
                allButtonsInGroup.forEach(b => b.disabled = true);

                try {
                    const cacheKey = item.id; // 'all-transactions' oder Wallet-ID
                    let transactions;

                    if (transactionCache[cacheKey]) {
                        console.log(`Lade Transaktionen aus dem Cache für: ${item.name}`);
                        transactions = await transactionCache[cacheKey];
                    } else {
                        console.log(`Rufe Transaktionen ab für: ${item.name}`);
                        const fetchPromise = (cacheKey === 'all-transactions') 
                            ? fetchAllTransactions() 
                            : getTransactionsForWallet(item.id);
                        
                        transactionCache[cacheKey] = fetchPromise; // Promise im Cache speichern
                        transactions = await fetchPromise;
                    }

                    const fileName = `${item.name} - Transactions`;
                    if (format === 'csv') {
                        toCSVFile(fileName, baseCurrency, transactions);
                    } else if (format === 'json') {
                        toJSONFile(fileName, transactions);
                    }
                    console.log(`Download für ${item.name} abgeschlossen.`);
                } catch (err) {
                    console.error(`Fehler beim Download für ${item.name}:`, err);
                    alert(`Ein Fehler ist aufgetreten. Prüfen Sie die Konsole für Details.`);
                    delete transactionCache[item.id]; // Bei Fehler Cache für diesen Key löschen
                } finally {
                    btn.textContent = originalText;
                    allButtonsInGroup.forEach(b => b.disabled = false);
                }
            };
            
            // --- UI-Elemente für Gesamt-Download erstellen ---
            const allTransactionsItem = { id: 'all-transactions', name: 'Alle Transaktionen (Gesamt)' };
            const allListItem = document.createElement('li');
            const allNameSpan = document.createElement('span');
            allNameSpan.textContent = allTransactionsItem.name;
            allNameSpan.style.fontWeight = 'bold';

            const allButtonGroup = document.createElement('div');
            allButtonGroup.className = 'koinly-exporter-btn-group';

            const downloadAllCsvBtn = document.createElement('button');
            downloadAllCsvBtn.textContent = 'Download CSV';
            downloadAllCsvBtn.onclick = () => handleDownload(allTransactionsItem, 'csv', downloadAllCsvBtn);

            const downloadAllJsonBtn = document.createElement('button');
            downloadAllJsonBtn.textContent = 'Download JSON';
            downloadAllJsonBtn.onclick = () => handleDownload(allTransactionsItem, 'json', downloadAllJsonBtn);
            
            allButtonGroup.appendChild(downloadAllCsvBtn);
            allButtonGroup.appendChild(downloadAllJsonBtn);
            allListItem.appendChild(allNameSpan);
            allListItem.appendChild(allButtonGroup);
            listElement.appendChild(allListItem);

            // --- Trennlinie ---
            const separator = document.createElement('li');
            separator.className = 'separator';
            listElement.appendChild(separator);

            if (!wallets || wallets.length === 0) {
                listElement.innerHTML += '<li>Keine Wallets gefunden.</li>';
                return;
            }

            // --- UI-Elemente für einzelne Wallets erstellen ---
            wallets.forEach((wallet) => {
                const listItem = document.createElement('li');
                const nameSpan = document.createElement('span');
                nameSpan.textContent = wallet.name;

                const buttonGroup = document.createElement('div');
                buttonGroup.className = 'koinly-exporter-btn-group';

                const downloadCsvBtn = document.createElement('button');
                downloadCsvBtn.textContent = 'Download CSV';
                downloadCsvBtn.onclick = () => handleDownload(wallet, 'csv', downloadCsvBtn);

                const downloadJsonBtn = document.createElement('button');
                downloadJsonBtn.textContent = 'Download JSON';
                downloadJsonBtn.onclick = () => handleDownload(wallet, 'json', downloadJsonBtn);
                
                buttonGroup.appendChild(downloadCsvBtn);
                buttonGroup.appendChild(downloadJsonBtn);
                
                listItem.appendChild(nameSpan);
                listItem.appendChild(buttonGroup);
                listElement.appendChild(listItem);
            });

        } catch (error) {
            console.error("Ein kritischer Fehler ist aufgetreten:", error);
            listElement.innerHTML = '<li>Ein Fehler ist aufgetreten. Stellen Sie sicher, dass Sie bei Koinly eingeloggt sind und versuchen Sie es erneut.</li>';
        }
    }

    // Skript automatisch starten
    startExporter();

})();
