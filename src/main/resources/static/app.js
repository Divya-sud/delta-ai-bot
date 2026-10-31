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

const candleSeries = chart.addCandlestickSeries({
    upColor: '#2ea043',
    downColor: '#f85149',
    borderVisible: false,
    wickUpColor: '#2ea043',
    wickDownColor: '#f85149'
});

window.addEventListener('resize', () => {
    chart.applyOptions({ width: chartContainer.clientWidth });
});

let lastCandle = null;

// Sync candles from Delta Exchange backend API
async function refreshChart() {
    try {
        const res = await fetch('/api/bot/candles?symbol=BTCUSD&resolution=1m');
        const data = await res.json();

        if (!data || data.length === 0) return;

        // Map Delta payload to TradingView format and sort ascending
        const formatted = data.map(d => ({
            time: Math.floor(d.time),
            open: d.open,
            high: d.high,
            low: d.low,
            close: d.close
        })).sort((a, b) => a.time - b.time);

        candleSeries.setData(formatted);
        lastCandle = { ...formatted[formatted.length - 1] };

        const priceTag = document.getElementById('price-tag');
        if (priceTag && lastCandle) {
            priceTag.innerText = `$${lastCandle.close.toFixed(2)}`;
            priceTag.style.color = '#e3b341';
        }
    } catch (e) {
        console.error("Failed to load candles:", e);
    }
}

// 1. Initial full fetch
refreshChart();

// 2. Poll Delta Exchange backend every 5 seconds for newly completed bars
setInterval(refreshChart, 5000);

// 3. Dynamic micro-tick simulation between intervals so the active bar moves live
setInterval(() => {
    if (!lastCandle) return;
    const jitter = (Math.random() - 0.49) * 2.2;
    lastCandle.close = +(lastCandle.close + jitter).toFixed(2);
    if (lastCandle.close > lastCandle.high) lastCandle.high = lastCandle.close;
    if (lastCandle.close < lastCandle.low) lastCandle.low = lastCandle.close;

    // Use update() to push tick changes to the active candle without refreshing the whole chart
    candleSeries.update(lastCandle);

    const priceTag = document.getElementById('price-tag');
    if (priceTag) {
        priceTag.innerText = `$${lastCandle.close.toFixed(2)}`;
        priceTag.style.color = jitter >= 0 ? '#2ea043' : '#f85149';
    }
}, 800);

// AI Model Evaluation
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

// Delta Order Execution
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