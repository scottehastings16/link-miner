document.getElementById('scrapeForm').addEventListener('submit', async (e) => {
    e.preventDefault();
   
    const urls = document.getElementById('urls').value.split(',').map(url => url.trim());
    const statusDiv = document.getElementById('status');
    statusDiv.style.display = 'block'; // Show the status div
    statusDiv.textContent = 'Scraping in progress...';
    statusDiv.className = ''; // Clear any previous classes
   
    try {
        const response = await fetch('/scrape', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ urls })
        });
   
        const result = await response.json();
        if (response.ok) {
            statusDiv.className = 'success'; // Apply success styling
            statusDiv.innerHTML = `Scraping completed! <a href="/output.pdf" download>Download PDF</a>`;
        } else {
            statusDiv.className = 'error'; // Apply error styling
            statusDiv.textContent = `Error: ${result.error}`;
        }
    } catch (error) {
        statusDiv.className = 'error'; // Apply error styling
        statusDiv.textContent = `Error: ${error.message}`;
    }
   });
