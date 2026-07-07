module.exports = {
  ...require('./lead/getDashboardData'),
  ...require('./lead/getMyProjects'),
  ...require('./lead/getProjectDetail'),
  ...require('./lead/createProjectTask'),
  ...require('./lead/updateProjectTask'),
  ...require('./lead/getTeamWorkload'),
  ...require('./lead/getTimesheets'),
  ...require('./lead/approveTimesheet'),
  ...require('./lead/getProgressReport'),
  ...require('./lead/getBudgetReport'),
  ...require('./lead/getClientDetail'),
};
