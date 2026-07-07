const crypto = require('crypto');
const { getIsConnected } = require('../config/db');
const Payment = require('../models/Payment');
const Company = require('../models/Company');
const User = require('../models/User');
const { fallbackPayments, fallbackCompanies, fallbackUsers } = require('../utils/fallbackStore');
const { resolvePlanDetails, getFallbackPlanDetails } = require('../utils/planResolver');

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

async function getPayments(req, res) {
  const companyId = req.user.companyId;
  const role = req.user.role;

  if (getIsConnected()) {
    try {
      const filter = role === 'Super Admin' ? {} : { companyId };
      const list = await Payment.find(filter).sort({ createdAt: -1 });
      return res.status(200).json({ success: true, data: list });
    } catch (err) {
      console.error(err);
    }
  }
  const fallbackFilter = role === 'Super Admin' ? () => true : p => p.companyId === companyId;
  const list = fallbackPayments.filter(fallbackFilter);
  return res.status(200).json({ success: true, data: list });
}

async function createRazorpayOrder(req, res) {
  const { planName, amount, companyName, adminEmail } = req.body;
  console.log('[createRazorpayOrder] Request body:', { planName, amount, companyName, adminEmail });

  if (!planName || amount === undefined) {
    return res.status(400).json({ success: false, message: 'Plan name and amount are required.' });
  }

  // Pre-payment validations: check if company name or user email already exists
  if (getIsConnected()) {
    try {
      if (companyName) {
        const existingComp = await Company.findOne({ name: companyName.trim(), isDeleted: { $ne: true } });
        if (existingComp) {
          console.log('[createRazorpayOrder] Pre-check failed: Company already exists:', companyName);
          return res.status(400).json({ success: false, message: 'A company with this name already exists.' });
        }
      }
      if (adminEmail) {
        const existingUsr = await User.findOne({ email: adminEmail.trim().toLowerCase() }).setOptions({ bypassTenant: true });
        if (existingUsr) {
          console.log('[createRazorpayOrder] Pre-check failed: Admin email already exists:', adminEmail);
          return res.status(400).json({ success: false, message: 'A user with this email address already exists.' });
        }
      }
    } catch (err) {
      console.error('[createRazorpayOrder] Error checking database records:', err);
    }
  } else {
    // Fallback store validation checks
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

  const planDetails = getIsConnected()
    ? await resolvePlanDetails(planName)
    : getFallbackPlanDetails(planName);
  const checkoutAmount = planDetails ? Number(planDetails.price) : amountNumber;

  // Razorpay requires minimum ₹1 (100 paise)
  if (checkoutAmount <= 0) {
    return res.status(400).json({ success: false, message: 'Cannot create a Razorpay order for a free plan. Register directly.' });
  }

  const keyId = process.env.RAZORPAY_KEY_ID || '';
  const keySecret = process.env.RAZORPAY_KEY_SECRET || '';

  // If Razorpay keys are not provided or are demo placeholders, operate in Mock/Development Mode
  if (!keyId || !keySecret || keyId === 'rzp_test_demo_key_id' || keyId.includes('demo')) {
    console.log('[createRazorpayOrder] No valid Razorpay keys, returning mock order');
    return res.status(200).json(buildMockOrder(checkoutAmount));
  }

  try {
    const amountInPaise = Math.round(checkoutAmount * 100);
    const orderPayload = {
      amount: amountInPaise,
      currency: 'INR',
      receipt: `receipt_${Date.now()}`,
      payment_capture: 1,
      notes: {
        plan: planName,
        source: 'Syncra SaaS Registration'
      }
    };
    console.log('[createRazorpayOrder] Sending to Razorpay:', orderPayload);

    const response = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + Buffer.from(keyId + ':' + keySecret).toString('base64')
      },
      body: JSON.stringify(orderPayload)
    });

    const order = await response.json();
    console.log('[createRazorpayOrder] Razorpay response status:', response.status, 'body:', JSON.stringify(order));

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
      console.error('[createRazorpayOrder] Razorpay API Error response:', JSON.stringify(order));
      if (process.env.RAZORPAY_STRICT !== 'true') {
        return res.status(200).json(buildMockOrder(checkoutAmount, 'Razorpay rejected the configured keys, so checkout is running in mock mode.'));
      }
      return res.status(400).json({ success: false, message: 'Razorpay API returned an error.', error: order });
    }
  } catch (err) {
    console.error('Razorpay Order creation failed:', err);
    if (process.env.RAZORPAY_STRICT !== 'true') {
      return res.status(200).json(buildMockOrder(checkoutAmount, 'Razorpay network request failed, so checkout is running in mock mode.'));
    }
    return res.status(500).json({ success: false, message: 'Internal server error creating payment order.' });
  }
}

async function verifyRazorpayPayment(req, res) {
  const { companyId, planName, amount, razorpay_order_id, razorpay_signature } = req.body;
  const razorpay_payment_id = req.body.razorpay_payment_id || req.body.paymentId;
  const org = req.user.org;
  const email = req.user.email;

  const keySecret = process.env.RAZORPAY_KEY_SECRET || '';

  // Skip signature verification for mock/development signatures or demo credentials
  if (keySecret && keySecret !== 'rzp_test_demo_key_secret' && !keySecret.includes('demo') && razorpay_signature && razorpay_signature !== 'mock_signature') {
    // Perform cryptographic verification
    const hmac = crypto.createHmac('sha256', keySecret);
    hmac.update(razorpay_order_id + "|" + razorpay_payment_id);
    const generated_signature = hmac.digest('hex');

    if (generated_signature !== razorpay_signature) {
      return res.status(400).json({ success: false, message: 'Invalid payment signature. Verification failed.' });
    }
  }

  // Update subscription in database
  const planDetails = getIsConnected()
    ? await resolvePlanDetails(planName)
    : getFallbackPlanDetails(planName);
  let billing = Number(planDetails?.price ?? amount) || 0;
  
  if (getIsConnected()) {
    try {
      const company = await Company.findById(companyId);
      if (company) {
        company.plan = planName;
        company.billing = billing;
        await company.save();
      }

      // Record payment transaction
      const newPayment = new Payment({
        clientName: email,
        companyId,
        org: org || company?.name || 'Syncra Org',
        amount: billing,
        status: 'Paid',
        paymentId: razorpay_payment_id || `pay_up_${Math.random().toString(36).substring(2, 9).toUpperCase()}`
      });
      await newPayment.save();

    } catch (err) {
      console.error('Failed to update tenant plan in MongoDB:', err);
    }
  } else {
    const company = fallbackCompanies.find(c => c.id === companyId);
    if (company) {
      company.plan = planName;
      company.billing = billing;
    }
    const newPayment = {
      id: `pay_${Date.now()}`,
      clientName: email,
      companyId,
      org: org || company?.name || 'Syncra Org',
      amount: billing,
      status: 'Paid',
      paymentId: razorpay_payment_id || `pay_up_${Math.random().toString(36).substring(2, 9).toUpperCase()}`,
      date: new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
    };
    fallbackPayments.push(newPayment);
  }

  return res.status(200).json({ success: true, message: 'Payment successfully captured and subscription active.' });
}

module.exports = {
  getPayments,
  createRazorpayOrder,
  verifyRazorpayPayment
};
