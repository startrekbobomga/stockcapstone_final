const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const { spawn } = require('child_process');
const OpenAI = require('openai');
const bodyParser = require('body-parser');
const Anthropic = require('@anthropic-ai/sdk');
const axios = require('axios');
require('dotenv').config();

// Initialize the Express app
const app = express();

// Configure OpenAI
const openai = new OpenAI({
    apiKey: 'OPEN_AI_API_KEY' 
});

// Configure Deepseek
const deepseek = new OpenAI({
  baseURL: 'https://api.deepseek.com/v1',
  apiKey: process.env.OPENAI_API_KEY,
});

// Configure Anthropic
const anthropic = new Anthropic({
  apiKey: '',
});

// Middleware
app.use(cors()); // To allow cross-origin requests
app.use(express.json()); // To parse JSON request bodies
app.use(bodyParser.json());

//MOngoDB URI
const mongo_uri = process.env.MONGO_URI;

// Connect to MongoDB
mongoose.connect('mongodb+srv://TonHuynh:Huynhton0792@tonhuynh-mongodb.uamsm.mongodb.net/finance2', { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('Connected to MongoDB at ', mongo_uri))
  .catch(err => console.error('MongoDB connection error:', err));

// Serve static files (e.g., index.html)
app.use(express.static(path.join(__dirname, 'public')));

// API URL and headers for the request rapidapi
const url_news = 'https://yahoo-finance15.p.rapidapi.com/api/v1/markets/news?tickers=AAPL%2CTSLA';
const options_news = {
  method: 'GET',
  headers: {
    'x-rapidapi-key': '',
    'x-rapidapi-host': 'yahoo-finance15.p.rapidapi.com'
  }
};
//forecast api
app.post('/api/forecast', async (req, res) => {
  const { ticker } = req.body;

  if (!ticker) {
      return res.status(400).json({ error: "Stock ticker symbol is required" });
  }

  const pythonScript = "forecast.py"; 

  const process = spawn("python", [pythonScript, ticker]);

  let output = "";
  let errorOutput = "";

  process.stdout.on("data", (data) => {
      output += data.toString();
  });

  process.stderr.on("data", (data) => {
      errorOutput += data.toString();
  });

  process.on("close", (code) => {
      if (code === 0) {
          try {
              const jsonResponse = JSON.parse(output);
              res.json(jsonResponse);
          } catch (error) {
              res.status(500).json({ error: "Error parsing Python output", details: error.message });
          }
      } else {
          res.status(500).json({ error: "Python script error", details: errorOutput });
      }
  });
});

// API Endpoint to get ticker names
app.get('/api/tickers', async (req, res) => {
  try {
    const db = mongoose.connection.db;

    // Fetch all collections
    const collections = await db.listCollections().toArray();

    // Filter collections starting with 'stock_stat' and remove prefix
    const tickerNames = collections
      .filter(collection => collection.name.startsWith('stock_stat'))
      .map(collection => collection.name.replace('stock_stat_', ''));

    // Return the list of ticker names
    res.status(200).json({ tickers: tickerNames });
  } catch (error) {
    console.error('Error fetching tickers:', error.message);
    res.status(500).json({ error: 'Failed to fetch ticker names' });
  }
});

const fear_greed_api_url = 'https://production.dataviz.cnn.io/index/fearandgreed/graphdata';

// API Endpoint fear and greed
app.get('/fear-and-greed', async (req, res) => {
    try {
        const response = await axios.get(fear_greed_api_url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36",
                "Accept": "application/json",
                "Referer": "https://edition.cnn.com",
            }
        });

        const data = response.data;

        const extractedData = {
            fear_and_greed: data.fear_and_greed,
            fear_and_greed_historical: data.fear_and_greed_historical
        };

        res.json(extractedData);
    } catch (error) {
        res.status(error.response ? error.response.status : 500).json({
            message: "Error fetching data",
            error: error.message
        });
    }
});

// API endpoint for fetching the latest news
app.get('/fetch-latest-news', async (req, res) => {
  try {
    const response = await fetch(url_news, options_news);
    const data = await response.json();
    
    // Assuming data has a structure like { data: [newsArray] }
    const latestNews = data.body.slice(0, 10);  // Get the 10 latest results

    res.json(latestNews); // Send the data as JSON in the response
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch data' }); // Return error message if something goes wrong
  }
});

