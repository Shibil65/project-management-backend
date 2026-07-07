module.exports = {
  ...require('./clientShare/getDashboard'),
  ...require('./clientShare/getBilling'),
  ...require('./clientShare/getRequirements'),
  ...require('./clientShare/createRequirement'),
  ...require('./clientShare/getFiles'),
  ...require('./clientShare/getMilestones'),
  ...require('./clientShare/getMessages'),
  ...require('./clientShare/createMessage'),
  ...require('./clientShare/getActivity'),
  ...require('./clientShare/getPendingActions'),
};
