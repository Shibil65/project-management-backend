require('dotenv').config();
const { connectDB } = require('../config/db');
const Company = require('../models/Company');
const User = require('../models/User');
const Project = require('../models/Project');
const LeaveRequest = require('../models/LeaveRequest');
const Attendance = require('../models/Attendance');
const Client = require('../models/Client');
const Message = require('../models/Message');
const Payment = require('../models/Payment');

const SEED_USERS = [
  { name: 'Sarah Jenkins', email: 'shibil.bloombiz@gmail.com', org: 'System Admin', role: 'Super Admin', status: 'Active' },
];

async function runSeed() {
  try {
    console.log('Connecting to database for seeding...');
    await connectDB();
    
    // Clear existing data
    console.log('Wiping collections: companies, users, projects, leaves, attendance, clients, messages, payments...');
    await Company.deleteMany({});
    await User.deleteMany({});
    await Project.deleteMany({});
    await LeaveRequest.deleteMany({});
    await Attendance.deleteMany({});
    await Client.deleteMany({});
    await Message.deleteMany({});
    await Payment.deleteMany({});
    
    console.log('Seeding platforms with Super Admin user...');
    const insertedUsers = await User.insertMany(SEED_USERS);
    console.log(`Successfully seeded ${insertedUsers.length} user (Super Admin).`);
    
    console.log('\n✅ [SEED DATA SUCCESS]: MongoDB seeded successfully with Super Admin user only.');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ [SEED DATA ERROR]:', error.message);
    process.exit(1);
  }
}

runSeed();
