import requests
import pymongo
import sys
import os
from dotenv import load_dotenv

MONGO_URI = os.getenv("MONGO_URI")
DATABASE_NAME = "finance2"
client = pymongo.MongoClient(MONGO_URI)
db = client[DATABASE_NAME]
stocklist = sys.argv
stocklist = stocklist[1:]


apiBase = 'https://query2.finance.yahoo.com'
headers = { 
    "User-Agent": "Mozilla/5.0 (Windows NT 6.1; Win64; x64)"
}

def getCredentials(cookieUrl='https://fc.yahoo.com', crumbUrl=apiBase+'/v1/test/getcrumb'):
    # Fetch the cookie
    cookie = requests.get(cookieUrl).cookies
    # Fetch the crumb using the cookie
    crumb = requests.get(url=crumbUrl, cookies=cookie, headers=headers).text
    return {'cookie': cookie, 'crumb': crumb}

def quote_summary(symbol, credentials):
    # Construct the quote summary URL
    url = f"{apiBase}/v10/finance/quoteSummary/{symbol}"
    
    # Define the required modules
    params = {
        'modules': 'defaultKeyStatistics',
        'crumb': credentials['crumb']
    }
    
    # Make the request to get the quote summary
    response = requests.get(url, params=params, cookies=credentials['cookie'], headers=headers)
    
    # Check if the request was successful
    if response.status_code != 200:
        print(f"Error fetching data for {symbol}: {response.status_code}")
        return None
    
    # Extract the relevant data from the response
    quote_summary = response.json()
    if 'quoteSummary' in quote_summary and 'result' in quote_summary['quoteSummary']:
        return quote_summary['quoteSummary']['result'][0]
    else:
        print(f"No data available for {symbol}")
        return None

def extract_data(symbol):
    credentials = getCredentials()
    data = quote_summary(symbol, credentials)
    
    if data:
        # Extract the relevant statistics and store in a list of dictionaries
        extracted_data = {
            'symbol': symbol,
            'enterpriseValue': data['defaultKeyStatistics'].get('enterpriseValue', {}).get('raw', None),
            'forwardPE': data['defaultKeyStatistics'].get('forwardPE', {}).get('raw', None),
            'profitMargin': data['defaultKeyStatistics'].get('profitMargins', {}).get('raw', None),
            'floatShares': data['defaultKeyStatistics'].get('floatShares', {}).get('raw', None),
            'sharesOutstanding': data['defaultKeyStatistics'].get('sharesOutstanding', {}).get('raw', None),
            'sharesShort': data['defaultKeyStatistics'].get('sharesShort', {}).get('raw', None),
            'sharesShortPriorMonth': data['defaultKeyStatistics'].get('sharesShortPriorMonth', {}).get('raw', None),
            'shortRatio': data['defaultKeyStatistics'].get('shortRatio', {}).get('raw', None),
            'insiderOwnership': data['defaultKeyStatistics'].get('heldPercentInsiders', {}).get('raw', None),
            'institutionalOwnership': data['defaultKeyStatistics'].get('heldPercentInstitutions', {}).get('raw', None),
            'sharesShortPercentSharesOut': data['defaultKeyStatistics'].get('sharesPercentSharesOut', {}).get('raw', None),
        }
        
        return extracted_data
    return None

def bulk_extract(symbol_list):
    out = {}
    for i in symbol_list:
        out[i] = extract_data(i)
        # Create a collection name dynamically
        COLLECTION_NAME = "stock_stat_" + i
        # Connect to MongoDB
        collection = db[COLLECTION_NAME]
        try:
            collection.insert_one(out[i])
        except Exception as e:
            print(f"Error saving stats of '{i}' to MongoDB: {e}")
        print(f"Successful saving stats of '{i}'")
    return "Successful saving statistics of the list"

bulk_extract(stocklist)