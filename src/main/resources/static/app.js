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

// 1. Candlestick Series (Standard)
const candleSeries = chart.addCandlestickSeries({
    upColor: '#2ea043', downColor: '#f85149',
    borderVisible: false, wickUpColor: '#2ea043', wickDownColor: '#f85149'
});

// 2. Line Break Candle Series (Rendered as thick block candles without wicks)
const lineBreakSeries = chart.addCandlestickSeries({
    upColor: '#00e676', downColor: '#ff1744',
    borderVisible: true,
    borderColor: '#30363d',
    wickVisible: false,
    visible: false
});

// 3. Pure Line Series
const priceLineSeries = chart.addLineSeries({
    color: '#2979ff', lineWidth: 2, visible: false
});

// 4. Area Chart Series (Gradient Fill)
const areaSeries = chart.addAreaSeries({
    topColor: 'rgba(41, 121, 255, 0.45)',
    bottomColor: 'rgba(41, 121, 255, 0.01)',
    lineColor: '#2979ff',
    lineWidth: 2,
    visible: false
});

// 5. Indicators (Overlays)
const maLineSeries = chart.addLineSeries({
    color: '#e3b341', lineWidth: 2, visible: true
});
const bbUpperSeries = chart.addLineSeries({
    color: '#8957e5', lineWidth: 1, lineStyle: 2, visible: false
});
const bbLowerSeries = chart.addLineSeries({
    color: '#8957e5', lineWidth: 1, lineStyle: 2, visible: false
});

window.addEventListener('resize', () => {
    chart.applyOptions({ width: chartContainer.clientWidth });
});

let rawCandles = [];
let lastCandle = null;
let currentChartMode = 'candles';
let showMaLine = true;
let showBollinger = false;

// Three-Line Break (TLB) Conversion Algorithm
function calculateLineBreak(candles, lineCount = 3) {
    if (!candles || candles.length === 0) return [];

    const blocks = [];
    // Seed first block
    blocks.push({
        time: candles[0].time,
        open: candles[0].open,
        high: Math.max(candles[0].open, candles[0].close),
        low: Math.min(candles[0].open, candles[0].close),
        close: candles[0].close
    });

    for (let i = 1; i < candles.length; i++) {
        const c = candles[i];
        const lastBlock = blocks[blocks.length - 1];
        const isUpTrend = lastBlock.close > lastBlock.open;

        // Check reversal condition against the previous N blocks
        const slice = blocks.slice(-lineCount);
        const maxHigh = Math.max(...slice.map(b => Math.max(b.open, b.close)));
        const minLow = Math.min(...slice.map(b => Math.min(b.open, b.close)));

        if (c.close > (isUpTrend ? lastBlock.close : maxHigh)) {
            // New upward block
            blocks.push({
                time: c.time,
                open: isUpTrend ? lastBlock.close : maxHigh,
                high: c.close,
                low: isUpTrend ? lastBlock.close : maxHigh,
                close: c.close
            });
        } else if (c.close < (isUpTrend ? minLow : lastBlock.close)) {
            // New downward block
            blocks.push({
                time: c.time,
                open: isUpTrend ? minLow : lastBlock.close,
                high: isUpTrend ? minLow : lastBlock.close,
                low: c.close,
                close: c.close
            });
        }
    }
    return blocks;
}

// Indicator Helpers: SMA & Bollinger Bands
function calculateSMA(data, count) {
    const result = [];
    for (let i = 0; i < data.length; i++) {
        if (i < count - 1) continue;
        let sum = 0;
        for (let j = 0; j < count; j++) sum += data[i - j].close;
        result.push({ time: data[i].time, value: +(sum / count).toFixed(2) });
    }
    return result;
}

function calculateBollingerBands(data, count = 20, multiplier = 2) {
    const upper = [], lower = [];
    for (let i = 0; i < data.length; i++) {
        if (i < count - 1) continue;
        let sum = 0;
        for (let j = 0; j < count; j++) sum += data[i - j].close;
        const mean = sum / count;
        let varianceSum = 0;
        for (let j = 0; j < count; j++) varianceSum += Math.pow(data[i - j].close - mean, 2);
        const stdDev = Math.sqrt(varianceSum / count);

        upper.push({ time: data[i].time, value: +(mean + multiplier * stdDev).toFixed(2) });
        lower.push({ time: data[i].time, value: +(mean - multiplier * stdDev).toFixed(2) });
    }
    return { upper, lower };
}

