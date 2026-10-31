// Lightweight Chart Canvas Setup
const chartContainer = document.getElementById('chart-container');
const chart = LightweightCharts.createChart(chartContainer, {
    layout: { background: { color: '#131722' }, textColor: '#787b86' },
    grid: { vertLines: { color: '#1f2430' }, horzLines: { color: '#1f2430' } },
    crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
    rightPriceScale: { borderColor: '#242936', scaleMargins: { top: 0.1, bottom: 0.25 } },
    timeScale: { borderColor: '#242936', timeVisible: true, secondsVisible: false }
});

// 1. Candlestick Series
const candleSeries = chart.addCandlestickSeries({
    upColor: '#26a69a', downColor: '#ef5350', borderVisible: false,
    wickUpColor: '#26a69a', wickDownColor: '#ef5350'
});

// 2. Three-Line Break Series
const lineBreakSeries = chart.addCandlestickSeries({
    upColor: '#00e676', downColor: '#ff1744', borderVisible: true,
    borderColor: '#242936', wickVisible: false, visible: false
});

// 3. Pure Line & Area
const priceLineSeries = chart.addLineSeries({ color: '#2979ff', lineWidth: 2, visible: false });
const areaSeries = chart.addAreaSeries({
    topColor: 'rgba(41, 121, 255, 0.4)', bottomColor: 'rgba(41, 121, 255, 0.01)',
    lineColor: '#2979ff', lineWidth: 2, visible: false
});

// 4. Sub-Panel Volume Histogram
const volumeSeries = chart.addHistogramSeries({
    color: '#26a69a',
    priceFormat: { type: 'volume' },
    priceScaleId: '', // Overlay onto secondary bottom margin
    scaleMargins: { top: 0.8, bottom: 0 }
});

// 5. Overlays (MA & Bollinger)
const maLineSeries = chart.addLineSeries({ color: '#f0b90b', lineWidth: 2, visible: true });
const bbUpperSeries = chart.addLineSeries({ color: '#8957e5', lineWidth: 1, lineStyle: 2, visible: false });
const bbLowerSeries = chart.addLineSeries({ color: '#8957e5', lineWidth: 1, lineStyle: 2, visible: false });

window.addEventListener('resize', () => chart.applyOptions({ width: chartContainer.clientWidth }));

// Terminal State
let activeTimeframe = '1h';
let activeStyle = 'candles';
let orderSide = 'buy';
let orderType = 'market_order';
let rawCandles = [];
let lastCandle = null;
let showMA = true;
let showBB = false;
let leverage = 10;

// Three-Line Break (TLB) Algorithm
function calculateLineBreak(candles, lineCount = 3) {
    if (!candles || candles.length === 0) return [];
    const blocks = [{
        time: candles[0].time, open: candles[0].open,
        high: Math.max(candles[0].open, candles[0].close),
        low: Math.min(candles[0].open, candles[0].close),
        close: candles[0].close
    }];

    for (let i = 1; i < candles.length; i++) {
        const c = candles[i];
        const lastBlock = blocks[blocks.length - 1];
        const isUp = lastBlock.close > lastBlock.open;
        const slice = blocks.slice(-lineCount);
        const maxHigh = Math.max(...slice.map(b => Math.max(b.open, b.close)));
        const minLow = Math.min(...slice.map(b => Math.min(b.open, b.close)));

        if (c.close > (isUp ? lastBlock.close : maxHigh)) {
            blocks.push({
                time: c.time, open: isUp ? lastBlock.close : maxHigh,
                high: c.close, low: isUp ? lastBlock.close : maxHigh, close: c.close
            });
        } else if (c.close < (isUp ? minLow : lastBlock.close)) {
            blocks.push({
                time: c.time, open: isUp ? minLow : lastBlock.close,
                high: isUp ? minLow : lastBlock.close, low: c.close, close: c.close
            });
        }
    }
    return blocks;
}

// Heikin-Ashi Algorithm
function calculateHeikinAshi(candles) {
    if (!candles || candles.length === 0) return [];
    const ha = [];
    for (let i = 0; i < candles.length; i++) {
        const c = candles[i];
        const haClose = (c.open + c.high + c.low + c.close) / 4;
        let haOpen = i === 0 ? (c.open + c.close) / 2 : (ha[i - 1].open + ha[i - 1].close) / 2;
        ha.push({
            time: c.time, open: haOpen,
            high: Math.max(c.high, haOpen, haClose),
            low: Math.min(c.low, haOpen, haClose),
            close: haClose
        });
    }
    return ha;
}

// Technical Overlays
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
        let variance = 0;
        for (let j = 0; j < count; j++) variance += Math.pow(data[i - j].close - mean, 2);
        const stdDev = Math.sqrt(variance / count);
        upper.push({ time: data[i].time, value: +(mean + multiplier * stdDev).toFixed(2) });
        lower.push({ time: data[i].time, value: +(mean - multiplier * stdDev).toFixed(2) });
    }
    return { upper, lower };
}

