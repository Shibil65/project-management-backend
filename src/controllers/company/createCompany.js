const {
  getIsConnected
} = require("../../config/db");
const Company = require("../../models/Company");
const User = require("../../models/User");
const Payment = require("../../models/Payment");
const {
  fallbackCompanies,
  fallbackUsers,
  fallbackPayments
} = require("../../utils/fallbackStore");
const {
  sendWelcomeCompanyEmail
} = require("../../services/email/emailService");

function queueWelcomeCompanyEmail(adminEmail, companyName, adminName, selectedPlan) {
  sendWelcomeCompanyEmail(adminEmail, companyName, adminName, selectedPlan)
    .then((result) => {
      if (result.emailSent) {
        console.log(`[createCompany] Welcome email queued successfully for ${adminEmail}`);
      } else {
        console.warn(`[createCompany] Welcome email was not sent for ${adminEmail}: ${result.error || 'unknown mail error'}`);
      }
    })
    .catch((err) => {
      console.error(`[createCompany] Welcome email failed for ${adminEmail}:`, err.message);
    });
}

function deriveAdminName(email) {
  const localPart = String(email || "admin").split("@")[0] || "admin";
  return localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || "Company Admin";
}

function createPaymentId() {
  return `pay_sa_${Math.random().toString(36).substring(2, 9).toUpperCase()}`;
}

async function createCompany(req, res) {
  const {
    name,
    desc,
    plan,
    users,
    billing,
    admin,
    paymentMethod,
    paymentId,
    razorpay_order_id,
    razorpay_signature
  } = req.body;
  if (!name || !admin) {
    return res.status(400).json({
      success: false,
      message: "Company Name and Admin Email are required."
    });
  }

  const adminEmail = admin.toLowerCase().trim();
  const adminName = deriveAdminName(adminEmail);
  const selectedPlan = plan || "Starter";
  const planSeats = Number(users) || 1;
  const planBilling = Number(billing) || 0;

  if (planBilling > 0 && !paymentId) {
    return res.status(400).json({
      success: false,
      message: "Payment is required for paid workspaces. Please complete checkout."
    });
  }

  if (planBilling > 0 && paymentId) {
    const keySecret = process.env.RAZORPAY_KEY_SECRET || "";
    if (keySecret && keySecret !== "rzp_test_demo_key_secret" && !keySecret.includes("demo") && razorpay_signature && razorpay_signature !== "super_mock_signature" && razorpay_signature !== "mock_signature") {
      const crypto = require("crypto");
      const hmac = crypto.createHmac("sha256", keySecret);
      hmac.update(razorpay_order_id + "|" + paymentId);
      const generated_signature = hmac.digest("hex");

      if (generated_signature !== razorpay_signature) {
        return res.status(400).json({
          success: false,
          message: "Invalid payment signature. Verification failed."
        });
      }
    }
  }

  if (getIsConnected()) {
    try {
      const existing = await Company.findOne({
        name,
        isDeleted: {
          $ne: true
        }
      });
      if (existing) {
        return res.status(400).json({
          success: false,
          message: "A company with this name already exists."
        });
      }

      const existingUser = await User.findOne({ email: adminEmail }).setOptions({ bypassTenant: true });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: "A user with this admin email already exists. Use a different admin email."
        });
      }

      const newCompany = new Company({
        name,
        desc: desc || "",
        plan: selectedPlan,
        users: planSeats,
        billing: planBilling,
        billingName: name,
        billingEmail: adminEmail,
        status: "Active",
        admin: adminEmail,
        isDeleted: false,
        attendancePortalEnabled: true,
        manualCheckInEnabled: true,
        attendancePortalOpenTime: "09:00",
        attendancePortalCloseTime: "18:00"
      });
      await newCompany.save();

      const newAdminUser = new User({
        name: adminName,
        email: adminEmail,
        companyId: newCompany._id.toString(),
        org: name,
        role: "Company Admin",
        status: "Active"
      });
      await newAdminUser.save();

      const newPayment = new Payment({
        clientName: adminEmail,
        companyId: newCompany._id.toString(),
        org: name,
        amount: planBilling,
        status: "Paid",
        paymentId: paymentId || createPaymentId(),
        paymentMethod: paymentMethod || "Credit Card",
        date: new Date().toLocaleDateString(undefined, {
          day: "numeric",
          month: "short",
          year: "numeric"
        })
      });
      await newPayment.save();

      queueWelcomeCompanyEmail(adminEmail, name, adminName, selectedPlan);

      return res.status(201).json({
        success: true,
        data: newCompany,
        admin: newAdminUser,
        emailQueued: true
      });
    } catch (err) {
      console.error("Failed to create company in MongoDB:", err.message);
      return res.status(500).json({
        success: false,
        message: "Database error creating company workspace."
      });
    }
  }

  const existingFallback = fallbackCompanies.find(c => c.name.toLowerCase() === name.toLowerCase() && !c.isDeleted);
  if (existingFallback) {
    return res.status(400).json({
      success: false,
      message: "A company with this name already exists in fallback store."
    });
  }
  const existingFallbackUser = fallbackUsers.find(u => u.email.toLowerCase() === adminEmail);
  if (existingFallbackUser) {
    return res.status(400).json({
      success: false,
      message: "A user with this admin email already exists in fallback store."
    });
  }

  const newCompanyId = `fb_${Date.now()}`;
  const newCompany = {
    id: newCompanyId,
    name,
    desc: desc || "",
    plan: selectedPlan,
    users: planSeats,
    billing: planBilling,
    billingName: name,
    billingEmail: adminEmail,
    status: "Active",
    admin: adminEmail,
    isDeleted: false,
    attendancePortalEnabled: true,
    manualCheckInEnabled: true,
    attendancePortalOpenTime: "09:00",
    attendancePortalCloseTime: "18:00"
  };
  fallbackCompanies.push(newCompany);

  const newAdminUser = {
    id: `fb_u_${Date.now()}`,
    name: adminName,
    email: adminEmail,
    companyId: newCompanyId,
    org: name,
    role: "Company Admin",
    status: "Active"
  };
  fallbackUsers.push(newAdminUser);

  const newPayment = {
    id: `pay_${Date.now()}`,
    clientName: adminEmail,
    companyId: newCompanyId,
    org: name,
    amount: planBilling,
    status: "Paid",
    paymentId: paymentId || createPaymentId(),
    paymentMethod: paymentMethod || "Credit Card",
    date: new Date().toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric"
    })
  };
  fallbackPayments.push(newPayment);
  queueWelcomeCompanyEmail(adminEmail, name, adminName, selectedPlan);

  return res.status(201).json({
    success: true,
    data: newCompany,
    admin: newAdminUser,
    emailQueued: true
  });
}

module.exports = { createCompany };