// Fetch tickers and stock data
async function fetchStockData() {
  try {
    // Fetch tickers
    const tickersResponse = await fetch("http://localhost:5000/api/tickers");
    const tickersData = await tickersResponse.json();
    const tickers = tickersData.tickers;

    if (!tickers || !tickers.length) {
      console.error("No tickers found.");
      return [];
    }

    // Fetch historical data for each ticker
    const stockData = await Promise.all(
      tickers.map(async (symbol) => {
        try {
          const response = await fetch(`http://localhost:5000/api/stock/${symbol}`);
          const history = await response.json();

          if (!history || history.length < 2) {
            console.warn(`Not enough data for ${symbol}`);
            return null;
          }

          // Use "Close" from historical data
          const latestClose = history[history.length - 1].Close;
          const previousClose = history[history.length - 2].Close;
          const change = latestClose - previousClose;
          
          return {
            name: symbol,
            change: change,
          };
        } catch (err) {
          console.error(`Error fetching history for ${symbol}:`, err);
          return null;
        }
      })
    );

    const filteredData = stockData.filter(d => d !== null);
    return filteredData;

  } catch (error) {
    console.error("Error fetching tickers:", error);
    return [];
  }
}

// API endpoint to get differeced between 2 latest day
app.get('/fetch-latest-diff', async (req, res) => {
  try {
    const stockData = await fetchStockData();
    res.json(stockData);
  } catch (err) {
    console.error('Error fetching stock data:', err);
    res.status(500).send('Internal Server Error');
  }
});


// API route to fetch stock data by symbol
app.get('/api/stock/:symbol', async (req, res) => {
    const { symbol } = req.params; // This will capture the symbol from the URL
    const collectionName = `stock_data${symbol.toUpperCase()}`; // e.g. stock_dataAAPL
    
    try {
      // Get the dynamic collection based on the symbol
      const collection = mongoose.connection.collection(collectionName);
  
      // Fetch stock data from the collection
      const stockData = await collection.find().toArray(); // Find all documents in the collection
  
      if (stockData.length === 0) {
        return res.status(404).json({ message: `No data found for symbol ${symbol}` });
      }
  
      // Return the stock data as JSON
      res.json(stockData);
    } catch (err) {
      console.error(err);
      res.status(500).send('Error fetching stock data');
    }
  });
  
// Fallback route for frontend (to serve index.html when accessing root)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));  // Update if index.html is in a different folder
});

// API route to fetch recent news by stock ticker
app.get('/api/news/:ticker', async (req, res) => {
  const { ticker } = req.params;
  const collectionName = `stock_news_${ticker.toUpperCase()}`; // e.g., stock_news_AAPL
  
  try {
    // Get the dynamic collection based on the ticker
    const collection = mongoose.connection.collection(collectionName);

    // Fetch recent news for the ticker
    const newsData = await collection.find().sort({ _id: -1 }).limit(30).toArray(); // Sort by most recent news

    if (newsData.length === 0) {
      return res.status(404).json({ message: `No news found for ticker ${ticker}` });
    }

    // Return the news data as JSON
    res.json(newsData);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error fetching news data');
  }
});


// API route to fetch recent stat by stock ticker
app.get('/api/stat/:ticker', async (req, res) => {
  const { ticker } = req.params;
  const collectionName = `stock_stat_${ticker.toUpperCase()}`; // e.g., stock_stat_AAPL
  
  try {
    // Get the dynamic collection based on the ticker
    const collection = mongoose.connection.collection(collectionName);

    // Fetch statistics for the ticker
    const statData = await collection.find().toArray(); // Return statData 

    if (statData.length === 0) {
      return res.status(404).json({ message: `No statistics found for ticker ${ticker}` });
    }

    // Return the news data as JSON
    res.json(statData);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error fetching news data');
  }
});

// API route to run Python script and fetch stock data
app.post('/api/run-python-gather-data', (req, res) => {
  const { stockSymbols } = req.body; // Expecting an array of stock symbols from the request body

  if (!Array.isArray(stockSymbols) || stockSymbols.length === 0) {
    return res.status(400).json({ message: "Invalid or empty stock symbols" });
  }

  const pythonScript = "gather_data.py"; // Path to the Python script

  // Spawn a child process to execute the Python script
  const pythonProcess = spawn("python", [pythonScript, ...stockSymbols]);

  let output = "";
  let errorOutput = "";

  pythonProcess.stdout.on("data", (data) => {
    output += data.toString();
  });

  pythonProcess.stderr.on("data", (data) => {
    errorOutput += data.toString();
  });

  pythonProcess.on("close", (code) => {
    if (code === 0) {
      res.json({ message: "Python script executed successfully", output });
    } else {
      res.status(500).json({ message: "Error executing Python script", error: errorOutput });
    }
  });
});

