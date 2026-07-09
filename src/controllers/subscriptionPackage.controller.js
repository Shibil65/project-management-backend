const service = require('../services/subscriptionPackage.service');
const asyncHandler = require('../utils/asyncHandler');

// 1. GET /api/subscription-packages/active
const getActivePackages = asyncHandler(async (req, res) => {
  const list = await service.getActivePackages();
  res.status(200).json({ success: true, data: list });
});

// 2. POST /api/subscription-packages/checkout
const checkout = asyncHandler(async (req, res) => {
  const { planName, amount, companyName, adminEmail } = req.body;
  if (!planName || amount === undefined) {
    return res.status(400).json({ success: false, message: 'Plan name and amount are required.' });
  }

  // Pre-payment workspace validation checks
  await service.processCheckoutValidation(companyName, adminEmail);

  const price = await service.fetchPackagePrice(planName);
  const resolvedPrice = price !== null ? price : Number(amount);

  if (resolvedPrice === 0) {
    return res.status(200).json({
      success: true,
      isFree: true,
      planName,
      amount: 0
    });
  }

  const orderData = await service.generateRazorpayOrder(resolvedPrice, planName);
  res.status(orderData.isMock ? 200 : 201).json(orderData);
});

// 3. POST /api/subscription-packages/confirm
const confirm = asyncHandler(async (req, res) => {
  const {
    name, adminName, adminEmail, plan, billing, paymentId, razorpay_order_id, razorpay_signature
  } = req.body;

  if (!name || !adminEmail || !adminName || !plan) {
    return res.status(400).json({
      success: false,
      message: 'Workspace Name, Admin Name, Admin Email, and Subscription Plan are required.'
    });
  }

  const planBilling = Number(billing) || 0;

  // Paid signature validation
  if (planBilling > 0 && paymentId) {
    await service.verifyRazorpaySignature(razorpay_order_id, paymentId, razorpay_signature);
  }

  const result = await service.provisionWorkspace(req.body);
  res.status(201).json({
    success: true,
    message: 'Workspace successfully registered and active.',
    data: result
  });
});

// 4. GET /api/subscription-packages/my-subscription
const getMySubscription = asyncHandler(async (req, res) => {
  const companyId = req.user.companyId;
  const subscription = await service.getCompanySubscription(companyId);
  res.status(200).json({ success: true, data: subscription });
});

module.exports = {
  getActivePackages,
  checkout,
  confirm,
  getMySubscription
};
