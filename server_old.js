const express = require('express');
const axios = require('axios');
const cors = require('cors');  // Import CORS middleware
const app = express();
const port = 5000;

app.use(cors()); // Allow all origins

app.get('/api/food/search', async (req, res) => {
  const { search } = req.query;

  if (!search) {
    return res.status(400).json({ error: 'Please provide a food search term' });
  }

  try {
    const response = await axios.get(`https://world.openfoodfacts.org/cgi/search.pl?search_terms=${search}&json=true`);
    if (!response.data.products || response.data.products.length === 0) {
      return res.status(404).json({ message: 'No products found' });
    }
    
    // Filter only the relevant fields
    const filteredProducts = response.data.products.map(product => ({
      name: product.product_name,
      description: product.ingredients_text,
      carbonFootprint: product.carbon_footprint_from_known_ingredients_debug || 'N/A',
    }));

    res.json(filteredProducts);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching data from Open Food Facts API' });
  }
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
