# Universal Price Comparison API

A powerful Node.js API that finds and compares product prices across multiple websites globally. Uses AI-powered matching and supports any country and product category.

## 🚀 Features

- **Global Coverage**: Works with any country and product category
- **AI-Powered Matching**: Uses Groq AI for intelligent product matching and country detection
- **Multi-Language Support**: Handles different languages and price formats
- **Smart Filtering**: Automatically filters out non-product pages
- **Batch Processing**: Efficient concurrent processing of multiple URLs
- **Comprehensive Validation**: AI validates product matches before returning results

## 📋 Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- API keys for the required services (see below)

## 🔑 Required API Keys

### 1. Groq API Key
- **Website**: [https://console.groq.com](https://console.groq.com)
- **Purpose**: AI-powered product matching and country information processing
- **Cost**: Free tier available with generous limits
- **Setup**:
  1. Sign up for a free account
  2. Navigate to API Keys section
  3. Create a new API key
  4. Copy the key for your `.env` file

### 2. ScrapingBee API Key
- **Website**: [https://app.scrapingbee.com](https://app.scrapingbee.com)
- **Purpose**: Google search results scraping for website discovery
- **Cost**: Free tier with 1,000 requests/month
- **Setup**:
  1. Create a free account
  2. Go to Dashboard → API Keys
  3. Copy your API key

### 3. ScraperAPI Key
- **Website**: [https://www.scraperapi.com](https://www.scraperapi.com)
- **Purpose**: Website content scraping with proxy rotation
- **Cost**: Free tier with 5,000 requests/month
- **Setup**:
  1. Sign up for a free account
  2. Find your API key in the dashboard
  3. Copy the key

## ⚙️ Installation

1. **Clone the repository**:
```bash
git clone [<repository-url>](https://github.com/DivakarPS/Intelligent-Price-Engine)
cd Intelligent-Price-Engine
```

2. **Install dependencies**:
```bash
npm install
```

3. **Create environment file**:
```bash
cp .env.example .env
```

4. **Configure your `.env` file**:
```env
# Port configuration
PORT=3000

# Groq AI API Key (Required)
GROQ_API_KEY=your_groq_api_key_here

# ScrapingBee API Key (Required)
SCRAPINGBEE_API_KEY=your_scrapingbee_api_key_here

# ScraperAPI Key (Required)
SCRAPERAPI_API_KEY=your_scraperapi_key_here
```

## 🚀 Usage

### Starting the Server

```bash
npm start
```

The server will start on `http://localhost:3000` (or your specified PORT).

### API Endpoints

#### Price Comparison
```http
POST /api/compare-prices
Content-Type: application/json

{
  "query": "iPhone 15 Pro 256GB",
  "country": "United States"
}
```
### Example Response

```json
{
  "success": true,
  "query": "iPhone 15 Pro 256GB",
  "country": {
    "isoCode": "US",
    "fullName": "United States",
    "currency": "USD",
    "isValid": true
  },
  "originalCountryInput": "United States",
  "results": [
    {
      "productName": "Apple iPhone 15 Pro 256GB Natural Titanium",
      "price": 1199.99,
      "currency": "USD",
      "originalPriceText": "$1,199.99",
      "link": "https://example-store.com/iphone-15-pro",
      "website": "example-store.com",
      "matchConfidence": 95,
      "matchReason": "High confidence match"
    }
  ],
  "totalFound": 1,
  "searchStrategies": [
    "buy iPhone 15 Pro 256GB price United States",
    "iPhone 15 Pro 256GB shop United States",
    "iPhone 15 Pro 256GB store online United States",
    "where to buy iPhone 15 Pro 256GB United States",
    "iPhone 15 Pro 256GB USD price"
  ],
  "timestamp": "2025-01-15T10:30:00.000Z"
}
```

## 🛠️ Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | Server port (default: 3000) |
| `GROQ_API_KEY` | Yes | Groq AI API key for product matching |
| `SCRAPINGBEE_API_KEY` | Yes | ScrapingBee API key for Google search |
| `SCRAPERAPI_API_KEY` | Yes | ScraperAPI key for website scraping |

### Customization Options

You can modify the following parameters in the code:

- **Batch Size**: Change `batchSize` in the main function (default: 5)
- **Result Limit**: Modify the slice parameter in the response (default: 25)
- **Confidence Threshold**: Adjust the matching confidence threshold (default: 50%)
- **Timeout Settings**: Modify API timeout values (default: 30 seconds)

## 🌍 Supported Countries

The API supports **all countries** worldwide. It uses AI to automatically detect and normalize country inputs. Examples:

- `"United States"`, `"USA"`, `"US"`
- `"United Kingdom"`, `"UK"`, `"GB"`
- `"Japan"`, `"JP"`
- `"Germany"`, `"Deutschland"`, `"DE"`
- And many more...

## 🔧 Troubleshooting

### Common Issues

1. **Missing API Keys Error**:
   - Ensure all three API keys are set in your `.env` file
   - Check that the variable names match exactly

2. **Rate Limiting**:
   - The API includes built-in delays between requests
   - Check your API key usage on respective dashboards

3. **No Results Found**:
   - Try more specific product queries
   - Check if the country name is spelled correctly
   - Some products might not be available in all countries

## 📋 API Limits

### Free Tier Limits:
- **Groq**: Generous free tier for AI requests
- **ScrapingBee**: 1,000 requests/month
- **ScraperAPI**: 5,000 requests/month

### Estimated Usage:
- Each price comparison request uses:
  - ~5 Google searches (ScrapingBee)
  - ~5-15 website scrapes (ScraperAPI)
  - ~10-20 AI requests (Groq)

## Sample working with expected input and output

<img width="1509" alt="Screenshot 2025-07-08 at 7 50 12 AM" src="https://github.com/user-attachments/assets/6b183800-249d-416d-a229-f68f2ed2799e" />

<img width="1501" alt="Screenshot 2025-07-08 at 7 50 31 AM" src="https://github.com/user-attachments/assets/80230069-76fa-4463-850b-201b81030a26" />


