package nishitech.model;

public record TradeSignal(
        String action,
        double confidence,
        String reasoning,
        double rsi,
        double currentPrice
) {}