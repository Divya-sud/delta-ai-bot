package nishitech.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import nishitech.model.Candle;
import nishitech.model.TradeSignal;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.List;

@Service
public class OllamaDecisionEngine {

    @Value("${ollama.url}")
    private String ollamaUrl;

    @Value("${ollama.model}")
    private String model;

    private final HttpClient httpClient = HttpClient.newHttpClient();
    private final ObjectMapper mapper = new ObjectMapper();

    public TradeSignal evaluateMarket(List<Candle> candles) {
        if (candles.size() < 15) {
            return new TradeSignal("HOLD", 0.0, "Insufficient market data", 50.0, 0.0);
        }

        double currentPrice = candles.get(candles.size() - 1).close();
        double rsi = calculateRSI(candles, 14);

        String prompt = String.format(
                "You are an algorithmic risk manager. Market conditions:\\n" +
                        "- Current Price: %.2f\\n" +
                        "- RSI (14 period): %.2f\\n" +
                        "Return valid JSON ONLY with format: " +
                        "{\\\"action\\\": \\\"BUY\\\" | \\\"SELL\\\" | \\\"HOLD\\\", \\\"confidence\\\": float, \\\"reasoning\\\": \\\"string\\\"}",
                currentPrice, rsi
        );

        try {
            String requestBody = mapper.createObjectNode()
                    .put("model", model)
                    .put("prompt", prompt)
                    .put("stream", false)
                    .put("format", "json")
                    .toString();

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(ollamaUrl))
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(requestBody))
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            JsonNode root = mapper.readTree(response.body());
            String responseText = root.get("response").asText();

            JsonNode signalJson = mapper.readTree(responseText);
            return new TradeSignal(
                    signalJson.path("action").asText("HOLD"),
                    signalJson.path("confidence").asDouble(0.0),
                    signalJson.path("reasoning").asText("Evaluated via Ollama"),
                    rsi,
                    currentPrice
            );
        } catch (Exception e) {
            return new TradeSignal("HOLD", 0.0, "Ollama service unavailable: " + e.getMessage(), rsi, currentPrice);
        }
    }

    private double calculateRSI(List<Candle> candles, int period) {
        double gains = 0, losses = 0;
        int size = candles.size();

        for (int i = size - period; i < size; i++) {
            double diff = candles.get(i).close() - candles.get(i - 1).close();
            if (diff >= 0) gains += diff;
            else losses += Math.abs(diff);
        }

        double avgGain = gains / period;
        double avgLoss = losses / period;

        if (avgLoss == 0) return 100.0;
        double rs = avgGain / avgLoss;
        return 100.0 - (100.0 / (1.0 + rs));
    }
}