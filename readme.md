# Groq-Powered Price Comparison API

This project is a Node.js-based server application that allows users to compare prices for a given product across various e-commerce websites using AI-powered data extraction and validation. It utilizes Groq (LLM), ScrapingBee, and ScraperAPI to fetch, process, and extract accurate pricing data.

## Features

* Dynamic discovery of product URLs using ScrapingBee's Google Search API
* AI-based extraction of product information using Groq's LLM
* Intelligent filtering of likely product pages
* Batch-wise scraping and extraction for efficiency
* Price comparison and validation based on query relevance

## Prerequisites

To run this project, you need the following:

* Node.js (v16 or later)
* npm or yarn
* Internet connection to access APIs
* API keys for:

  * Groq (GROQ\_API\_KEY)
  * ScrapingBee (SCRAPINGBEE\_API\_KEY)
  * ScraperAPI (SCRAPERAPI\_API\_KEY)

## Setup Instructions

1. Clone this repository to your local machine.

2. Navigate to the project directory.

3. Create a `.env` file in the root directory and add the following keys with your respective values:

   * GROQ\_API\_KEY
   * SCRAPINGBEE\_API\_KEY
   * SCRAPERAPI\_API\_KEY

4. Run `npm install` or `yarn install` to install all dependencies.

5. Start the server using `node server.js` or with a process manager like `nodemon`.

6. Once the server starts, it will be available at `http://localhost:3000` (or the port you specified in the `.env` file).

## How It Works

* A POST request is sent to `/api/compare-prices` with a JSON body containing `query` (product name) and `country` (2-letter country code).
* The server queries Google search results via ScrapingBee for potential product pages.
* Each URL is filtered using heuristics to identify product pages.
* Groq LLM extracts product name, price, and currency from raw HTML content.
* The results are validated against the original search query for relevance and sorted by price.

## Example Request Payload

* query: "iPhone 16 Pro"
* country: "US"

## Output

The server responds with a list of product matches that include:

* productName
* price
* currency
* link
* website
* confidence (score based on matching quality)

## Notes

* The server includes robust error handling and logs every step of the process for easier debugging.
* Confidence scores help determine the relevance of a product based on the original search query.
* This tool is intended for educational or demo purposes; consider rate limits and TOS of APIs before production use.
