const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');
const { Groq } = require('groq-sdk');
const path = require('path');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

const SCRAPINGBEE_API_KEY = process.env.SCRAPINGBEE_API_KEY;
const SCRAPERAPI_API_KEY = process.env.SCRAPERAPI_API_KEY;

if (!process.env.GROQ_API_KEY || !SCRAPINGBEE_API_KEY || !SCRAPERAPI_API_KEY) {
  console.error("FATAL: GROQ_API_KEY, SCRAPINGBEE_API_KEY, and SCRAPER_API_KEY must all be set in the .env file.");
  process.exit(1);
}

// Universal country-to-ISO mapping using AI for unknown countries
async function getCountryInfo(countryInput) {
  try {
    const prompt = `Given the country input "${countryInput}", provide the following information in JSON format:
    {
      "isoCode": "two-letter ISO 3166-1 alpha-2 country code (e.g., US, GB, JP, DE)",
      "fullName": "official country name (e.g., United States, United Kingdom, Japan, Germany)",
      "currency": "three-letter ISO 4217 currency code (e.g., USD, GBP, JPY, EUR)",
      "isValid": true/false
    }
    
    Examples:
    - "USA" → {"isoCode": "US", "fullName": "United States", "currency": "USD", "isValid": true}
    - "UK" → {"isoCode": "GB", "fullName": "United Kingdom", "currency": "GBP", "isValid": true}
    - "JAPAN" → {"isoCode": "JP", "fullName": "Japan", "currency": "JPY", "isValid": true}
    - "InvalidCountry" → {"isoCode": null, "fullName": null, "currency": null, "isValid": false}`;
    
    const response = await groq.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: "llama3-8b-8192",
      temperature: 0,
      max_tokens: 150,
      response_format: { type: "json_object" }
    });
    
    const countryInfo = JSON.parse(response.choices[0].message.content);
    
    if (countryInfo.isValid) {
      console.log(`[Country Info] ${countryInput} → ${countryInfo.fullName} (${countryInfo.isoCode}) - ${countryInfo.currency}`);
      return countryInfo;
    } else {
      console.warn(`[Country Info] Invalid country: ${countryInput}`);
      return { isoCode: 'US', fullName: 'United States', currency: 'USD', isValid: false };
    }
  } catch (error) {
    console.error('[Country Info] AI lookup failed:', error.message);
    // Fallback to basic normalization
    const upperInput = countryInput.toUpperCase();
    const basicMappings = {
      'USA': { isoCode: 'US', fullName: 'United States', currency: 'USD' },
      'UK': { isoCode: 'GB', fullName: 'United Kingdom', currency: 'GBP' },
      'JAPAN': { isoCode: 'JP', fullName: 'Japan', currency: 'JPY' },
      'GERMANY': { isoCode: 'DE', fullName: 'Germany', currency: 'EUR' },
      'FRANCE': { isoCode: 'FR', fullName: 'France', currency: 'EUR' },
      'CANADA': { isoCode: 'CA', fullName: 'Canada', currency: 'CAD' },
      'AUSTRALIA': { isoCode: 'AU', fullName: 'Australia', currency: 'AUD' },
      'INDIA': { isoCode: 'IN', fullName: 'India', currency: 'INR' },
      'BRAZIL': { isoCode: 'BR', fullName: 'Brazil', currency: 'BRL' },
      'MEXICO': { isoCode: 'MX', fullName: 'Mexico', currency: 'MXN' }
    };
    
    return basicMappings[upperInput] || { 
      isoCode: upperInput.length === 2 ? upperInput : 'US', 
      fullName: countryInput, 
      currency: 'USD' 
    };
  }
}

function fallbackMatch(originalQuery, productTitle) {
    if (!originalQuery || !productTitle) return { match: false, confidence: 0, reason: 'Fallback: Missing data' };
    const queryLower = originalQuery.toLowerCase();
    const titleLower = productTitle.toLowerCase();
    const words = queryLower.split(/\s+/).filter(w => w.length > 2);
    if (words.length === 0) return { match: false, confidence: 0, reason: 'Fallback: No usable words in query' };
    
    const matchedWords = words.filter(word => titleLower.includes(word));
    const confidence = Math.round((matchedWords.length / words.length) * 100);
    
    return { match: confidence > 50, confidence, reason: 'Fallback text matching' };
}

