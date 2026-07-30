document.addEventListener('DOMContentLoaded', () => {
    fetchData();
    // Otomatik güncelleme: Her 5 dakikada bir (300.000 ms) verileri yeniden çeker
    setInterval(fetchData, 5 * 60 * 1000);
});

async function fetchData() {
    try {
        const response = await fetch('/api/measurements');
        if (!response.ok) throw new Error('API Hatası');
        const data = await response.json();
        
        processAndDisplayData(data);
    } catch (error) {
        console.error('Veri çekme hatası:', error);
        document.getElementById('metrics-grid').innerHTML = `
            <div class="loading-state">
                <p style="color: var(--temp-color)">Veri alınamadı. Sunucu bağlantısını kontrol edin.</p>
            </div>
        `;
        document.getElementById('main-title').innerText = "Bağlantı Hatası";
        document.getElementById('pool-info').innerText = "";
    }
}

function processAndDisplayData(data) {
    const cloudAccount = data?.data?.CloudAccount;
    if (!cloudAccount || !cloudAccount.Accounts || cloudAccount.Accounts.length === 0) {
        document.getElementById('main-title').innerText = "Havuz Bulunamadı";
        document.getElementById('pool-info').innerText = "";
        return;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const poolIdParam = urlParams.get('poolId');

    let account = null;
    
    // Eğer URL'de poolId belirtilmişse (Örn: ?poolId=2), o hesabı bul
    if (poolIdParam) {
        account = cloudAccount.Accounts.find(acc => acc.id == poolIdParam);
    }
    
    // Eğer poolId verilmemişse veya bulunamadıysa, ölçümleri olan ilk hesabı bul
    if (!account) {
        for (const acc of cloudAccount.Accounts) {
            if (acc.Measurements && acc.Measurements.length > 0) {
                account = acc;
                break;
            }
        }
    }
    
    if (!account) account = cloudAccount.Accounts[0]; // Son çare ilkini al

    let poolName = account.pooltext;
    if (!poolName || poolName.trim() === '-' || poolName.trim() === '') {
        poolName = `${account.forename || ''} ${account.surname || ''}`.trim();
        if(!poolName) poolName = "Havuz";
    }
    document.getElementById('main-title').innerText = poolName;

    const measurements = account.Measurements || [];
    measurements.sort((a, b) => b.timestamp - a.timestamp);

    let phMeasurement = null;
    let clMeasurement = null;
    let tempMeasurement = null;

    for (const m of measurements) {
        if (!phMeasurement && (m.parameter === 'PL pH' || m.scenario === '429-pH-PoolLab')) phMeasurement = m;
        if (!clMeasurement && (m.parameter.includes('Chlorine') || m.scenario.includes('Chlorine'))) clMeasurement = m;
        if (!tempMeasurement && (m.parameter === 'PL Temp' || m.scenario.includes('Temp') || m.parameter.includes('Temp'))) tempMeasurement = m;
        if (phMeasurement && clMeasurement && tempMeasurement) break;
    }

    const grid = document.getElementById('metrics-grid');
    grid.innerHTML = ''; 

    // Define thresholds
    // pH: Ideal (7.0 - 7.6), Warning (6.8-6.9 or 7.7-7.8), Danger (<6.8 or >7.8)
    if (phMeasurement) {
        const phStatus = getStatusCustom(phMeasurement.value, { 
            minDanger: 6.8, minWarning: 7.0, maxWarning: 7.6, maxDanger: 7.8 
        });
        grid.appendChild(createMetricCard('pH', phMeasurement.value, 'pH', phMeasurement.timestamp, 'ph', phStatus));
    }
    
    // Chlorine: Ideal (1.0 - 3.0), Warning (0.5-0.9 or 3.1-5.0), Danger (<0.5 or >5.0)
    if (clMeasurement) {
        const clStatus = getStatusCustom(clMeasurement.value, {
            minDanger: 0.5, minWarning: 1.0, maxWarning: 3.0, maxDanger: 5.0
        });
        grid.appendChild(createMetricCard('Serbest Klor', clMeasurement.value, clMeasurement.unit || 'ppm', clMeasurement.timestamp, 'cl', clStatus));
    }
    
    // Temperature: Ideal (25-32), Warning (20-24 or 32-35), Danger (<20 or >35)
    if (tempMeasurement) {
        const tempStatus = getStatusCustom(tempMeasurement.value, {
            minDanger: 20, minWarning: 25, maxWarning: 32, maxDanger: 35
        });
        grid.appendChild(createMetricCard('Sıcaklık', tempMeasurement.value, '°C', tempMeasurement.timestamp, 'temp', tempStatus));
    }

    const maxTime = Math.max(
        phMeasurement ? phMeasurement.timestamp : 0, 
        clMeasurement ? clMeasurement.timestamp : 0,
        tempMeasurement ? tempMeasurement.timestamp : 0
    );
    
    if (maxTime > 0) {
        document.getElementById('pool-info').innerText = `Son ölçüm: ${formatDate(maxTime)}`;
        // Hide the old last-updated since we moved it to header
        const oldLastUpdated = document.getElementById('last-updated');
        if(oldLastUpdated) oldLastUpdated.style.display = 'none';
    }
}

// Logic: value < minDanger => danger
// minDanger <= value < minWarning => warning
// minWarning <= value <= maxWarning => ideal
// maxWarning < value <= maxDanger => warning
// value > maxDanger => danger
function getStatusCustom(value, thresholds) {
    const val = parseFloat(value);
    if (isNaN(val)) return 'ideal';
    
    if (val < thresholds.minDanger || val > thresholds.maxDanger) return 'danger';
    if (val < thresholds.minWarning || val > thresholds.maxWarning) return 'warning';
    return 'ideal';
}

function getStatusText(status) {
    switch (status) {
        case 'ideal': return 'İdeal';
        case 'warning': return 'Dikkat';
        case 'danger': return 'Riskli';
        default: return '';
    }
}

function formatDate(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp * 1000);
    return date.toLocaleString('tr-TR', { 
        day: '2-digit', month: '2-digit', year: 'numeric', 
        hour: '2-digit', minute: '2-digit'
    });
}

