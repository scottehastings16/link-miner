const express = require('express');
const puppeteer = require('puppeteer');
const PDFDocument = require('pdfkit'); // Install this package: npm install pdfkit
const fs = require('fs');
const path = require('path');
const sizeOf = require('image-size'); // Install this package: npm install image-size

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware to parse JSON data
app.use(express.json());

// Serve static files from the "public" directory
app.use(express.static(path.join(__dirname, 'public')));

// Endpoint to scrape data
app.post('/scrape', async (req, res) => {
 const { urls } = req.body;

 if (!urls || !Array.isArray(urls) || urls.length === 0) {
     return res.status(400).json({ error: 'Please provide a valid array of URLs.' });
 }

 console.log(`Received URLs to scrape: ${urls}`);

 const browser = await puppeteer.launch({ headless: false }); // Set headless to false for debugging
 const page = await browser.newPage();

 // Directory to save screenshots
 const screenshotsDir = path.join(__dirname, 'screenshots');
 if (!fs.existsSync(screenshotsDir)) {
     fs.mkdirSync(screenshotsDir);
 }

 const pdfFilePath = path.join(__dirname, 'output.pdf');
 const doc = new PDFDocument({ margin: 30 });
 const writeStream = fs.createWriteStream(pdfFilePath);
 doc.pipe(writeStream);

 try {
     for (const url of urls) {
         console.log(`Processing URL: ${url}`);
         await page.goto(url, { waitUntil: 'networkidle2' });

         // Handle the cookie banner
         try {
             const cookieBannerSelector = '#close-pc-btn-handler';
             if (await page.$(cookieBannerSelector)) {
                 console.log('Cookie banner detected. Closing it...');
                 await page.click(cookieBannerSelector);
                 await page.waitForTimeout(2000); // Wait for the banner to close
                 console.log('Cookie banner closed.');
             } else {
                 console.log('No cookie banner detected.');
             }
         } catch (error) {
             console.warn('Error handling cookie banner:', error);
         }

         // Process all elements with a valid ID and the `data-cmp-clickable` attribute
         const clickableElements = await page.$$('[data-cmp-clickable][id]');
         console.log(`Found ${clickableElements.length} clickable elements with valid IDs.`);

         for (const [index, element] of clickableElements.entries()) {
             // Locate the parent component if necessary
             const parentComponent = await element.evaluateHandle(el => {
                 let parent = el.closest('.cmp-teaser');
                 return parent || el; // If no parent found, return the element itself
             });

             // Extract JSON data from the clickable button
             const buttonDataLayer = await element.evaluate(el => {
                 const dataLayer = el.getAttribute('data-cmp-data-layer');
                 return dataLayer ? JSON.parse(dataLayer) : null;
             });

             // Extract JSON data from the parent component
             const parentDataLayer = await parentComponent.evaluate(el => {
                 const dataLayer = el.getAttribute('data-cmp-data-layer');
                 return dataLayer ? JSON.parse(dataLayer) : null;
             });

             // Combine the data layers
             const combinedDataLayer = {
                 buttonData: buttonDataLayer,
                 parentData: parentDataLayer
             };

             console.log(`Element ${index + 1} Combined JSON Data:`, combinedDataLayer);

             // Take a screenshot of the parent component or the element itself
             const screenshotPath = path.join(
                 screenshotsDir,
                 `element-${index + 1}.png`
             );
             await parentComponent.screenshot({ path: screenshotPath });
             console.log(`Screenshot saved: ${screenshotPath}`);

             // Get the original dimensions of the screenshot
             const dimensions = sizeOf(screenshotPath);
             const maxWidth = 200; // Desired maximum width for the image in the PDF
             const scaleFactor = Math.min(maxWidth / dimensions.width, 1); // Scale down if necessary
             const resizedWidth = Math.round(dimensions.width * scaleFactor);
             const resizedHeight = Math.round(dimensions.height * scaleFactor);

             // Calculate the space needed for the row
             const rowHeight = Math.max(resizedHeight, 100); // Ensure minimum row height

             // Check if there's enough space on the current page
             if (doc.y + rowHeight + 50 > doc.page.height - doc.page.margins.bottom) {
                 doc.addPage(); // Add a new page if not enough space
             }

             // Add a horizontal separator line before the row
             if (index > 0) {
                 doc.moveTo(30, doc.y) // Start the line at the left margin
                     .lineTo(570, doc.y) // End the line at the right margin
                     .strokeColor('#cccccc') // Light gray color for the line
                     .lineWidth(1) // Thin line
                     .stroke();
                 doc.moveDown(1); // Add some spacing after the line
             }

             // Add JSON data on the left with proper spacing
             const startX = 50; // Starting X position for the row
             let currentY = doc.y; // Current Y position

             // Add URL
             doc.fontSize(10)
                 .text(`URL: ${url}`, startX, currentY, { width: 250 })
                 .moveDown(1); // Add extra spacing after this line

             // Add Element ID
             currentY = doc.y; // Update Y position
             doc.text(`Element ID: ${await element.evaluate(el => el.id)}`, startX, currentY, { width: 250 })
                 .moveDown(1); // Add extra spacing after this line

             // Add Extracted JSON Data label
             currentY = doc.y; // Update Y position
             doc.text(`Extracted JSON Data:`, startX, currentY, { width: 250 })
                 .moveDown(0.5); // Slightly smaller spacing here

             // Add JSON data (formatted)
             currentY = doc.y; // Update Y position
             doc.fontSize(8)
                 .text(JSON.stringify(combinedDataLayer, null, 2), startX, currentY, { width: 250, lineGap: 4 }) // Add lineGap for better readability
                 .moveDown(1); // Add extra spacing after the JSON block

             // Add the image on the right
             doc.image(screenshotPath, startX + 300, currentY, {
                 fit: [resizedWidth, resizedHeight],
                 align: 'center',
                 valign: 'top'
             });

             // Move the cursor down to the next row
             doc.y = currentY + rowHeight + 30; // Ensure enough vertical space for the next row
         }
     }

     doc.end(); // Finalize the PDF
     await new Promise(resolve => writeStream.on('finish', resolve));
     console.log(`PDF file created successfully at ${pdfFilePath}`);

     res.json({
         message: 'Scraping completed successfully!',
         filePath: '/output.pdf',
         screenshotsDir: '/screenshots'
     });
     await browser.close();
 } catch (error) {
     console.error('Error during scraping:', error);
     res.status(500).json({ error: 'An error occurred during scraping.' });
 }
});

// Serve the generated PDF file
app.use('/output.pdf', express.static(path.join(__dirname, 'output.pdf')));

// Serve the screenshots directory
app.use('/screenshots', express.static(path.join(__dirname, 'screenshots')));

// Start the server
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
