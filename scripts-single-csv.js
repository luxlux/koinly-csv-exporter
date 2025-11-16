(function() {
    const PAGE_COUNT = 25;

    const getCookie = (name) => {
        const cookies = document.cookie.split('; ');
        const cookieMap = cookies.map(it => it.split('='))
            .reduce((prev, curr) => {
                const [key, value] = curr;
                return {
                    ...prev,
                    [key]: value,
                }
            }, {})
        return cookieMap[name]
    }

    const fetchHeaders = () => {
        const headers = new Headers();
        headers.append('authority', 'api.koinly.io');
        headers.append('accept', 'application/json, text/plain, */*');
        headers.append('accept-language', 'en-GB,en-US;q=0.9,en;q=0.8');
        headers.append('access-control-allow-credentials', 'true');
        headers.append('caches-requests', '1');
        headers.append('cookie', document.cookie);
        headers.append('origin', 'https://app.koinly.io');
        headers.append('referer', 'https://app.koinly.io/');
        headers.append('sec-fetch-dest', 'empty');
        headers.append('sec-fetch-mode', 'cors');
        headers.append('sec-fetch-site', 'same-site');
        headers.append('sec-gpc', '1');
        headers.append('user-agent', navigator.userAgent);
        headers.append('x-auth-token', getCookie('API_KEY'));
        headers.append('x-portfolio-token', getCookie('PORTFOLIO_ID'));
        return headers;
    }

    const fetchSession = async () => {
        const requestOptions = {
            method: 'GET',
            headers: fetchHeaders(),
            redirect: 'follow'
        };
        
        try {
            const response = await fetch('https://api.koinly.io/api/sessions', requestOptions);
            return response.json();
        } catch(err) {
            console.error(err)
            throw new Error('Fetch session failed')
        }
    }

    const fetchPage = async (pageNumber) => {
        const requestOptions = {
            method: 'GET',
            headers: fetchHeaders(),
            redirect: 'follow'
        };
        
        try {
            const response = await fetch(`https://api.koinly.io/api/transactions?per_page=${PAGE_COUNT}&order=date&page=${pageNumber}`, requestOptions);
            return response.json();
        } catch(err) {
            console.error(err)
            throw new Error(`Fetch failed for page=${pageNumber}`)
        }
    }

    const getAllTransactions = async () => {
        const firstPage = await fetchPage(1);
        const totalPages = firstPage.meta.page.total_pages;
        const promises = [];
        for (let i=2; i <= totalPages; i++) {
            promises.push(fetchPage(i));
        }
        const remainingPages = await Promise.all(promises);
        const allPages = [firstPage, ...remainingPages];
        return allPages.flatMap(it => it.transactions);
    }
    
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
    

    const toCSVFile = (baseCurrency, transactions) => {  
   
        // Headings
        // Representing Koinly Spreadsheet (https://docs.google.com/spreadsheets/d/1dESkilY70aLlo18P3wqXR_PX1svNyAbkYiAk2tBPJng/edit#gid=0)
        const headings = [
            'Date', 
            'Transaction Type', 
            'Label', 
            'Ignored?', 
            'Ign. Reason', 
            'F(From)_Wallet', // All From headers start with F_
            'F_Source', 
            'T(To)_Wallet',  // All To headers start with T_
            'T_Source', 
            'F_Amount', 
            'F_Cur', // From Currency 
            'F_Cur ID',
            'F_Cur Type',
            'F_Cost Basis', 
            'F_Cost Basis Cur', 
            'T_Amount', 
            'T_Cur', 
            'T_Cur ID', 
            'T_Cur Type',
            'T_Cost Basis', 
            'T_Cost Basis Cur', 
            'Fee Amount', 
            'Fee Cur',
            'Fee Cur ID',
            'Fee Cur Type',
            'Fee Value', 
            'Fee Value Cur', 
            'Net Worth Amount', 
            'Net Worth Cur', 
            'Gain', 
            'Gain Cur', 
            'Cost Basis Method', 
            'Manual?', 
            'Missing Rates?', 
            'Missing Cost Basis?', 
            'Description', 
            'TxHash',
            // EXTRA_HEADERS: Add extra headers as necessary (ensure you also update "row" below)
        ];
        
        const transactionRows = transactions.map((t) =>
            [
                t.date,
                t.type,
                t.label ? t.label : '',
                t.ignored ? t.ignored : '',
                t.ignored_reason ? t.ignored_reason : '',
                t.from ? t.from.wallet.name : '',
                t.from_source ? t.from_source : '',
                t.to ? t.to.wallet.name : '',
                t.to_source ? t.to_source : '',
                t.from ? t.from.amount : '',
                t.from ? t.from.currency.symbol : '',
                t.from ? t.from.currency.id : '',
                t.from ? t.from.currency.type : '',
                t.from ? t.from.cost_basis : '',
                t.from?.cost_basis ? baseCurrency : '',
                t.to ? t.to.amount : '',
                t.to ? t.to.currency.symbol : '',
                t.to ? t.to.currency.id : '',
                t.to ? t.to.currency.type : '',
                t.to ? t.to.cost_basis : '',
                t.to?.cost_basis ? baseCurrency : '',
                t.fee ? t.fee.amount : '',
                t.fee ? t.fee.currency.symbol : '',
                t.fee ? t.fee.currency.id : '',
                t.fee ? t.fee.currency.type : '',
                t.fee ? t.fee_value : '',
                t.fee_value? baseCurrency : '',
                t.net_value,
                t.net_value? baseCurrency : '',
                t.gain,
                t.gain? baseCurrency : '',
                t.cost_basis_method,
                t.missing_rates ? t.missing_rates : '',
                t.missing_cost_basis ? t.missing_cost_basis : '',
                t.manual ? t.manual : '',
                t.description,
                t.txhash,
            ].map(escapeCSV).join(',') // Wendet die escapeCSV-Funktion auf jedes Feld an.
        );        
   
        const csv = [
            headings.join(','), 
            ...transactionRows
        ].join('\n');
         
        const hiddenElement = document.createElement('a');
        hiddenElement.href = 'data:text/csv;charset=utf-8,' + encodeURI(csv);
        hiddenElement.target = '_blank';
        hiddenElement.download = 'Koinly Transactions.csv';
        hiddenElement.click();
    }

    const run = async () => {
        const session = await fetchSession()
        const baseCurrency = session.portfolios[0].base_currency.symbol;
        const transactions = await getAllTransactions()
        console.log('Your Koinly Transactions\n', transactions)
        toCSVFile(baseCurrency, transactions)
    }

    run()
})()
