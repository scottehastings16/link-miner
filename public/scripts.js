document.getElementById('scrapeForm').addEventListener('submit', async (e) => {
    e.preventDefault();
   
    const urls = document.getElementById('urls').value.split(',').map(url => url.trim());
    const statusDiv = document.getElementById('status');
    statusDiv.textContent = 'Scraping in progress...';
   
    try {
        const response = await fetch('/scrape', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ urls })
        });
   
        const result = await response.json();
   
        if (response.ok) {
            statusDiv.innerHTML = `Scraping completed! <a href="/output.xlsx" download>Download Excel File</a>`;
            console.log(result.file)
        } else {
            statusDiv.textContent = `Error: ${result.error}`;
        }
    } catch (error) {
        statusDiv.textContent = `Error: ${error.message}`;
    }
   });