// API route to run Python script and fetch stock data
app.post('/api/run-python-gather-news', (req, res) => {
  const { stockSymbols } = req.body; // Expecting an array of stock symbols from the request body

  if (!Array.isArray(stockSymbols) || stockSymbols.length === 0) {
    return res.status(400).json({ message: "Invalid or empty stock symbols" });
  }

  const pythonScript = "gather_news.py"; // Path to the Python script

  // Spawn a child process to execute the Python script
  const pythonProcess = spawn("python", [pythonScript, ...stockSymbols]);

  let output = "";
  let errorOutput = "";

  pythonProcess.stdout.on("data", (data) => {
    output += data.toString();
  });

  pythonProcess.stderr.on("data", (data) => {
    errorOutput += data.toString();
  });

  pythonProcess.on("close", (code) => {
    if (code === 0) {
      res.json({ message: "Python script executed successfully", output });
    } else {
      res.status(500).json({ message: "Error executing Python script", error: errorOutput });
    }
  });
});


// API route to run Python script and fetch stock data
app.post('/api/run-python-gather-stat', (req, res) => {
  const { stockSymbols } = req.body; // Expecting an array of stock symbols from the request body

  if (!Array.isArray(stockSymbols) || stockSymbols.length === 0) {
    return res.status(400).json({ message: "Invalid or empty stock symbols" });
  }

  const pythonScript = "gather_stat.py"; // Path to the Python script

  // Spawn a child process to execute the Python script
  const pythonProcess = spawn("python", [pythonScript, ...stockSymbols]);

  let output = "";
  let errorOutput = "";

  pythonProcess.stdout.on("data", (data) => {
    output += data.toString();
  });

  pythonProcess.stderr.on("data", (data) => {
    errorOutput += data.toString();
  });

  pythonProcess.on("close", (code) => {
    if (code === 0) {
      res.json({ message: "Python script executed successfully", output });
    } else {
      res.status(500).json({ message: "Error executing Python script", error: errorOutput });
    }
  });
});


// Function to fetch data from MongoDB collections
async function getStockData(db,ticker) {
  try {
    // Fetch collections dynamically based on ticker
    const stockData = await db.collection(`stock_data${ticker}`).find({}).toArray();
    const stockNews = await db.collection(`stock_news_${ticker}`).find({}).toArray();
    const stockStats = await db.collection(`stock_stat_${ticker}`).find({}).toArray();

    return { stockData, stockNews, stockStats };
  } catch (error) {
    console.error(`Error fetching data for ${ticker}:`, error);
    throw error;
  }
}

// Chatbot context
app.post('/openai', async (req, res) => {
    const { message } = req.body;

    if (!message) {
        return res.status(400).json({ error: 'No message provided' });
    }

    try {
            // Extract ticker symbol from the message
            const tickerMatch = message.match(/\b[A-Z]{1,5}\b/g);
            if (!tickerMatch) {
                return res.json({ response: "Please provide a valid ticker symbol in your query." });
            }
    
            const tickers = tickerMatch;
            const db = mongoose.connection.db;
    
            // Prepare context for OpenAI
            async function prepareAIContext(message, tickers) {
              try {
                  // Fetch data for all provided tickers
                  const allData = {};
                  for (const ticker of tickers) {
                      allData[ticker] = await getStockData(db,ticker);
                  }

                  // Build the context
                  const context = [
                      {
                          role: 'system',
                          content: 'You are a financial assistant that interprets data, provides analysis, performs comparisons between stocks, and gives actionable recommendations.',
                      },
                      {
                          role: 'user',
                          content: message,
                      },
                  ];

                  // Add data for each ticker
                  for (const ticker of tickers) {
                      const { stockData, stockNews, stockStats } = allData[ticker];
                      context.push({
                          role: 'assistant',
                          content: `Here is the retrieved data for ${ticker}:\n\n` +
                              `- Historical Stock Data: ${JSON.stringify(stockData.slice(-5), null, 2)} (showing last 5 entries for brevity)\n\n` +
                              `- Latest News: ${JSON.stringify(stockNews.slice(-3), null, 2)} (showing last 3 entries for brevity)\n\n` +
                              `- Key Statistics: ${JSON.stringify(stockStats, null, 2)}\n\n`,
                      });
                  }

                  // Add a prompt for comparison if multiple tickers are provided
                  if (tickers.length > 1) {
                      context.push({
                          role: 'assistant',
                          content: `Based on the data for ${tickers.join(' and ')}, compare their performances, highlight key differences and similarities, and provide actionable recommendations for an investor.`,
                      });
                  } else {
                      context.push({
                          role: 'assistant',
                          content: `Based on this data, provide a detailed interpretation of the company's current performance and offer actionable recommendations for an investor.`,
                      });
                  }

                  return context;
              } catch (error) {
                  console.error('Error preparing AI context:', error);
                  throw error;
              }
            }
            const context = await prepareAIContext(message, tickers);
            // Generate AI response
            const response = await openai.chat.completions.create({
                model: 'gpt-4-0125-preview',
                messages: context,
            });
    
            const responseContent = response.choices[0].message.content;
            res.json({ response: responseContent });
        } catch (error) {
            console.error('Error:', error);
    
            if (error instanceof OpenAI.APIError) {
                return res.status(500).json({
                    error: error.message,
                    status: error.status,
                    code: error.code,
                    type: error.type,
                });
            }
    
            res.status(500).json({ error: 'Something went wrong' });
        }
});


