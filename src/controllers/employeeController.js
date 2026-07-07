module.exports = {
  ...require('./employee/getEmployees'),
  ...require('./employee/getUsers'),
  ...require('./employee/createEmployee'),
  ...require('./employee/updateEmployee'),
  ...require('./employee/deleteEmployee'),
  ...require('./employee/deleteUser'),
  ...require('./employee/getProjectLeads'),
  ...require('./employee/createProjectLead'),
  ...require('./employee/inviteEmployee'),
  ...require('./employee/resendCredentials'),
};
