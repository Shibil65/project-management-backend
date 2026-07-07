require('dotenv').config();
const app = require('./app');
const { connectDB } = require('./config/db');

const PORT = process.env.PORT || 5000;
const isProduction = process.env.NODE_ENV === 'production';
const requireDatabase = isProduction || process.env.REQUIRE_DATABASE === 'true';

async function runOptionalDatabaseCleanup() {
  if (process.env.ENABLE_DB_AUTO_CLEANUP !== 'true') return;

  try {
    console.log('Auto-Cleanup enabled: wiping database and seeding default Super Admin...');
    const User = require('./models/User');
    const Company = require('./models/Company');
    const Project = require('./models/Project');
    const LeaveRequest = require('./models/LeaveRequest');
    const Attendance = require('./models/Attendance');
    const Client = require('./models/Client');
    const Message = require('./models/Message');
    const Payment = require('./models/Payment');

    await Company.deleteMany({});
    await User.deleteMany({});
    await Project.deleteMany({});
    await LeaveRequest.deleteMany({});
    await Attendance.deleteMany({});
    await Client.deleteMany({});
    await Message.deleteMany({});
    await Payment.deleteMany({});

    await User.create({
      name: 'Sarah Jenkins',
      email: 'sshibil654@gmail.com',
      org: 'System Admin',
      role: 'Super Admin',
      status: 'Active'
    });

    console.log('Auto-Cleanup completed. Disable ENABLE_DB_AUTO_CLEANUP after local reset tasks.');
  } catch (err) {
    console.error('Auto-Cleanup failed:', err.message);
    throw err;
  }
}

async function writeOptionalDatabaseDebugDump() {
  if (process.env.ENABLE_DB_DEBUG_DUMP !== 'true') return;

  try {
    const fs = require('fs');
    const path = require('path');
    const mongoose = require('mongoose');

    let debugInfo = `DB Connection State: ${mongoose.connection.readyState}\n`;

    if (mongoose.connection.readyState === 1) {
      const admin = mongoose.connection.db.admin();
      const dbs = await admin.listDatabases();
      debugInfo += `All Databases: ${JSON.stringify(dbs.databases.map(d => d.name))}\n`;

      const companyDbs = dbs.databases.map(d => d.name).filter(name => (
        name.includes('dynamic') ||
        name.includes('company') ||
        name.includes('syncra') ||
        name.includes('Syncra')
      ));
      debugInfo += `Company Databases: ${JSON.stringify(companyDbs)}\n`;

      for (const dbName of companyDbs) {
        const targetDb = mongoose.connection.useDb(dbName);
        const collections = await targetDb.db.listCollections().toArray();
        debugInfo += `\nCollections in ${dbName}: ${JSON.stringify(collections.map(c => c.name))}\n`;

        for (const col of collections) {
          const docs = await targetDb.collection(col.name).find({}).toArray();
          debugInfo += `  Docs in ${col.name}: ${JSON.stringify(docs, null, 2)}\n`;
        }
      }
    } else {
      debugInfo += 'Database is not connected.\n';
    }

    fs.writeFileSync(path.join(__dirname, '../db_debug.txt'), debugInfo);
    console.log('DB debug dump written to db_debug.txt. Disable ENABLE_DB_DEBUG_DUMP after inspection.');
  } catch (err) {
    console.error('Debug dump failed:', err.message);
  }
}

async function initializeDatabase() {
  try {
    await connectDB();
    await runOptionalDatabaseCleanup();
    await writeOptionalDatabaseDebugDump();
  } catch (err) {
    if (requireDatabase) {
      console.error('\n[DATABASE CONFIG ERROR]: MongoDB is required in this environment. Server will not start.');
      console.error('Fix Atlas Network Access/IP allowlist or MONGODB_URI, then restart the backend.\n');
      process.exit(1);
    }

    console.log('\n[DATABASE CONFIG WARNING]: MongoDB connection failed.');
    console.log('Using IN-MEMORY datastore for local development only. Data will be lost on restart.');
    console.log('Set REQUIRE_DATABASE=true or NODE_ENV=production to fail fast instead.\n');
  }
}

async function startServer() {
  await initializeDatabase();

  const server = app.listen(PORT, () => {
    console.log('=========================================');
    console.log(`Syncra SaaS backend listening on port ${PORT}`);
    console.log('Clean Architecture (src/) loaded successfully.');
    console.log('=========================================');
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\nERROR: Port ${PORT} is already in use by another process.`);
      console.error(`   Run this command to fix it:`);
      console.error(`   netstat -ano | findstr :${PORT}   (find the PID)`);
      console.error(`   taskkill /PID <PID> /F             (kill it)\n`);
      process.exit(1);
    }
    throw err;
  });
}

startServer();