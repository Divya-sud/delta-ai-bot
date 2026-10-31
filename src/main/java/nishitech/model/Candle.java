package nishitech.model;

public record Candle(
        long time,
        double open,
        double high,
        double low,
        double close,
        double volume
) {}