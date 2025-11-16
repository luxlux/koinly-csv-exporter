(function() {
    // This wrapper ensures no variables or functions leak into the page's global scope.

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
        const headings = ['From Wallet', 'F_Source', 'To Wallet', 'T_Source', 'Date', 'Ignored?', 'Ign. Reason', 'Sent Amount', 'Sent Currency', 'Sent Currency ID','Sent Cost Basis', 'Sent Cost Basis Currency', 'Received Amount', 'Received Currency', 'Received Currency ID', 'Received Cost Basis', 'Received Cost Basis Currency', 'Received Cost Basis Currency ID', 'Fee Amount', 'Fee Currency', 'Fee Value (EUR)', 'Net Worth Amount', 'Net Worth Currency', 'Gain' , 'Gain Currency', 'Type', 'Label', 'Cost Basis Method', 'Manual?', 'Missing Rates?', 'Missing Cost Basis?', 'Description', 'TxHash'];

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
                t.from ? t.from.currency.id : '',
                t.from ? t.from.cost_basis : '',
                baseCurrency,
                t.to ? t.to.amount : '',
                t.to ? t.to.currency.symbol : '',
                t.to ? t.to.currency.id : '',
                t.to ? t.to.cost_basis : '',
                baseCurrency,
                t.fee ? t.fee.amount : '',
                t.fee ? t.fee.currency.symbol : '',
                t.fee ? t.fee.currency.id : '',
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

    const toJSONFile = (walletName, transactions) => {
        // Creates a beautified JSON string with 2 spaces for indentation
        const jsonString = JSON.stringify(transactions, null, 2);
        const hiddenElement = document.createElement('a');
        hiddenElement.href = 'data:application/json;charset=utf-8,' + encodeURIComponent(jsonString);
        hiddenElement.target = '_blank';
        hiddenElement.download = `${walletName} - Transactions.json`;
        hiddenElement.click();
    };

    function createUI() {
        const styles = `
            #koinly-exporter-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0, 0, 0, 0.7); z-index: 10000; display: flex; justify-content: center; align-items: center; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
            #koinly-exporter-modal { background-color: #ffffff; padding: 25px; border-radius: 8px; width: 90%; max-width: 600px; max-height: 80vh; display: flex; flex-direction: column; box-shadow: 0 5px 20px rgba(0,0,0,0.25); position: relative; }
            #koinly-exporter-modal h2 { margin: 0 0 20px 0; color: #333; }
            #koinly-exporter-list { list-style: none; padding: 0; margin: 0; overflow-y: auto; }
            #koinly-exporter-list li { display: flex; justify-content: space-between; align-items: center; padding: 12px 5px; border-bottom: 1px solid #e0e0e0; color: #333; }
            #koinly-exporter-list li:last-child { border-bottom: none; }
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
                <ul id="koinly-exporter-list"><li>Loading wallets...</li></ul>
                <div id="koinly-exporter-footer">
                    <button id="koinly-exporter-close-btn">Close</button>
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
            console.log("Exporter is already open.");
            return;
        }
        
        const { listElement } = createUI();

        try {
            const session = await fetchSession();
            const baseCurrency = session.portfolios[0].base_currency.symbol;
            wallets = await getAllWallets();

            listElement.innerHTML = ''; 

            if (!wallets || wallets.length === 0) {
                listElement.innerHTML = '<li>No wallets found.</li>';
                return;
            }

            const handleDownload = async (wallet, format, btn) => {
                const originalText = btn.textContent;
                btn.textContent = 'Loading...';
                btn.disabled = true;
                const allButtonsInGroup = btn.parentElement.querySelectorAll('button');
                allButtonsInGroup.forEach(b => b.disabled = true);

                try {
                    console.log(`Starting download for wallet: ${wallet.name} (Format: ${format.toUpperCase()})`);
                    const transactions = await getAllTransactions(wallet.id);

                    if (format === 'csv') {
                        toCSVFile(wallet.name, baseCurrency, transactions);
                    } else if (format === 'json') {
                        toJSONFile(wallet.name, transactions);
                    }
                    console.log(`Download for ${wallet.name} completed.`);
                } catch (err) {
                    console.error(`Error downloading for ${wallet.name}:`, err);
                    alert(`An error occurred. Please check the console for details.`);
                } finally {
                    btn.textContent = originalText;
                    allButtonsInGroup.forEach(b => b.disabled = false);
                }
            };

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
            console.error("A critical error occurred:", error);
            listElement.innerHTML = '<li>An error occurred. Please ensure you are logged into Koinly and try again.</li>';
        }
    }

    // Start the script automatically
    startExporter();

})();
