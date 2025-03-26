import csv
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
import time
import getpass
from selenium.common.exceptions import NoSuchElementException
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
import pymongo
import sys
import os
from dotenv import load_dotenv


PATH = "C:\Program Files (x86)\chromedriver.exe"
MONGO_URI = os.getenv("MONGO_URI")
DATABASE_NAME = "finance2"
client = pymongo.MongoClient(MONGO_URI)
db = client[DATABASE_NAME]
stocklist = sys.argv
stocklist = stocklist[1:]

def scrape_yahoo_news_titles_and_links(ticker):
    """
    Scrape news titles and their links from Yahoo Finance's news section for a specific stock ticker.
    
    Args:
        ticker (str): The stock ticker (e.g., 'AAPL').
    
    Returns:
        list of tuples: A list of tuples where each tuple contains a news title and its link.
    """
    # Setup WebDriver (Specify the ChromeDriver path directly)
    chromedriver_path = PATH  # Replace with your chromedriver path
    options = webdriver.ChromeOptions()
    # options.add_argument("--headless")  # Run Chrome in headless mode
    options.add_argument("--disable-gpu")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    service = Service(executable_path=chromedriver_path)
    driver = webdriver.Chrome(service=service, options=options)
    
    try:
        # Navigate to Yahoo Finance news section
        url = f"https://finance.yahoo.com/quote/{ticker}/news/"
        driver.get(url)

        # Wait until the news section is loaded
        WebDriverWait(driver, 80).until(
            EC.presence_of_all_elements_located((By.XPATH, "//a[contains(@class, 'subtle-link')]"))
        )
        
        news_items = set()  # Use a set to avoid duplicates
        while len(news_items) < 50:

            # Locate all news article titles and their links
            link_elements = driver.find_elements(By.XPATH, "//a[contains(@class, 'subtle-link') and contains(@class, 'fin-size-small')]")
            for link_element in link_elements:
                title = link_element.get_attribute('aria-label')  # Extract title from 'aria-label'
                url = link_element.get_attribute('href')  # Extract URL from 'href'
                
                # Only add to set if both title and URL are present
                if title and url:
                    news_items.add((title, url))
            
            # Scroll down to load more content
            driver.execute_script("window.scrollBy(0, 1000);")
            time.sleep(2)  # Wait for new content to load

            # Break the loop if no new titles are loaded
            if len(news_items) >= 50 or not link_elements:
                break
    
    except Exception as e:
        print(f"An error occurred: {e}")
    
    finally:
        # Close the WebDriver after use
        driver.quit()

    return list(news_items)


def actual_scrapping_and_saving_links_titles(tick):
    ticker = tick
    try:
        news_titles = scrape_yahoo_news_titles_and_links(ticker)
        print("Successfully scraped ", ticker)

        # Create a collection name dynamically
        COLLECTION_NAME = "stock_news_" + tick

        # Connect to MongoDB
        collection = db[COLLECTION_NAME]

        # Insert data to MongoDB
        for title, link in news_titles:
            try:
                collection.insert_one({"title": title, "link": link})
                
            except Exception as e:
                print(f"Error saving to MongoDB: {e}")
        
        print("List items have been stored")
    except Exception as e:
        print(f"An error occurred: {e}")


def bulk_scrapping_and_saving(stock_list):
    for i in stock_list:
        actual_scrapping_and_saving_links_titles(i)
        print("")
    return

bulk_scrapping_and_saving(stocklist)