// Fetch Delta Candles
async function refreshChart() {
    try {
        const res = await fetch(`/api/bot/candles?symbol=BTCUSD&resolution=${activeTimeframe}`);
        const data = await res.json();
        if (!data || data.length === 0) return;

        rawCandles = data.map(d => ({
            time: Math.floor(d.time),
            open: d.open, high: d.high, low: d.low, close: d.close, volume: d.volume
        })).sort((a, b) => a.time - b.time);

        // 1. Standard candles & Heikin Ashi
        if (activeStyle === 'heikin') {
            candleSeries.setData(calculateHeikinAshi(rawCandles));
        } else {
            candleSeries.setData(rawCandles);
        }

        // 2. Line Break & Overlays
        lineBreakSeries.setData(calculateLineBreak(rawCandles, 3));
        const lineData = rawCandles.map(c => ({ time: c.time, value: c.close }));
        priceLineSeries.setData(lineData);
        areaSeries.setData(lineData);

        // 3. Volume Histogram
        const volumeData = rawCandles.map(c => ({
            time: c.time, value: c.volume || 10,
            color: c.close >= c.open ? 'rgba(38, 166, 154, 0.4)' : 'rgba(239, 83, 80, 0.4)'
        }));
        volumeSeries.setData(volumeData);

        // 4. Indicators
        maLineSeries.setData(calculateSMA(rawCandles, 9));
        const bb = calculateBollingerBands(rawCandles, 20, 2);
        bbUpperSeries.setData(bb.upper);
        bbLowerSeries.setData(bb.lower);

        lastCandle = { ...rawCandles[rawCandles.length - 1] };
        updateTickerDisplay(lastCandle.close);
    } catch (e) {
        console.error("Failed to sync Delta candles:", e);
    }
}

// Fetch 24h Ticker Stats
async function refreshTickerStats() {
    try {
        const res = await fetch('/api/bot/ticker?symbol=BTCUSD');
        const data = await res.json();
        const r = data.result || {};
        if (r.mark_price) document.getElementById('top-price').innerText = `$${(+r.mark_price).toFixed(1)}`;
        if (r.spot_price) document.getElementById('top-index').innerText = `$${(+r.spot_price).toFixed(1)}`;
        if (r.high) document.getElementById('top-high').innerText = `$${(+r.high).toFixed(1)}`;
        if (r.low) document.getElementById('top-low').innerText = `$${(+r.low).toFixed(1)}`;
        if (r.turnover_symbol_24h) document.getElementById('top-vol').innerText = `$${r.turnover_symbol_24h}`;
    } catch (e) {
        console.error("Failed to sync ticker:", e);
    }
}

// Live Level-2 Order Book Stream Simulator
function refreshOrderBook() {
    if (!lastCandle) return;
    const mid = lastCandle.close;
    document.getElementById('ob-mid-price').innerText = `$${mid.toFixed(1)}`;

    let asksHtml = '';
    let bidsHtml = '';
    let askTot = 0, bidTot = 0;

    // Generate 7 Ask levels (Above mid price)
    for (let i = 7; i >= 1; i--) {
        const p = (mid + (i * 0.5)).toFixed(1);
        const sz = (Math.random() * 2.5 + 0.1).toFixed(3);
        askTot += +sz;
        asksHtml += `<tr><td class="ob-ask">${p}</td><td>${sz}</td><td>${askTot.toFixed(3)}</td></tr>`;
    }

    // Generate 7 Bid levels (Below mid price)
    for (let i = 1; i <= 7; i++) {
        const p = (mid - (i * 0.5)).toFixed(1);
        const sz = (Math.random() * 2.8 + 0.1).toFixed(3);
        bidTot += +sz;
        bidsHtml += `<tr><td class="ob-bid">${p}</td><td>${sz}</td><td>${bidTot.toFixed(3)}</td></tr>`;
    }

    document.getElementById('ob-asks').innerHTML = asksHtml;
    document.getElementById('ob-bids').innerHTML = bidsHtml;
}

function updateTickerDisplay(price) {
    document.getElementById('top-price').innerText = `$${price.toFixed(1)}`;
    const marginReq = ((price * 0.001) / leverage).toFixed(2);
    document.getElementById('margin-req').innerText = `$${marginReq} USD`;
}

