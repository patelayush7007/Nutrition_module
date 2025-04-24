const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  preferences: { type: Object }, // stores health goals, allergies, etc.
});

module.exports = mongoose.model('User', UserSchema);
