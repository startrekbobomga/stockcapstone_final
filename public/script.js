// Function to navigate to the chart page
function navigateToChartPage() {
  const symbol = document.getElementById('symbol').value.trim().toUpperCase();
  if (!symbol) {
    alert('Please enter a stock symbol first');
    return;
  }
  window.location.href = `chart.html?symbol=${symbol}`;
}


// Function to navigate to the news page
function navigateToNewsPage() {
  const symbol = document.getElementById('symbol').value.trim().toUpperCase();
  if (!symbol) {
    alert('Please enter a stock symbol first');
    return;
  }
  window.location.href = `news.html?symbol=${symbol}`;

}

// Function to navigate to the stat page
function navigateToStatPage() {
  const symbol = document.getElementById('symbol').value.trim().toUpperCase();
  if (!symbol) {
    alert('Please enter a stock symbol first');
    return;
  }
  window.location.href = `stat.html?symbol=${symbol}`;

}

// Function to navigate to the historical page
function navigateToHistoricalPage() {
  const symbol = document.getElementById('symbol').value.trim().toUpperCase();
  if (!symbol) {
    alert('Please enter a stock symbol first');
    return;
  }
  window.location.href = `historical.html?symbol=${symbol}`;

}

function navigateToSelectionPage() {
  window.location.href = 'selection.html'; 
}

function navigateToLoadDataPage() {
  window.location.href = 'load-data.html'; 
}

function navigateToCollectedDataPage() {
  window.location.href = 'collected-data.html'; 
}

function navigateToTreeMapPage(){
  window.location.href = 'treemap.html'; 
}

function navigateToReportPage(){
  window.location.href = 'report.html'; 
}

function navigateToFGIPage(){
  window.location.href = 'fgih.html'; 
}

function navigateToForecastPage() {
  const symbol = document.getElementById('symbol').value.trim().toUpperCase();
  if (!symbol) {
      alert('Please enter a stock symbol first');
      return;
  }
  window.location.href = `forecast.html?symbol=${symbol}`; // Redirect with stock symbol
}