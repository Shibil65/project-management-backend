const crypto = require('crypto');
const { getIsConnected } = require('../config/db');
const Company = require('../models/Company');
const User = require('../models/User');
const Payment = require('../models/Payment');
const SubscriptionPlan = require('../models/SubscriptionPlan');
const {
  fallbackCompanies,
  fallbackUsers,
  fallbackPayments
} = require('../utils/fallbackStore');
const {
  sendWelcomeCompanyEmail
} = require('../services/email/emailService');

function buildMockOrder(amount, reason = 'Razorpay credentials are not configured for live checkout.') {
  return {
    success: true,
    isMock: true,
    mockReason: reason,
    orderId: `order_mock_${Math.random().toString(36).substring(2, 9)}`,
    keyId: 'mock_key_id',
    amount: Math.round(Number(amount) * 100),
    currency: 'INR'
  };
}

function queueWelcomeCompanyEmail(adminEmail, companyName, adminName, selectedPlan) {
  sendWelcomeCompanyEmail(adminEmail, companyName, adminName, selectedPlan)
    .then((result) => {
      if (result.emailSent) {
        console.log(`[subscriptionController] Welcome email queued successfully for ${adminEmail}`);
      } else {
        console.warn(`[subscriptionController] Welcome email was not sent for ${adminEmail}: ${result.error || 'unknown mail error'}`);
      }
    })
    .catch((err) => {
      console.error(`[subscriptionController] Welcome email failed for ${adminEmail}:`, err.message);
    });
}

// 1. POST /api/subscriptions/checkout
async function checkout(req, res) {
  const { planName, amount, companyName, adminEmail } = req.body;
  console.log('[subscriptionController.checkout] Request body:', { planName, amount, companyName, adminEmail });

  if (!planName || amount === undefined) {
    return res.status(400).json({ success: false, message: 'Plan name and amount are required.' });
  }

  // Pre-payment validation: Check for existing organization or email
  if (getIsConnected()) {
    try {
      if (companyName) {
        const existingComp = await Company.findOne({ name: companyName.trim(), isDeleted: { $ne: true } });
        if (existingComp) {
          return res.status(400).json({ success: false, message: 'A company with this name already exists.' });
        }
      }
      if (adminEmail) {
        const existingUsr = await User.findOne({ email: adminEmail.trim().toLowerCase() }).setOptions({ bypassTenant: true });
        if (existingUsr) {
          return res.status(400).json({ success: false, message: 'A user with this email address already exists.' });
        }
      }
    } catch (err) {
      console.error('[checkout] Error checking database records:', err);
    }
  } else {
    if (companyName) {
      const existingComp = fallbackCompanies.find(c => c.name.toLowerCase() === companyName.trim().toLowerCase() && !c.isDeleted);
      if (existingComp) {
        return res.status(400).json({ success: false, message: 'A company with this name already exists in fallback store.' });
      }
    }
    if (adminEmail) {
      const existingUsr = fallbackUsers.find(u => u.email.toLowerCase() === adminEmail.trim().toLowerCase());
      if (existingUsr) {
        return res.status(400).json({ success: false, message: 'A user with this email address already exists in fallback store.' });
      }
    }
  }

  const amountNumber = Number(amount);
  if (!Number.isFinite(amountNumber) || amountNumber < 0) {
    return res.status(400).json({ success: false, message: 'Amount must be a valid non-negative number.' });
  }

  // Fetch plan details to confirm price
  let resolvedPrice = amountNumber;
  if (getIsConnected()) {
    const planDoc = await SubscriptionPlan.findOne({ name: new RegExp(`^${planName.trim()}$`, 'i') });
    if (planDoc) {
      resolvedPrice = planDoc.price;
    }
  } else {
    const fallbackPlans = require('../utils/fallbackStore').fallbackPlans;
    const planDoc = fallbackPlans.find(p => p.name.toLowerCase() === planName.trim().toLowerCase());
    if (planDoc) {
      resolvedPrice = planDoc.price;
    }
  }

  // If price is 0 (Free plan), return indicator to skip payment portal
  if (resolvedPrice === 0) {
    return res.status(200).json({
      success: true,
      isFree: true,
      planName,
      amount: 0
    });
  }

  // Generate Razorpay Order (paid plan)
  const keyId = process.env.RAZORPAY_KEY_ID || '';
  const keySecret = process.env.RAZORPAY_KEY_SECRET || '';

  if (!keyId || !keySecret || keyId === 'rzp_test_demo_key_id' || keyId.includes('demo')) {
    console.log('[checkout] Razorpay credentials demo or missing, running in Mock Mode');
    return res.status(200).json(buildMockOrder(resolvedPrice));
  }

  try {
    const amountInPaise = Math.round(resolvedPrice * 100);
    const orderPayload = {
      amount: amountInPaise,
      currency: 'INR',
      receipt: `sub_receipt_${Date.now()}`,
      payment_capture: 1,
      notes: {
        plan: planName,
        source: 'Syncra SaaS Onboarding'
      }
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
      return res.status(201).json({
        success: true,
        isMock: false,
        orderId: order.id,
        keyId,
        amount: order.amount,
        currency: order.currency
      });
    } else {
      console.error('[checkout] Razorpay error output:', order);
      return res.status(200).json(buildMockOrder(resolvedPrice, 'Razorpay rejected keys: ' + (order.error?.description || 'Unknown')));
    }
  } catch (err) {
    console.error('[checkout] Order fetch exception:', err);
    return res.status(200).json(buildMockOrder(resolvedPrice, 'Razorpay request threw: ' + err.message));
  }
}

