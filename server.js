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
  console.error("FATAL: GROQ_API_KEY, SCRAPINGBEE_API_KEY, and SCRAPERAPI_API_KEY must all be set in the .env file.");
  process.exit(1);
}

const CURRENCY_MAP = {
  US: 'USD', IN: 'INR', UK: 'GBP', CA: 'CAD', AU: 'AUD',
  DE: 'EUR', FR: 'EUR', IT: 'EUR', ES: 'EUR', JP: 'JPY',
  BR: 'BRL', MX: 'MXN'
};

const COUNTRY_NAME_MAP = {
    US: 'United States', IN: 'India', UK: 'United Kingdom', CA: 'Canada',
    AU: 'Australia', DE: 'Germany', FR: 'France', JP: 'Japan'
};


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

function isLikelyProductPage(urlString) {
    try {
        const url = new URL(urlString);
        const path = url.pathname.toLowerCase();
        const search = url.search.toLowerCase();
        
        if ( path.includes('/search') || path.includes('/s/') || path.includes('/c/') || path.includes('/market/') || path.includes('/blog/') || path.includes('/news/') || path.includes('/forum/') || path.includes('/comments/') || search.includes('?s=') || search.includes('?q=') || search.includes('?k=')) {
            console.log(`[Pre-Filter] SKIPPING URL (search/category page): ${urlString}`);
            return false;
        }

        if ( path.includes('/p/') || path.includes('/product/') || path.includes('/dp/') || path.match(/\/\d{5,}/) ) {
            console.log(`[Pre-Filter] KEEPING URL (looks like product): ${urlString}`);
            return true;
        }
        
        console.log(`[Pre-Filter] KEEPING URL (plausible): ${urlString}`);
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
        const prompt = `Original search query: "${originalQuery}"\nProduct title: "${productTitle}"\nDoes this product title accurately match the search query? Respond with only a JSON object with three keys: "match" (boolean), "confidence" (integer 0-100), and "reason" (string, e.g., "Exact match", "Model number mismatch").`;
        
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



async function discoverWebsites(query, country) {
  const countryName = COUNTRY_NAME_MAP[country] || country;
  const searchQuery = `buy ${query} price in ${countryName}`;
  const searchUrl = `https://app.scrapingbee.com/api/v1/store/google?api_key=${SCRAPINGBEE_API_KEY}&search=${encodeURIComponent(searchQuery)}&country_code=${country.toLowerCase()}`;
  
  console.log(`[Discovery] Querying ScrapingBee: "${searchQuery}"`);
  try {
    const response = await axios.get(searchUrl, { timeout: 20000 });
    const organicResults = response.data.organic_results || [];
    const urls = organicResults.slice(0, 8).map(res => res.url);
    console.log(`[Discovery] Found URLs:`, urls);
    return urls.filter(url => url && !url.includes('google.com'));
  } catch (error) {
    console.error(`[Discovery] ScrapingBee failed for [${query}]:`, error.message);
    return [];
  }
}

async function extractProductDataFromUrl(url) {
    console.log(`[Extraction] Processing: ${url}`);
    try {
        const scraperApiProxyUrl = `http://api.scraperapi.com?api_key=${SCRAPERAPI_API_KEY}&url=${encodeURIComponent(url)}`;
        const response = await axios.get(scraperApiProxyUrl, { timeout: 25000 });
        const $ = cheerio.load(response.data);

        $('script, style, noscript, svg, footer, header, nav, link, meta').remove();
        const bodyText = $('body').text().replace(/\s\s+/g, ' ').trim().substring(0, 12000);

        if (bodyText.length < 100) {
            console.warn(`[Extraction] SKIPPING ${url}, not enough content.`);
            return null;
        }

        const prompt = `Analyze the following text from a product webpage and extract the required information. Respond ONLY with a JSON object with the keys "productName", "price" (as a number, not string), and "currency" (as a 3-letter ISO 4217 code like USD, INR, EUR). If a value is not found, set it to null.\n\nWebpage Text:\n"""\n${bodyText}\n"""`;

        const aiResponse = await groq.chat.completions.create({
            messages: [{ role: 'user', content: prompt }],
            model: "llama3-8b-8192",
            temperature: 0,
            max_tokens: 250,
            response_format: { type: "json_object" }
        });

        const extractedData = JSON.parse(aiResponse.choices[0].message.content);
        
        if (extractedData && typeof extractedData.price === 'number' && typeof extractedData.productName === 'string') {
             const website = new URL(url).hostname.replace(/^www\./, '');
             console.log(`[Extraction] SUCCESS for ${url}: ${extractedData.productName} - ${extractedData.price}`);
             return { ...extractedData, link: url, website };
        }
        console.warn(`[Extraction] Groq parsing for ${url} produced invalid data:`, extractedData);
        return null;

    } catch (error) {
        console.error(`[Extraction] FAILED for ${url}:`, error.message);
        return null;
    }
}


async function dynamicComparePrice(query, country) {

  const allUrls = await discoverWebsites(query, country);
  if (!allUrls || allUrls.length === 0) return [];


  const promisingUrls = allUrls.filter(isLikelyProductPage);
  if (promisingUrls.length === 0) {
      console.log("No promising product page URLs found after filtering.");
      return [];
  }

  console.log(`[Orchestrator] Processing ${promisingUrls.length} promising URLs in batches...`);
  const allProducts = [];
  const batchSize = 3; // Process 3 URLs at a time.
  const delayBetweenBatches = 1000; // 1 second delay (1000ms)

  for (let i = 0; i < promisingUrls.length; i += batchSize) {
      const batch = promisingUrls.slice(i, i + batchSize);
      console.log(`[Orchestrator] Processing batch ${Math.floor(i / batchSize) + 1}...`);
      
      const extractionPromises = batch.map(url => extractProductDataFromUrl(url));
      const settledResults = await Promise.allSettled(extractionPromises);
      
      settledResults.forEach(res => {
          if (res.status === 'fulfilled' && res.value) {
              allProducts.push(res.value);
          }
      });
      
      if (i + batchSize < promisingUrls.length) {
          console.log(`[Orchestrator] Waiting for ${delayBetweenBatches}ms before next batch...`);
          await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
      }
  }


  console.log(`[Validation] Validating ${allProducts.length} extracted products...`);
  const validationPromises = allProducts.map(async (product) => {
    if (product && product.productName && product.price) {
        const matchResult = await matchProduct(query, product.productName);
        if (matchResult.match && matchResult.confidence > 60) {
             return {
                ...product,
                confidence: matchResult.confidence,
                currency: product.currency || CURRENCY_MAP[country] || 'USD',
             };
        } else {
            console.log(`[Validation] SKIPPING [${product.productName}] due to low confidence (${matchResult.confidence}%)`);
            return null;
        }
    }
    return null;
  });
  
  const validatedProductResults = await Promise.all(validationPromises);
  const validatedProducts = validatedProductResults.filter(p => p !== null);

  validatedProducts.sort((a, b) => a.price - b.price);
  return validatedProducts;
}




app.post('/api/compare-prices', async (req, res) => {
  try {
    const { query, country } = req.body;
    
    if (!query || !country) {
      return res.status(400).json({ error: 'Missing required parameters: query and country' });
    }
    
    console.log(`\n--- New Request [${new Date().toISOString()}] ---`);
    console.log(`Query: "${query}", Country: ${country}`);
    
    const results = await dynamicComparePrice(query, country);
    
    console.log(`--- Request Complete: Found ${results.length} valid results ---`);

    res.json({
      success: true,
      query,
      country,
      results: results.slice(0, 20),
      totalFound: results.length,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('API Error in /api/compare-prices:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});


app.listen(port, () => {
  console.log(`Groq-Powered Price Comparison Server running on http://localhost:${port}`);
});

module.exports = app;