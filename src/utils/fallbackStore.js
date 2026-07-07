const otpStore = new Map();

const fallbackCompanies = [];
const fallbackUsers = [];
const fallbackProjects = [];
const fallbackLeaves = [];
const fallbackAttendance = [];
const fallbackClients = [];
const fallbackPayments = [];
const fallbackMessages = [];

const fallbackPlans = [
  { id: '0', name: 'Free', price: 0, limit: '5 Users', maxUsers: 5, maxProjects: 3 },
  { id: '1', name: 'Starter Package', price: 2500, limit: '15 Users', maxUsers: 15, maxProjects: 10 },
  { id: '2', name: 'Scale Package Tier', price: 8900, limit: '50 Users', maxUsers: 50, maxProjects: 30 }
];

const fallbackTimesheets = [];
const fallbackCRMProjectLeads = [];
const fallbackCRMClientLeads = [];

module.exports = {
  otpStore,
  fallbackCompanies,
  fallbackUsers,
  fallbackProjects,
  fallbackLeaves,
  fallbackAttendance,
  fallbackClients,
  fallbackPayments,
  fallbackMessages,
  fallbackPlans,
  fallbackTimesheets,
  fallbackCRMProjectLeads,
  fallbackCRMClientLeads
};
