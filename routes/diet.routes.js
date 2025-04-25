const express = require('express');
const router = express.Router();
const dietController = require('../controllers/diet.controller');

router.post('/generate', dietController.generateDietPlan);

// router.post('/generate-diet', dietController.getDietPlan);

module.exports = router;