// Chatbot context
app.post('/deepseek', async (req, res) => {
  const { message } = req.body;

  if (!message) {
      return res.status(400).json({ error: 'No message provided' });
  }

  try {
      // Extract ticker symbol from the message
      const tickerMatch = message.match(/\b[A-Z]{1,5}\b/g);
      if (!tickerMatch) {
          return res.json({ response: "Please provide a valid ticker symbol in your query." });
      }

      const tickers = tickerMatch;
      const db = mongoose.connection.db;

      // Prepare context for OpenAI
      async function prepareAIContext(message, tickers) {
        try {
            // Fetch data for all provided tickers
            const allData = {};
            for (const ticker of tickers) {
                allData[ticker] = await getStockData(db,ticker);
            }

            // Build the context
            const context = [
                {
                    role: 'system',
                    content: 'You are a financial assistant that interprets data, provides analysis, performs comparisons between stocks, and gives actionable recommendations.',
                },
                {
                    role: 'user',
                    content: message,
                },
            ];

            // Add data for each ticker
            for (const ticker of tickers) {
                const { stockData, stockNews, stockStats } = allData[ticker];
                context.push({
                    role: 'assistant',
                    content: `Here is the retrieved data for ${ticker}:\n\n` +
                        `- Historical Stock Data: ${JSON.stringify(stockData.slice(-5), null, 2)} (showing last 5 entries for brevity)\n\n` +
                        `- Latest News: ${JSON.stringify(stockNews.slice(-3), null, 2)} (showing last 3 entries for brevity)\n\n` +
                        `- Key Statistics: ${JSON.stringify(stockStats, null, 2)}\n\n`,
                });

                // Interleave with user message asking for analysis after data for each ticker
                context.push({
                    role: 'user',
                    content: `Please provide your analysis and recommendations for ${ticker}.`,
                });
            }

            // Add a comparison message for multiple tickers
            if (tickers.length > 1) {
                context.push({
                    role: 'assistant',
                    content: `Based on the data for ${tickers.join(' and ')}, compare their performances, highlight key differences and similarities, and provide actionable recommendations for an investor.`,
                });

                // Add a user prompt for recommendations
                context.push({
                    role: 'user',
                    content: 'Please provide your recommendations for an investor based on this comparison.',
                });
            } else {
                // For a single ticker, ask for analysis and recommendations
                context.push({
                    role: 'assistant',
                    content: `Based on this data, provide a detailed interpretation of the company's current performance and offer actionable recommendations for an investor.`,
                });

                // Add user prompt for recommendations
                context.push({
                    role: 'user',
                    content: 'Please provide your recommendations for an investor based on this data.',
                });
            }

            return context;
        } catch (error) {
            console.error('Error preparing AI context:', error);
            throw error;
        }
      }

      const context = await prepareAIContext(message, tickers);

      // Generate AI response using deepseek API
      const response = await deepseek.chat.completions.create({
          model: 'deepseek-reasoner',
          messages: context,
      });

      const responseContent = response.choices[0].message.content;
      res.json({ response: responseContent });

  } catch (error) {
      console.error('Error:', error);

      if (error instanceof OpenAI.APIError) {
          return res.status(500).json({
              error: error.message,
              status: error.status,
              code: error.code,
              type: error.type,
          });
      }

      res.status(500).json({ error: 'Something went wrong' });
  }
});

