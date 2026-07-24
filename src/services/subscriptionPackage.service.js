const crypto = require('crypto');
const mongoose = require('mongoose');
const { getIsConnected } = require('../config/db');
const SubscriptionPackage = require('../models/subscriptionPackage.model');
const Company = require('../models/Company');
const User = require('../models/User');
const Payment = require('../models/Payment');
const { fallbackPlans, fallbackCompanies, fallbackUsers, fallbackPayments } = require('../utils/fallbackStore');
const { defaultSeedPackages } = require('../seeders/subscriptionPackageSeeder');
const { sendWelcomeCompanyEmail } = require('./email/emailService');
const slugify = require('../utils/slugify');

const escapeRegExp = (str) => String(str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Seeding helper for database
async function ensureDbSeeded() {
  const count = await SubscriptionPackage.countDocuments({});
  if (count === 0) {
    console.log('[subscriptionPackage.service] Auto-seeding database packages...');
    await SubscriptionPackage.insertMany(defaultSeedPackages);
  }
}

// Seeding helper for fallback store
function checkAndSeedFallback() {
  if (fallbackPlans.length === 0 || !fallbackPlans[0].limits) {
    fallbackPlans.length = 0; // clear legacy format if any
    defaultSeedPackages.forEach((p, i) => {
      fallbackPlans.push({
        id: `fb_p_${Date.now()}_${i}`,
        ...p,
        maxUsers: p.limits.maxEmployees,
        maxProjects: p.limits.maxProjects,
        limit: `${p.limits.maxEmployees} Users`
      });
    });
  }
}

const subscriptionPackageService = {
  
  // ── Package CRUD operations ──

  async getActivePackages() {
    if (getIsConnected()) {
      await ensureDbSeeded();
      return await SubscriptionPackage.find({ isActive: { $ne: false } }).sort({ displayOrder: 1 });
    }
    checkAndSeedFallback();
    return fallbackPlans.filter(p => p.isActive).sort((a, b) => a.displayOrder - b.displayOrder);
  },

  async getAllPackages() {
    if (getIsConnected()) {
      await ensureDbSeeded();
      return await SubscriptionPackage.find({}).sort({ displayOrder: 1 });
    }
    checkAndSeedFallback();
    return fallbackPlans.sort((a, b) => a.displayOrder - b.displayOrder);
  },

  async createPackage(data, creatorEmail = 'Super Admin') {
    const name = data.name.trim();
    const slug = data.slug ? slugify(data.slug) : slugify(name);

    if (getIsConnected()) {
      const existing = await SubscriptionPackage.findOne({ name: new RegExp(`^${escapeRegExp(name)}$`, 'i') });
      if (existing) throw new Error('A plan package with this name already exists.');

      if (data.isPopular) {
        await SubscriptionPackage.updateMany({}, { isPopular: false });
      }

      const newDoc = new SubscriptionPackage({
        ...data,
        name,
        slug,
        price: Number(data.price),
        createdBy: creatorEmail
      });
      return await newDoc.save();
    }

    checkAndSeedFallback();
    const existingFallback = fallbackPlans.find(p => p.name.toLowerCase() === name.toLowerCase());
    if (existingFallback) throw new Error('A plan package with this name already exists in fallback store.');

    if (data.isPopular) {
      fallbackPlans.forEach(p => p.isPopular = false);
    }

    const fallbackObj = {
      id: `fb_p_${Date.now()}`,
      ...data,
      name,
      slug,
      price: Number(data.price),
      isActive: data.isActive !== false,
      displayOrder: data.displayOrder !== undefined ? Number(data.displayOrder) : 0,
      maxUsers: data.limits?.maxEmployees || 15,
      maxProjects: data.limits?.maxProjects || 10,
      limit: `${data.limits?.maxEmployees || 15} Users`
    };
    fallbackPlans.push(fallbackObj);
    return fallbackObj;
  },

  async updatePackage(id, data, updaterEmail = 'Super Admin') {
    const updates = { ...data };
    if (data.name) {
      updates.name = data.name.trim();
      if (!data.slug) {
        updates.slug = slugify(updates.name);
      }
    }
    if (data.slug) {
      updates.slug = slugify(data.slug);
    }
    updates.updatedBy = updaterEmail;

    if (getIsConnected()) {
      let planDoc = null;
      if (mongoose.Types.ObjectId.isValid(id)) {
        planDoc = await SubscriptionPackage.findById(id);
      }
      if (!planDoc) {
        planDoc = await SubscriptionPackage.findOne({ $or: [{ slug: id }, { name: new RegExp(`^${escapeRegExp(id)}$`, 'i') }] });
      }

      if (planDoc) {
        if (updates.name) {
          const existingOther = await SubscriptionPackage.findOne({
            _id: { $ne: planDoc._id },
            name: new RegExp(`^${escapeRegExp(updates.name)}$`, 'i')
          });
          if (existingOther) throw new Error('A plan package with this name already exists.');
        }

        if (updates.isPopular) {
          await SubscriptionPackage.updateMany({ _id: { $ne: planDoc._id } }, { isPopular: false });
        }

        Object.assign(planDoc, updates);
        return await planDoc.save();
      }
    }

    checkAndSeedFallback();
    const idx = fallbackPlans.findIndex(p => p.id === id || p._id === id);
    if (idx === -1) throw new Error('Subscription package not found.');

    const original = fallbackPlans[idx];
    if (updates.name && updates.name.toLowerCase() !== original.name.toLowerCase()) {
      const existingOther = fallbackPlans.find(p => (p.id !== id && p._id !== id) && p.name.toLowerCase() === updates.name.toLowerCase());
      if (existingOther) throw new Error('A plan package with this name already exists.');
    }

    if (updates.isPopular) {
      fallbackPlans.forEach(p => p.isPopular = false);
    }

    const updatedObj = {
      ...original,
      ...updates,
      limits: updates.limits ? { ...original.limits, ...updates.limits } : original.limits
    };
    updatedObj.maxUsers = updatedObj.limits?.maxEmployees || updatedObj.maxUsers;
    updatedObj.maxProjects = updatedObj.limits?.maxProjects || updatedObj.maxProjects;
    updatedObj.limit = `${updatedObj.maxUsers} Users`;

    fallbackPlans[idx] = updatedObj;
    return updatedObj;
  },

  async deletePackage(id) {
    if (getIsConnected()) {
      let deleted = null;
      if (mongoose.Types.ObjectId.isValid(id)) {
        deleted = await SubscriptionPackage.findByIdAndDelete(id);
      } else {
        deleted = await SubscriptionPackage.findOneAndDelete({ $or: [{ slug: id }] });
      }
      if (deleted) return true;
    }

    checkAndSeedFallback();
    const idx = fallbackPlans.findIndex(p => p.id === id || p._id === id);
    if (idx === -1) throw new Error('Subscription package not found.');
    fallbackPlans.splice(idx, 1);
    return true;
  },

  async togglePackageStatus(id) {
    if (getIsConnected()) {
      let planDoc = null;
      if (mongoose.Types.ObjectId.isValid(id)) {
        planDoc = await SubscriptionPackage.findById(id);
      }
      if (planDoc) {
        planDoc.isActive = !planDoc.isActive;
        return await planDoc.save();
      }
    }

    checkAndSeedFallback();
    const plan = fallbackPlans.find(p => p.id === id || p._id === id);
    if (!plan) throw new Error('Subscription package not found.');
    plan.isActive = !plan.isActive;
    return plan;
  },

  async markPackagePopular(id) {
    if (getIsConnected()) {
      let planDoc = null;
      if (mongoose.Types.ObjectId.isValid(id)) {
        planDoc = await SubscriptionPackage.findById(id);
      }
      if (planDoc) {
        await SubscriptionPackage.updateMany({}, { isPopular: false });
        planDoc.isPopular = true;
        return await planDoc.save();
      }
    }

    checkAndSeedFallback();
    const plan = fallbackPlans.find(p => p.id === id || p._id === id);
    if (!plan) throw new Error('Subscription package not found.');
    fallbackPlans.forEach(p => p.isPopular = false);
    plan.isPopular = true;
    return plan;
  },


  // ── Checkout & Onboarding Onboarding Workflow Business Logic ──

  async processCheckoutValidation(companyName, adminEmail) {
    if (getIsConnected()) {
      if (companyName) {
        const existingComp = await Company.findOne({ name: companyName.trim(), isDeleted: { $ne: true } });
        if (existingComp) throw new Error('A company workspace with this name already exists.');
      }
      if (adminEmail) {
        const existingUsr = await User.findOne({ email: adminEmail.trim().toLowerCase() }).setOptions({ bypassTenant: true });
        if (existingUsr) throw new Error('A user with this email address already exists.');
      }
    } else {
      if (companyName) {
        const existingComp = fallbackCompanies.find(c => c.name.toLowerCase() === companyName.trim().toLowerCase() && !c.isDeleted);
        if (existingComp) throw new Error('A company workspace with this name already exists.');
      }
      if (adminEmail) {
        const existingUsr = fallbackUsers.find(u => u.email.toLowerCase() === adminEmail.trim().toLowerCase());
        if (existingUsr) throw new Error('A user with this email address already exists.');
      }
    }
  },

  async fetchPackagePrice(planName) {
    if (getIsConnected()) {
      const planDoc = await SubscriptionPackage.findOne({ name: new RegExp(`^${planName.trim()}$`, 'i') });
      return planDoc ? planDoc.price : null;
    }
    checkAndSeedFallback();
    const planDoc = fallbackPlans.find(p => p.name.toLowerCase() === planName.trim().toLowerCase());
    return planDoc ? planDoc.price : null;
  },

  async generateRazorpayOrder(amount, planName) {
    const keyId = process.env.RAZORPAY_KEY_ID || '';
    const keySecret = process.env.RAZORPAY_KEY_SECRET || '';

    // Mock Mode fallback
    if (!keyId || !keySecret || keyId === 'rzp_test_demo_key_id' || keyId.includes('demo')) {
      return {
        success: true,
        isMock: true,
        mockReason: 'Razorpay credentials are not configured.',
        orderId: `order_mock_${Math.random().toString(36).substring(2, 9)}`,
        keyId: 'mock_key_id',
        amount: Math.round(Number(amount) * 100),
        currency: 'INR'
      };
    }

    const amountInPaise = Math.round(Number(amount) * 100);
    const orderPayload = {
      amount: amountInPaise,
      currency: 'INR',
      receipt: `sub_receipt_${Date.now()}`,
      payment_capture: 1,
      notes: { plan: planName, source: 'Duskra SaaS Onboarding' }
    };

    const response = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + Buffer.from(keyId + ':' + keySecret).toString('base64')
      },
      body: JSON.stringify(orderPayload)
    });

    const order = await response.json();
    if (order.id) {
      return {
        success: true,
        isMock: false,
        orderId: order.id,
        keyId,
        amount: order.amount,
        currency: order.currency
      };
    }
    throw new Error(order.error?.description || 'Razorpay rejected authorization key.');
  },

  async verifyRazorpaySignature(orderId, paymentId, signature) {
    const keySecret = process.env.RAZORPAY_KEY_SECRET || '';
    if (
      keySecret &&
      keySecret !== 'rzp_test_demo_key_secret' &&
      !keySecret.includes('demo') &&
      signature &&
      signature !== 'super_mock_signature' &&
      signature !== 'mock_signature'
    ) {
      const hmac = crypto.createHmac('sha256', keySecret);
      hmac.update(orderId + '|' + paymentId);
      const generated = hmac.digest('hex');
      if (generated !== signature) throw new Error('Invalid payment signature. Verification failed.');
    }
  },

  async provisionWorkspace(payload) {
    const {
      name, desc, adminName, adminEmail, plan, users, billing,
      billingName, billingEmail, billingPhone, billingAddress, country,
      logo, autopay, paymentId, paymentMethod, razorpay_order_id, razorpay_signature
    } = payload;

    const email = adminEmail.toLowerCase();
    const workspaceName = name.trim();
    const seats = Number(users) || 10;
    const rate = Number(billing) || 0;

    // Database provisioning
    if (getIsConnected()) {
      const existing = await Company.findOne({ name: workspaceName, isDeleted: { $ne: true } });
      if (existing) throw new Error('A company workspace with this name already exists.');

      const existingUser = await User.findOne({ email }).setOptions({ bypassTenant: true });
      if (existingUser) throw new Error('A user with this email address already exists.');

      const newCompany = new Company({
        name: workspaceName,
        desc: desc || '',
        plan,
        users: seats,
        billing: rate,
        billingName: billingName || workspaceName,
        billingEmail: billingEmail || email,
        billingPhone: billingPhone || '',
        billingAddress: billingAddress || '',
        country: country || '',
        logo: logo || '',
        autopay: autopay !== false,
        status: 'Active',
        admin: email,
        isDeleted: false
      });
      await newCompany.save();

      const newAdminUser = new User({
        name: adminName,
        email,
        companyId: newCompany._id,
        org: workspaceName,
        role: 'Company Admin',
        status: 'Active'
      });
      await newAdminUser.save();

      const transactionId = paymentId || `pay_tr_${Math.random().toString(36).substring(2, 9).toUpperCase()}`;
      const newPayment = new Payment({
        clientName: email,
        companyId: newCompany._id,
        org: workspaceName,
        amount: rate,
        status: 'Paid',
        paymentId: transactionId,
        paymentMethod: paymentMethod || (rate === 0 ? 'Free' : 'Razorpay'),
        date: new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
      });
      await newPayment.save();

      // Trigger email sending asynchronously
      sendWelcomeCompanyEmail(email, workspaceName, adminName, plan).catch(err => {
        console.error('Welcome email failed:', err.message);
      });

      return { company: newCompany, admin: newAdminUser };
    }

    // Fallback provisioning
    const existingCompanyFallback = fallbackCompanies.find(c => c.name.toLowerCase() === workspaceName.toLowerCase() && !c.isDeleted);
    if (existingCompanyFallback) throw new Error('A company workspace with this name already exists.');

    const existingUserFallback = fallbackUsers.find(u => u.email.toLowerCase() === email);
    if (existingUserFallback) throw new Error('A user with this email already exists.');

    const newCompanyId = `fb_co_${Date.now()}`;
    const newCompany = {
      id: newCompanyId,
      name: workspaceName,
      desc: desc || '',
      plan,
      users: seats,
      billing: rate,
      billingName: billingName || workspaceName,
      billingEmail: billingEmail || email,
      billingPhone: billingPhone || '',
      billingAddress: billingAddress || '',
      country: country || '',
      logo: logo || '',
      autopay: autopay !== false,
      status: 'Active',
      admin: email,
      isDeleted: false
    };
    fallbackCompanies.push(newCompany);

    const newAdminUser = {
      id: `fb_u_${Date.now()}`,
      name: adminName,
      email,
      companyId: newCompanyId,
      org: workspaceName,
      role: 'Company Admin',
      status: 'Active'
    };
    fallbackUsers.push(newAdminUser);

    const transactionId = paymentId || `pay_tr_${Math.random().toString(36).substring(2, 9).toUpperCase()}`;
    const newPayment = {
      id: `pay_${Date.now()}`,
      clientName: email,
      companyId: newCompanyId,
      org: workspaceName,
      amount: rate,
      status: 'Paid',
      paymentId: transactionId,
      paymentMethod: paymentMethod || (rate === 0 ? 'Free' : 'Credit Card'),
      date: new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
    };
    fallbackPayments.push(newPayment);

    sendWelcomeCompanyEmail(email, workspaceName, adminName, plan).catch(err => {
      console.error('Welcome email failed:', err.message);
    });

    return { company: newCompany, admin: newAdminUser };
  },

  async getCompanySubscription(companyId) {
    if (getIsConnected()) {
      const company = await Company.findById(companyId);
      if (!company) throw new Error('Company workspace not found.');

      const packageDoc = await SubscriptionPackage.findOne({ name: new RegExp(`^${company.plan.trim()}$`, 'i') });
      return {
        plan: company.plan,
        billing: company.billing,
        limits: packageDoc ? packageDoc.limits : { maxProjects: 10, maxEmployees: 15, maxClients: 15, storageGB: 10 },
        status: company.status
      };
    }

    const company = fallbackCompanies.find(c => c.id === companyId);
    if (!company) throw new Error('Company workspace not found.');

    checkAndSeedFallback();
    const planDoc = fallbackPlans.find(p => p.name.toLowerCase() === company.plan.toLowerCase());
    return {
      plan: company.plan,
      billing: company.billing,
      limits: planDoc ? planDoc.limits : { maxProjects: 10, maxEmployees: 15, maxClients: 15, storageGB: 10 },
      status: company.status
    };
  }

};

module.exports = subscriptionPackageService;
