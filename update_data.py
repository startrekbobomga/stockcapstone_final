import requests
import yfinance as yf
import pymongo
import pandas as pd
import pytz
import os

MONGO_URI = "mongodb+srv://TonHuynh:Huynhton0792@tonhuynh-mongodb.uamsm.mongodb.net/"  # Change to your MongoDB URI if needed
DATABASE_NAME = "finance2"

client = pymongo.MongoClient(MONGO_URI)
db = client[DATABASE_NAME]

def fetch_tickers():
    url = "http://localhost:5000/api/tickers"
    try:
        response = requests.get(url)
        response.raise_for_status()  # Raise an error for bad responses (4xx and 5xx)
        return response.json()  # Return the JSON response
    except requests.exceptions.RequestException as e:
        print(f"Error fetching data: {e}")
        return None

# Example usage
tickers = fetch_tickers()

stocklist = tickers['tickers']
print(stocklist)


for i in stocklist:
    COLLECTION_NAME = "stock_data" + i
    collection = db[COLLECTION_NAME]
    
    # Find the most recent date in the database
    latest_entry = collection.find_one(sort=[("Date", -1)])
    last_date = pd.to_datetime(latest_entry["Date"]) if latest_entry else None
    
    # Fetch new stock data
    stock = yf.Ticker(i)
    data = stock.history(period="1mo", interval="1d")
    data.reset_index(inplace=True)
    
    # Convert Date column to datetime and remove timezone
    data["Date"] = pd.to_datetime(data["Date"]).dt.tz_localize(None)

    # Ensure last_date is timezone-naive
    if last_date is not None and last_date.tzinfo is not None:
        last_date = last_date.tz_localize(None)
    
    # Filter for new data only
    if last_date:
        data = data[data["Date"] > last_date]
    
    # Convert to dictionary format
    data_dict = data.to_dict("records")
    
    # Insert new data into MongoDB
    
    if data_dict:
        collection.insert_many(data_dict)
        print(f"{i}: New data successfully inserted into MongoDB!")
    else:
        print(f"{i}: No new data to insert.")
