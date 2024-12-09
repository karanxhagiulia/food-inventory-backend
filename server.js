// Required dependencies
const express = require('express'); // Express framework for building the API
const axios = require('axios'); // Axios for making HTTP requests
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb'); // MongoDB client and utilities
const dotenv = require('dotenv'); // For loading environment variables from a .env file
const cors = require('cors'); // Cross-Origin Resource Sharing middleware
const bodyParser = require('body-parser'); // Middleware to parse incoming request bodies

// Initialize dotenv to load environment variables
dotenv.config();

// Create an Express app instance
const app = express();

// Set the port for the server (either from environment variable or default to 5000)
const port = process.env.PORT || 5000;

// Middleware setup
app.use(cors()); // Enables CORS for all routes
app.use(bodyParser.json()); // Parses JSON request bodies

// MongoDB connection details
const uri = process.env.MONGO_URI; // MongoDB connection string from environment variables
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// Database and collection setup
const dbName = 'foodInventory1'; // Database name
const collectionName = 'foods1'; // Collection name for storing food items

let db, collection; // Variables to hold the DB and collection instances

// Connect to MongoDB
async function connectToDB() {
  try {
    await client.connect(); // Establish connection to MongoDB
    db = client.db(dbName); // Select the database
    collection = db.collection(collectionName); // Select the collection
    console.log('Connected to MongoDB');
  } catch (error) {
    console.error('Error connecting to MongoDB:', error); // Log error if connection fails
    process.exit(1); // Exit the app if MongoDB connection fails
  }
}

// Start the Express server after successful DB connection
connectToDB().then(() => {
  app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
  });
});

// ROUTES

// GET route to search for food items from Open Food Facts
app.get('/api/food/search', async (req, res) => {
  const { search } = req.query; // Get the search term from the query parameters

  if (!search) {
    return res.status(400).json({ error: 'Please provide a food search term' });
  }

  try {
    // Make a request to Open Food Facts API to search for products
    const response = await axios.get(`https://world.openfoodfacts.org/cgi/search.pl?search_terms=${search}&json=true`);
    const products = response.data.products; // Extract the products from the response

    if (!products || products.length === 0) {
      return res.status(404).json({ message: 'No products found' });
    }

    // Map the products to return only the necessary information
    const filteredProducts = products.map((product) => ({
      name: product.product_name || "No name available",
      brands: product.brands || "No brand information",
      quantity: product.quantity || "Unknown quantity",
      categories: product.categories || "No categories available",
      imageUrl: product.image_url || "No image available",
      url: product.url || "No URL available",
      ingredients: product.ingredients_text || "No ingredients information",
    }));

    // Send the filtered product data back to the client
    res.status(200).json(filteredProducts);
  } catch (error) {
    console.error('Error fetching data from Open Food Facts API:', error);
    res.status(500).json({ error: 'Error fetching data from Open Food Facts API' });
  }
});

// POST route to add a new product to the inventory
app.post('/api/food/add', async (req, res) => {
  const { name, ingredients, brands, quantity, categories, imageUrl, url, expiryDate } = req.body;

  // Trim the incoming fields to avoid issues with extra spaces
  const trimmedBrands = brands ? brands.trim() : '';
  const trimmedName = name ? name.trim() : '';
  const trimmedQuantity = quantity ? quantity.trim() : '';

  // Debug log to verify the incoming data
  console.log('Adding product to inventory:', {
    name: trimmedName,
    brands: trimmedBrands,
    quantity: trimmedQuantity,
    ingredients,
    categories,
    imageUrl,
    url,
    expiryDate
  });

  // Check if required fields are missing
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
    // Insert the product into MongoDB collection
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

    // Fetch the inserted product to send as response
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

// GET route to fetch all products in the inventory
app.get('/api/food/inventory', async (req, res) => {
  try {
    // Retrieve all products from the collection
    const inventory = await collection.find().toArray();

    // Aggregate products by name and brands (to avoid duplicates)
    const productCounts = inventory.reduce((acc, item) => {
      const key = `${item.name}-${item.brands}`; // Unique identifier by product name and brand
      if (acc[key]) {
        acc[key].count += 1; // Increment count for duplicate products
      } else {
        acc[key] = { ...item, count: 1 }; // New product with a count of 1
      }
      return acc;
    }, {});

    // Convert the aggregated object back to an array
    const aggregatedInventory = Object.values(productCounts);

    // Send the aggregated inventory data back to the client
    res.status(200).json(aggregatedInventory);
  } catch (error) {
    console.error('Error fetching inventory:', error);
    res.status(500).json({ error: 'Failed to fetch inventory' });
  }
});

// DELETE route to remove a product from the inventory by ID
app.delete('/api/food/delete/:id', async (req, res) => {
  const { id } = req.params;

  // Check if the provided ID is valid
  if (!ObjectId.isValid(id)) {
    return res.status(400).json({ error: 'Invalid product ID' });
  }

  try {
    // Attempt to delete the product from MongoDB
    const result = await collection.findOneAndDelete({ _id: new ObjectId(id) });

    if (!result.value) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Send a success message if deletion was successful
    res.status(200).json({ message: 'Product deleted successfully' });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

// GET route to fetch a product by its ID
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

// PATCH route to update a product's expiry date by ID
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

