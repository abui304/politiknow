const mongoose = require('mongoose');

const postSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        ref: 'User',
    },
    billTitle: {
        type: String,
        required: [true, 'Please add a bill title'],
        trim: true,
    },
    originalText: {
        type: String,
        required: [true, 'Please add the orginal text of the bill'],
    },
    summary: {
        type: String,
        required: true, 
    },
    likes: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    }],
    comments: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Comment',
    }],
}, {
    timestamps: true,
});

const Post = mongoose.model('Post', postSchema);
module.exports = Post;