// Chatbot context
app.post('/anthropic', async (req, res) => {
  const { message } = req.body;

  if (!message) {
      return res.status(400).json({ error: 'No message provided' });
  }

  try {
      // Extract ticker symbol from the message
      const tickerMatch = message.match(/\b[A-Z]{1,5}\b/g);
      if (!tickerMatch) {
          return res.json({ response: "Please provide a valid ticker symbol in your query." });
      }

      const tickers = tickerMatch;
      const db = mongoose.connection.db;

      // Prepare context for Claude
      async function prepareContext(message, tickers) {
          try {
              // Fetch data for all provided tickers
              const allData = {};
              for (const ticker of tickers) {
                  allData[ticker] = await getStockData(db, ticker);
              }

              // Build the system prompt
              let systemPrompt = `You are a financial assistant that interprets data, provides analysis, performs comparisons between stocks, and gives actionable recommendations. 
              Format your responses using markdown for better readability. Use tables where appropriate to compare metrics.`;

              // Build the context with the data
              let context = `Here is the data for your analysis:\n\n`;

              // Add data for each ticker
              for (const ticker of tickers) {
                  const { stockData, stockNews, stockStats } = allData[ticker];
                  context += `Data for ${ticker}:\n` +
                      `Historical Stock Data (last 5 entries):\n${JSON.stringify(stockData.slice(-5), null, 2)}\n\n` +
                      `Latest News (last 3 entries):\n${JSON.stringify(stockNews.slice(-3), null, 2)}\n\n` +
                      `Key Statistics:\n${JSON.stringify(stockStats, null, 2)}\n\n`;
              }

              // Add comparison instruction if multiple tickers
              if (tickers.length > 1) {
                  context += `Please compare the performance of ${tickers.join(' and ')}, highlight key differences and similarities, and provide actionable recommendations for an investor.`;
              } else {
                  context += `Please provide a detailed interpretation of the company's current performance and offer actionable recommendations for an investor.`;
              }

              return { systemPrompt, context };
          } catch (error) {
              console.error('Error preparing context:', error);
              throw error;
          }
      }

      // Get the prepared context
      const { systemPrompt, context } = await prepareContext(message, tickers);

      // Generate Claude response
      const response = await anthropic.messages.create({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 4096,
          messages: [
              {
                  role: 'user',
                  content: `${context}\n\nUser query: ${message}`
              }
          ],
          system: systemPrompt
      });

      const responseContent = response.content[0].text;
      res.json({ response: responseContent });

  } catch (error) {
      console.error('Error:', error);

      if (error instanceof Anthropic.APIError) {
          return res.status(500).json({
              error: error.message,
              status: error.status,
              type: error.type
          });
      }

      res.status(500).json({ error: 'Something went wrong' });
  }
});

app.post('/report', async (req, res) => {
  try {
      // Fetch latest news and closing price differences
      const [newsResponse, diffResponse] = await Promise.all([
          axios.get('http://localhost:5000/fetch-latest-news'),
          axios.get('http://localhost:5000/fetch-latest-diff')
      ]);

      const latestNews = newsResponse.data;
      const priceDiff = diffResponse.data;

      // Prepare context for AI
      const context = [
          {
              role: 'system',
              content: 'You are a financial reporter. Your job is to analyze the latest news and recent closing price differences, find useful insights, and create a detailed yet concise financial report.',
          },
          {
              role: 'assistant',
              content: `Here are the latest financial updates:
              
              - Latest News: ${JSON.stringify(latestNews, null, 2)} 
              
              - Recent Closing Price Differences: ${JSON.stringify(priceDiff, null, 2)}
              
              Based on this information, summarize key market movements, trends, and potential implications for investors.
              Mention the date of the report and source of the news`,
          }
      ];

      // Generate AI response
      const response = await openai.chat.completions.create({
          model: 'gpt-4-0125-preview',
          messages: context,
      });

      const responseContent = response.choices[0].message.content;
      res.json({ response: responseContent });
  } catch (error) {
      console.error('Error:', error);
      res.status(500).json({ error: 'Something went wrong' });
  }
});


// Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