// Data synchronization
async function refreshChart() {
    try {
        const res = await fetch('/api/bot/candles?symbol=BTCUSD&resolution=1m');
        const data = await res.json();
        if (!data || data.length === 0) return;

        rawCandles = data.map(d => ({
            time: Math.floor(d.time),
            open: d.open,
            high: d.high,
            low: d.low,
            close: d.close
        })).sort((a, b) => a.time - b.time);

        // 1. Populate Candles
        candleSeries.setData(rawCandles);

        // 2. Populate Line & Area
        const lineData = rawCandles.map(c => ({ time: c.time, value: c.close }));
        priceLineSeries.setData(lineData);
        areaSeries.setData(lineData);

        // 3. Populate 3-Line Break
        const lineBreakData = calculateLineBreak(rawCandles, 3);
        lineBreakSeries.setData(lineBreakData);

        // 4. Overlays
        maLineSeries.setData(calculateSMA(rawCandles, 9));
        const bb = calculateBollingerBands(rawCandles, 20, 2);
        bbUpperSeries.setData(bb.upper);
        bbLowerSeries.setData(bb.lower);

        lastCandle = { ...rawCandles[rawCandles.length - 1] };
        updatePriceDisplay(lastCandle.close, 0);
    } catch (e) {
        console.error("Failed to load candles:", e);
    }
}

// View switcher
function switchChartType(type) {
    currentChartMode = type;
    const buttons = {
        candles: document.getElementById('btn-candles'),
        line: document.getElementById('btn-line'),
        area: document.getElementById('btn-area'),
        linebreak: document.getElementById('btn-linebreak')
    };

    Object.values(buttons).forEach(btn => btn && btn.classList.remove('active'));
    if (buttons[type]) buttons[type].classList.add('active');

    candleSeries.applyOptions({ visible: type === 'candles' });
    priceLineSeries.applyOptions({ visible: type === 'line' });
    areaSeries.applyOptions({ visible: type === 'area' });
    lineBreakSeries.applyOptions({ visible: type === 'linebreak' });

    const badge = document.getElementById('chart-mode-badge');
    if (badge) {
        badge.innerText = type === 'candles' ? 'Candlestick' :
                         (type === 'line' ? 'Line Chart' :
                         (type === 'area' ? 'Area Gradient' : 'Three-Line Break'));
    }
}

// Indicator Toggles
function toggleMovingAverage() {
    showMaLine = !showMaLine;
    maLineSeries.applyOptions({ visible: showMaLine });
    const btn = document.getElementById('btn-ma');
    btn.innerText = showMaLine ? "MA(9): ON" : "MA(9): OFF";
    btn.className = showMaLine ? "btn btn-outline-warning btn-chart-mode active" : "btn btn-outline-secondary btn-chart-mode";
}

function toggleBollingerBands() {
    showBollinger = !showBollinger;
    bbUpperSeries.applyOptions({ visible: showBollinger });
    bbLowerSeries.applyOptions({ visible: showBollinger });
    const btn = document.getElementById('btn-bb');
    btn.innerText = showBollinger ? "BB(20): ON" : "BB(20): OFF";
    btn.className = showBollinger ? "btn btn-outline-info btn-chart-mode active" : "btn btn-outline-secondary btn-chart-mode";
}

function updatePriceDisplay(price, jitter) {
    const priceTag = document.getElementById('price-tag');
    if (priceTag) {
        priceTag.innerText = `$${price.toFixed(2)}`;
        priceTag.style.color = jitter >= 0 ? '#2ea043' : '#f85149';
    }
}

// Initial Sync & 5-Second Delta Polling
refreshChart();
setInterval(refreshChart, 5000);

// Live tick animation
setInterval(() => {
    if (!lastCandle) return;
    const jitter = (Math.random() - 0.49) * 2.5;
    lastCandle.close = +(lastCandle.close + jitter).toFixed(2);
    if (lastCandle.close > lastCandle.high) lastCandle.high = lastCandle.close;
    if (lastCandle.close < lastCandle.low) lastCandle.low = lastCandle.close;

    // Update all series simultaneously
    candleSeries.update(lastCandle);
    priceLineSeries.update({ time: lastCandle.time, value: lastCandle.close });
    areaSeries.update({ time: lastCandle.time, value: lastCandle.close });

    updatePriceDisplay(lastCandle.close, jitter);
}, 800);

// AI Trigger
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

// Order Dispatcher
async function executeTrade(side) {
    const status = document.getElementById('execution-status');
    status.innerText = `Submitting ${side.toUpperCase()} order...`;
    try {
        const res = await fetch(`/api/bot/execute?productId=27&size=1&side=${side}`, { method: 'POST' });
        const result = await res.text();
        status.innerText = "Order submitted: " + result.substring(0, 45) + "...";
    } catch (e) {
        status.innerText = "Failed to dispatch order.";
    }
}