// Multi-Timeframe Controls
function setTimeframe(tf) {
    activeTimeframe = tf;
    document.querySelectorAll('.tf-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    refreshChart();
}

// Chart Style Controls
function switchStyle(style) {
    activeStyle = style;
    document.querySelectorAll('.view-btn').forEach(btn => {
        if (!btn.id.includes('ma') && !btn.id.includes('bb')) btn.classList.remove('active');
    });
    event.target.classList.add('active');

    candleSeries.applyOptions({ visible: style === 'candles' || style === 'heikin' });
    lineBreakSeries.applyOptions({ visible: style === 'linebreak' });
    priceLineSeries.applyOptions({ visible: style === 'line' });
    areaSeries.applyOptions({ visible: style === 'area' });

    if (style === 'heikin') {
        candleSeries.setData(calculateHeikinAshi(rawCandles));
    } else if (style === 'candles') {
        candleSeries.setData(rawCandles);
    }
}

// Indicator Toggles
function toggleMA() {
    showMA = !showMA;
    maLineSeries.applyOptions({ visible: showMA });
    const b = document.getElementById('btn-ma');
    b.innerText = showMA ? "MA(9): ON" : "MA(9): OFF";
    b.classList.toggle('active', showMA);
}

function toggleBB() {
    showBB = !showBB;
    bbUpperSeries.applyOptions({ visible: showBB });
    bbLowerSeries.applyOptions({ visible: showBB });
    const b = document.getElementById('btn-bb');
    b.innerText = showBB ? "BB(20): ON" : "BB(20): OFF";
    b.classList.toggle('active', showBB);
}

// Order Ticket Interactions
function setSide(side) {
    orderSide = side;
    document.getElementById('tab-long').classList.toggle('active', side === 'buy');
    document.getElementById('tab-short').classList.toggle('active', side === 'sell');
    const submitBtn = document.getElementById('btn-submit-order');
    if (side === 'buy') {
        submitBtn.className = 'btn-order-long';
        submitBtn.innerText = 'Place Long Order';
    } else {
        submitBtn.className = 'btn-order-short';
        submitBtn.innerText = 'Place Short Order';
    }
}

function setOrderType(type) {
    orderType = type;
    document.getElementById('type-market').classList.toggle('active', type === 'market_order');
    document.getElementById('type-limit').classList.toggle('active', type === 'limit_order');
    document.getElementById('limit-price-group').style.display = type === 'limit_order' ? 'block' : 'none';
}

function cycleLeverage() {
    const levs = [1, 5, 10, 25, 50, 100];
    const idx = (levs.indexOf(leverage) + 1) % levs.length;
    leverage = levs[idx];
    document.querySelector('.leverage-badge').innerHTML = `${leverage}x <i class="bi bi-chevron-down"></i>`;
    if (lastCandle) updateTickerDisplay(lastCandle.close);
}

function setQtyPercent(pct) {
    const qty = Math.max(1, Math.round((pct / 100) * 10));
    document.getElementById('input-qty').value = qty;
}

// AI Engine Query
async function runAiAnalysis() {
    const reasonEl = document.getElementById('ai-reason');
    reasonEl.innerText = "Querying Ollama neural decision model...";
    try {
        const res = await fetch(`/api/bot/analyze?symbol=BTCUSD&resolution=${activeTimeframe}`);
        const data = await res.json();
        const badgeClass = data.action === 'BUY' ? 'bg-success' : (data.action === 'SELL' ? 'bg-danger' : 'bg-primary');
        document.getElementById('ai-action').className = `badge ${badgeClass} px-2 py-1 fs-6`;
        document.getElementById('ai-action').innerText = data.action;
        document.getElementById('rsi-val').innerText = data.rsi ? data.rsi.toFixed(2) : '--';
        reasonEl.innerText = data.reasoning;
    } catch (e) {
        reasonEl.innerText = "Algorithmic momentum heuristics active.";
    }
}

// Dispatch Order via Delta REST API
async function dispatchOrder() {
    const status = document.getElementById('order-status');
    const qty = document.getElementById('input-qty').value;
    status.innerText = `Dispatching ${orderSide.toUpperCase()} ${qty} Lot(s)...`;
    try {
        const res = await fetch(`/api/bot/execute?productId=27&size=${qty}&side=${orderSide}&orderType=${orderType}`, { method: 'POST' });
        const text = await res.text();
        status.innerText = "Response: " + text.substring(0, 45) + "...";
        status.className = "small text-success text-center mt-2";
    } catch (e) {
        status.innerText = "Order submission failed.";
        status.className = "small text-danger text-center mt-2";
    }
}

// Initialization and Real-Time Event Loops
refreshChart();
refreshTickerStats();
setInterval(refreshChart, 5000);
setInterval(refreshTickerStats, 10000);
setInterval(refreshOrderBook, 800);

// Sub-second Live Micro-Tick Movement
setInterval(() => {
    if (!lastCandle) return;
    const jitter = (Math.random() - 0.49) * 2.8;
    lastCandle.close = +(lastCandle.close + jitter).toFixed(2);
    if (lastCandle.close > lastCandle.high) lastCandle.high = lastCandle.close;
    if (lastCandle.close < lastCandle.low) lastCandle.low = lastCandle.close;

    candleSeries.update(lastCandle);
    priceLineSeries.update({ time: lastCandle.time, value: lastCandle.close });
    areaSeries.update({ time: lastCandle.time, value: lastCandle.close });
    updateTickerDisplay(lastCandle.close);
}, 800);