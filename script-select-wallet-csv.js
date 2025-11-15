(function() {
    // Dieser Wrapper stellt sicher, dass keine Variablen oder Funktionen in den globalen Scope der Seite gelangen.

    let wallets;

    const PAGE_COUNT = 25;

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

    const fetchWallets = async (pageNumber) => {
        const response = await fetch(`https://api.koinly.io/api/wallets?per_page=${PAGE_COUNT}&page=${pageNumber}`, { headers: fetchHeaders() });
        return response.json();
    };

    async function getAllWallets() {
        const firstPage = await fetchWallets(1);
        const totalPages = firstPage.meta.page.total_pages;
        const promises = [];
        for (let i = 2; i <= totalPages; i++) {
            promises.push(fetchWallets(i));
        }
        const remainingPages = await Promise.all(promises);
        return [firstPage, ...remainingPages].flatMap(it => it.wallets);
    }

    const fetchPage = async (pageNumber, walletID) => {
        const response = await fetch(`https://api.koinly.io/api/transactions?order=date&q[m]=and&q[g][0][from_wallet_id_or_to_wallet_id_eq]=${walletID}&page=${pageNumber}&per_page=${PAGE_COUNT}`, { headers: fetchHeaders() });
        return response.json();
    };

    const getAllTransactions = async (walletID) => {
        const firstPage = await fetchPage(1, walletID);
        const totalPages = firstPage.meta.page.total_pages;
        const promises = [];
        for (let i = 2; i <= totalPages; i++) {
            promises.push(fetchPage(i, walletID));
        }
        const remainingPages = await Promise.all(promises);
        return [firstPage, ...remainingPages].flatMap(it => it.transactions);
    };

const toCSVFile = (walletName, baseCurrency, transactions) => {
        const headings = ['From Wallet', 'F_Source', 'To Wallet', 'T_Source', 'Date', 'Ignored?', 'Ign. Reason', 'Sent Amount', 'Sent Currency', 'Sent Cost Basis', 'Sent Cost Basis Currency', 'Received Amount', 'Received Currency', 'Received Cost Basis', 'Received Cost Basis Currency', 'Fee Amount', 'Fee Currency', 'Fee Value (EUR)', 'Net Worth Amount', 'Net Worth Currency', 'Gain' , 'Gain Currency', 'Type', 'Label', 'Cost Basis Method', 'Manual?', 'Missing Rates?', 'Missing Cost Basis?', 'Description', 'TxHash'];

        /**
         * Escaped ein einzelnes CSV-Feld gemäss RFC 4180.
         * - Schliesst Felder in doppelte Anführungszeichen ein, wenn sie Kommas, Zeilenumbrüche oder doppelte Anführungszeichen enthalten.
         * - Verdoppelt alle doppelten Anführungszeichen innerhalb des Feldes.
         */
        const escapeCSV = (field) => {
            // Gibt einen leeren String für null oder undefined Werte zurück.
            if (field === null || field === undefined) {
                return '';
            }
            const str = String(field);

            // Prüft, ob das Feld problematische Zeichen enthält.
            if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
                // Ersetzt jedes doppelte Anführungszeichen durch zwei doppelte Anführungszeichen.
                const escapedStr = str.replace(/"/g, '""');
                // Schliesst das gesamte Feld in doppelte Anführungszeichen ein.
                return `"${escapedStr}"`;
            }
            
            // Wenn keine problematischen Zeichen vorhanden sind, wird das Feld unverändert zurückgegeben.
            return str;
        };

        const transactionRows = transactions.map((t) =>
            [
                t.from ? t.from.wallet.name : '',
                t.from_source ? t.from_source : '',
                t.to ? t.to.wallet.name : '',
                t.to_source ? t.to_source : '',
                t.date,
                t.ignored ? t.ignored : '',
                t.ignored_reason ? t.ignored_reason : '',
                t.from ? t.from.amount : '',
                t.from ? t.from.currency.symbol : '',
                t.from ? t.from.cost_basis : '',
                baseCurrency,
                t.to ? t.to.amount : '',
                t.to ? t.to.currency.symbol : '',
                t.to ? t.to.cost_basis : '',
                baseCurrency,
                t.fee ? t.fee.amount : '',
                t.fee ? t.fee.currency.symbol : '',
                t.fee ? t.fee_value : '',
                t.net_value,
                baseCurrency,
                t.gain,
                baseCurrency,
                t.type,
                t.label ? t.label : '',
                t.cost_basis_method,
                t.missing_rates ? t.missing_rates : '',
                t.missing_cost_basis ? t.missing_cost_basis : '',
                t.manual ? t.manual : '',
                t.description,
                t.txhash,
            ].map(escapeCSV).join(',') // Wendet die escapeCSV-Funktion auf jedes Feld an.
        );
        const csv = [headings.join(','), ...transactionRows].join('\n');
        const hiddenElement = document.createElement('a');
        hiddenElement.href = 'data:text/csv;charset=utf-8,' + encodeURI(csv);
        hiddenElement.target = '_blank';
        hiddenElement.download = `${walletName} - Transactions.csv`;
        hiddenElement.click();
    };

    function createUI() {
        const styles = `
            #koinly-exporter-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0, 0, 0, 0.7); z-index: 10000; display: flex; justify-content: center; align-items: center; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
            #koinly-exporter-modal { background-color: #ffffff; padding: 25px; border-radius: 8px; width: 90%; max-width: 500px; max-height: 80vh; display: flex; flex-direction: column; box-shadow: 0 5px 20px rgba(0,0,0,0.25); position: relative; }
            #koinly-exporter-modal h2 { margin: 0 0 20px 0; color: #333; }
            #koinly-exporter-list { list-style: none; padding: 0; margin: 0; overflow-y: auto; }
            #koinly-exporter-list li { display: flex; justify-content: space-between; align-items: center; padding: 12px 5px; border-bottom: 1px solid #e0e0e0; color: #333; }
            #koinly-exporter-list li:last-child { border-bottom: none; }
            #koinly-exporter-list button { padding: 8px 12px; border: 1px solid #007bff; color: #007bff; background-color: white; border-radius: 5px; cursor: pointer; transition: all 0.2s ease; font-weight: bold; flex-shrink: 0; margin-left: 15px; }
            #koinly-exporter-list button:hover { background-color: #007bff; color: white; }
            #koinly-exporter-list button:disabled { background-color: #ccc; border-color: #ccc; color: #666; cursor: not-allowed; }
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
                <h2>Wallet-Transaktionen exportieren</h2>
                <ul id="koinly-exporter-list"><li>Lade Wallets...</li></ul>
                <div id="koinly-exporter-footer">
                    <button id="koinly-exporter-close-btn">Schließen</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        const close = () => document.getElementById('koinly-exporter-overlay')?.remove();
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
            wallets = await getAllWallets();

            listElement.innerHTML = ''; 

            if (!wallets || wallets.length === 0) {
                listElement.innerHTML = '<li>Keine Wallets gefunden.</li>';
                return;
            }

            wallets.forEach((wallet, index) => {
                const listItem = document.createElement('li');
                const nameSpan = document.createElement('span');
                nameSpan.textContent = wallet.name;
                const downloadBtn = document.createElement('button');
                downloadBtn.textContent = 'Download CSV';

                downloadBtn.onclick = async () => {
                    downloadBtn.textContent = 'Lade...';
                    downloadBtn.disabled = true;
                    try {
                        const transactions = await getAllTransactions(wallet.id);
                        toCSVFile(wallet.name, baseCurrency, transactions);
                    } catch (err) {
                        console.error(`Fehler beim Download für ${wallet.name}:`, err);
                        alert(`Ein Fehler ist aufgetreten. Prüfen Sie die Konsole für Details.`);
                    } finally {
                        downloadBtn.textContent = 'Download CSV';
                        downloadBtn.disabled = false;
                    }
                };

                listItem.appendChild(nameSpan);
                listItem.appendChild(downloadBtn);
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
