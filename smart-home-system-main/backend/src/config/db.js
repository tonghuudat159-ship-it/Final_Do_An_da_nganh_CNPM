const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI);
    console.log(`MongoDB connected: ${conn.connection.host}`);
  } catch (err) {
    console.error('MongoDB connection error:', err.message);
    if (err.message && err.message.includes('ECONNREFUSED')) {
      console.error('MongoDB is not running. Start it with:');
      console.error('  docker compose up -d');
      console.error('or install/start MongoDB locally.');
    }
    process.exit(1);
  }
};

module.exports = { connectDB };
