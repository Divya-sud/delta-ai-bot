package nishitech.controller;


import nishitech.model.Candle;
import nishitech.model.TradeSignal;
import nishitech.service.DeltaApiClient;
import nishitech.service.OllamaDecisionEngine;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/bot")
public class BotController {

    private final DeltaApiClient deltaClient;
    private final OllamaDecisionEngine ollamaEngine;

    public BotController(DeltaApiClient deltaClient, OllamaDecisionEngine ollamaEngine) {
        this.deltaClient = deltaClient;
        this.ollamaEngine = ollamaEngine;
    }

    @GetMapping("/candles")
    public List<Candle> getCandles(
            @RequestParam(defaultValue = "BTCUSD") String symbol,
            @RequestParam(defaultValue = "5m") String resolution) {
        return deltaClient.getHistoricalCandles(symbol, resolution, 100);
    }

    @GetMapping("/analyze")
    public TradeSignal analyze(@RequestParam(defaultValue = "BTCUSD") String symbol) {
        List<Candle> candles = deltaClient.getHistoricalCandles(symbol, "5m", 50);
        return ollamaEngine.evaluateMarket(candles);
    }

    @PostMapping("/execute")
    public String executeOrder(@RequestParam int productId, @RequestParam int size, @RequestParam String side) {
        return deltaClient.placeOrder(productId, size, side, "market_order");
    }
}