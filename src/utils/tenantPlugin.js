const { AsyncLocalStorage } = require('async_hooks');
const mongoose = require('mongoose');

const tenantStorage = new AsyncLocalStorage();

function tenantPlugin(schema) {
  // Query middleware: automatically inject companyId filter
  const injectCompanyId = function (next) {
    const companyId = tenantStorage.getStore();
    if (companyId) {
      const options = (typeof this.getOptions === 'function' ? this.getOptions() : this.options) || {};
      if (options.bypassTenant) {
        return next();
      }
      this.where({ companyId });
    }
    next();
  };

  const queryMethods = [
    'find',
    'findOne',
    'count',
    'countDocuments',
    'updateOne',
    'updateMany',
    'deleteOne',
    'deleteMany',
    'findOneAndUpdate',
    'findOneAndDelete',
    'findOneAndReplace',
    'replaceOne'
  ];

  queryMethods.forEach((method) => {
    schema.pre(method, injectCompanyId);
  });

  // Pre-save hook: automatically stamp companyId on document save
  schema.pre('save', function (next) {
    const companyId = tenantStorage.getStore();
    if (companyId && !this.companyId) {
      this.companyId = companyId;
    }
    next();
  });
}

module.exports = {
  tenantPlugin,
  tenantStorage
};
