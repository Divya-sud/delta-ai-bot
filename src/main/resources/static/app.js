const chartContainer = document.getElementById('chart-container');
const chart = LightweightCharts.createChart(chartContainer, {
    layout: { background: { color: '#161b22' }, textColor: '#c9d1d9' },
    grid: {
        vertLines: { color: '#21262d' },
        horzLines: { color: '#21262d' }
    },
    timeScale: { timeVisible: true, secondsVisible: false }
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

async function refreshChart() {
    try {
        const res = await fetch('/api/bot/candles?symbol=BTCUSD&resolution=5m');
        const data = await res.json();

        // Map Delta payload to TradingView format
        const formatted = data.map(d => ({
            time: Math.floor(d.time),
            open: d.open,
            high: d.high,
            low: d.low,
            close: d.close
        })).sort((a, b) => a.time - b.time);

        candleSeries.setData(formatted);
        if (formatted.length > 0) {
            document.getElementById('price-tag').innerText = `$${formatted[formatted.length - 1].close.toFixed(2)}`;
        }
    } catch (e) {
        console.error("Failed to load candles:", e);
    }
}

async function runAiAnalysis() {
    const reasonEl = document.getElementById('ai-reason');
    reasonEl.innerText = "Querying Ollama model...";
    try {
        const res = await fetch('/api/bot/analyze?symbol=BTCUSD');
        const data = await res.json();

        const badgeClass = data.action === 'BUY' ? 'badge-buy' : (data.action === 'SELL' ? 'badge-sell' : 'badge-hold');
        document.getElementById('ai-action').innerHTML = `<span class="badge ${badgeClass}">${data.action}</span>`;
        document.getElementById('ai-confidence').style.width = `${Math.round(data.confidence * 100)}%`;
        document.getElementById('rsi-val').innerText = data.rsi.toFixed(2);
        reasonEl.innerText = data.reasoning;
    } catch (e) {
        reasonEl.innerText = "Inference failed: Ensure Ollama is running (`ollama serve`).";
    }
}

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

// Initial boot
refreshChart();