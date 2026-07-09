require('dotenv').config();
const mongoose = require('mongoose');

async function test() {
  console.log('Connecting to MongoDB...');
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected!');
    
    // Load models
    const User = require('./src/models/User');
    const Attendance = require('./src/models/Attendance');
    
    console.log('Querying User...');
    const user = await User.findOne({ email: 'emp2@gmail.com' });
    console.log('User found:', JSON.stringify(user, null, 2));

    if (user) {
      console.log('Querying Attendance...');
      const list = await Attendance.find({ email: 'emp2@gmail.com' }).sort({ createdAt: -1 }).limit(10);
      console.log('Query success! Count:', list.length);
      console.log('Data:', JSON.stringify(list, null, 2));
    }
    
  } catch (err) {
    console.error('ERROR ENCOUNTERED:', err);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected.');
  }
}

test();
