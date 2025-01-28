const fs = require('fs');
const request = require('request');
const cheerio = require('cheerio');
const parse = require('url-parse');
const csvWriter = require('csv-write-stream');

const url = process.argv[2];
const urlObj = parse(url);
const baseUrl = urlObj.protocol + '//' + urlObj.hostname;

let visited = [];
let queue = [];

// Rate limiting: Define delay between requests in milliseconds
const RATE_LIMIT_DELAY = 500; // 1 second delay between requests

// Validate the input URL
if (!url || !urlObj.protocol || !urlObj.hostname || (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:')) {
    console.log('Please provide a valid URL');
    process.exit();
}

// Initialize the CSV writer
const writer = csvWriter({ headers: ['URL', 'Response', 'Title', 'Description'], sendHeaders: true });
const outputFile = fs.createWriteStream('output.csv');
writer.pipe(outputFile);

queue.push(url);

function crawl() {
    if (queue.length === 0) {
        writer.end();
        console.log('Crawling completed. Please check output.csv file');
        return;
    }

    const currentUrl = queue.shift();
    if (visited.includes(currentUrl)) {
        crawl();
        return;
    }

    // Create altBaseUrl which is the base URL either with or without www depending on what it is currently
    let altBaseUrl;
    if (baseUrl.includes('www.')) {
        altBaseUrl = baseUrl.replace('www.', '');
    } else {
        altBaseUrl = baseUrl.replace('://', '://www.');
    }

    if (!currentUrl.includes(baseUrl) && !currentUrl.includes(altBaseUrl)) {
        visited.push(currentUrl);
        crawl();
        return;
    }

    visited.push(currentUrl);

    // Delay the request using setTimeout for rate limiting
    setTimeout(() => {
        request(currentUrl, (error, response, body) => {
            if (error) {
                console.log(`Error fetching ${currentUrl}:`, error.message);
                crawl();
                return;
            }

            const $ = cheerio.load(body);
            const title = $('title').text();
            const description = $('meta[name="description"]').attr('content') || '';
            const statusCode = response.statusCode;

            writer.write({ URL: currentUrl, Response: statusCode, Title: title, Description: description });

            $('a').each((index, element) => {
                const link = $(element).attr('href');
                if (link) {
                    const linkObj = parse(link, true);

                    if (!linkObj.protocol) {
                        linkObj.set('protocol', urlObj.protocol);
                        linkObj.set('hostname', urlObj.hostname);
                    }

                    const fullUrl = linkObj.toString();
                    if ((linkObj.protocol === 'http:' || linkObj.protocol === 'https:') && !visited.includes(fullUrl)) {
                        queue.push(fullUrl);
                    }
                }
            });

            crawl();
        });
    }, RATE_LIMIT_DELAY);
}

crawl();
