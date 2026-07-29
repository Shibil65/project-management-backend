const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/auth');
const { adminGuard } = require('../middlewares/roleGuard');
const {
  getOfficeLocations,
  createOfficeLocation,
  updateOfficeLocation,
  deleteOfficeLocation
} = require('../controllers/officeLocationController');

router.use(authMiddleware);
router.use(adminGuard);

router.get('/office-locations', getOfficeLocations);
router.post('/office-locations', createOfficeLocation);
router.patch('/office-locations/:locationId', updateOfficeLocation);
router.delete('/office-locations/:locationId', deleteOfficeLocation);

module.exports = router;
