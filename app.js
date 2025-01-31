const express = require('express');
const puppeteer = require('puppeteer');
const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));

const decodeHtmlEntities = (html) => {
return html.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
};

const flattenJson = (prefix, obj) => {
const result = {};
for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'object' && value !== null && value !== obj) {
        const nestedFlattened = flattenJson(key, value);
        for (const [nestedKey, nestedValue] of Object.entries(nestedFlattened)) {
            result[nestedKey] = nestedValue;
        }
    } else {
        const fullKey = prefix ? `${prefix}_${key}` : key;
        result[fullKey] = value;
    }
}
return result;
};

const formatJsonAsKeyValuePairs = (jsonData) => {
const flattened = flattenJson('', jsonData);
const keyValuePairs = Object.entries(flattened).map(([key, value]) => `${renameKey(key)}:${value}`);
return keyValuePairs.join('\n');
};

const renameKey = (key) => {
return key.replace(/\./g, '_');
};

app.post('/scrape', async (req, res) => {
const { urls } = req.body;

if (!urls || !Array.isArray(urls) || urls.length === 0) {
    return res.status(400).json({ error: 'Please provide a valid array of URLs.' });
}

const browser = await puppeteer.launch();
const page = await browser.newPage();

const workbook = new ExcelJS.Workbook();
const worksheet = workbook.addWorksheet('Sheet1');

worksheet.columns = [
    { header: 'URL', key: 'url', width: 30 },
    { header: 'Readable Key-Value Pairs', key: 'data', width: 50 },
    { header: 'Screenshot', key: 'screenshot', width: 30 }
];

const minWidth = 100;
const minHeight = 100;
const maxWidth = 400;
const maxHeight = 300;

try {
    for (const url of urls) {
        await page.goto(url);
        try {
            await page.waitForSelector('#close-pc-btn-handler', { timeout: 5000 });
            await page.click('#close-pc-btn-handler');
        } catch (error) { }

        const elementsData = await page.evaluate(() => {
            const uniqueElements = new Map();
            Array.from(document.querySelectorAll('[data-cmp-data-layer]')).forEach(el => {
                try {
                    const encodedJson = el.getAttribute('data-cmp-data-layer');
                    const decodedJson = decodeHtmlEntities(encodedJson);
                    const jsonData = JSON.parse(decodedJson);
                    const parent = el.closest('.cmp-teaser');
                    const uniqueKey = parent ? `${el.id}-${parent.dataset.cmpDataLayer}` : el.id;
                    if (!uniqueElements.has(uniqueKey)) {
                        const boundingBox = parent ? parent.getBoundingClientRect() : el.getBoundingClientRect();
                        uniqueElements.set(uniqueKey, {
                            id: el.id,
                            data: jsonData,
                            naturalWidth: boundingBox.width,
                            naturalHeight: boundingBox.height,
                            parentSelector: parent ? '.cmp-teaser' : null,
                            uniqueKey
                        });
                    }
                } catch (error) {
                    console.error("Error processing element:", error);
                }
            });
            return Array.from(uniqueElements.values());
        });

        if (elementsData.length === 0) {
            continue;
        }

        let elementIndex = 0;

        for (const element of elementsData) {
            const { uniqueKey, id, data, naturalWidth, naturalHeight, parentSelector } = element;
            elementIndex++;

            let elementHandle = await page.$(`#${id}`);
            if (!elementHandle) continue;

            if (parentSelector) {
                elementHandle = await page.evaluateHandle(el => el.closest('.cmp-teaser'), elementHandle);
            }

            const screenshotPath = `screenshots/${uniqueKey}.png`;
            if (!fs.existsSync('screenshots')) fs.mkdirSync('screenshots');
            await elementHandle.screenshot({ path: screenshotPath });

            const formattedData = formatJsonAsKeyValuePairs(data);
            const dataWithMetadata = `${id}:\n${formattedData}\nElement Index: ${elementIndex}\nPage URL: ${url}`;

            let embedWidth = naturalWidth;
            let embedHeight = naturalHeight;

            if (naturalWidth < minWidth || naturalHeight < minHeight) {
                const scalingFactor = Math.max(minWidth / naturalWidth, minHeight / naturalHeight);
                embedWidth = naturalWidth * scalingFactor;
                embedHeight = naturalHeight * scalingFactor;
            }

            if (naturalWidth > maxWidth || naturalHeight > maxHeight) {
                const scalingFactor = Math.min(maxWidth / naturalWidth, maxHeight / naturalHeight);
                embedWidth = naturalWidth * scalingFactor;
                embedHeight = naturalHeight * scalingFactor;
            }

            const row = worksheet.addRow({
                url,
                data: dataWithMetadata,
                screenshot: ''
            });

            worksheet.getRow(row.number).height = embedHeight / 1.33;

            const imageId = workbook.addImage({
                filename: screenshotPath,
                extension: 'png'
            });

            worksheet.addImage(imageId, {
                tl: { col: 2, row: row.number - 1 },
                ext: { width: embedWidth, height: embedHeight }
            });
        }
    }

    if (!fs.existsSync('public')) {
        fs.mkdirSync('public');
    }

    const excelFilePath = path.join(__dirname, 'public', 'output.xlsx');
    await workbook.xlsx.writeFile(excelFilePath);

    await browser.close();

    res.json({ message: 'Scraping completed successfully!', file: 'output.xlsx' });
} catch (error) {
    console.error("Scraping error:", error);
    res.status(500).json({ error: 'An error occurred during scraping.' });
}
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));