function formatValue(value) {
    const val = parseFloat(value);
    if (isNaN(val)) return value;
    return val.toFixed(2);
}

const icons = {
    ph: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 22C17.5 22 22 17.5 22 12C22 6.5 12 2 12 2C12 2 2 6.5 2 12C2 17.5 6.5 22 12 22Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>`,
    cl: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C12 2 2 8.5 2 14.5C2 20.0228 6.47715 24.5 12 24.5C17.5228 24.5 22 20.0228 22 14.5C22 8.5 12 2 12 2Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 16.5C14.2091 16.5 16 14.7091 16 12.5C16 10.2909 14.2091 8.5 12 8.5C9.79086 8.5 8 10.2909 8 12.5C8 14.7091 9.79086 16.5 12 16.5Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>`,
    temp: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 14C13.6569 14 15 12.6569 15 11V5C15 3.34315 13.6569 2 12 2C10.3431 2 9 3.34315 9 5V11C9 12.6569 10.3431 14 12 14Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 22C14.7614 22 17 19.7614 17 17C17 14.9463 15.759 13.1818 14 12.418V11C14 9.89543 13.1046 9 12 9C10.8954 9 10 9.89543 10 11V12.418C8.24099 13.1818 7 14.9463 7 17C7 19.7614 9.23858 22 12 22Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`
};

function createMetricCard(title, value, unit, timestamp, type, status) {
    const card = document.createElement('div');
    card.className = `metric-card ${type} status-${status}`;
    
    // Değerlerin rengini status'e göre değiştireceğiz
    // CSS'de .status-ideal, .status-warning, .status-danger class'larını ekleyeceğiz
    
    card.innerHTML = `
        <div class="metric-header">
            <span class="metric-title">${title}</span>
            <div class="metric-icon">
                ${icons[type] || ''}
            </div>
        </div>
        <div class="metric-value-container">
            <span class="metric-value status-text-${status}">${formatValue(value)}</span>
            <span class="metric-unit">${unit}</span>
        </div>
        <div class="metric-footer">
            <span class="timestamp">${formatDate(timestamp)}</span>
            <span class="status-badge ${status}">${getStatusText(status)}</span>
        </div>
    `;
    
    return card;
}
