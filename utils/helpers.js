
const Conversation = require("../models/Conversation");
const Invitation = require("../models/Invitation");

// Helper function to process invitation
async function processInvitation(invitation, acceptingUserId) {
    // Check if conversation already exists
    let conv = await Conversation.findOne({
        type: 'direct',
        participants: { $all: [invitation.fromUserId, acceptingUserId], $size: 2 }
    });

    if (!conv) {
        conv = await Conversation.create({
            type: 'direct',
            participants: [invitation.fromUserId, acceptingUserId],
            createdBy: invitation.fromUserId
        });
    }

    // Update invitation
    invitation.status = "accepted";
    invitation.conversationId = conv._id;
    await invitation.save();

    return conv;
}

module.exports = { processInvitation };
