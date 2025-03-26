import yfinance as yf
import pymongo
import pandas as pd
import sys
import os
from dotenv import load_dotenv

# MongoDB connection details
MONGO_URI =  os.getenv("MONGO_URI")# Change to your MongoDB URI if needed
DATABASE_NAME = "finance2"
stocklist = sys.argv
stocklist = stocklist[1:]


client = pymongo.MongoClient(MONGO_URI)
db = client[DATABASE_NAME]

for i in stocklist:
    COLLECTION_NAME = "stock_data" + i

    # Connect to MongoDB
    
    collection = db[COLLECTION_NAME]

    # Fetch stock data using yfinance
    stock = yf.Ticker(i)
    data = stock.history(period="1y", interval="1d")

    # Reset index to convert DateTimeIndex into a column
    data.reset_index(inplace=True)

    # Convert DataFrame to a list of dictionaries
    data_dict = data.to_dict("records")

    # Insert data into MongoDB
    if data_dict:  # Check if there's data to insert
        collection.insert_many(data_dict)
        print(i + " Data successfully inserted into MongoDB!")
    else:
        print("No data to insert.")