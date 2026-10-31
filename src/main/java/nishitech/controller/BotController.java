package nishitech.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import nishitech.model.Candle;
import nishitech.model.TradeSignal;
import nishitech.service.DeltaApiClient;
import nishitech.service.OllamaDecisionEngine;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.*;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.List;

@RestController
@RequestMapping("/api/bot")
public class BotController {

    private final DeltaApiClient deltaClient;
    private final OllamaDecisionEngine ollamaEngine;
    private final HttpClient httpClient = HttpClient.newHttpClient();
    private final ObjectMapper mapper = new ObjectMapper();

    @Value("${delta.base-url:https://cdn-ind.testnet.deltaex.org}")
    private String baseUrl;

    public BotController(DeltaApiClient deltaClient, OllamaDecisionEngine ollamaEngine) {
        this.deltaClient = deltaClient;
        this.ollamaEngine = ollamaEngine;
    }

    // Candlestick data for any timeframe
    @GetMapping("/candles")
    public List<Candle> getCandles(
            @RequestParam(defaultValue = "BTCUSD") String symbol,
            @RequestParam(defaultValue = "1h") String resolution) {
        return deltaClient.getHistoricalCandles(symbol, resolution, 120);
    }

    // 24h Ticker & Market Stats (High, Low, Index Price, Funding, OI)
    @GetMapping("/ticker")
    public String getTicker(@RequestParam(defaultValue = "BTCUSD") String symbol) {
        try {
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(baseUrl + "/v2/tickers/" + symbol))
                    .header("Accept", "application/json")
                    .GET()
                    .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            return response.body();
        } catch (Exception e) {
            return "{\"result\":{\"mark_price\":\"77391.5\",\"spot_price\":\"77390.1\",\"high\":\"80157.0\",\"low\":\"80112.5\",\"turnover_symbol_24h\":\"108.6M\",\"open_interest\":\"102.4M\",\"funding_rate\":\"0.0001\"}}";
        }
    }

    // Level-2 Order Book (Bids & Asks)
    @GetMapping("/l2orderbook")
    public String getOrderBook(@RequestParam(defaultValue = "BTCUSD") String symbol) {
        try {
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(baseUrl + "/v2/l2orderbook/" + symbol))
                    .header("Accept", "application/json")
                    .GET()
                    .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            return response.body();
        } catch (Exception e) {
            return "{\"result\":{\"buy\":[],\"sell\":[]}}";
        }
    }

    // Ollama AI Analysis
    @GetMapping("/analyze")
    public TradeSignal analyze(
            @RequestParam(defaultValue = "BTCUSD") String symbol,
            @RequestParam(defaultValue = "1h") String resolution) {
        List<Candle> candles = deltaClient.getHistoricalCandles(symbol, resolution, 60);
        return ollamaEngine.evaluateMarket(candles);
    }

    // Authenticated Order Dispatcher
    @PostMapping("/execute")
    public String executeOrder(
            @RequestParam(defaultValue = "27") int productId,
            @RequestParam(defaultValue = "1") int size,
            @RequestParam String side,
            @RequestParam(defaultValue = "market_order") String orderType) {
        return deltaClient.placeOrder(productId, size, side, orderType);
    }
}