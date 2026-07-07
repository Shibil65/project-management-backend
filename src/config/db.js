const mongoose = require('mongoose');

const DEFAULT_LOCAL_URI = 'mongodb://127.0.0.1:27017/project_management';
const MONGODB_URI = process.env.MONGODB_URI || DEFAULT_LOCAL_URI;

let isConnected = false;

function getMongoTarget(uri = MONGODB_URI) {
  try {
    const parsed = new URL(uri);
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  } catch {
    return uri.includes('@') ? uri.slice(uri.indexOf('@') + 1) : uri;
  }
}

function getConnectionHelp(error) {
  const message = error?.message || '';
  if (message.includes('Could not connect to any servers') || message.includes('Server selection timed out')) {
    return 'Check the Atlas Network Access allowlist for this machine/VPS public IP, and verify MONGODB_URI uses the correct username, password, cluster host, and database name.';
  }
  if (message.includes('bad auth') || message.includes('Authentication failed')) {
    return 'Check the MongoDB username/password in MONGODB_URI and make sure the database user has access to this database.';
  }
  return 'Check MONGODB_URI and MongoDB network access.';
}

async function connectDB() {
  if (isConnected) return;

  try {
    const db = await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      bufferCommands: false
    });
    isConnected = db.connections[0].readyState === 1;
    console.log('MongoDB connected successfully via Mongoose.');
  } catch (error) {
    isConnected = false;
    console.error('Mongoose connection failed:', error.message);
    console.error('MongoDB connection help:', getConnectionHelp(error));
    throw error;
  }
}

module.exports = {
  connectDB,
  getIsConnected: () => isConnected,
  getMongoTarget,
};