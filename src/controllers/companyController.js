module.exports = {
  ...require('./company/getCompanies'),
  ...require('./company/getTrashCompanies'),
  ...require('./company/createCompany'),
  ...require('./company/toggleCompanyStatus'),
  ...require('./company/softDeleteCompany'),
  ...require('./company/restoreCompany'),
  ...require('./company/permanentDeleteCompany'),
  ...require('./company/registerCompany'),
  ...require('./company/selectPlan'),
};
