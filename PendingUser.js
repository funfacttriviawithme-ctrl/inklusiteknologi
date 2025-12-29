const mongoose = require('mongoose');

const pendingUserSchema = new mongoose.Schema({
    name: { type: String, required: true },
    phoneNumberTarget: { type: String, required: true },
    username: { type: String, default: '' },
    password: { type: String, default: '' },
    service: { type: String, default: 'REGULER' },
    submittedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('WaitingList', pendingUserSchema);