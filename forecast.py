import sys
import json
import numpy as np
import pandas as pd
import tensorflow as tf
from pymongo import MongoClient
from sklearn.preprocessing import MinMaxScaler
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import LSTM, Dense
import yfinance as yf
import os
from dotenv import load_dotenv

# Suppress TensorFlow warnings
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'

# MongoDB Connection
MONGO_URI = os.getenv("MONGO_URI")
DB_NAME = "finance2"

def fetch_stock_data_from_mongo(ticker):
    """Fetch historical stock data from MongoDB"""
    try:
        client = MongoClient(MONGO_URI)
        db = client[DB_NAME]
        collection_name = f"stock_data{ticker.upper()}"
        collection = db[collection_name]

        cursor = collection.find({}, {"_id": 0, "Date": 1, "Close": 1}).sort("_id", 1)
        df = pd.DataFrame(list(cursor))

        client.close()

        if df.empty or len(df) < 60:
            print(f"Not enough data for {ticker}. Found only {len(df)} days of data.")
            return None
        return df
    except Exception as e:
        print(f"Error fetching stock data for {ticker}: {str(e)}")
        return None

def fetch_earnings_hits_misses(ticker):
    """Fetch earnings surprises (Hits & Misses) from Yahoo Finance"""
    try:
        stock = yf.Ticker(ticker)
        earnings_data = stock.earnings_dates

        if earnings_data.empty:
            print(f"No earnings data found for {ticker}. Using default values.")
            return [0] * 10, [0] * 10

        hits, misses = [], []
        for date, row in earnings_data.iterrows():
            actual = row.get("Actual", None)
            estimate = row.get("Estimate", None)

            if actual is not None and estimate is not None:
                if actual > estimate:
                    hits.append(1)
                    misses.append(0)
                else:
                    hits.append(0)
                    misses.append(1)

        if len(hits) < 10:
            hits += [0] * (10 - len(hits))
            misses += [0] * (10 - len(misses))

        return hits[:10], misses[:10]
    except Exception as e:
        print(f"Error fetching earnings data: {str(e)}")
        return [0] * 10, [0] * 10

def prepare_data(df, lookback=60):
    """Prepare data for LSTM model"""
    if len(df) < lookback:
        return None, None, None

    scaler = MinMaxScaler(feature_range=(0, 1))
    scaled_data = scaler.fit_transform(df[['Close']])

    X, y = [], []
    for i in range(lookback, len(scaled_data)):
        X.append(scaled_data[i-lookback:i, 0])
        y.append(scaled_data[i, 0])

    return np.array(X), np.array(y), scaler

def build_lstm_model():
    """Build LSTM model for time series forecasting"""
    model = Sequential([
        LSTM(50, return_sequences=True, input_shape=(60, 1)),
        LSTM(50, return_sequences=False),
        Dense(25),
        Dense(1)
    ])
    model.compile(optimizer='adam', loss='mean_squared_error')
    return model

def generate_forecast(X, model, scaler, days=30):
    """Generate High, Mean, and Low predictions"""
    last_60_days = X[-1].reshape(1, 60, 1)
    mean_predictions, high_predictions, low_predictions = [], [], []

    for _ in range(days):
        pred = model.predict(last_60_days, verbose=0)[0][0]

        mean_predictions.append(pred)
        high_predictions.append(pred * np.random.uniform(1.02, 1.05))
        low_predictions.append(pred * np.random.uniform(0.95, 0.98))

        last_60_days = np.append(last_60_days[0, 1:], pred).reshape(1, 60, 1)

    # Convert back to original price scale
    mean_predictions = scaler.inverse_transform(np.array(mean_predictions).reshape(-1, 1)).flatten().tolist()
    high_predictions = scaler.inverse_transform(np.array(high_predictions).reshape(-1, 1)).flatten().tolist()
    low_predictions = scaler.inverse_transform(np.array(low_predictions).reshape(-1, 1)).flatten().tolist()

    return mean_predictions, high_predictions, low_predictions

def forecast_stock(ticker):
    """Main function to fetch data, train model, and forecast prices"""
    df = fetch_stock_data_from_mongo(ticker)

    if df is None or len(df) < 60:
        print(f"Not enough data for {ticker}. Using default forecast.")
        return json.dumps({
            "error": f"Not enough data for {ticker} (requires 60+ days). Returning default forecast.",
            "forecast_mean": [],
            "forecast_high": [],
            "forecast_low": [],
            "actual_prices": [],
            "earningsActual": [],
            "earningsEstimate": [],
            "valuation": {},
            "consensus": {"buy": 0, "hold": 0, "sell": 0},
            "hits": [],
            "misses": []
        })

    X, y, scaler = prepare_data(df)
    if X is None or y is None:
        return json.dumps({"error": f"Data processing failed for {ticker}. Returning default forecast."})

    X = X.reshape(X.shape[0], X.shape[1], 1)

    model = build_lstm_model()
    model.fit(X, y, epochs=10, batch_size=32, verbose=0)

    mean_forecast, high_forecast, low_forecast = generate_forecast(X, model, scaler)

    # Get the actual last 30 days prices
    actual_prices = df['Close'].iloc[-30:].tolist() if len(df) >= 30 else []

    # Get earnings Hits/Misses data
    hits, misses = fetch_earnings_hits_misses(ticker)

    result = {
        "ticker": ticker,
        "forecast_mean": [round(float(p), 2) for p in mean_forecast] if mean_forecast else [],
        "forecast_high": [round(float(p), 2) for p in high_forecast] if high_forecast else [],
        "forecast_low": [round(float(p), 2) for p in low_forecast] if low_forecast else [],
        "actual_prices": [round(float(p), 2) for p in actual_prices] if actual_prices else [],
        "earningsActual": [round(np.random.uniform(50, 500), 2) for _ in range(10)],  # Placeholder data
        "earningsEstimate": [round(np.random.uniform(50, 500), 2) for _ in range(10)],  # Placeholder data
        "valuation": {
            "P/E Ratio": round(np.random.uniform(10, 50), 2),
            "P/B Ratio": round(np.random.uniform(1, 10), 2),
            "EV/EBITDA": round(np.random.uniform(5, 20), 2),
        },
        "consensus": {
            "buy": np.random.randint(1, 10),
            "hold": np.random.randint(1, 5),
            "sell": np.random.randint(0, 5),
        },
        "hits": hits,
        "misses": misses
    }

    print(json.dumps(result))
    sys.exit(0)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Stock ticker symbol required"}))
        sys.exit(1)
    else:
        ticker = sys.argv[1]
        forecast_stock(ticker)