// Enhanced product page detection that works across all types of e-commerce sites
function isLikelyProductPage(urlString) {
    try {
        const url = new URL(urlString);
        const hostname = url.hostname.toLowerCase();
        const path = url.pathname.toLowerCase();
        const search = url.search.toLowerCase();
        
        // Skip obvious non-product pages
        const skipPatterns = [
            '/search', '/s/', '/browse', '/category', '/categories', '/c/',
            '/blog', '/news', '/forum', '/about', '/contact', '/help', '/support',
            '/login', '/register', '/account', '/cart', '/checkout', '/wishlist',
            '/compare', '/reviews', '/ratings', '/comments', '/discussions'
        ];
        
        const skipParams = ['q=', 'search=', 'query=', 'k=', 's=', 'category='];
        
        if (skipPatterns.some(pattern => path.includes(pattern)) || 
            skipParams.some(param => search.includes(param))) {
            console.log(`[Pre-Filter] SKIPPING URL (non-product page): ${urlString}`);
            return false;
        }
        
        // Skip social media, forums, and aggregator sites
        const skipDomains = [
            'facebook.com', 'twitter.com', 'instagram.com', 'youtube.com', 'tiktok.com',
            'reddit.com', 'quora.com', 'pinterest.com', 'linkedin.com',
            'google.com', 'bing.com', 'yahoo.com', 'duckduckgo.com',
            'wikipedia.org', 'wikimedia.org'
        ];
        
        if (skipDomains.some(domain => hostname.includes(domain))) {
            console.log(`[Pre-Filter] SKIPPING URL (excluded domain): ${urlString}`);
            return false;
        }
        
        // Positive indicators for product pages (works across different e-commerce platforms)
        const productIndicators = [
            '/product/', '/item/', '/p/', '/dp/', '/goods/', '/artikel/', '/produit/',
            '/producto/', '/prodotto/', '/товар/', '/商品/', '/제품/', '/سلعة/',
            // Common product ID patterns
            /\/\d{5,}/, /\/[A-Z0-9]{8,}/, /\/sku/, /\/model/, /\/ref/,
            // E-commerce specific patterns
            '/buy/', '/shop/', '/store/', '/mall/', '/market/', '/boutique/',
            '/tienda/', '/negozio/', '/магазин/', '/店/', '/상점/', '/متجر/'
        ];
        
        if (productIndicators.some(indicator => {
            if (typeof indicator === 'string') {
                return path.includes(indicator);
            } else {
                return indicator.test(path);
            }
        })) {
            console.log(`[Pre-Filter] KEEPING URL (product indicator found): ${urlString}`);
            return true;
        }
        
        // Check for e-commerce domains (global patterns)
        const ecommercePatterns = [
            'shop', 'store', 'mall', 'market', 'buy', 'sell', 'commerce',
            'tienda', 'negozio', 'boutique', 'магазин', '店', '상점', 'متجر'
        ];
        
        if (ecommercePatterns.some(pattern => hostname.includes(pattern))) {
            console.log(`[Pre-Filter] KEEPING URL (e-commerce domain): ${urlString}`);
            return true;
        }
        
        // Default: keep URL if it's not obviously a non-product page
        console.log(`[Pre-Filter] KEEPING URL (default): ${urlString}`);
        return true;
        
    } catch (error) {
        console.warn(`[Pre-Filter] Invalid URL found: ${urlString}`);
        return false;
    }
}

async function matchProduct(originalQuery, productTitle) {
    if (!productTitle) {
        return fallbackMatch(originalQuery, productTitle);
    }
    try {
        const prompt = `Original search query: "${originalQuery}"\nProduct title: "${productTitle}"\nDoes this product title accurately match the search query? Consider:
        - Similar products (e.g., "iPhone 16 256GB" matches "iPhone 16 256GB Pro")
        - Different languages/translations
        - Slight variations in naming/branding
        - Model numbers and specifications
        
        Respond with only a JSON object with three keys: "match" (boolean), "confidence" (integer 0-100), and "reason" (string explanation).`;
        
        const response = await groq.chat.completions.create({
            messages: [{ role: 'user', content: prompt }],
            model: "llama3-8b-8192",
            temperature: 0,
            max_tokens: 150,
            response_format: { type: "json_object" }
        });
        
        return JSON.parse(response.choices[0].message.content);
    } catch (error) {
        console.error('Groq matching error:', error.message);
        return fallbackMatch(originalQuery, productTitle);
    }
}

