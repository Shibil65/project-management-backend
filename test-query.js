require('dotenv').config();
const mongoose = require('mongoose');

async function test() {
  console.log('Connecting to MongoDB...');
  console.log('URI:', process.env.MONGODB_URI);
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected!');
    
    // Load models
    const SubscriptionPlan = require('./src/models/SubscriptionPlan');
    
    console.log('Querying SubscriptionPlan...');
    const list = await SubscriptionPlan.find({});
    console.log('Query success! Count:', list.length);
    console.log('Data:', JSON.stringify(list, null, 2));
    
  } catch (err) {
    console.error('ERROR ENCOUNTERED:', err);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected.');
  }
}

test();
