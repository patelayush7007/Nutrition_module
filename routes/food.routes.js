const express = require('express');
const router = express.Router();
const Food = require('../models/food.model');

router.get('/foods', async (req, res) => {
  try {
    const foods = await Food.find().limit(10); // get first 10 items
    res.json(foods);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