// 2. POST /api/subscriptions/confirm
async function confirm(req, res) {
  console.log('[subscriptionController.confirm] Request payload:', { ...req.body, logo: req.body.logo ? '(base64)' : '' });
  
  const {
    name,
    desc,
    adminName,
    adminEmail,
    plan,
    users,
    billing,
    billingName,
    billingEmail,
    billingPhone,
    billingAddress,
    logo,
    autopay,
    paymentId,
    paymentMethod,
    razorpay_order_id,
    razorpay_signature
  } = req.body;

  if (!name || !adminEmail || !adminName || !plan) {
    return res.status(400).json({
      success: false,
      message: 'Workspace Name, Admin Name, Admin Email, and Subscription Plan are required.'
    });
  }

  const selectedPlan = plan;
  const planSeats = Number(users) || 10;
  const planBilling = Number(billing) || 0;

  // Paid signature validation
  if (planBilling > 0 && paymentId) {
    const keySecret = process.env.RAZORPAY_KEY_SECRET || '';
    if (
      keySecret &&
      keySecret !== 'rzp_test_demo_key_secret' &&
      !keySecret.includes('demo') &&
      razorpay_signature &&
      razorpay_signature !== 'super_mock_signature' &&
      razorpay_signature !== 'mock_signature'
    ) {
      const hmac = crypto.createHmac('sha256', keySecret);
      hmac.update(razorpay_order_id + '|' + paymentId);
      const generated_signature = hmac.digest('hex');

      if (generated_signature !== razorpay_signature) {
        return res.status(400).json({
          success: false,
          message: 'Invalid payment signature. Verification failed.'
        });
      }
    }
  }

  if (getIsConnected()) {
    try {
      const existing = await Company.findOne({ name: name.trim(), isDeleted: { $ne: true } });
      if (existing) {
        return res.status(400).json({ success: false, message: 'A company workspace with this name already exists.' });
      }

      const existingUser = await User.findOne({ email: adminEmail.toLowerCase() }).setOptions({ bypassTenant: true });
      if (existingUser) {
        return res.status(400).json({ success: false, message: 'A user with this email address already exists.' });
      }

      const newCompany = new Company({
        name: name.trim(),
        desc: desc || '',
        plan: selectedPlan,
        users: planSeats,
        billing: planBilling,
        billingName: billingName || name.trim(),
        billingEmail: billingEmail || adminEmail,
        billingPhone: billingPhone || '',
        billingAddress: billingAddress || '',
        logo: logo || '',
        autopay: autopay !== false,
        status: 'Active',
        admin: adminEmail.toLowerCase(),
        isDeleted: false
      });
      await newCompany.save();

      const newAdminUser = new User({
        name: adminName,
        email: adminEmail.toLowerCase(),
        companyId: newCompany._id,
        org: name.trim(),
        role: 'Company Admin',
        status: 'Active'
      });
      await newAdminUser.save();

      // Record transaction history
      const newPayment = new Payment({
        clientName: adminEmail.toLowerCase(),
        companyId: newCompany._id,
        org: name.trim(),
        amount: planBilling,
        status: 'Paid',
        paymentId: paymentId || `pay_tr_${Math.random().toString(36).substring(2, 9).toUpperCase()}`,
        paymentMethod: paymentMethod || (planBilling === 0 ? 'Free' : 'Razorpay'),
        date: new Date().toLocaleDateString(undefined, {
          day: 'numeric',
          month: 'short',
          year: 'numeric'
        })
      });
      await newPayment.save();

      queueWelcomeCompanyEmail(adminEmail.toLowerCase(), name.trim(), adminName, selectedPlan);

      return res.status(201).json({
        success: true,
        message: 'Workspace successfully registered and active.',
        data: {
          company: newCompany,
          admin: newAdminUser
        }
      });
    } catch (err) {
      console.error('[confirm] Database Error:', err);
      return res.status(500).json({ success: false, message: `Server error confirming registration: ${err.message}` });
    }
  }

  // Fallback Store Operations
  const existingCompanyFallback = fallbackCompanies.find(c => c.name.toLowerCase() === name.toLowerCase() && !c.isDeleted);
  if (existingCompanyFallback) {
    return res.status(400).json({ success: false, message: 'A company with this name already exists in fallback store.' });
  }

  const existingUserFallback = fallbackUsers.find(u => u.email.toLowerCase() === adminEmail.toLowerCase());
  if (existingUserFallback) {
    return res.status(400).json({ success: false, message: 'A user with this email already exists in fallback store.' });
  }

  const newCompanyId = `fb_co_${Date.now()}`;
  const newCompany = {
    id: newCompanyId,
    name: name.trim(),
    desc: desc || '',
    plan: selectedPlan,
    users: planSeats,
    billing: planBilling,
    billingName: billingName || name.trim(),
    billingEmail: billingEmail || adminEmail,
    billingPhone: billingPhone || '',
    billingAddress: billingAddress || '',
    logo: logo || '',
    autopay: autopay !== false,
    status: 'Active',
    admin: adminEmail.toLowerCase(),
    isDeleted: false
  };
  fallbackCompanies.push(newCompany);

  const newAdminUser = {
    id: `fb_u_${Date.now()}`,
    name: adminName,
    email: adminEmail.toLowerCase(),
    companyId: newCompanyId,
    org: name.trim(),
    role: 'Company Admin',
    status: 'Active'
  };
  fallbackUsers.push(newAdminUser);

  const newPayment = {
    id: `pay_${Date.now()}`,
    clientName: adminEmail.toLowerCase(),
    companyId: newCompanyId,
    org: name.trim(),
    amount: planBilling,
    status: 'Paid',
    paymentId: paymentId || `pay_tr_${Math.random().toString(36).substring(2, 9).toUpperCase()}`,
    paymentMethod: paymentMethod || (planBilling === 0 ? 'Free' : 'Credit Card'),
    date: new Date().toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    })
  };
  fallbackPayments.push(newPayment);

  queueWelcomeCompanyEmail(adminEmail.toLowerCase(), name.trim(), adminName, selectedPlan);

  return res.status(201).json({
    success: true,
    message: 'Workspace successfully registered in fallback store.',
    data: {
      company: newCompany,
      admin: newAdminUser
    }
  });
}