// Universal website discovery that works for any country and product category
async function discoverWebsites(query, countryInfo) {
  const searchQueries = [
    `buy ${query} price ${countryInfo.fullName}`,
    `${query} shop ${countryInfo.fullName}`,
    `${query} store online ${countryInfo.fullName}`,
    `where to buy ${query} ${countryInfo.fullName}`,
    `${query} ${countryInfo.currency} price`
  ];
  
  const allUrls = new Set();
  
  for (const searchQuery of searchQueries) {
    try {
      const searchUrl = `https://app.scrapingbee.com/api/v1/store/google`;
      const params = {
        api_key: SCRAPINGBEE_API_KEY,
        search: searchQuery,
        country_code: countryInfo.isoCode.toLowerCase(),
        nb_results: 20,
        device: 'desktop'
      };
      
      console.log(`[Discovery] Searching: "${searchQuery}" in ${countryInfo.fullName}`);
      
      const response = await axios.get(searchUrl, { 
        params: params,
        timeout: 30000 
      });
      
      if (response.data && response.data.organic_results) {
        const organicResults = response.data.organic_results || [];
        organicResults.forEach(result => {
          if (result.url && !result.url.includes('google.com')) {
            allUrls.add(result.url);
          }
        });
      }
      
      // Small delay between searches to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
      
    } catch (error) {
      console.error(`[Discovery] Search failed for "${searchQuery}":`, error.message);
    }
  }
  
  const urlArray = Array.from(allUrls);
  console.log(`[Discovery] Found ${urlArray.length} unique URLs across all searches`);
  return urlArray;
}

// Enhanced product data extraction with multi-language support
async function extractProductDataFromUrl(url, expectedCurrency) {
    console.log(`[Extraction] Processing: ${url}`);
    try {
        const scraperApiProxyUrl = `http://api.scraperapi.com?api_key=${SCRAPERAPI_API_KEY}&url=${encodeURIComponent(url)}`;
        const response = await axios.get(scraperApiProxyUrl, { timeout: 30000 });
        const $ = cheerio.load(response.data);

        // Remove unwanted elements
        $('script, style, noscript, svg, footer, header, nav, link, meta, .comments, .reviews, .related, .recommendations').remove();
        
        // Extract text content
        const bodyText = $('body').text().replace(/\s\s+/g, ' ').trim().substring(0, 15000);

        if (bodyText.length < 100) {
            console.warn(`[Extraction] SKIPPING ${url}, not enough content.`);
            return null;
        }

        const prompt = `Analyze this product webpage content and extract information. The expected currency is ${expectedCurrency}.

        Instructions:
        - Look for product name, price, and currency
        - Handle multiple languages and formats
        - Convert prices to numbers (remove currency symbols, commas, etc.)
        - Identify the actual currency used (may differ from expected)
        - Handle different price formats (1,234.56 / 1.234,56 / 1 234,56)
        
        Respond ONLY with JSON:
        {
          "productName": "string or null",
          "price": number or null,
          "currency": "3-letter ISO code or null",
          "originalPriceText": "original price text found or null"
        }

        Webpage content:
        "${bodyText}"`;

        const aiResponse = await groq.chat.completions.create({
            messages: [{ role: 'user', content: prompt }],
            model: "llama3-8b-8192",
            temperature: 0,
            max_tokens: 300,
            response_format: { type: "json_object" }
        });

        const extractedData = JSON.parse(aiResponse.choices[0].message.content);
        
        if (extractedData && typeof extractedData.price === 'number' && 
            extractedData.price > 0 && extractedData.productName) {
            
            const website = new URL(url).hostname.replace(/^www\./, '');
            console.log(`[Extraction] SUCCESS for ${url}: ${extractedData.productName} - ${extractedData.price} ${extractedData.currency}`);
            
            return { 
                ...extractedData, 
                link: url, 
                website,
                currency: extractedData.currency || expectedCurrency
            };
        }
        
        console.warn(`[Extraction] Invalid data from ${url}:`, extractedData);
        return null;

    } catch (error) {
        console.error(`[Extraction] FAILED for ${url}:`, error.message);
        return null;
    }
}

