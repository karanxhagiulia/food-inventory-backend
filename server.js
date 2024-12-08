const express = require('express');
const axios = require('axios');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const dotenv = require('dotenv');
const cors = require('cors');
const bodyParser = require('body-parser');

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// MongoDB Connection
const uri = process.env.MONGO_URI;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const dbName = 'foodInventory1';
const collectionName = 'foods1';

let db, collection;

// Connect to MongoDB
async function connectToDB() {
  try {
    await client.connect();
    db = client.db(dbName);
    collection = db.collection(collectionName);
    console.log('Connected to MongoDB');
  } catch (error) {
    console.error('Error connecting to MongoDB:', error);
    process.exit(1);
  }
}

// Start server after MongoDB connection
connectToDB().then(() => {
  app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
  });
});

// ROUTES

// GET: Search for food items in Open Food Facts
app.get('/api/food/search', async (req, res) => {
  const { search } = req.query;

  if (!search) {
    return res.status(400).json({ error: 'Please provide a food search term' });
  }

  try {
    const response = await axios.get(`https://world.openfoodfacts.org/cgi/search.pl?search_terms=${search}&json=true`);
    const products = response.data.products;

    if (!products || products.length === 0) {
      return res.status(404).json({ message: 'No products found' });
    }

    const filteredProducts = products.map((product) => ({
      name: product.product_name || "No name available",
      brands: product.brands || "No brand information",
      quantity: product.quantity || "Unknown quantity",
      categories: product.categories || "No categories available",
      imageUrl: product.image_url || "No image available",
      url: product.url || "No URL available",
      ingredients: product.ingredients_text || "No ingredients information",
    }));

    res.status(200).json(filteredProducts);
  } catch (error) {
    console.error('Error fetching data from Open Food Facts API:', error);
    res.status(500).json({ error: 'Error fetching data from Open Food Facts API' });
  }
});

app.post('/api/food/add', async (req, res) => {
    const { name, ingredients, brands, quantity, categories, imageUrl, url, expiryDate } = req.body;
  
    // Ensure brands is a string (no conversion to array)
    const trimmedBrands = brands ? brands.trim() : '';
  
    // Trim all fields to avoid issues with extra spaces
    const trimmedName = name ? name.trim() : '';
    const trimmedQuantity = quantity ? quantity.trim() : '';
  
    // Debug log for incoming data
    console.log('Adding product to inventory:', {
      name: trimmedName,
      brands: trimmedBrands,
      quantity: trimmedQuantity,
      ingredients,
      categories,
      imageUrl,
      url,
      expiryDate // Include expiryDate
    });
  
    // Check for missing required fields (trimmed)
    if (!trimmedName || !trimmedBrands || !trimmedQuantity) {
      return res.status(400).json({
        error: 'Missing required fields',
        missingFields: {
          name: !!trimmedName,
          brands: !!trimmedBrands,
          quantity: !!trimmedQuantity
        }
      });
    }
  
    try {
      // Insert the product into MongoDB (optional fields can be omitted)
      const result = await collection.insertOne({
        name: trimmedName,
        ingredients,  // optional
        brands: trimmedBrands,  // Keep as a string
        quantity: trimmedQuantity,
        categories,    // optional
        imageUrl,      // optional
        url,           // optional
        expiryDate     // optional
      });
  
      const insertedItem = await collection.findOne({ _id: result.insertedId });
  
      console.log('Product added with ID:', result.insertedId);
      res.status(201).json({
        message: 'Food added to inventory successfully',
        item: insertedItem,
      });
    } catch (error) {
      console.error('Error adding product:', error);
      res.status(500).json({ error: 'Failed to add food to inventory' });
    }
  });
  
  

  app.get('/api/food/inventory', async (req, res) => {
    try {
      const inventory = await collection.find().toArray();
  
      // Aggregate products by name and brands
      const productCounts = inventory.reduce((acc, item) => {
        const key = `${item.name}-${item.brands}`; // Unique identifier by product name and brand
        if (acc[key]) {
          acc[key].count += 1; // Increment the count for the same product
        } else {
          acc[key] = { ...item, count: 1 }; // New product with a count of 1
        }
        return acc;
      }, {});
  
      // Convert the object back to an array
      const aggregatedInventory = Object.values(productCounts);
  
      res.status(200).json(aggregatedInventory);
    } catch (error) {
      console.error('Error fetching inventory:', error);
      res.status(500).json({ error: 'Failed to fetch inventory' });
    }
  });
  
  

// DELETE: Delete a product by ID
app.delete('/api/food/delete/:id', async (req, res) => {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid product ID' });
    }
    
    try {
      const result = await collection.findOneAndDelete({ _id: new ObjectId(id) });
    
      if (!result.value) {
        return res.status(404).json({ error: 'Product not found' });
      }
    
      res.status(200).json({ message: 'Product deleted successfully' });
    } catch (error) {
      console.error('Error deleting product:', error);
      res.status(500).json({ error: 'Failed to delete product' });
    }
    
});



// GET: Fetch product by ID
app.get('/api/food/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const item = await collection.findOne({ _id: new ObjectId(id) });

    if (!item) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.status(200).json(item);
  } catch (error) {
    console.error('Error fetching product:', error);
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

app.patch('/api/food/update/:id', async (req, res) => {
    const { id } = req.params;
    const { expiryDate } = req.body;
  
    try {
      // Ensure expiryDate is provided
      if (!expiryDate) {
        return res.status(400).json({ error: 'Expiry date is required' });
      }
  
      const updatedProduct = await collection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { expiryDate } }
      );
  
      if (updatedProduct.modifiedCount === 0) {
        return res.status(404).json({ error: 'Product not found or expiry date is the same' });
      }
  
      res.status(200).json({ message: 'Expiry date updated successfully' });
    } catch (err) {
      console.error('Error updating expiry date:', err);
      res.status(500).json({ error: 'Failed to update expiry date' });
    }
  });


// DELETE: Delete all products from the inventory
app.delete('/api/food/delete/all', async (req, res) => {
    try {
      console.log('Delete all request received');
      const result = await collection.deleteMany({});
      console.log('Delete result:', result);
  
      if (result.deletedCount === 0) {
        console.log('No products found to delete');
        return res.status(404).json({ error: 'No products found to delete' });
      }
  
      res.status(200).json({ message: 'All products deleted successfully' });
    } catch (error) {
      console.error('Error deleting all products:', error);
      res.status(500).json({ error: `Failed to delete all products: ${error.message}` });
    }
  });
  