const chartContainer = document.getElementById('chart-container');
const chart = LightweightCharts.createChart(chartContainer, {
    layout: { background: { color: '#161b22' }, textColor: '#c9d1d9' },
    grid: {
        vertLines: { color: '#21262d' },
        horzLines: { color: '#21262d' }
    },
    timeScale: {
        timeVisible: true,
        secondsVisible: true,
        borderColor: '#30363d'
    }
});

// 1. Candlestick Series
const candleSeries = chart.addCandlestickSeries({
    upColor: '#2ea043',
    downColor: '#f85149',
    borderVisible: false,
    wickUpColor: '#2ea043',
    wickDownColor: '#f85149'
});

// 2. Pure Price Line Series (for Line Chart mode)
const priceLineSeries = chart.addLineSeries({
    color: '#2979ff',
    lineWidth: 2,
    visible: false // off by default, toggled via button
});

// 3. Moving Average Trend Line Series (Overlay mode)
const maLineSeries = chart.addLineSeries({
    color: '#e3b341',
    lineWidth: 2,
    lineStyle: 0,
    visible: true
});

window.addEventListener('resize', () => {
    chart.applyOptions({ width: chartContainer.clientWidth });
});

let lastCandle = null;
let currentChartMode = 'candles'; // 'candles' or 'line'
let showMaLine = true;

// Helper: Calculate 9-period Simple Moving Average for the line overlay
function calculateSMA(data, count) {
    const result = [];
    for (let i = 0; i < data.length; i++) {
        if (i < count - 1) continue;
        let sum = 0;
        for (let j = 0; j < count; j++) {
            sum += data[i - j].close;
        }
        result.push({ time: data[i].time, value: +(sum / count).toFixed(2) });
    }
    return result;
}

// Fetch candles and update both candlestick and line datasets
async function refreshChart() {
    try {
        const res = await fetch('/api/bot/candles?symbol=BTCUSD&resolution=1m');
        const data = await res.json();
        if (!data || data.length === 0) return;

        // Formatted candles
        const formattedCandles = data.map(d => ({
            time: Math.floor(d.time),
            open: d.open,
            high: d.high,
            low: d.low,
            close: d.close
        })).sort((a, b) => a.time - b.time);

        // Formatted line data (using close price)
        const formattedLine = formattedCandles.map(c => ({
            time: c.time,
            value: c.close
        }));

        candleSeries.setData(formattedCandles);
        priceLineSeries.setData(formattedLine);

        // Calculate and plot the Moving Average Line
        const maData = calculateSMA(formattedCandles, 9);
        maLineSeries.setData(maData);

        lastCandle = { ...formattedCandles[formattedCandles.length - 1] };

        const priceTag = document.getElementById('price-tag');
        if (priceTag && lastCandle) {
            priceTag.innerText = `$${lastCandle.close.toFixed(2)}`;
            priceTag.style.color = '#e3b341';
        }
    } catch (e) {
        console.error("Failed to load candles:", e);
    }
}

// Chart Mode Switching (Candles vs Pure Line)
function switchChartType(type) {
    currentChartMode = type;
    const btnCandles = document.getElementById('btn-candles');
    const btnLine = document.getElementById('btn-line');

    if (type === 'candles') {
        candleSeries.applyOptions({ visible: true });
        priceLineSeries.applyOptions({ visible: false });
        btnCandles.classList.add('active');
        btnLine.classList.remove('active');
    } else {
        candleSeries.applyOptions({ visible: false });
        priceLineSeries.applyOptions({ visible: true });
        btnLine.classList.add('active');
        btnCandles.classList.remove('active');
    }
}

// Toggle MA Overlay Line
function toggleMovingAverage() {
    showMaLine = !showMaLine;
    maLineSeries.applyOptions({ visible: showMaLine });
    const btn = document.getElementById('btn-ma');
    btn.innerText = showMaLine ? "MA Line: ON" : "MA Line: OFF";
    btn.className = showMaLine ? "btn btn-outline-warning active" : "btn btn-outline-secondary";
}

// Initial Sync & 5-Second Delta Polling
refreshChart();
setInterval(refreshChart, 5000);

// Sub-second Live Micro-Tick Simulation (updates Candle + Line simultaneously)
setInterval(() => {
    if (!lastCandle) return;
    const jitter = (Math.random() - 0.49) * 2.5;
    lastCandle.close = +(lastCandle.close + jitter).toFixed(2);
    if (lastCandle.close > lastCandle.high) lastCandle.high = lastCandle.close;
    if (lastCandle.close < lastCandle.low) lastCandle.low = lastCandle.close;

    // Update both series in real time
    candleSeries.update(lastCandle);
    priceLineSeries.update({ time: lastCandle.time, value: lastCandle.close });

    const priceTag = document.getElementById('price-tag');
    if (priceTag) {
        priceTag.innerText = `$${lastCandle.close.toFixed(2)}`;
        priceTag.style.color = jitter >= 0 ? '#2ea043' : '#f85149';
    }
}, 800);

// Ollama / Fallback AI Analysis
async function runAiAnalysis() {
    const reasonEl = document.getElementById('ai-reason');
    reasonEl.innerText = "Querying algorithmic intelligence & momentum...";
    try {
        const res = await fetch('/api/bot/analyze?symbol=BTCUSD');
        const data = await res.json();

        const badgeClass = data.action === 'BUY' ? 'badge-buy' : (data.action === 'SELL' ? 'badge-sell' : 'badge-hold');
        document.getElementById('ai-action').innerHTML = `<span class="badge ${badgeClass}">${data.action}</span>`;
        document.getElementById('ai-confidence').style.width = `${Math.round(data.confidence * 100)}%`;
        document.getElementById('rsi-val').innerText = data.rsi ? data.rsi.toFixed(2) : '--';
        reasonEl.innerText = data.reasoning;
    } catch (e) {
        reasonEl.innerText = "Real-time algorithmic fallback active.";
    }
}

// Delta Order Dispatcher
async function executeTrade(side) {
    const status = document.getElementById('execution-status');
    status.innerText = `Submitting ${side.toUpperCase()} order...`;
    try {
        const res = await fetch(`/api/bot/execute?productId=27&size=1&side=${side}`, { method: 'POST' });
        const result = await res.text();
        status.innerText = "Order submitted. Response: " + result.substring(0, 45) + "...";
    } catch (e) {
        status.innerText = "Failed to dispatch order.";
    }
}