// Main orchestration function
async function dynamicComparePrice(query, countryInput) {
  // Get country information using AI
  const countryInfo = await getCountryInfo(countryInput);
  
  // Discover websites
  const allUrls = await discoverWebsites(query, countryInfo);
  if (!allUrls || allUrls.length === 0) {
    console.log('[Orchestrator] No URLs found during discovery phase');
    return { products: [], countryInfo };
  }

  // Filter for likely product pages
  const promisingUrls = allUrls.filter(isLikelyProductPage);
  if (promisingUrls.length === 0) {
    console.log("No promising product page URLs found after filtering.");
    return { products: [], countryInfo };
  }

  console.log(`[Orchestrator] Processing ${promisingUrls.length} promising URLs...`);
  
  // Process URLs in batches with increased concurrency for global coverage
  const allProducts = [];
  const batchSize = 5; // Increased batch size for better performance
  const delayBetweenBatches = 800; // Reduced delay

  for (let i = 0; i < promisingUrls.length; i += batchSize) {
    const batch = promisingUrls.slice(i, i + batchSize);
    console.log(`[Orchestrator] Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(promisingUrls.length / batchSize)}...`);
    
    const extractionPromises = batch.map(url => 
      extractProductDataFromUrl(url, countryInfo.currency)
    );
    
    const settledResults = await Promise.allSettled(extractionPromises);
    
    settledResults.forEach((result, index) => {
      if (result.status === 'fulfilled' && result.value) {
        allProducts.push(result.value);
      } else if (result.status === 'rejected') {
        console.warn(`[Orchestrator] Batch item ${index} failed:`, result.reason?.message);
      }
    });
    
    if (i + batchSize < promisingUrls.length) {
      await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
    }
  }

  // Validate products using AI matching
  console.log(`[Validation] Validating ${allProducts.length} extracted products...`);
  const validationPromises = allProducts.map(async (product) => {
    if (product && product.productName && product.price) {
      const matchResult = await matchProduct(query, product.productName);
      if (matchResult.match && matchResult.confidence > 50) { // Lowered threshold for global coverage
        return {
          ...product,
          matchConfidence: matchResult.confidence,
          matchReason: matchResult.reason
        };
      } else {
        console.log(`[Validation] SKIPPING [${product.productName}] - ${matchResult.reason} (${matchResult.confidence}%)`);
        return null;
      }
    }
    return null;
  });
  
  const validatedProductResults = await Promise.all(validationPromises);
  const validatedProducts = validatedProductResults.filter(p => p !== null);

  // Sort by price
  validatedProducts.sort((a, b) => a.price - b.price);
  
  return { products: validatedProducts, countryInfo };
}

// API endpoint
app.post('/api/compare-prices', async (req, res) => {
  try {
    const { query, country } = req.body;
    
    if (!query || !country) {
      return res.status(400).json({ error: 'Missing required parameters: query and country' });
    }
    
    console.log(`\n--- New Request [${new Date().toISOString()}] ---`);
    console.log(`Query: "${query}", Country: "${country}"`);
    
    const result = await dynamicComparePrice(query, country);
    
    console.log(`--- Request Complete: Found ${result.products.length} valid results ---`);

    res.json({
      success: true,
      query,
      country: result.countryInfo,
      originalCountryInput: country,
      results: result.products.slice(0, 25), // Increased result limit
      totalFound: result.products.length,
      searchStrategies: [
        `buy ${query} price ${result.countryInfo.fullName}`,
        `${query} shop ${result.countryInfo.fullName}`,
        `${query} store online ${result.countryInfo.fullName}`,
        `where to buy ${query} ${result.countryInfo.fullName}`,
        `${query} ${result.countryInfo.currency} price`
      ],
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('API Error in /api/compare-prices:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    services: {
      groq: !!process.env.GROQ_API_KEY,
      scrapingbee: !!SCRAPINGBEE_API_KEY,
      scraperapi: !!SCRAPERAPI_API_KEY
    }
  });
});

app.listen(port, () => {
  console.log(`Universal Price Comparison Server running on http://localhost:${port}`);
  console.log(`Supports ANY country and ANY product category globally`);
});

module.exports = app;
