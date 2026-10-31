package nishitech.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import nishitech.model.Candle;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

@Service
public class DeltaApiClient {

    @Value("${delta.base-url}")
    private String baseUrl;

    @Value("${delta.api-key}")
    private String apiKey;

    @Value("${delta.api-secret}")
    private String apiSecret;

    private final HttpClient httpClient = HttpClient.newHttpClient();
    private final ObjectMapper mapper = new ObjectMapper();

    // 1. Fetch historical candles for Chart and Indicators
    public List<Candle> getHistoricalCandles(String symbol, String resolution, int candleCount) {
        long end = Instant.now().getEpochSecond();
        long intervalSeconds = switch (resolution) {
            case "1m" -> 60L;
            case "5m" -> 300L;
            case "15m" -> 900L;
            case "1h" -> 3600L;
            default -> 300L;
        };
        long start = end - (candleCount * intervalSeconds);

        String path = "/v2/history/candles?resolution=" + resolution + "&symbol=" + symbol + "&start=" + start + "&end=" + end;

        try {
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(baseUrl + path))
                    .header("Accept", "application/json")
                    .header("User-Agent", "Nishitech-Trading-Engine")
                    .GET()
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            JsonNode root = mapper.readTree(response.body());
            JsonNode resultNode = root.get("result");

            List<Candle> candles = new ArrayList<>();
            if (resultNode != null && resultNode.isArray()) {
                for (JsonNode c : resultNode) {
                    candles.add(new Candle(
                            c.get("time").asLong(),
                            c.get("open").asDouble(),
                            c.get("high").asDouble(),
                            c.get("low").asDouble(),
                            c.get("close").asDouble(),
                            c.get("volume").asDouble()
                    ));
                }
            }
            return candles;
        } catch (Exception e) {
            throw new RuntimeException("Failed to fetch Delta candles", e);
        }
    }

    // 2. Authenticated Order Placement using HMAC-SHA256
    public String placeOrder(int productId, int size, String side, String orderType) {
        String path = "/v2/orders";
        String method = "POST";
        long timestamp = Instant.now().getEpochSecond();

        String payload = String.format("{\"product_id\":%d,\"size\":%d,\"side\":\"%s\",\"order_type\":\"%s\"}",
                productId, size, side, orderType);

        // Delta signature formula: METHOD + TIMESTAMP + PATH + QUERY_STRING + PAYLOAD
        String signatureData = method + timestamp + path + "" + payload;
        String signature = generateHmacSha256(signatureData, apiSecret);

        try {
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(baseUrl + path))
                    .header("Content-Type", "application/json")
                    .header("Accept", "application/json")
                    .header("api-key", apiKey)
                    .header("signature", signature)
                    .header("timestamp", String.valueOf(timestamp))
                    .header("User-Agent", "Nishitech-Trading-Engine")
                    .POST(HttpRequest.BodyPublishers.ofString(payload))
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            return response.body();
        } catch (Exception e) {
            throw new RuntimeException("Failed to place Delta order", e);
        }
    }

    private String generateHmacSha256(String data, String key) {
        try {
            Mac sha256Hmac = Mac.getInstance("HmacSHA256");
            SecretKeySpec secretKey = new SecretKeySpec(key.getBytes(StandardCharsets.UTF_8), "HmacSHA256");
            sha256Hmac.init(secretKey);
            byte[] hash = sha256Hmac.doFinal(data.getBytes(StandardCharsets.UTF_8));
            StringBuilder hexString = new StringBuilder();
            for (byte b : hash) {
                String hex = Integer.toHexString(0xff & b);
                if (hex.length() == 1) hexString.append('0');
                hexString.append(hex);
            }
            return hexString.toString();
        } catch (Exception e) {
            throw new RuntimeException("Signature generation failed", e);
        }
    }
}