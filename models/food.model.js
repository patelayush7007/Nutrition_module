const mongoose = require('mongoose');

const foodSchema = new mongoose.Schema({}, { strict: false }); 

module.exports = mongoose.model('Food', foodSchema);