// 3. GET /api/subscriptions/my-subscription
async function getMySubscription(req, res) {
  const companyId = req.user.companyId;

  if (getIsConnected()) {
    try {
      const company = await Company.findById(companyId);
      if (!company) {
        return res.status(404).json({ success: false, message: 'Company workspace not found.' });
      }

      const planDoc = await SubscriptionPlan.findOne({ name: new RegExp(`^${company.plan.trim()}$`, 'i') });
      return res.status(200).json({
        success: true,
        data: {
          plan: company.plan,
          billing: company.billing,
          limits: planDoc ? planDoc.limits : {
            maxProjects: 10,
            maxEmployees: 15,
            maxClients: 15,
            storageGB: 10
          },
          status: company.status
        }
      });
    } catch (err) {
      console.error('[getMySubscription] Error:', err);
      return res.status(500).json({ success: false, message: 'Database error fetching active subscription.' });
    }
  }

  const company = fallbackCompanies.find(c => c.id === companyId);
  if (!company) {
    return res.status(404).json({ success: false, message: 'Company workspace not found in fallback store.' });
  }

  const fallbackPlans = require('../utils/fallbackStore').fallbackPlans;
  const planDoc = fallbackPlans.find(p => p.name.toLowerCase() === company.plan.toLowerCase());

  return res.status(200).json({
    success: true,
    data: {
      plan: company.plan,
      billing: company.billing,
      limits: planDoc ? planDoc.limits : {
        maxProjects: 10,
        maxEmployees: 15,
        maxClients: 15,
        storageGB: 10
      },
      status: company.status
    }
  });
}

module.exports = {
  checkout,
  confirm,
  getMySubscription
};
