import axios from 'axios';

async function debugRecentPage() {
  const url = 'https://www.pornpics.com/recent/';
  console.error(`Fetching HTML from ${url} to find amateur galleries...`);
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36',
        'Referer': 'https://www.pornpics.com/',
      }
    });
    // Print the raw HTML to stdout for analysis
    console.log(response.data);
  } catch (error) {
    console.error('Failed to fetch HTML:', error.message);
  }
}

debugRecentPage();
